import { randomUUID } from "node:crypto";
import { logError } from "./lib/logger.js";
import Fastify, { type FastifyInstance } from "fastify";
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
import { runStartupQuoteHistoryPrep } from "./modules/history/startup-quote-history.js";

const SETTING_LAST_STOPPED_AT = "runtime.api.last_stopped_at";

export async function createApiApplication(env: Env): Promise<{
  app: FastifyInstance;
  /** listen() 직후 호출: 히스토리 정리·KIS 당일분봉 백필 후 시세 폴링 시작 (시간이 걸려도 HTTP는 이미 열림) */
  runAfterListen: () => Promise<void>;
}> {
  const adminPre = createAdminPreHandler(env);
  let market = createMarketDataProvider(env, { providerSetting: "mock", pollIntervalMs: 1000 });
  const quoteCache = new QuoteCache();
  const newsCache = new NewsMemoryCache();
  const sockets = new Set<{ send: (data: string) => void; close: () => void }>();

  /** `runAfterListen` 완료 전까지 신규 WS 클라이언트에도 로딩 상태 전달 */
  let marketStartupLoading = true;

  let broadcastThrottleMs = 250;
  let snapshotThrottleTimer: ReturnType<typeof setTimeout> | null = null;

  const historyRecorder = createQuoteHistoryRecorder(prisma, { throttleMs: 1_000 });

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

  async function reloadMarketFromDb(opts?: { loading?: boolean }) {
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
      loading: opts?.loading ?? false,
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
  app.addHook("onClose", async () => {
    try {
      await prisma.systemSetting.upsert({
        where: { settingKey: SETTING_LAST_STOPPED_AT },
        update: { settingValue: new Date().toISOString() },
        create: { settingKey: SETTING_LAST_STOPPED_AT, settingValue: new Date().toISOString() },
      });
    } catch (e) {
      logError("persist last stopped at failed", { err: String(e) });
    }
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
        loading: marketStartupLoading,
      }),
    );
    socket.on("close", () => {
      sockets.delete(ws);
    });
  });

  await refreshBroadcastThrottle();

  async function runAfterListen() {
    /** DB의 market_data.provider(kis 등)를 즉시 반영. 당일 분봉 백필은 느리므로 그 뒤에 두면 그동안 mock으로 보이는 문제가 난다. */
    try {
      broadcastJson({
        type: "status",
        marketConnected: market.isConnected(),
        message: "시세·히스토리 준비 중…",
        loading: true,
      });
      await reloadMarketFromDb({ loading: true });
      try {
        await runStartupQuoteHistoryPrep(prisma, env);
      } catch (e) {
        logError("runStartupQuoteHistoryPrep failed", { err: String(e) });
      }
    } finally {
      marketStartupLoading = false;
      broadcastJson({
        type: "status",
        marketConnected: market.isConnected(),
        message: marketStatusMessage(market),
        loading: false,
      });
    }
  }

  return { app, runAfterListen };
}
