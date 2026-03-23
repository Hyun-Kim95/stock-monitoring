import type { FastifyInstance } from "fastify";
import {
  StockCreateSchema,
  StockUpdateSchema,
} from "@stock-monitoring/shared";
import type { PrismaClient } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import type { Env } from "../config.js";
import { sendZodError } from "../lib/errors.js";
import { countActiveStocks, getMaxActiveStocks } from "../lib/stock-limits.js";
import {
  maybeBackfillKisChartHistory,
  maybeBackfillKisMinuteToday,
} from "../modules/history/kis-chart-backfill.js";
import type { ChartGranularity, ChartRange } from "@stock-monitoring/shared";
import { fetchChart } from "../modules/history/quote-history.js";

type Ctx = {
  prisma: PrismaClient;
  adminPre: preHandlerHookHandler;
  reloadMarket: () => Promise<void>;
  env: Env;
};

export async function registerStockRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre, reloadMarket, env } = ctx;

  app.get("/stocks", async () => {
    const rows = await prisma.stock.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: {
        themeMaps: { include: { theme: true } },
      },
    });
    return {
      stocks: rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        searchAlias: s.searchAlias,
        isActive: s.isActive,
        themes: s.themeMaps
          .filter((m) => m.theme.isActive)
          .map((m) => ({
            id: m.theme.id,
            name: m.theme.name,
          })),
      })),
    };
  });

  app.get("/stocks/:id/chart", async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { granularity?: string; range?: string };
    const rawG = q.granularity ?? "day";
    const rawR = q.range ?? "normal";
    const allowedG: ChartGranularity[] = ["minute", "day", "month", "year"];
    const allowedR: ChartRange[] = ["compact", "normal", "deep", "max"];
    if (!allowedG.includes(rawG as ChartGranularity)) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "query granularity=minute | day | month | year",
        },
      });
    }
    if (!allowedR.includes(rawR as ChartRange)) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "query range=compact | normal | deep | max",
        },
      });
    }
    const granularity = rawG as ChartGranularity;
    const range = rawR as ChartRange;
    const stock = await prisma.stock.findUnique({ where: { id } });
    if (!stock) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "종목 없음" } });
    }
    const provRow = await prisma.systemSetting.findUnique({
      where: { settingKey: "market_data.provider" },
    });
    const useKis = provRow?.settingValue?.trim().toLowerCase() === "kis";
    if (useKis) {
      if (granularity === "minute") {
        await maybeBackfillKisMinuteToday(prisma, env, stock.code);
      }
      await maybeBackfillKisChartHistory(prisma, env, stock.code);
    }
    const { candles, meta } = await fetchChart(prisma, stock.code, granularity, range);
    return {
      stockId: stock.id,
      code: stock.code,
      name: stock.name,
      granularity,
      range,
      candles,
      meta,
    };
  });

  app.get("/stocks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const s = await prisma.stock.findUnique({
      where: { id },
      include: { themeMaps: { include: { theme: true } } },
    });
    if (!s) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "종목 없음" } });
    }
    return {
      stock: {
        id: s.id,
        code: s.code,
        name: s.name,
        searchAlias: s.searchAlias,
        isActive: s.isActive,
        themes: s.themeMaps
          .filter((m) => m.theme.isActive)
          .map((m) => ({ id: m.theme.id, name: m.theme.name })),
      },
    };
  });

  app.post("/stocks", { preHandler: [adminPre] }, async (request, reply) => {
    const parsed = StockCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const b = parsed.data;
    const willBeActive = b.isActive !== false;
    if (willBeActive) {
      const max = await getMaxActiveStocks(prisma);
      const n = await countActiveStocks(prisma);
      if (n >= max) {
        return reply.status(409).send({
          error: {
            code: "STOCK_LIMIT",
            message: `활성 종목은 최대 ${max}개까지 등록할 수 있습니다. (합의: D-005 / 설정 키 stocks.max_active)`,
          },
        });
      }
    }
    try {
      const created = await prisma.stock.create({
        data: {
          code: b.code,
          name: b.name,
          searchAlias: b.searchAlias ?? null,
          isActive: b.isActive ?? true,
        },
      });
      await reloadMarket();
      return reply.status(201).send({ stock: created });
    } catch {
      return reply.status(409).send({ error: { code: "DUPLICATE", message: "이미 있는 종목코드입니다." } });
    }
  });

  app.patch("/stocks/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = StockUpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    if (parsed.data.isActive === true) {
      const current = await prisma.stock.findUnique({ where: { id } });
      if (current && !current.isActive) {
        const max = await getMaxActiveStocks(prisma);
        const n = await countActiveStocks(prisma);
        if (n >= max) {
          return reply.status(409).send({
            error: {
              code: "STOCK_LIMIT",
              message: `활성 종목은 최대 ${max}개까지입니다. 비활성 종목을 끄거나 상한을 조정하세요.`,
            },
          });
        }
      }
    }
    try {
      const { code, ...rest } = parsed.data;
      const data = code !== undefined ? { ...rest, code } : rest;
      const updated = await prisma.stock.update({
        where: { id },
        data,
      });
      await reloadMarket();
      return { stock: updated };
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "종목 없음" } });
    }
  });

  app.delete("/stocks/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.stock.update({ where: { id }, data: { isActive: false } });
      await reloadMarket();
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "종목 없음" } });
    }
  });
}
