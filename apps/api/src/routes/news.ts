import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildMockNewsForStock } from "../modules/news/mock-news.js";
import { buildNaverNewsQuery, fetchNaverNews } from "../modules/news/naver-news.js";
import type { NewsMemoryCache } from "../modules/news/news-cache.js";
import { applyNewsRules, dedupeNewsByUrl } from "../modules/news/process.js";

type Ctx = {
  prisma: PrismaClient;
  newsCache: NewsMemoryCache;
  naverClientId?: string;
  naverClientSecret?: string;
};

export async function registerNewsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, newsCache, naverClientId, naverClientSecret } = ctx;

  app.get("/stocks/:id/news", async (request, reply) => {
    const { id } = request.params as { id: string };
    const stock = await prisma.stock.findUnique({ where: { id } });
    if (!stock) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "종목 없음" } });
    }

    const maxRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "news.max_items_per_stock" },
    });
    const limit = Math.min(50, Math.max(1, Number(maxRow?.settingValue ?? 20)));

    const ttlRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "news.fetch_interval_ms" },
    });
    const ttlMs = Math.min(3_600_000, Math.max(5_000, Number(ttlRow?.settingValue ?? 60_000)));

    const cached = newsCache.get(stock.id);
    if (cached) {
      return { news: cached };
    }

    const rules = await prisma.newsSourceRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    const ruleInput = rules.map((r) => ({
      scope: r.scope as "GLOBAL" | "STOCK",
      stockId: r.stockId,
      includeKeyword: r.includeKeyword,
      excludeKeyword: r.excludeKeyword,
      priority: r.priority,
      isActive: r.isActive,
    }));

    const naverId = naverClientId?.trim();
    const naverSecret = naverClientSecret?.trim();
    let items;
    if (naverId && naverSecret) {
      try {
        const q = buildNaverNewsQuery(stock);
        items = await fetchNaverNews(naverId, naverSecret, q, limit);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return reply.status(502).send({
          error: {
            code: "NEWS_UPSTREAM_FAILED",
            message: detail.slice(0, 500),
          },
        });
      }
    } else {
      items = buildMockNewsForStock(stock, limit);
    }
    items = dedupeNewsByUrl(items);
    items = applyNewsRules(items, ruleInput, stock.id);

    newsCache.set(stock.id, items, ttlMs);
    return { news: items };
  });
}
