import type { QuoteSnapshot } from "@stock-monitoring/shared";
import { normalizeKrxStockCode } from "@stock-monitoring/shared";
import type { MarketDataProvider } from "../types.js";
import {
  fetchKisAccessToken,
  fetchKisInquirePrice,
  parseKisNumber,
  parseKisSignedFluctuation,
} from "./kis-rest.js";

type SessionState = "OPEN" | "CLOSED" | "PRE" | "AFTER";
type SessionSlot = "OFF" | "PRE" | "REGULAR" | "NXT" | "AFTER";

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

  // KRX 정규장: 09:00~15:30, NXT 연장장: 15:30~20:00
  if (mins >= 7 * 60 + 30 && mins < 9 * 60) return "PRE";
  if (mins >= 9 * 60 && mins < 15 * 60 + 30) return "REGULAR";
  if (mins >= 15 * 60 + 30 && mins < 20 * 60) return "NXT";
  if (mins >= 20 * 60 && mins < 20 * 60 + 30) return "AFTER";
  return "OFF";
}

type TokenState = { token: string; expiresAt: number };

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

export type KisPollingOptions = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  trIdPrice: string;
  /** 폴링 주기 ms */
  pollIntervalMs: number;
  /** 종목별 inquire-price 사이 대기(ms). KIS 초당 거래건수 제한 대응 */
  quoteRequestGapMs: number;
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
  const nxEligibleByCode = new Map<string, boolean>();

  async function ensureToken(): Promise<string> {
    const now = Date.now();
    if (tokenState && tokenState.expiresAt > now + 60_000) {
      return tokenState.token;
    }
    const t = await fetchKisAccessToken(opts.baseUrl, opts.appKey, opts.appSecret);
    const exp = Date.parse(t.access_token_token_expired.replace(" ", "T"));
    const expiresAt = Number.isNaN(exp) ? now + 23 * 3600_000 : exp;
    tokenState = { token: t.access_token, expiresAt };
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
    const frgnNet = parseKisNumber(out.frgn_ntby_qty ?? out.FRGN_NTBY_QTY);
    const frgnPct = parseKisNumber(out.hts_frgn_ehrt ?? out.HTS_FRGN_EHRT);
    return {
      symbol: code,
      name: (out.hts_kor_isnm ?? out.HTS_KOR_ISNM ?? name).trim() || name,
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
              } else {
                // 0원/빈값 응답은 실거래 시세로 보지 않고 KRX(J)로 폴백
                nxEligibleByCode.set(s.code, false);
              }
            } catch {
              nxEligibleByCode.set(s.code, false);
            }
          }

          if (!out) {
            out = await request("J");
          }

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
          if (rateLimited) hitRateLimit = true;
          statusMessage = rateLimited
            ? `KIS 호출 한도 초과(초당 건수). .env KIS_QUOTE_REQUEST_GAP_MS(현재 ${gap}ms)를 늘리거나 market_data.poll_interval_ms를 올리세요.`
            : `KIS ${s.code} 오류: ${msg.slice(0, 120)}`;
          const prev = lastQuotes.find((q) => q.symbol === s.code);
          if (prev) batch.push(prev);
        }
      }
      if (batch.length > 0) {
        lastQuotes = batch;
        connected = true;
        if (!hitRateLimit) statusMessage = "KIS 연결 (REST 폴링)";
        for (const cb of listeners) cb(batch);
      }
    } catch (e) {
      connected = false;
      statusMessage = `KIS 토큰/통신 실패: ${String(e).slice(0, 160)}`;
      for (const cb of listeners) cb(lastQuotes);
    } finally {
      tickInFlight = false;
    }
  }

  return {
    start(nextSymbols) {
      this.stop();
      symbols.length = 0;
      symbols.push(...nextSymbols);
      lastQuotes = [];
      tokenState = null;
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
  };
}
