import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeKrxStockCode } from "@stock-monitoring/shared";
import type { Env } from "../../config.js";
import {
  fetchKisAccessToken,
  fetchKisDailyItemChartPriceAll,
  fetchKisTimeItemChartPrice,
  parseKisNumber,
} from "../market-data/kis/kis-rest.js";

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
const lastMinuteBackfillAt = new Map<string, number>();
let backfillTokenCache: { baseUrl: string; token: string; expiresAt: number } | null = null;

async function ensureBackfillToken(baseUrl: string, appKey: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (backfillTokenCache && backfillTokenCache.baseUrl === baseUrl && backfillTokenCache.expiresAt > now + 60_000) {
    return backfillTokenCache.token;
  }
  const t = await fetchKisAccessToken(baseUrl, appKey, appSecret);
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

/** 해당 KST 달력일의 시고저종 순서로 기록 (PostgreSQL date_trunc 일봉 집계와 맞춤) */
function kstDayToUtcInstants(y: number, mo: number, d: number): { open: Date; high: Date; low: Date; close: Date } {
  const m = mo - 1;
  return {
    open: new Date(Date.UTC(y, m, d, 0, 0, 0)),
    low: new Date(Date.UTC(y, m, d, 1, 0, 0)),
    high: new Date(Date.UTC(y, m, d, 3, 0, 0)),
    close: new Date(Date.UTC(y, m, d, 6, 30, 0)),
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

  lastBackfillAt.set(stockCode, now);

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
    const t = kstDayToUtcInstants(y, mo, d);
    inserts.push(
      { id: randomUUID(), stockCode, recordedAt: t.open, price: p.open, volume: null },
      { id: randomUUID(), stockCode, recordedAt: t.low, price: p.low, volume: null },
      { id: randomUUID(), stockCode, recordedAt: t.high, price: p.high, volume: null },
      // 분봉 집계와 충돌하지 않도록 백필 포인트는 volume을 저장하지 않음
      { id: randomUUID(), stockCode, recordedAt: t.close, price: p.close, volume: null },
    );
  }

  if (inserts.length === 0) return;

  try {
    await prisma.stockQuoteHistory.createMany({ data: inserts });
  } catch {
    /* DB 없음 등 */
  }
}

function formatKstDateOnly(d: Date): string {
  const s = d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
  return s.slice(0, 10);
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
  close: number;
  volume: bigint | null;
  hhmmss: string;
} | null {
  const hhmmss = (row.stck_cntg_hour ?? row.STCK_CNTG_HOUR ?? "").trim();
  if (!/^\d{6}$/.test(hhmmss)) return null;
  const close = parseKisNumber(row.stck_prpr ?? row.STCK_PRPR ?? row.stck_clpr ?? row.STCK_CLPR);
  if (!Number.isFinite(close) || close <= 0) return null;
  const volNum = parseKisNumber(row.cntg_vol ?? row.CNTG_VOL ?? row.acml_vol ?? row.ACML_VOL);
  const volume = Number.isFinite(volNum) && volNum >= 0 ? BigInt(Math.floor(volNum)) : null;
  const minuteIso = `${kstDate}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:00+09:00`;
  const minuteBase = new Date(minuteIso);
  if (Number.isNaN(minuteBase.getTime())) return null;
  return {
    minuteBase,
    close: Math.round(close),
    volume,
    hhmmss,
  };
}

/** 분봉에서 오늘 장중 데이터가 비는 경우, KIS 당일분봉(30건/page)을 역순으로 수집해 보강 */
export async function maybeBackfillKisMinuteToday(
  prisma: PrismaClient,
  env: Env,
  stockCode: string,
): Promise<void> {
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (!key || !secret) return;

  const now = Date.now();
  const last = lastMinuteBackfillAt.get(stockCode) ?? 0;
  if (now - last < 2 * 60_000) return;
  lastMinuteBackfillAt.set(stockCode, now);

  const kstDate = formatKstDateOnly(new Date());
  const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
  const todayBounds = await prisma.$queryRaw<{ min_t: Date | null; max_t: Date | null; n: bigint }[]>`
    SELECT
      MIN("recorded_at") AS min_t,
      MAX("recorded_at") AS max_t,
      COUNT(*)::bigint AS n
    FROM "stock_quote_history"
    WHERE "stock_code" = ${stockCode}
      AND "recorded_at" >= ${dayStart}
      AND "price" > 0
      AND "volume" IS NOT NULL
  `;
  const b = todayBounds[0];
  const existing = Number(b?.n ?? 0);
  const minT = b?.min_t ?? null;
  if (existing >= 360 && minT) {
    const hhmm = new Date(minT).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Seoul",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    // 오늘 09시대부터 이미 쌓여 있으면 충분하다고 판단
    if (hhmm <= "09:10") return;
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
  const gap = Math.min(700, Math.max(200, env.KIS_QUOTE_REQUEST_GAP_MS ?? 400));

  const rowsToInsert: { id: string; stockCode: string; recordedAt: Date; price: number; volume: bigint | null }[] =
    [];
  const seen = new Set<string>();

  for (const marketDiv of ["J", "NX"] as const) {
    let cursor = "200000";
    for (let page = 0; page < 20; page++) {
      let pageRows: Record<string, string | undefined>[];
      try {
        pageRows = await fetchKisTimeItemChartPrice(
          baseUrl,
          token,
          key,
          secret,
          kisCode,
          marketDiv,
          cursor,
        );
      } catch {
        break;
      }
      if (pageRows.length === 0) break;

      let oldest: string | null = null;
      for (const r of pageRows) {
        const p = parseMinuteRow(r, kstDate);
        if (!p) continue;
        if (p.hhmmss < "090000" || p.hhmmss > "203000") continue;
        const dedupe = `${p.minuteBase.toISOString()}|${p.close}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        rowsToInsert.push({
          id: randomUUID(),
          stockCode,
          recordedAt: p.minuteBase,
          price: p.close,
          volume: p.volume,
        });
        if (!oldest || p.hhmmss < oldest) oldest = p.hhmmss;
      }
      if (!oldest || oldest <= "090000") break;
      cursor = hhmmssMinus1s(oldest);
      await new Promise((r) => setTimeout(r, gap));
    }
  }

  if (rowsToInsert.length === 0) return;

  // 분당 종가 시계열에서 분봉 OHLC를 재구성해 저장 (open=직전 close, high/low=max/min(open, close))
  rowsToInsert.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const rebuilt: { id: string; stockCode: string; recordedAt: Date; price: number; volume: bigint | null }[] = [];
  let prevClose: number | null = null;
  for (const r of rowsToInsert) {
    const close = Math.round(r.price);
    const open = prevClose == null ? close : prevClose;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    const openAt = new Date(r.recordedAt.getTime());
    const lowAt = new Date(r.recordedAt.getTime() + 10_000);
    const highAt = new Date(r.recordedAt.getTime() + 20_000);
    const closeAt = new Date(r.recordedAt.getTime() + 50_000);
    rebuilt.push(
      { id: randomUUID(), stockCode, recordedAt: openAt, price: open, volume: null },
      { id: randomUUID(), stockCode, recordedAt: lowAt, price: low, volume: null },
      { id: randomUUID(), stockCode, recordedAt: highAt, price: high, volume: null },
      { id: randomUUID(), stockCode, recordedAt: closeAt, price: close, volume: r.volume },
    );
    prevClose = close;
  }

  await prisma.stockQuoteHistory.createMany({ data: rebuilt, skipDuplicates: false });
}
