import type { QuoteSnapshot } from "@stock-monitoring/shared";
import { normalizeKrxStockCode } from "@stock-monitoring/shared";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MarketDataProvider } from "../types.js";
import {
  fetchKisAccessToken,
  fetchKisInquirePrice,
  fetchKisInvestorTrend,
  parseKisNumber,
  parseKisSignedFluctuation,
} from "./kis-rest.js";

type SessionState = "OPEN" | "CLOSED" | "PRE" | "AFTER";
type SessionSlot = "OFF" | "PRE" | "REGULAR" | "NXT" | "AFTER";
const KIS_TOKEN_CACHE_FILE = path.join(os.homedir(), ".stock-monitoring", "kis-token-cache.json");

function kstSessionSlotNow(): SessionSlot {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") return "OFF";

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  // 7:30~8:00 PRE, 8:00~15:30는 단일가·정규 포함해 시세·분봉(8시~)과 맞게 REGULAR→OPEN. NXT 15:30~20:00
  if (mins >= 7 * 60 + 30 && mins < 8 * 60) return "PRE";
  if (mins >= 8 * 60 && mins < 15 * 60 + 30) return "REGULAR";
  if (mins >= 15 * 60 + 30 && mins < 20 * 60) return "NXT";
  if (mins >= 20 * 60 && mins < 20 * 60 + 30) return "AFTER";
  return "OFF";
}

type TokenState = { token: string; expiresAt: number };
let tokenRetryNotBefore = 0;

async function readTokenCache(): Promise<TokenState | null> {
  try {
    const raw = await fs.readFile(KIS_TOKEN_CACHE_FILE, "utf8");
    const json = JSON.parse(raw) as Partial<TokenState>;
    const token = typeof json.token === "string" ? json.token.trim() : "";
    const expiresAt = Number(json.expiresAt);
    if (!token || !Number.isFinite(expiresAt)) return null;
    return { token, expiresAt };
  } catch {
    return null;
  }
}

async function writeTokenCache(state: TokenState): Promise<void> {
  const dir = path.dirname(KIS_TOKEN_CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(KIS_TOKEN_CACHE_FILE, JSON.stringify(state), "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositive(out: Record<string, string | undefined>, ...keys: string[]): number {
  for (const k of keys) {
    const n = parseKisNumber(out[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

function kstYmdNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date())
    .replace(/-/g, "");
}

function pickForeignNetByDate(
  rows: Array<Record<string, string | undefined>>,
  targetYmd: string,
): number | null {
  const parse = (r: Record<string, string | undefined>) => {
    const n = parseKisNumber(r.frgn_ntby_qty ?? r.FRGN_NTBY_QTY);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const todayRow = rows.find((r) => String(r.stck_bsop_date ?? r.STCK_BSOP_DATE ?? "").trim() === targetYmd);
  if (todayRow) {
    const v = parse(todayRow);
    if (v != null) return v;
  }
  for (const r of rows) {
    const v = parse(r);
    if (v != null) return v;
  }
  return null;
}

function pickForeignNetTodayOnly(
  rows: Array<Record<string, string | undefined>>,
  targetYmd: string,
): number | null {
  const todayRow = rows.find((r) => String(r.stck_bsop_date ?? r.STCK_BSOP_DATE ?? "").trim() === targetYmd);
  if (!todayRow) return null;
  const n = parseKisNumber(todayRow.frgn_ntby_qty ?? todayRow.FRGN_NTBY_QTY);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export type KisPollingOptions = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  trIdPrice: string;
  /** 폴링 주기 ms */
  pollIntervalMs: number;
  /** 종목별 inquire-price 사이 대기(ms). KIS 초당 거래건수 제한 대응 */
  quoteRequestGapMs: number;
  /** 투자자 수급 재조회 주기(ms). 0 이하이면 비활성 */
  investorRefreshMs?: number;
};

/**
 * KIS REST 현재가를 주기적으로 폴링해 스냅샷 갱신 (실시간 WS는 추후).
 */
export function createKisPollingProvider(opts: KisPollingOptions): MarketDataProvider & {
  getStatusMessage(): string;
} {
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(quotes: QuoteSnapshot[]) => void>();
  const symbols: { code: string; name: string }[] = [];
  let lastQuotes: QuoteSnapshot[] = [];
  let tokenState: TokenState | null = null;
  let connected = false;
  let statusMessage = "KIS 초기화";
  let tickInFlight = false;
  const nxEligibleByCode = new Map<string, boolean | null>();
  const nxEligibilityFailByCode = new Map<string, number>();
  const investorNetByCode = new Map<string, { value: number | null; fetchedAt: number; inFlight?: Promise<void> }>();
  let tokenCacheHydrated = false;
  /** tick과 동시에 seed하면 토큰 발급·한도에서 실패하고 맵이 영원히 비는 경우가 있어, 첫 틱 이후에만 시드한다 */
  let nxEligibilitySeedStarted = false;
  let nxEligibilitySeedQueued = false;

  async function refreshInvestorNetIfNeeded(token: string, code: string): Promise<void> {
    const refreshMs = opts.investorRefreshMs ?? 60_000;
    if (refreshMs <= 0) return;
    const now = Date.now();
    const state = investorNetByCode.get(code);
    if (state?.inFlight) return;
    if (state && now - state.fetchedAt < refreshMs) return;
    const inFlight = (async () => {
      try {
        const todayYmd = kstYmdNow();
        const rowsJ = await fetchKisInvestorTrend(
          opts.baseUrl,
          token,
          opts.appKey,
          opts.appSecret,
          normalizeKrxStockCode(code),
          "J",
        );
        const vJ = pickForeignNetByDate(rowsJ, todayYmd);
        let vNx: number | null = null;
        try {
          const rowsNx = await fetchKisInvestorTrend(
            opts.baseUrl,
            token,
            opts.appKey,
            opts.appSecret,
            normalizeKrxStockCode(code),
            "NX",
          );
          // NX는 오늘 행이 없을 때 과거 데이터(며칠~수주 전)가 내려오는 케이스가 있어,
          // today 행이 확인될 때만 합산한다.
          vNx = pickForeignNetTodayOnly(rowsNx, todayYmd);
        } catch {
          // NX 미지원/빈응답이면 J만 사용
        }
        // 일부 종목/시점에서 J와 NX가 동일 값으로 내려와 단순 합산 시 2배가 될 수 있다.
        const merged =
          vJ != null && vNx != null ? (vJ === vNx ? vJ : vJ + vNx) : vJ != null ? vJ : vNx != null ? vNx : null;
        investorNetByCode.set(code, { value: merged, fetchedAt: Date.now() });
      } catch {
        investorNetByCode.set(code, { value: state?.value ?? null, fetchedAt: Date.now() });
      }
    })();
    investorNetByCode.set(code, { value: state?.value ?? null, fetchedAt: state?.fetchedAt ?? 0, inFlight });
    await inFlight;
  }

  async function ensureToken(): Promise<string> {
    const now = Date.now();
    if (!tokenCacheHydrated) {
      tokenCacheHydrated = true;
      const cached = await readTokenCache();
      if (cached && cached.expiresAt > now + 60_000) {
        tokenState = cached;
      }
    }
    // 만료 여유 1분 이상 남은 토큰은 그대로 사용
    if (tokenState && tokenState.expiresAt > now + 60_000) {
      return tokenState.token;
    }
    // EGW00133로 재발급만 막힌 경우: 아직 만료 전이면 기존 토큰으로 시세 조회 계속 (쿨다운 ≠ 통신 실패)
    if (now < tokenRetryNotBefore) {
      if (tokenState && tokenState.expiresAt > now) {
        return tokenState.token;
      }
      const waitSec = Math.ceil((tokenRetryNotBefore - now) / 1000);
      throw new Error(`KIS_TOKEN_COOLDOWN:${waitSec}`);
    }
    let t;
    try {
      t = await fetchKisAccessToken(opts.baseUrl, opts.appKey, opts.appSecret);
      tokenRetryNotBefore = 0;
    } catch (e) {
      const msg = String(e);
      if (msg.includes("EGW00133") || msg.includes("접근토큰 발급 잠시 후 다시 시도하세요")) {
        tokenRetryNotBefore = Date.now() + 65_000;
      }
      throw e;
    }
    const exp = Date.parse(t.access_token_token_expired.replace(" ", "T"));
    const expiresAt = Number.isNaN(exp) ? now + 23 * 3600_000 : exp;
    tokenState = { token: t.access_token, expiresAt };
    void writeTokenCache(tokenState).catch(() => undefined);
    return t.access_token;
  }

  function mapOutput(
    code: string,
    name: string,
    out: Record<string, string | undefined>,
    marketSession: SessionState,
  ): QuoteSnapshot {
    const price = parsePositive(
      out,
      "stck_prpr",
      "STCK_PRPR",
      "prdy_clpr",
      "PRDY_CLPR",
      "stck_sdpr",
      "STCK_SDPR",
      "stck_clpr",
      "STCK_CLPR",
    );
    if (Number.isNaN(price)) {
      throw new Error("stck_prpr 없음/파싱 실패");
    }
    const prdySign = out.prdy_vrss_sign ?? out.PRDY_VRSS_SIGN;
    const change = parseKisSignedFluctuation(out.prdy_vrss ?? out.PRDY_VRSS, prdySign);
    const changeRate = parseKisSignedFluctuation(out.prdy_ctrt ?? out.PRDY_CTRT, prdySign);
    const volume = parseKisNumber(out.acml_vol ?? out.ACML_VOL);
    const frgnNetFromPrice = parseKisNumber(out.frgn_ntby_qty ?? out.FRGN_NTBY_QTY);
    const frgnNetFromInvestor = investorNetByCode.get(code)?.value;
    const frgnNet = frgnNetFromInvestor ?? (Number.isNaN(frgnNetFromPrice) ? NaN : frgnNetFromPrice);
    const frgnPct = parseKisNumber(out.hts_frgn_ehrt ?? out.HTS_FRGN_EHRT);
    /** DB `stocks.stock_name` 우선 — KIS HTS명은 상장사 명칭 변경 후에도 늦게 갱신되는 경우가 있음 */
    const kisHtsName = (out.hts_kor_isnm ?? out.HTS_KOR_ISNM ?? "").trim();
    const displayName = name.trim() || kisHtsName || code;
    return {
      symbol: code,
      name: displayName,
      price,
      change: Number.isNaN(change) ? 0 : change,
      changeRate: Number.isNaN(changeRate) ? 0 : changeRate,
      volume: Number.isNaN(volume) || volume < 0 ? 0 : Math.floor(volume),
      timestamp: new Date().toISOString(),
      marketSession,
      foreignNetBuyVolume: Number.isNaN(frgnNet) ? null : Math.trunc(frgnNet),
      /** API 원값 유지 — 앱마다 소수 자릿수만 다름 */
      foreignOwnershipPct: Number.isNaN(frgnPct) ? null : frgnPct,
    };
  }

  async function tick() {
    if (symbols.length === 0) return;
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const token = await ensureToken();
      const batch: QuoteSnapshot[] = [];
      const gap = Math.max(0, opts.quoteRequestGapMs);
      let hitRateLimit = false;
      const slot = kstSessionSlotNow();
      for (let i = 0; i < symbols.length; i++) {
        const s = symbols[i]!;
        if (i > 0) await sleep(gap);
        try {
          const kisIscd = normalizeKrxStockCode(s.code);
          const request = (marketDiv: "J" | "NX") =>
            fetchKisInquirePrice(
              opts.baseUrl,
              token,
              opts.appKey,
              opts.appSecret,
              kisIscd,
              opts.trIdPrice,
              marketDiv,
            );

          let out: Record<string, string | undefined> | null = null;
          let usedNx = false;

          if ((slot === "NXT" || slot === "AFTER") && nxEligibleByCode.get(s.code) !== false) {
            try {
              const nxOut = await request("NX");
              const nxPrice = parsePositive(nxOut, "stck_prpr", "STCK_PRPR");
              if (Number.isFinite(nxPrice) && nxPrice > 0) {
                out = nxOut;
                usedNx = true;
                nxEligibleByCode.set(s.code, true);
                nxEligibilityFailByCode.set(s.code, 0);
              } else {
                // 0원/빈값은 시간대·상황 영향일 수 있어 즉시 미적격으로 단정하지 않는다.
                const fail = (nxEligibilityFailByCode.get(s.code) ?? 0) + 1;
                nxEligibilityFailByCode.set(s.code, fail);
                nxEligibleByCode.set(s.code, fail >= 6 ? false : null);
              }
            } catch {
              const fail = (nxEligibilityFailByCode.get(s.code) ?? 0) + 1;
              nxEligibilityFailByCode.set(s.code, fail);
              nxEligibleByCode.set(s.code, fail >= 6 ? false : null);
            }
          }

          if (!out) {
            out = await request("J");
          }
          void refreshInvestorNetIfNeeded(token, s.code);

          let marketSession: SessionState = "CLOSED";
          if (slot === "PRE") marketSession = "PRE";
          else if (slot === "REGULAR") marketSession = "OPEN";
          else if (slot === "NXT") marketSession = usedNx ? "OPEN" : "CLOSED";
          else if (slot === "AFTER") marketSession = usedNx ? "AFTER" : "CLOSED";

          batch.push(mapOutput(s.code, s.name, out, marketSession));
        } catch (e) {
          const msg = String(e);
          const rateLimited =
            msg.includes("EGW00201") || msg.includes("초당 거래건수") || msg.includes("거래건수를 초과");
          const tokenLikelyInvalid =
            msg.includes("EGW00123") ||
            msg.includes("EGW00115") ||
            (msg.includes("토큰") && (msg.includes("만료") || msg.includes("유효")));
          if (tokenLikelyInvalid) tokenState = null;
          if (rateLimited) hitRateLimit = true;
          const tokenLimited = msg.includes("EGW00133") || msg.includes("접근토큰 발급 잠시 후 다시 시도하세요");
          statusMessage = tokenLimited
            ? "KIS 토큰 발급 제한(1분 1회). 잠시 후 자동 재시도합니다."
            : rateLimited
            ? `KIS 호출 한도 초과(초당 건수). .env KIS_QUOTE_REQUEST_GAP_MS(현재 ${gap}ms)를 늘리거나 market_data.poll_interval_ms를 올리세요.`
            : `KIS ${s.code} 오류: ${msg.slice(0, 120)}`;
          const prev = lastQuotes.find((q) => q.symbol === s.code);
          if (prev) batch.push({ ...prev, name: s.name.trim() || prev.name });
        }
      }
      if (batch.length > 0) {
        lastQuotes = batch;
        connected = true;
        if (!hitRateLimit) statusMessage = "KIS 연결 (REST 폴링)";
        for (const cb of listeners) cb(batch);
      }
      if (!nxEligibilitySeedStarted && !nxEligibilitySeedQueued && symbols.length > 0) {
        nxEligibilitySeedQueued = true;
        seedNxEligibilityAsync();
      }
    } catch (e) {
      const msg = String(e);
      if (msg.startsWith("Error: KIS_TOKEN_COOLDOWN:") || msg.includes("KIS_TOKEN_COOLDOWN:")) {
        const sec = msg.split("KIS_TOKEN_COOLDOWN:")[1]?.trim().split(/[\s:]/)[0] ?? "?";
        statusMessage = `KIS 접근토큰 재발급 대기(약 ${sec}초). 1분당 1회 제한 해제 후 자동 재시도합니다.`;
        connected = lastQuotes.length > 0;
      } else {
        connected = false;
        statusMessage = `KIS 토큰/통신 실패: ${msg.slice(0, 160)}`;
      }
      for (const cb of listeners) cb(lastQuotes);
    } finally {
      tickInFlight = false;
    }
  }

  /** 장중에도 관심종목 표에서 NXT 여부를 쓰려면 NX 현재가 1회 조회로 맵을 채운다 */
  function seedNxEligibilityAsync(): void {
    void (async () => {
      try {
        if (symbols.length === 0) return;
        const gap = Math.max(0, opts.quoteRequestGapMs);
        const token = await ensureToken();
        nxEligibilitySeedStarted = true;
        for (let i = 0; i < symbols.length; i++) {
          const s = symbols[i]!;
          if (nxEligibleByCode.has(s.code)) continue;
          try {
            const kisIscd = normalizeKrxStockCode(s.code);
            const nxOut = await fetchKisInquirePrice(
              opts.baseUrl,
              token,
              opts.appKey,
              opts.appSecret,
              kisIscd,
              opts.trIdPrice,
              "NX",
            );
            const nxPrice = parsePositive(nxOut, "stck_prpr", "STCK_PRPR");
            if (Number.isFinite(nxPrice) && nxPrice > 0) {
              nxEligibleByCode.set(s.code, true);
              nxEligibilityFailByCode.set(s.code, 0);
            } else {
              nxEligibleByCode.set(s.code, null);
            }
          } catch {
            nxEligibleByCode.set(s.code, null);
          }
          if (i < symbols.length - 1) await sleep(gap);
        }
      } catch {
        /* 토큰 실패 등 — started 미설정 상태로 두어 다음 틱에서 다시 큐 */
      } finally {
        nxEligibilitySeedQueued = false;
      }
    })();
  }

  return {
    start(nextSymbols) {
      this.stop();
      // stop()이 statusMessage를 "KIS 중지"로 두면, 첫 tick 전에 브로드캐스트된 UI가 그대로 남습니다.
      statusMessage = "KIS 연결 중…";
      symbols.length = 0;
      symbols.push(...nextSymbols);
      lastQuotes = [];
      tokenState = null;
      investorNetByCode.clear();
      nxEligibleByCode.clear();
      nxEligibilityFailByCode.clear();
      nxEligibilitySeedStarted = false;
      nxEligibilitySeedQueued = false;
      void tick();
      timer = setInterval(() => void tick(), Math.max(500, opts.pollIntervalMs));
      connected = true;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      connected = false;
      statusMessage = "KIS 중지";
    },
    getQuotes() {
      return lastQuotes;
    },
    onTick(cb) {
      listeners.add(cb);
    },
    isConnected() {
      return connected && !!timer;
    },
    getStatusMessage() {
      return statusMessage;
    },
    getNxEligibilityByCode() {
      const out: Record<string, boolean | null> = {};
      for (const s of symbols) {
        const v = nxEligibleByCode.get(s.code);
        out[s.code] = v === undefined ? null : v;
      }
      return out;
    },
  };
}
