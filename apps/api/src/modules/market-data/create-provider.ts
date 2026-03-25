import type { Env } from "../../config.js";
import { createKisPollingProvider } from "./kis/kis-polling-provider.js";
import { createMockMarketProvider } from "./mock-provider.js";
import type { MarketDataProvider } from "./types.js";

const DEFAULT_KIS_BASE = "https://openapivts.koreainvestment.com:29443";

export function createMarketDataProvider(
  env: Env,
  opts: { providerSetting: string; pollIntervalMs: number },
): MarketDataProvider {
  const wantKis = opts.providerSetting.trim().toLowerCase() === "kis";
  const key = env.KIS_APP_KEY?.trim();
  const secret = env.KIS_APP_SECRET?.trim();
  if (wantKis && key && secret) {
    const base = (env.KIS_REST_BASE_URL?.trim() || DEFAULT_KIS_BASE).replace(/\/$/, "");
    const trId = env.KIS_TR_ID_PRICE?.trim() || "FHKST01010100";
    const gap = env.KIS_QUOTE_REQUEST_GAP_MS ?? 400;
    return createKisPollingProvider({
      baseUrl: base,
      appKey: key,
      appSecret: secret,
      trIdPrice: trId,
      pollIntervalMs: opts.pollIntervalMs,
      quoteRequestGapMs: Math.max(50, Math.min(5000, gap)),
    });
  }
  if (wantKis && (!key || !secret)) {
    return createMockMarketProvider({
      statusHint: "mock (DB=kis인데 .env에 KIS_APP_KEY/SECRET 없음)",
    });
  }
  return createMockMarketProvider({
    statusHint: "mock (시스템 설정 market_data.provider=mock)",
  });
}

export function marketStatusMessage(market: MarketDataProvider): string {
  return market.getStatusMessage?.() ?? "mock provider";
}
