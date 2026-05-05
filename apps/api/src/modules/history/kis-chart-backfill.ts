import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CHART_RANGE_MATRIX, normalizeKrxStockCode, type ChartGranularity, type ChartRange } from "@stock-monitoring/shared";
import type { Env } from "../../config.js";
import {
  fetchKisAccessToken,
  fetchKisDailyItemChartPriceAll,
  fetchKisTimeItemChartPrice,
  parseKisNumber,
} from "../market-data/kis/kis-rest.js";
import { kstYmdForInstant } from "../market-data/kis/kis-trading-session.js";
import { isKrxScheduledFullDayClosureKstYmd } from "../market-data/krx-scheduled-closure-ymd.js";
import { redisAcquireLock, redisReleaseLock, redisWaitUntilUnlocked } from "../../lib/redis.js";
import { redisGetJson, redisSetJson } from "../../lib/redis.js";

/** 동일 종목 백필 재시도 최소 간격 (KIS 호출·DB 부하 완화) */
const COOLDOWN_MS = 8 * 60_000;
/**
 * KST 거래일(일자) 수가 이 정도 이상이면 추가 백필 안 함.
 * ~10년치 일봉이면 연봉·월봉이 여러 개 나올 수 있는 수준.
 */
const TARGET_DISTINCT_DAYS = 2000;
/** 한 번의 차트 요청에서 과거로 나눠 부르는 배치 수 (타임아웃·KIS 한도 고려) */
const MAX_BACKFILL_BATCHES = 6;
/** 배치당 KIS에서 모을 output2 행 상한 (800일 창 안의 거래일을 거의 다 담도록) */
const MAX_ROWS_PER_BATCH = 1200;

const lastBackfillAt = new Map<string, number>();
/** 이 시각(ms) 이전에는 당일 분봉 백필을 다시 시도하지 않음 (성공·스킵·빈응답 시에만 갱신) */
const minuteBackfillNotBefore = new Map<string, number>();
/** 동일 종목·당일에 분봉 백필이 여러 차트 폴링에서 중복 실행되지 않도록 공유 */
const minuteTodayBackfillInFlight = new Map<string, Promise<void>>();

type MinuteCoverage = {
  kstDate: string;
  firstHhmmss: string | null;
  lastHhmmss: string | null;
  distinctMinutes: number;
  /** KST 09:00~14:30 구간 분 수(장중 코어) */
  coreMinutes: number;
  /** KST 08:00~09:00 미만 구간 분 수(프리·동시호가 등). 없으면 차트가 9시부터만 보일 수 있음 */
  premarketMinutes: number;
  updatedAtMs: number;
};

type HistoryCoverage = {
  stockCode: string;
  firstKstDate: string | null;
  lastKstDate: string | null;
  distinctDays: number;
  updatedAtMs: number;
};

/** 기동 시 일봉·분봉 쿨다운 초기화(삭제 후 재백필과 맞춤) */
export function resetQuoteHistoryCaches(): void {
  lastBackfillAt.clear();
  minuteBackfillNotBefore.clear();
  minuteTodayBackfillInFlight.clear();
}

/**
 * 차트 API 등에서 호출: 이미 진행 중인 당일 분봉 백필이 있으면 그 Promise를 재사용한다.
 */
export function startOrJoinKisMinuteBackfillToday(
  prisma: PrismaClient,
  env: Env,
  stockCode: string,
  opts?: BackfillKisMinuteTodayOpts,
): Promise<void> {
  const k = `${stockCode}:${formatKstDateOnly(new Date())}`;
  let p = minuteTodayBackfillInFlight.get(k);
  if (!p) {
    p = (async () => {
      const lockKey = `lock:minute-backfill:${k}`;
      const acquired = await redisAcquireLock(lockKey, 120_000);
      if (!acquired) {
        // 다른 인스턴스가 같은 종목 백필 중이면 짧게 대기 후 합류 효과를 낸다.
        await redisWaitUntilUnlocked(lockKey, 25_000, 350);
        return;
      }
      try {
        await maybeBackfillKisMinuteToday(prisma, env, stockCode, opts);
      } finally {
        await redisReleaseLock(lockKey);
      }
    })().finally(() => {
      minuteTodayBackfillInFlight.delete(k);
    });
    minuteTodayBackfillInFlight.set(k, p);
  }
  return p;
}
let backfillTokenCache: { baseUrl: string; token: string; expiresAt: number } | null = null;
let backfillTokenRetryNotBefore = 0;

async function ensureBackfillToken(baseUrl: string, appKey: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (
    backfillTokenCache &&
    backfillTokenCache.baseUrl === baseUrl &&
    backfillTokenCache.expiresAt > now + 60_000
  ) {
    return backfillTokenCache.token;
  }
  if (now < backfillTokenRetryNotBefore) {
    if (backfillTokenCache && backfillTokenCache.baseUrl === baseUrl && backfillTokenCache.expiresAt > now) {
      return backfillTokenCache.token;
    }
    const waitSec = Math.ceil((backfillTokenRetryNotBefore - now) / 1000);
    throw new Error(`KIS_TOKEN_COOLDOWN:${waitSec}`);
  }
  let t;
  try {
    t = await fetchKisAccessToken(baseUrl, appKey, appSecret);
    backfillTokenRetryNotBefore = 0;
  } catch (e) {
    const msg = String(e);
    if (msg.includes("EGW00133") || msg.includes("접근토큰 발급 잠시 후 다시 시도하세요")) {
      backfillTokenRetryNotBefore = Date.now() + 65_000;
    }
    throw e;
  }
  const exp = Date.parse(String(t.access_token_token_expired ?? "").replace(" ", "T"));
  backfillTokenCache = {
    baseUrl,
    token: t.access_token,
    expiresAt: Number.isNaN(exp) ? now + 55 * 60_000 : exp,
  };
  return t.access_token;
}

function formatKstYmd(d: Date): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
  return s.slice(0, 10).replace(/-/g, "");
}

/** KST 달력 `ymd`에서 `days`만큼 뺀 날짜(YYYYMMDD, KST 기준) */
function subDaysFromYmd(ymd: string, days: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const anchor = new Date(`${iso}T12:00:00+09:00`);
  anchor.setDate(anchor.getDate() - days);
  return formatKstYmd(anchor);
}

/**
 * 해당 KST 달력일의 시·저·고·종을 `recorded_at` 오름차순으로 기록.
 * 과거: UTC 자정·1시…를 쓰면 KST로 09:00~15:30이 되어 분봉 집계(장중)와 같은 버킷에 섞임.
 * 현재: 동일 날짜 08:00~08:03 KST(장 시작 전)만 사용 → 분봉 SQL과 절대 겹치지 않음.
 */
function kstDayOffMarketInstants(y: number, mo: number, d: number): { open: Date; low: Date; high: Date; close: Date } {
  const p = (n: number) => String(n).padStart(2, "0");
  const t = (hh: number, mm: number, ss: number) =>
    new Date(`${y}-${p(mo)}-${p(d)}T${p(hh)}:${p(mm)}:${p(ss)}+09:00`);
  return {
    open: t(8, 0, 0),
    low: t(8, 1, 0),
    high: t(8, 2, 0),
    close: t(8, 3, 0),
  };
}

function parseChartRow(r: Record<string, string | undefined>): {
  ymd: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint | null;
} | null {
  const ymd = (r.stck_bsop_date ?? r.STCK_BSOP_DATE ?? "").trim();
  if (!/^\d{8}$/.test(ymd)) return null;
  const open = parseKisNumber(r.stck_oprc ?? r.STCK_OPRC);
  const high = parseKisNumber(r.stck_hgpr ?? r.STCK_HGPR);
  const low = parseKisNumber(r.stck_lwpr ?? r.STCK_LWPR);
  const close = parseKisNumber(r.stck_clpr ?? r.STCK_CLPR);
  if ([open, high, low, close].some((n) => Number.isNaN(n) || n <= 0)) return null;
  const vol = parseKisNumber(r.acml_vol ?? r.ACML_VOL);
  const volume = Number.isNaN(vol) || vol < 0 ? null : BigInt(Math.floor(vol));
  return { ymd, open: Math.round(open), high: Math.round(high), low: Math.round(low), close: Math.round(close), volume };
}

async function distinctKstDayCount(prisma: PrismaClient, stockCode: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT (DATE("recorded_at" AT TIME ZONE 'Asia/Seoul')))::bigint AS n
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
  `;
  return Number(rows[0]?.n ?? 0);
}

async function loadHistoryCoverage(prisma: PrismaClient, stockCode: string): Promise<HistoryCoverage> {
  const key = `history-coverage:${stockCode}`;
  const cached = await redisGetJson<HistoryCoverage>(key);
  if (cached?.stockCode === stockCode) return cached;
  const rows = await prisma.$queryRaw<{ min_ymd: string | null; max_ymd: string | null; n: bigint }[]>`
    SELECT
      TO_CHAR(DATE(MIN("recorded_at") AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS min_ymd,
      TO_CHAR(DATE(MAX("recorded_at") AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS max_ymd,
      COUNT(DISTINCT (DATE("recorded_at" AT TIME ZONE 'Asia/Seoul')))::bigint AS n
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
  `;
  const cov: HistoryCoverage = {
    stockCode,
    firstKstDate: rows[0]?.min_ymd ?? null,
    lastKstDate: rows[0]?.max_ymd ?? null,
    distinctDays: Number(rows[0]?.n ?? 0),
    updatedAtMs: Date.now(),
  };
  await redisSetJson(key, cov, 30_000);
  return cov;
}

export async function isHistoryCoverageFreshEnough(
  prisma: PrismaClient,
  stockCode: string,
  granularity: Exclude<ChartGranularity, "minute">,
  range: ChartRange,
): Promise<boolean> {
  const cov = await loadHistoryCoverage(prisma, stockCode);
  if (!cov.firstKstDate || !cov.lastKstDate) return false;
  if (cov.distinctDays <= 0) return false;
  const lookbackMs = CHART_RANGE_MATRIX[granularity][range].lookbackMs;
  const desiredFrom = new Date(Date.now() - lookbackMs);
  desiredFrom.setHours(0, 0, 0, 0);
  const first = new Date(`${cov.firstKstDate}T00:00:00+09:00`);
  const last = new Date(`${cov.lastKstDate}T00:00:00+09:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return false;
  const hasRecentTail = Date.now() - last.getTime() <= 3 * 24 * 3600_000;
  const hasOldEnoughHead = first.getTime() <= desiredFrom.getTime();
  return hasOldEnoughHead && hasRecentTail;
}

async function minKstYmdInDb(prisma: PrismaClient, stockCode: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ ymd: string | null }[]>`
    SELECT TO_CHAR(DATE(MIN("recorded_at") AT TIME ZONE 'Asia/Seoul'), 'YYYYMMDD') AS ymd
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
  `;
  const y = rows[0]?.ymd?.trim();
  return y && /^\d{8}$/.test(y) ? y : null;
}

/**
 * `market_data.provider=kis`일 때, KIS 일봉 API로 과거를 채웁니다.
 * 90일에서 멈추지 않고 목표 거래일 수(약 10년치)까지 여러 구간을 연속 조회합니다.
 */
export async function maybeBackfillKisChartHistory(
  prisma: PrismaClient,
  env: Env,
  stockCode: string,
): Promise<void> {
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (!key || !secret) return;

  const now = Date.now();
  const last = lastBackfillAt.get(stockCode) ?? 0;
  if (now - last < COOLDOWN_MS) return;

  let distinctDays: number;
  try {
    distinctDays = await distinctKstDayCount(prisma, stockCode);
  } catch {
    return;
  }
  if (distinctDays >= TARGET_DISTINCT_DAYS) return;

  const baseUrl = (env.KIS_REST_BASE_URL?.trim() || "https://openapivts.koreainvestment.com:29443").replace(
    /\/$/,
    "",
  );
  const kisCode = normalizeKrxStockCode(stockCode);
  const todayYmd = formatKstYmd(new Date());

  let token: string;
  try {
    token = await ensureBackfillToken(baseUrl, key, secret);
  } catch {
    lastBackfillAt.delete(stockCode);
    return;
  }

  const gap = Math.min(800, Math.max(200, env.KIS_QUOTE_REQUEST_GAP_MS ?? 400));

  const byDay = new Map<string, NonNullable<ReturnType<typeof parseChartRow>>>();

  let minDb: string | null = null;
  try {
    minDb = await minKstYmdInDb(prisma, stockCode);
  } catch {
    /* ignore */
  }

  /** 다음 배치: [date1, date2] 구간 (YYYYMMDD, date1 ≤ date2, KIS 기준 과거→최근) */
  let date2: string;
  let date1: string;

  if (minDb) {
    date2 = subDaysFromYmd(minDb, 1);
    date1 = subDaysFromYmd(date2, 800);
  } else {
    date2 = todayYmd;
    date1 = subDaysFromYmd(todayYmd, 800);
  }

  for (let batch = 0; batch < MAX_BACKFILL_BATCHES; batch++) {
    if (date1 > date2) break;
    if (date2 < "19900101") break;

    let raw: Record<string, string | undefined>[];
    try {
      raw = await fetchKisDailyItemChartPriceAll(
        baseUrl,
        token,
        key,
        secret,
        kisCode,
        date1,
        date2,
        "D",
        "0",
        { maxRows: MAX_ROWS_PER_BATCH, pageGapMs: gap },
      );
    } catch {
      break;
    }

    if (raw.length === 0) break;

    let batchMin: string | null = null;
    for (const row of raw) {
      const p = parseChartRow(row);
      if (!p) continue;
      byDay.set(p.ymd, p);
      if (!batchMin || p.ymd < batchMin) batchMin = p.ymd;
    }
    if (!batchMin) break;

    date2 = subDaysFromYmd(batchMin, 1);
    date1 = subDaysFromYmd(date2, 800);

    if (raw.length < 5) break;
    if (gap > 0) {
      await new Promise((r) => setTimeout(r, gap));
    }
  }

  const inserts: { id: string; stockCode: string; recordedAt: Date; price: number; volume: bigint | null }[] = [];

  for (const p of byDay.values()) {
    const y = Number(p.ymd.slice(0, 4));
    const mo = Number(p.ymd.slice(4, 6));
    const d = Number(p.ymd.slice(6, 8));
    const t = kstDayOffMarketInstants(y, mo, d);
    inserts.push(
      { id: randomUUID(), stockCode, recordedAt: t.open, price: p.open, volume: null },
      { id: randomUUID(), stockCode, recordedAt: t.low, price: p.low, volume: null },
      { id: randomUUID(), stockCode, recordedAt: t.high, price: p.high, volume: null },
      // 분봉 집계와 충돌하지 않도록 백필 포인트는 volume을 저장하지 않음
      { id: randomUUID(), stockCode, recordedAt: t.close, price: p.close, volume: null },
    );
  }

  if (inserts.length === 0) {
    /* KIS 조회 실패·빈 응답 등으로 넣을 행이 없으면 쿨다운을 걸지 않음. 예전에는 여기서도 8분 쿨다운이
     * 이미 걸려 있어, 이후 차트 요청이 백필을 건너뛰고 폴링으로 쌓인 소량(수 일) 일봉만 보이는 현상이 났음. */
    return;
  }

  try {
    await prisma.stockQuoteHistory.createMany({ data: inserts });
    lastBackfillAt.set(stockCode, Date.now());
  } catch {
    /* DB 없음 등 — 삽입 실패 시 다음 차트 요청에서 다시 백필 시도할 수 있게 쿨다운을 두지 않음 */
  }
}

function formatKstDateOnly(d: Date): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
  return s.slice(0, 10);
}

function minuteCoverageRedisKey(stockCode: string, kstDate: string): string {
  return `minute-coverage-v2:${stockCode}:${kstDate}`;
}

function minutePremarketAttemptRedisKey(stockCode: string, kstDate: string): string {
  return `minute-premarket-attempted:${stockCode}:${kstDate}`;
}

/** KST 평일 09:05 이후에는 프리마켓(08~09) 분이 없으면 당일분봉 보강을 한 번 더 시도한다 */
function kstPastPremarketWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (wd === "Sat" || wd === "Sun") return false;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute >= 9 * 60 + 5;
}

/** KST 기준 `now`가 속한 분의 시작 시각 — 분봉 차트·백필에서 ‘아직 도래하지 않은 분’ 제외에 사용 */
function kstMinuteStartFloor(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(
    `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:00+09:00`,
  );
}

function hhmmssMinus1s(hhmmss: string): string {
  const h = Number(hhmmss.slice(0, 2));
  const m = Number(hhmmss.slice(2, 4));
  const s = Number(hhmmss.slice(4, 6));
  const dt = new Date(Date.UTC(2000, 0, 1, h, m, s));
  dt.setUTCSeconds(dt.getUTCSeconds() - 1);
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const ss = String(dt.getUTCSeconds()).padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

function parseMinuteRow(
  row: Record<string, string | undefined>,
  kstDate: string,
): {
  minuteBase: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint | null;
  hhmmss: string;
} | null {
  const hhmmss = (row.stck_cntg_hour ?? row.STCK_CNTG_HOUR ?? "").trim();
  if (!/^\d{6}$/.test(hhmmss)) return null;
  const closeRaw = parseKisNumber(row.stck_prpr ?? row.STCK_PRPR ?? row.stck_clpr ?? row.STCK_CLPR);
  if (!Number.isFinite(closeRaw) || closeRaw <= 0) return null;
  const close = Math.round(closeRaw);
  let open = parseKisNumber(row.stck_oprc ?? row.STCK_OPRC);
  let high = parseKisNumber(row.stck_hgpr ?? row.STCK_HGPR);
  let low = parseKisNumber(row.stck_lwpr ?? row.STCK_LWPR);
  if (!Number.isFinite(open) || open <= 0) open = close;
  else open = Math.round(open);
  if (!Number.isFinite(high) || high <= 0) high = Math.max(open, close);
  else high = Math.round(high);
  if (!Number.isFinite(low) || low <= 0) low = Math.min(open, close);
  else low = Math.round(low);
  high = Math.max(high, open, close);
  low = Math.min(low, open, close);
  /** 분봉 API: cntg_vol=해당분(또는 구간) 체결량. acml_vol은 당일 누적이라 분 단위로 넣으면 차트·거래량이 틀어짐 */
  const volNum = parseKisNumber(row.cntg_vol ?? row.CNTG_VOL);
  const volume = Number.isFinite(volNum) && volNum >= 0 ? BigInt(Math.floor(volNum)) : null;
  const minuteIso = `${kstDate}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:00+09:00`;
  const minuteBase = new Date(minuteIso);
  if (Number.isNaN(minuteBase.getTime())) return null;
  return {
    minuteBase,
    open,
    high,
    low,
    close,
    volume,
    hhmmss,
  };
}

function kstHhmmssFromDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  const h = pick("hour").padStart(2, "0");
  const m = pick("minute").padStart(2, "0");
  const s = pick("second").padStart(2, "0");
  return `${h}${m}${s}`;
}

function hhmmssToSec(h: string): number {
  if (!/^\d{6}$/.test(h)) return NaN;
  return Number(h.slice(0, 2)) * 3600 + Number(h.slice(2, 4)) * 60 + Number(h.slice(4, 6));
}

function kstHhmmssOfMinute(d: Date): string {
  const p = kstHhmmssFromDate(d);
  return `${p.slice(0, 4)}00`;
}

async function loadMinuteCoverageToday(prisma: PrismaClient, stockCode: string): Promise<MinuteCoverage> {
  const kstDate = formatKstDateOnly(new Date());
  const key = minuteCoverageRedisKey(stockCode, kstDate);
  const cached = await redisGetJson<MinuteCoverage>(key);
  if (cached && cached.kstDate === kstDate) return cached;

  const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const rows = await prisma.$queryRaw<{ min_t: Date | null; max_t: Date | null; distinct_minutes: bigint }[]>`
    SELECT
      MIN("recorded_at") AS min_t,
      MAX("recorded_at") AS max_t,
      COUNT(DISTINCT DATE_TRUNC('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul'))::bigint AS distinct_minutes
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
      AND "recorded_at" >= ${dayStart}
      AND "recorded_at" < ${dayEnd}
      AND "price" > 0
  `;
  const coreMinutes = await distinctCoreSessionMinutesToday(prisma, stockCode, dayStart, dayEnd);
  const premarketMinutes = await distinctPremarketMinutesToday(prisma, stockCode, dayStart, dayEnd);
  const minT = rows[0]?.min_t ?? null;
  const maxT = rows[0]?.max_t ?? null;
  const coverage: MinuteCoverage = {
    kstDate,
    firstHhmmss: minT ? kstHhmmssOfMinute(minT) : null,
    lastHhmmss: maxT ? kstHhmmssOfMinute(maxT) : null,
    distinctMinutes: Number(rows[0]?.distinct_minutes ?? 0),
    coreMinutes,
    premarketMinutes,
    updatedAtMs: Date.now(),
  };
  await redisSetJson(key, coverage, 15_000);
  return coverage;
}

export async function isMinuteCoverageFreshEnough(
  prisma: PrismaClient,
  stockCode: string,
): Promise<{ ok: boolean; coverage: MinuteCoverage }> {
  const coverage = await loadMinuteCoverageToday(prisma, stockCode);
  const nowFloor = kstMinuteStartFloor();
  const target = new Date(nowFloor.getTime() - 60_000);
  const targetHhmmss = kstHhmmssOfMinute(target);
  const coreLooksFull = coverage.coreMinutes >= 120;
  const lastLooksRecent =
    coverage.lastHhmmss != null && hhmmssToSec(coverage.lastHhmmss) >= hhmmssToSec(targetHhmmss);
  const pastPremarket = kstPastPremarketWindow();
  const premarketAttempted = await redisGetJson<{ v: number }>(
    minutePremarketAttemptRedisKey(stockCode, coverage.kstDate),
  );
  const premarketGapAcceptable =
    !pastPremarket ||
    coverage.premarketMinutes >= 1 ||
    premarketAttempted?.v === 1;
  return { ok: coreLooksFull && lastLooksRecent && premarketGapAcceptable, coverage };
}

/** 현재 KST 시각이 구간 안이면 그 시각부터, 아니면 구간 끝(역방향 페이지네이션 시작점) */
function pickInitialCursor(hhmmMin: string, hhmmMax: string, now = new Date()): string {
  const cur = kstHhmmssFromDate(now);
  const c = hhmmssToSec(cur);
  const lo = hhmmssToSec(hhmmMin);
  const hi = hhmmssToSec(hhmmMax);
  if (Number.isNaN(c) || Number.isNaN(lo) || Number.isNaN(hi)) return hhmmMax;
  if (c >= lo && c <= hi) return cur;
  return hhmmMax;
}

/**
 * 당일 분봉 한 구간(J 정규·프리 / NX 넥스트)만 KIS에서 받아 저장.
 * 차트 집계는 분당 첫/끝 틱으로 시·종, MAX/MIN으로 고·저를 쓰므로 분당 시·고·저·종 가격을
 * 같은 KST 분 안에서 서로 다른 recorded_at(0s·15s·30s·59.999s)으로 4행 넣는다.
 */
async function backfillKisMinuteTodaySegment(
  prisma: PrismaClient,
  stockCode: string,
  kstDate: string,
  baseUrl: string,
  token: string,
  key: string,
  secret: string,
  kisCode: string,
  gap: number,
  params: {
    marketDiv: "J" | "NX";
    hhmmMin: string;
    hhmmMax: string;
    initialCursor: string;
  },
): Promise<number> {
  const lo = hhmmssToSec(params.hhmmMin);
  const hi = hhmmssToSec(params.hhmmMax);
  const byMinute = new Map<
    string,
    {
      minuteBase: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: bigint | null;
      hhmmss: string;
    }
  >();
  let cursor = params.initialCursor;
  for (let page = 0; page < 40; page++) {
    let pageRows: Record<string, string | undefined>[];
    try {
      pageRows = await fetchKisTimeItemChartPrice(
        baseUrl,
        token,
        key,
        secret,
        kisCode,
        params.marketDiv,
        cursor,
      );
    } catch {
      break;
    }
    if (pageRows.length === 0) break;

    let oldest: string | null = null;
    let oldestSec = Infinity;
    for (const r of pageRows) {
      const p = parseMinuteRow(r, kstDate);
      if (!p) continue;
      const ps = hhmmssToSec(p.hhmmss);
      if (Number.isNaN(ps) || ps < lo || ps > hi) continue;
      const mk = p.minuteBase.toISOString();
      if (!byMinute.has(mk)) {
        byMinute.set(mk, {
          minuteBase: p.minuteBase,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          volume: p.volume,
          hhmmss: p.hhmmss,
        });
      }
      if (ps < oldestSec) {
        oldestSec = ps;
        oldest = p.hhmmss;
      }
    }
    if (oldest == null || !Number.isFinite(oldestSec)) break;
    if (oldestSec <= lo) break;
    cursor = hhmmssMinus1s(oldest);
    await new Promise((r) => setTimeout(r, gap));
  }

  const kstNowMinMs = kstMinuteStartFloor().getTime();
  const rowsSorted = [...byMinute.values()]
    .filter((r) => r.minuteBase.getTime() <= kstNowMinMs)
    .sort((a, b) => a.minuteBase.getTime() - b.minuteBase.getTime());
  if (rowsSorted.length === 0) return 0;

  const toInsert = rowsSorted.flatMap((r) => {
    const t0 = r.minuteBase.getTime();
    /* 시가는 분 시작 정각이면 volume NULL + KST 09:00 등 “일봉 마커” 제외 조건에 걸릴 수 있어 +1s */
    return [
      { id: randomUUID(), stockCode, recordedAt: new Date(t0 + 1_000), price: r.open, volume: null },
      { id: randomUUID(), stockCode, recordedAt: new Date(t0 + 15_000), price: r.high, volume: null },
      { id: randomUUID(), stockCode, recordedAt: new Date(t0 + 30_000), price: r.low, volume: null },
      { id: randomUUID(), stockCode, recordedAt: new Date(t0 + 60_000 - 1), price: r.close, volume: r.volume },
    ];
  });

  await prisma.stockQuoteHistory.createMany({ data: toInsert, skipDuplicates: false });
  return rowsSorted.length;
}

export type BackfillKisMinuteTodayOpts = {
  /** true: 쿨다운·커버리지 스킵 생략, J는 08:00~15:30·NX는 15:31~20:30까지 당일 백필(서버 기동용) */
  force?: boolean;
  /** 서버 재기동 보강 시작 시각(KST HHMMSS). 예: 154500 */
  startupFromHhmmss?: string;
  /** 사용자 차트 조회 직전 경로: 응답 지연을 줄이기 위해 페이지 간 대기를 더 낮춘다. */
  interactive?: boolean;
  /** KIS 폴링의 NXT 적격 맵. `false`만 오전 NX 분봉 시도를 건너뜀. */
  getNxEligibilityByCode?: () => Record<string, boolean | null>;
};

function kstHourMinute(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/**
 * 일봉 백필이 쓰는 08:00~08:03 KST 구간을 제외한 뒤, 당일 08:00(KST) 이후 첫 행.
 * 프리마켓·분봉은 08:xx에도 정상적으로 쌓일 수 있으므로, "장 시작 직후 큰 공백"으로 볼 만한
 * 시각(정규장 09:00 KST 이후)부터만 당일 08:00~ 구간을 갈아엎는다.
 * (08:01만으로 치환하면 재기동·정상 프리마켓 데이터까지 과삭제하기 쉬움)
 */
function shouldReplaceTodayByFirstBar(firstBar: Date): boolean {
  const { hour, minute } = kstHourMinute(firstBar);
  return hour * 60 + minute >= 9 * 60;
}

async function firstMeaningfulMinuteToday(
  prisma: PrismaClient,
  stockCode: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ m: Date | null }[]>`
    SELECT MIN("recorded_at") AS m
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
      AND "recorded_at" >= ${dayStart}
      AND "recorded_at" < ${dayEnd}
      AND ("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '08:00:00'
      AND NOT (
        ("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '08:00:00'
        AND ("recorded_at" AT TIME ZONE 'Asia/Seoul')::time < TIME '08:04:00'
      )
  `;
  return rows[0]?.m ?? null;
}

/**
 * 당일 KST 09:00~14:30 구간에 실제로 몇 분의 틱이 있는지(장중 코어).
 * 일봉 백필이 넣은 08:00~08:03만 있고 오후 폴링만 이어지는 경우, 전체 distinct 분 수만으로는
 * "이미 하루 분봉이 다 찼다"고 오판해 KIS 보강을 건너뛰는 문제를 막는다.
 */
async function distinctCoreSessionMinutesToday(
  prisma: PrismaClient,
  stockCode: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT DATE_TRUNC('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul'))::bigint AS n
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
      AND "recorded_at" >= ${dayStart}
      AND "recorded_at" < ${dayEnd}
      AND "price" > 0
      AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '09:00:00')
      AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time <= TIME '14:30:00')
  `;
  return Number(rows[0]?.n ?? 0);
}

async function distinctPremarketMinutesToday(
  prisma: PrismaClient,
  stockCode: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT DATE_TRUNC('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul'))::bigint AS n
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
      AND "recorded_at" >= ${dayStart}
      AND "recorded_at" < ${dayEnd}
      AND "price" > 0
      AND EXTRACT(ISODOW FROM ("recorded_at" AT TIME ZONE 'Asia/Seoul')) BETWEEN 1 AND 5
      AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time >= TIME '08:00:00')
      AND (("recorded_at" AT TIME ZONE 'Asia/Seoul')::time < TIME '09:00:00')
  `;
  return Number(rows[0]?.n ?? 0);
}

/** 분봉에서 오늘 장중 데이터가 비는 경우, KIS 당일분봉(30건/page)을 역순으로 수집해 보강 */
export async function maybeBackfillKisMinuteToday(
  prisma: PrismaClient,
  env: Env,
  stockCode: string,
  opts?: BackfillKisMinuteTodayOpts,
): Promise<void> {
  const force = opts?.force === true;
  const interactive = opts?.interactive === true;
  const startupFromHhmmss = opts?.startupFromHhmmss?.trim();
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (!key || !secret) return;

  const now = Date.now();
  if (!force && now < (minuteBackfillNotBefore.get(stockCode) ?? 0)) return;

  /** KST 전일 휴장에는 KIS 당일분봉을 넣지 않음(빈·전일 데이터가 섞여 버킷이 생기는 것 방지). `force`도 덮지 않음. */
  if (isKrxScheduledFullDayClosureKstYmd(kstYmdForInstant(new Date()))) return;

  const kstDate = formatKstDateOnly(new Date());
  const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
  const kstOpenGrace = new Date(`${kstDate}T08:15:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  if (!force) {
    const coverage = await loadMinuteCoverageToday(prisma, stockCode);
    const minT =
      coverage.firstHhmmss != null ? new Date(`${kstDate}T${coverage.firstHhmmss.slice(0, 2)}:${coverage.firstHhmmss.slice(2, 4)}:00+09:00`) : null;
    const distinctMinutes = coverage.distinctMinutes;
    const coreMinutes = coverage.coreMinutes;
    const premarketMinutes = coverage.premarketMinutes;
    /** 09:00~14:30 구간에 충분한 분이 있어야 "당일 분봉이 이미 갖춰졌다"고 본다 */
    const coreLooksFull = coreMinutes >= 120;
    const pastPremarket = kstPastPremarketWindow();
    const premarketLooksOk = !pastPremarket || premarketMinutes >= 1;
    if (
      minT != null &&
      minT.getTime() <= kstOpenGrace.getTime() &&
      distinctMinutes >= 240 &&
      coreLooksFull &&
      premarketLooksOk
    ) {
      minuteBackfillNotBefore.set(stockCode, now + 45_000);
      return;
    }
  }

  const baseUrl = (env.KIS_REST_BASE_URL?.trim() || "https://openapivts.koreainvestment.com:29443").replace(
    /\/$/,
    "",
  );
  const kisCode = normalizeKrxStockCode(stockCode);
  let token: string;
  try {
    token = await ensureBackfillToken(baseUrl, key, secret);
  } catch {
    return;
  }
  const configuredGap = Math.min(700, Math.max(200, env.KIS_QUOTE_REQUEST_GAP_MS ?? 400));
  const gap = interactive ? Math.max(80, Math.floor(configuredGap / 3)) : configuredGap;

  let todayClearedFrom8 = false;
  if (force) {
    try {
      const firstBar = await firstMeaningfulMinuteToday(prisma, stockCode, dayStart, dayEnd);
      if (firstBar && shouldReplaceTodayByFirstBar(firstBar)) {
        const cutoff = new Date(`${kstDate}T08:00:00+09:00`);
        await prisma.$executeRaw`
          DELETE FROM "stock_quote_history"
          WHERE "stock_code" = ${stockCode}
            AND "recorded_at" >= ${cutoff}
        `;
        todayClearedFrom8 = true;
      }
    } catch {
      /* DB 오류 시 삭제 생략 후 백필만 시도 */
    }
  }

  /**
   * J 시장 프리·정규 구간: KST 08:00~15:30.
   * 당일 08:00(KST) 이후를 갈아엎은 뒤에는 반드시 08:00부터 다시 채운다.
   * 같은 날 재기동이고 직전 종료 시각(`startupFromHhmmss`)이 있으면, 삭제를 하지 않은 경우에만
   * 그 시각 이후만 보강해 KIS·폴링 분봉을 이중 삽입하지 않는다.
   */
  const resumeFrom =
    force && startupFromHhmmss && /^\d{6}$/.test(startupFromHhmmss) ? startupFromHhmmss : null;

  /**
   * J(거래소) 당일분봉은 09:00 이전 봉이 비는 경우가 많고, NXT 적격 종목의 08:00~08:59는 NX 구분으로만 내려온다.
   * - 명시적으로 NXT 비적격(false)이면 J만 08:00부터.
   * - 그 외에는 먼저 NX 08:00~08:59를 시도하고, 한 건이라도 나오면 J는 09:00부터(분 단위 중복 삽입 방지).
   */
  const nxMap = opts?.getNxEligibilityByCode?.() ?? {};
  const nxKnownFalse = nxMap[stockCode] === false;
  let inserted = 0;
  let nxMorningInserted = 0;
  if (!nxKnownFalse) {
    const cursorNxAm = pickInitialCursor("080000", "085959");
    nxMorningInserted = await backfillKisMinuteTodaySegment(
      prisma,
      stockCode,
      kstDate,
      baseUrl,
      token,
      key,
      secret,
      kisCode,
      gap,
      { marketDiv: "NX", hhmmMin: "080000", hhmmMax: "085959", initialCursor: cursorNxAm },
    );
    inserted += nxMorningInserted;
  }
  const jFrom090 = nxMap[stockCode] === true || (!nxKnownFalse && nxMorningInserted > 0);
  const jMinFloor = jFrom090 ? "090000" : "080000";
  const jMin =
    resumeFrom && resumeFrom > jMinFloor && !todayClearedFrom8 ? resumeFrom : jMinFloor;
  const jMax = "153059";
  const cursorJ = pickInitialCursor(jMin, jMax);
  inserted += await backfillKisMinuteTodaySegment(
    prisma,
    stockCode,
    kstDate,
    baseUrl,
    token,
    key,
    secret,
    kisCode,
    gap,
    { marketDiv: "J", hhmmMin: jMin, hhmmMax: jMax, initialCursor: cursorJ },
  );

  if (interactive && !force) {
    await redisSetJson(minutePremarketAttemptRedisKey(stockCode, kstDate), { v: 1 }, 48 * 3600 * 1000);
  }

  if (force) {
    const nxMinBase = "153100";
    const nxMin =
      resumeFrom && resumeFrom > nxMinBase && !todayClearedFrom8 ? resumeFrom : nxMinBase;
    const nxMax = "203059";
    const nowHhmmss = kstHhmmssFromDate(new Date());
    if (nowHhmmss >= nxMinBase) {
      const cursorNx = pickInitialCursor(nxMin, nxMax);
      inserted += await backfillKisMinuteTodaySegment(
        prisma,
        stockCode,
        kstDate,
        baseUrl,
        token,
        key,
        secret,
        kisCode,
        gap,
        { marketDiv: "NX", hhmmMin: nxMin, hhmmMax: nxMax, initialCursor: cursorNx },
      );
    }
  }

  if (inserted === 0) {
    minuteBackfillNotBefore.set(stockCode, now + 30_000);
    return;
  }
  minuteBackfillNotBefore.set(stockCode, Date.now() + 45_000);
}

/** 서버 기동 시 활성 종목별 당일 분봉 강제 백필 (폴링 시작 전) */
export async function runStartupKisMinuteBackfill(
  prisma: PrismaClient,
  env: Env,
  opts?: { startupFromHhmmss?: string; getNxEligibilityByCode?: () => Record<string, boolean | null> },
): Promise<void> {
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (!key || !secret) return;

  const stocks = await prisma.stock.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true },
  });

  const between = Math.min(700, Math.max(200, env.KIS_QUOTE_REQUEST_GAP_MS ?? 400));
  for (const s of stocks) {
    try {
      await startOrJoinKisMinuteBackfillToday(prisma, env, s.code, {
        force: true,
        startupFromHhmmss: opts?.startupFromHhmmss,
        getNxEligibilityByCode: opts?.getNxEligibilityByCode,
      });
    } catch {
      /* 한 종목 실패해도 다음 종목 계속 */
    }
    await new Promise((r) => setTimeout(r, between));
  }
}
