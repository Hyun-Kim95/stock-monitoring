import type { PrismaClient } from "@prisma/client";
import type { Env } from "../../config.js";
import { logInfo } from "../../lib/logger.js";
import { redisSetJson } from "../../lib/redis.js";
import { fetchChart } from "./quote-history.js";
import {
  resetQuoteHistoryCaches,
  runStartupKisMinuteBackfill,
  startOrJoinKisMinuteBackfillToday,
} from "./kis-chart-backfill.js";

const SETTING_LAST_STARTED_AT = "runtime.api.last_started_at";
const SETTING_LAST_STOPPED_AT = "runtime.api.last_stopped_at";

function kstDateOnly(d: Date): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 10);
}

function kstHhmmss(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${pick("hour")}${pick("minute")}${pick("second")}`;
}

function parseIsoDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startupBackfillFromHhmmss(now: Date, lastStoppedAt: Date | null, lastStartedAt: Date | null): string | undefined {
  const ref = lastStoppedAt ?? lastStartedAt;
  if (!ref) return undefined;
  if (kstDateOnly(ref) !== kstDateOnly(now)) return undefined;
  const hhmmss = kstHhmmss(ref);
  if (!/^\d{6}$/.test(hhmmss)) return undefined;
  if (hhmmss <= "080000") return "080000";
  return hhmmss;
}

async function markLastStartedAt(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { settingKey: SETTING_LAST_STARTED_AT },
    update: { settingValue: now.toISOString() },
    create: { settingKey: SETTING_LAST_STARTED_AT, settingValue: now.toISOString() },
  });
}

/**
 * 서버 기동 직후: (옵션) 시세 히스토리 삭제 → KIS면 당일 분봉 선백필.
 * 이후 `reloadMarketFromDb`에서 폴링이 시작되므로, 저장은 폴링보다 먼저 채워짐.
 */
export async function runStartupQuoteHistoryPrep(prisma: PrismaClient, env: Env): Promise<void> {
  const mode = env.QUOTE_HISTORY_RESET_ON_START;
  const now = new Date();

  if (mode === "today") {
    const kstDate = kstDateOnly(now);
    const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
    await prisma.$executeRaw`DELETE FROM "stock_quote_history" WHERE "recorded_at" >= ${dayStart}`;
    console.info(`[stockMonitoring] QUOTE_HISTORY_RESET_ON_START=today → ${kstDate} 0시(KST) 이후 행 삭제`);
  } else if (mode === "today_8kst") {
    const kstDate = kstDateOnly(now);
    const open8 = new Date(`${kstDate}T08:00:00+09:00`);
    await prisma.$executeRaw`DELETE FROM "stock_quote_history" WHERE "recorded_at" < ${open8}`;
    console.info(
      `[stockMonitoring] QUOTE_HISTORY_RESET_ON_START=today_8kst → ${kstDate} 08:00(KST) 이전 행 삭제 (전일·당일 8시 미만)`,
    );
  } else if (mode === "all") {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "stock_quote_history"`);
    console.info("[stockMonitoring] QUOTE_HISTORY_RESET_ON_START=all → stock_quote_history TRUNCATE");
  }

  resetQuoteHistoryCaches();

  try {
    if (!env.KIS_STARTUP_MINUTE_BACKFILL) return;

    const provRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "market_data.provider" },
    });
    if (provRow?.settingValue?.trim().toLowerCase() !== "kis") return;
    if (!env.KIS_APP_KEY?.trim() || !env.KIS_APP_SECRET?.trim()) return;

    const [lastStoppedRow, lastStartedRow] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { settingKey: SETTING_LAST_STOPPED_AT } }),
      prisma.systemSetting.findUnique({ where: { settingKey: SETTING_LAST_STARTED_AT } }),
    ]);
    const fromHhmmss = startupBackfillFromHhmmss(
      now,
      parseIsoDate(lastStoppedRow?.settingValue),
      parseIsoDate(lastStartedRow?.settingValue),
    );

    await runStartupKisMinuteBackfill(prisma, env, { startupFromHhmmss: fromHhmmss });
  } finally {
    await markLastStartedAt(prisma, now);
  }
}

/**
 * 서버 기동 직후 백그라운드 prewarm:
 * - 종목별 당일 분봉 백필을 우선 시도(이미 진행 중이면 조인)
 * - minute 차트 compact/normal 결과를 Redis에 짧게 예열
 */
export async function runStartupMinuteChartPrewarmQueue(prisma: PrismaClient, env: Env): Promise<void> {
  const provRow = await prisma.systemSetting.findUnique({
    where: { settingKey: "market_data.provider" },
  });
  if (provRow?.settingValue?.trim().toLowerCase() !== "kis") return;
  if (!env.KIS_APP_KEY?.trim() || !env.KIS_APP_SECRET?.trim()) return;

  const stocks = await prisma.stock.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true },
  });
  const queueStartedAt = Date.now();
  logInfo("startup minute prewarm queue started", { stockCount: stocks.length });
  const ranges = ["compact", "normal"] as const;
  const slowStocks: { stockCode: string; elapsedMs: number }[] = [];
  let failCount = 0;
  for (const s of stocks) {
    const stockStartedAt = Date.now();
    let step = "backfill";
    try {
      await startOrJoinKisMinuteBackfillToday(prisma, env, s.code, { force: true, interactive: true });
      step = "cache";
      for (const range of ranges) {
        const bundle = await fetchChart(prisma, s.code, "minute", range, { minuteSession: "all" });
        const key = `chart:minute:${s.code}|minute|${range}|default|all`;
        await redisSetJson(key, bundle, 2_500);
      }
      const elapsedMs = Date.now() - stockStartedAt;
      if (elapsedMs >= 1_000) {
        slowStocks.push({ stockCode: s.code, elapsedMs });
      }
    } catch {
      failCount += 1;
      logInfo("startup minute prewarm stock failed", {
        stockCode: s.code,
        step,
        elapsedMs: Date.now() - stockStartedAt,
      });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  logInfo("startup minute prewarm queue finished", {
    stockCount: stocks.length,
    failCount,
    slowStockCount: slowStocks.length,
    slowStocks: slowStocks.sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 5),
    elapsedMs: Date.now() - queueStartedAt,
  });
}
