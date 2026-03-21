import type { QuoteSnapshot } from "@stock-monitoring/shared";
import type { MarketDataProvider } from "../types.js";
import {
  fetchKisAccessToken,
  fetchKisInquirePrice,
  parseKisNumber,
} from "./kis-rest.js";

function sessionNowKst(): "OPEN" | "CLOSED" {
  const d = new Date();
  const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay();
  if (day === 0 || day === 6) return "CLOSED";
  const h = kst.getHours();
  const m = kst.getMinutes();
  const mins = h * 60 + m;
  const open = 9 * 60;
  const close = 15 * 60 + 30;
  return mins >= open && mins <= close ? "OPEN" : "CLOSED";
}

type TokenState = { token: string; expiresAt: number };

export type KisPollingOptions = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  trIdPrice: string;
  /** 폴링 주기 ms */
  pollIntervalMs: number;
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

  function mapOutput(code: string, name: string, out: Record<string, string | undefined>): QuoteSnapshot {
    const price = parseKisNumber(out.stck_prpr ?? out.STCK_PRPR);
    const change = parseKisNumber(out.prdy_vrss ?? out.PRDY_VRSS);
    const changeRate = parseKisNumber(out.prdy_ctrt ?? out.PRDY_CTRT);
    const volume = parseKisNumber(out.acml_vol ?? out.ACML_VOL);
    return {
      symbol: code,
      name: (out.hts_kor_isnm ?? out.HTS_KOR_ISNM ?? name).trim() || name,
      price: Number.isNaN(price) ? 0 : price,
      change: Number.isNaN(change) ? 0 : change,
      changeRate: Number.isNaN(changeRate) ? 0 : changeRate,
      volume: Number.isNaN(volume) ? 0 : Math.floor(volume),
      timestamp: new Date().toISOString(),
      marketSession: sessionNowKst(),
    };
  }

  async function tick() {
    if (symbols.length === 0) return;
    try {
      const token = await ensureToken();
      const batch: QuoteSnapshot[] = [];
      for (const s of symbols) {
        try {
          const out = await fetchKisInquirePrice(
            opts.baseUrl,
            token,
            opts.appKey,
            opts.appSecret,
            s.code,
            opts.trIdPrice,
          );
          batch.push(mapOutput(s.code, s.name, out));
        } catch (e) {
          statusMessage = `KIS ${s.code} 오류: ${String(e).slice(0, 120)}`;
          const prev = lastQuotes.find((q) => q.symbol === s.code);
          if (prev) batch.push(prev);
        }
      }
      if (batch.length > 0) {
        lastQuotes = batch;
        connected = true;
        statusMessage = "KIS 연결 (REST 폴링)";
        for (const cb of listeners) cb(batch);
      }
    } catch (e) {
      connected = false;
      statusMessage = `KIS 토큰/통신 실패: ${String(e).slice(0, 160)}`;
      for (const cb of listeners) cb(lastQuotes);
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
