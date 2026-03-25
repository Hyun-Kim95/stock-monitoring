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
/** 이 시각(ms) 이전에는 당일 분봉 백필을 다시 시도하지 않음 (성공·스킵·빈응답 시에만 갱신) */
const minuteBackfillNotBefore = new Map<string, number>();

/** 기동 시 일봉·분봉 쿨다운 초기화(삭제 후 재백필과 맞춤) */
export function resetQuoteHistoryCaches(): void {
  lastBackfillAt.clear();
  minuteBackfillNotBefore.clear();
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
    const t = kstDayOffMarketInstants(y, mo, d);
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
 * 그 시각이 08:00 정각이 아니라 08:01 이후이면 앞 구간이 비어 있어 당일 구간을 갈아엎고 백필한다.
 */
function shouldReplaceTodayByFirstBar(firstBar: Date): boolean {
  const { hour, minute } = kstHourMinute(firstBar);
  return hour * 60 + minute >= 8 * 60 + 1;
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

/** 분봉에서 오늘 장중 데이터가 비는 경우, KIS 당일분봉(30건/page)을 역순으로 수집해 보강 */
export async function maybeBackfillKisMinuteToday(
  prisma: PrismaClient,
  env: Env,
  stockCode: string,
  opts?: BackfillKisMinuteTodayOpts,
): Promise<void> {
  const force = opts?.force === true;
  const startupFromHhmmss = opts?.startupFromHhmmss?.trim();
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (!key || !secret) return;

  const now = Date.now();
  if (!force && now < (minuteBackfillNotBefore.get(stockCode) ?? 0)) return;

  const kstDate = formatKstDateOnly(new Date());
  const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
  const kstOpenGrace = new Date(`${kstDate}T08:15:00+09:00`);

  if (!force) {
    const todayBounds = await prisma.$queryRaw<{ min_t: Date | null; distinct_minutes: bigint }[]>`
      SELECT
        MIN("recorded_at") AS min_t,
        COUNT(DISTINCT DATE_TRUNC('minute', "recorded_at" AT TIME ZONE 'Asia/Seoul'))::bigint AS distinct_minutes
      FROM "stock_quote_history"
      WHERE "stock_code" = ${stockCode}
        AND "recorded_at" >= ${dayStart}
        AND "price" > 0
    `;
    const b = todayBounds[0];
    const minT = b?.min_t ?? null;
    const distinctMinutes = Number(b?.distinct_minutes ?? 0);
    if (minT != null && minT.getTime() <= kstOpenGrace.getTime() && distinctMinutes >= 240) {
      minuteBackfillNotBefore.set(stockCode, now + 2 * 60_000);
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
  const gap = Math.min(700, Math.max(200, env.KIS_QUOTE_REQUEST_GAP_MS ?? 400));

  if (force && (!startupFromHhmmss || !/^\d{6}$/.test(startupFromHhmmss))) {
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    try {
      const firstBar = await firstMeaningfulMinuteToday(prisma, stockCode, dayStart, dayEnd);
      if (firstBar && shouldReplaceTodayByFirstBar(firstBar)) {
        const cutoff = new Date(`${kstDate}T08:00:00+09:00`);
        await prisma.$executeRaw`
          DELETE FROM "stock_quote_history"
          WHERE "stock_code" = ${stockCode}
            AND "recorded_at" >= ${cutoff}
        `;
      }
    } catch {
      /* DB 오류 시 삭제 생략 후 백필만 시도 */
    }
  }

  /** J 시장 프리·정규 구간: KST 08:00~15:30. 재기동 보강 시엔 직전 종료 시각 이후만 조회 */
  const startupFrom = startupFromHhmmss && /^\d{6}$/.test(startupFromHhmmss) ? startupFromHhmmss : null;
  const jMin = startupFrom && startupFrom > "080000" ? startupFrom : "080000";
  const jMax = "153059";
  const cursorJ = pickInitialCursor(jMin, jMax);
  let inserted = await backfillKisMinuteTodaySegment(
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

  if (force) {
    const nxMinBase = "153100";
    const nxMin = startupFrom && startupFrom > nxMinBase ? startupFrom : nxMinBase;
    const nxMax = "203059";
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

  if (inserted === 0) {
    minuteBackfillNotBefore.set(stockCode, now + 60_000);
    return;
  }
  minuteBackfillNotBefore.set(stockCode, Date.now() + 2 * 60_000);
}

/** 서버 기동 시 활성 종목별 당일 분봉 강제 백필 (폴링 시작 전) */
export async function runStartupKisMinuteBackfill(
  prisma: PrismaClient,
  env: Env,
  opts?: { startupFromHhmmss?: string },
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
      await maybeBackfillKisMinuteToday(prisma, env, s.code, {
        force: true,
        startupFromHhmmss: opts?.startupFromHhmmss,
      });
    } catch {
      /* 한 종목 실패해도 다음 종목 계속 */
    }
    await new Promise((r) => setTimeout(r, between));
  }
}
