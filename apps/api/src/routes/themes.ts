import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import {
  ThemeCreateSchema,
  ThemeUpdateSchema,
  ThemeStockIdsSchema,
} from "@stock-monitoring/shared";
import { sendZodError } from "../lib/errors.js";

type Ctx = {
  prisma: PrismaClient;
  adminPre: preHandlerHookHandler;
};

export async function registerThemeRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre } = ctx;

  app.get("/themes", async () => {
    const themes = await prisma.theme.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        stockMaps: { include: { stock: true } },
      },
    });
    return {
      themes: themes.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        stocks: t.stockMaps
          .filter((m) => m.stock.isActive)
          .map((m) => ({ id: m.stock.id, code: m.stock.code, name: m.stock.name })),
      })),
    };
  });

  app.post("/themes", { preHandler: [adminPre] }, async (request, reply) => {
    const parsed = ThemeCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const b = parsed.data;
    try {
      const theme = await prisma.theme.create({
        data: {
          name: b.name,
          description: b.description ?? null,
          isActive: b.isActive ?? true,
        },
      });
      return reply.status(201).send({ theme });
    } catch {
      return reply.status(409).send({ error: { code: "DUPLICATE", message: "이미 있는 테마명입니다." } });
    }
  });

  app.patch("/themes/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ThemeUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    try {
      const theme = await prisma.theme.update({ where: { id }, data: parsed.data });
      return { theme };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테마 없음" } });
    }
  });

  app.delete("/themes/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.theme.update({ where: { id }, data: { isActive: false } });
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테마 없음" } });
    }
  });

  app.put("/themes/:id/stocks", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ThemeStockIdsSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const theme = await prisma.theme.findUnique({ where: { id } });
    if (!theme) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테마 없음" } });
    }
    await prisma.$transaction(async (tx) => {
      await tx.stockThemeMap.deleteMany({ where: { themeId: id } });
      if (parsed.data.stockIds.length) {
        await tx.stockThemeMap.createMany({
          data: parsed.data.stockIds.map((stockId) => ({ themeId: id, stockId })),
        });
      }
    });
    return { ok: true };
  });
}
