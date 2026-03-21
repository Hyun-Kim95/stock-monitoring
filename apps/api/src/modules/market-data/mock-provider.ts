import type { QuoteSnapshot } from "@stock-monitoring/shared";
import type { MarketDataProvider } from "./types.js";

/** 국내 장 구간(한국시간 09:00~15:30, 주말 제외) — KIS 프로바이더와 동일 기준 */
function sessionNowKst(): "OPEN" | "CLOSED" {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = kst.getDay();
  if (day === 0 || day === 6) return "CLOSED";
  const mins = kst.getHours() * 60 + kst.getMinutes();
  const open = 9 * 60;
  const close = 15 * 60 + 30;
  return mins >= open && mins <= close ? "OPEN" : "CLOSED";
}

export function createMockMarketProvider(): MarketDataProvider {
  let timer: ReturnType<typeof setInterval> | undefined;
  const state = new Map<string, { name: string; price: number; base: number; volume: number }>();
  const listeners = new Set<(quotes: QuoteSnapshot[]) => void>();

  function tick() {
    const marketSession = sessionNowKst();
    const batch: QuoteSnapshot[] = [];
    for (const [code, s] of state) {
      if (marketSession === "OPEN") {
        const delta = (Math.random() - 0.5) * (s.base * 0.002);
        s.price = Math.max(100, Math.round((s.price + delta) * 100) / 100);
        s.volume += Math.floor(Math.random() * 5000);
      }
      const change = Math.round((s.price - s.base) * 100) / 100;
      const changeRate = s.base ? Math.round((change / s.base) * 10000) / 100 : 0;
      batch.push({
        symbol: code,
        name: s.name,
        price: s.price,
        change,
        changeRate,
        volume: s.volume,
        timestamp: new Date().toISOString(),
        marketSession,
      });
    }
    for (const cb of listeners) {
      cb(batch);
    }
  }

  return {
    start(symbols) {
      this.stop();
      state.clear();
      for (const { code, name } of symbols) {
        const base = 50000 + Math.floor(Math.random() * 100000);
        state.set(code, { name, price: base, base, volume: Math.floor(Math.random() * 1_000_000) });
      }
      timer = setInterval(tick, 1000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    getQuotes() {
      const marketSession = sessionNowKst();
      const out: QuoteSnapshot[] = [];
      for (const [code, s] of state) {
        const change = Math.round((s.price - s.base) * 100) / 100;
        const changeRate = s.base ? Math.round((change / s.base) * 10000) / 100 : 0;
        out.push({
          symbol: code,
          name: s.name,
          price: s.price,
          change,
          changeRate,
          volume: s.volume,
          timestamp: new Date().toISOString(),
          marketSession,
        });
      }
      return out;
    },
    onTick(cb) {
      listeners.add(cb);
    },
    isConnected() {
      return !!timer;
    },
  };
}
