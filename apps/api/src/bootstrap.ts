import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { prisma } from "@stock-monitoring/db";
import type { QuoteSnapshot } from "@stock-monitoring/shared";
import type { Env } from "./config.js";
import { createAdminPreHandler } from "./lib/admin-pre-handler.js";
import { registerWriteRateLimit } from "./lib/write-rate-limit.js";
import { createMarketDataProvider, marketStatusMessage } from "./modules/market-data/create-provider.js";
import { NewsMemoryCache } from "./modules/news/news-cache.js";
import { QuoteCache } from "./modules/realtime/quote-cache.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStockRoutes } from "./routes/stocks.js";
import { registerThemeRoutes } from "./routes/themes.js";
import { registerNewsRuleRoutes } from "./routes/news-rules.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerNewsRoutes } from "./routes/news.js";
import { createQuoteHistoryRecorder } from "./modules/history/quote-history.js";

export async function createApiApplication(env: Env) {
  const adminPre = createAdminPreHandler(env);
  let market = createMarketDataProvider(env, { providerSetting: "mock", pollIntervalMs: 1000 });
  const quoteCache = new QuoteCache();
  const newsCache = new NewsMemoryCache();
  const sockets = new Set<{ send: (data: string) => void; close: () => void }>();

  let broadcastThrottleMs = 250;
  let snapshotThrottleTimer: ReturnType<typeof setTimeout> | null = null;

  const historyRecorder = createQuoteHistoryRecorder(prisma, { throttleMs: 30_000 });

  function broadcastJson(payload: unknown) {
    const raw = JSON.stringify(payload);
    for (const ws of sockets) {
      try {
        ws.send(raw);
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleSnapshotBroadcast() {
    if (snapshotThrottleTimer) return;
    snapshotThrottleTimer = setTimeout(() => {
      snapshotThrottleTimer = null;
      broadcastJson({ type: "snapshot", quotes: quoteCache.snapshot() });
    }, broadcastThrottleMs);
  }

  const handleMarketQuotes = (quotes: QuoteSnapshot[]) => {
    quoteCache.setMany(quotes);
    scheduleSnapshotBroadcast();
    historyRecorder.record(quotes);
  };
  market.onTick(handleMarketQuotes);

  async function reloadMarketFromDb() {
    const stocks = await prisma.stock.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });
    const provRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "market_data.provider" },
    });
    const pollRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "market_data.poll_interval_ms" },
    });
    const pollMs = Math.min(60_000, Math.max(500, Number(pollRow?.settingValue ?? 1000)));

    market.stop();
    market = createMarketDataProvider(env, {
      providerSetting: provRow?.settingValue ?? "mock",
      pollIntervalMs: pollMs,
    });
    market.onTick(handleMarketQuotes);
    market.start(stocks.map((s) => ({ code: s.code, name: s.name })));
    quoteCache.setMany(market.getQuotes());
    broadcastJson({ type: "snapshot", quotes: quoteCache.snapshot() });
    broadcastJson({
      type: "status",
      marketConnected: market.isConnected(),
      message: marketStatusMessage(market),
    });
  }

  async function refreshBroadcastThrottle() {
    const row = await prisma.systemSetting.findUnique({
      where: { settingKey: "realtime.broadcast_throttle_ms" },
    });
    if (row) {
      const n = Number(row.settingValue);
      if (!Number.isNaN(n) && n >= 50) {
        broadcastThrottleMs = n;
      }
    }
  }

  const app = Fastify({
    logger: env.NODE_ENV === "development",
    genReqId: () => randomUUID(),
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  registerWriteRateLimit(app, { max: 120, windowMs: 60_000 });

  await registerHealthRoutes(app);

  await registerStockRoutes(app, {
    prisma,
    adminPre,
    reloadMarket: reloadMarketFromDb,
    env,
  });
  await registerThemeRoutes(app, { prisma, adminPre });
  await registerNewsRuleRoutes(app, { prisma, adminPre, newsCache });
  await registerSettingsRoutes(app, { prisma, adminPre, reloadMarket: reloadMarketFromDb });
  await registerNewsRoutes(app, {
    prisma,
    newsCache,
    naverClientId: env.NAVER_CLIENT_ID,
    naverClientSecret: env.NAVER_CLIENT_SECRET,
  });

  await app.register(websocket);
  app.get("/ws/quotes", { websocket: true }, (socket, _req) => {
    const ws = {
      send: (data: string) => socket.send(data),
      close: () => socket.close(),
    };
    sockets.add(ws);
    socket.send(JSON.stringify({ type: "snapshot", quotes: quoteCache.snapshot() }));
    socket.send(
      JSON.stringify({
        type: "status",
        marketConnected: market.isConnected(),
        message: marketStatusMessage(market),
      }),
    );
    socket.on("close", () => {
      sockets.delete(ws);
    });
  });

  await refreshBroadcastThrottle();
  await reloadMarketFromDb();

  return app;
}
