import type { FastifyInstance } from "fastify";
import type { PrismaClient, NewsRuleScope } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import { NewsRuleCreateSchema, NewsRuleUpdateSchema } from "@stock-monitoring/shared";
import { sendZodError } from "../lib/errors.js";
import type { NewsMemoryCache } from "../modules/news/news-cache.js";

type Ctx = {
  prisma: PrismaClient;
  adminPre: preHandlerHookHandler;
  newsCache?: NewsMemoryCache;
};

export async function registerNewsRuleRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre, newsCache } = ctx;

  app.get("/news-rules", async () => {
    const rules = await prisma.newsSourceRule.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    return { rules };
  });

  app.post("/news-rules", { preHandler: [adminPre] }, async (request, reply) => {
    const parsed = NewsRuleCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const b = parsed.data;
    if (b.scope === "STOCK" && !b.stockId) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "STOCK 범위는 stockId가 필요합니다." },
      });
    }
    if (b.scope === "GLOBAL" && b.stockId) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "GLOBAL 범위에서는 stockId를 비워야 합니다." },
      });
    }
    const rule = await prisma.newsSourceRule.create({
      data: {
        scope: b.scope as NewsRuleScope,
        stockId: b.stockId ?? null,
        includeKeyword: b.includeKeyword ?? null,
        excludeKeyword: b.excludeKeyword ?? null,
        priority: b.priority ?? 0,
        isActive: b.isActive ?? true,
      },
    });
    newsCache?.invalidate();
    return reply.status(201).send({ rule });
  });

  app.patch("/news-rules/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = NewsRuleUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    try {
      const rule = await prisma.newsSourceRule.update({ where: { id }, data: parsed.data });
      return { rule };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "규칙 없음" } });
    }
  });

  app.delete("/news-rules/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.newsSourceRule.delete({ where: { id } });
      newsCache?.invalidate();
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "규칙 없음" } });
    }
  });
}
