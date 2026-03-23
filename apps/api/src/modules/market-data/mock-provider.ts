import type { QuoteSnapshot } from "@stock-monitoring/shared";
import type { MarketDataProvider } from "./types.js";

/** 국내장 세션(KST): PRE / OPEN / AFTER / CLOSED */
function sessionNowKst(): "OPEN" | "CLOSED" | "PRE" | "AFTER" {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") return "CLOSED";

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  if (mins >= 7 * 60 + 30 && mins < 8 * 60) return "PRE";
  if (mins >= 8 * 60 && mins < 20 * 60) return "OPEN";
  if (mins >= 20 * 60 && mins < 20 * 60 + 30) return "AFTER";
  return "CLOSED";
}

export function createMockMarketProvider(): MarketDataProvider {
  let timer: ReturnType<typeof setInterval> | undefined;
  const state = new Map<
    string,
    {
      name: string;
      price: number;
      base: number;
      volume: number;
      foreignNetBuyVolume: number;
      foreignOwnershipPct: number;
    }
  >();
  const listeners = new Set<(quotes: QuoteSnapshot[]) => void>();

  function tick() {
    const marketSession = sessionNowKst();
    const batch: QuoteSnapshot[] = [];
    for (const [code, s] of state) {
      if (marketSession === "OPEN") {
        const delta = (Math.random() - 0.5) * (s.base * 0.002);
        s.price = Math.max(100, Math.round((s.price + delta) * 100) / 100);
        s.volume += Math.floor(Math.random() * 5000);
        s.foreignNetBuyVolume += Math.floor((Math.random() - 0.48) * 8000);
        s.foreignOwnershipPct = Math.max(
          0,
          Math.min(45, Math.round((s.foreignOwnershipPct + (Math.random() - 0.5) * 0.08) * 100) / 100),
        );
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
        foreignNetBuyVolume: s.foreignNetBuyVolume,
        foreignOwnershipPct: s.foreignOwnershipPct,
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
        state.set(code, {
          name,
          price: base,
          base,
          volume: Math.floor(Math.random() * 1_000_000),
          foreignNetBuyVolume: Math.floor((Math.random() - 0.5) * 400_000),
          foreignOwnershipPct: Math.round((8 + Math.random() * 32) * 100) / 100,
        });
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
          foreignNetBuyVolume: s.foreignNetBuyVolume,
          foreignOwnershipPct: s.foreignOwnershipPct,
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
