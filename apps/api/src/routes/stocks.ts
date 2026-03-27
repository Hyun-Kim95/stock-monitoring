import type { FastifyInstance } from "fastify";
import {
  StockCreateSchema,
  StockUpdateSchema,
} from "@stock-monitoring/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import type { Env } from "../config.js";
import { sendZodError } from "../lib/errors.js";
import { logError } from "../lib/logger.js";
import {
  getNaverIndustryMajorName,
  getNaverIndustryMajorNames,
  normalizeIndustryMajorLabel,
} from "../lib/naver-industry-major-name.js";
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
  type Tx = Prisma.TransactionClient;
  /** 종목별 당일 분봉 KIS 보강 진행 상태 (UI 배지/상태 노출용) */
  const minuteBackfillInProgressByCode = new Map<string, boolean>();

  async function fetchIndustryMajorCodeFromNaver(code: string): Promise<string | null> {
    try {
      const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`, {
        headers: { Accept: "application/json", "User-Agent": "stock-monitoring/1.0" },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { industryCode?: unknown };
      const raw = String(json.industryCode ?? "").trim();
      return raw ? raw : null;
    } catch {
      return null;
    }
  }

  async function upsertThemeByName(tx: Tx, rawName: string, description: string | null) {
    const name = normalizeIndustryMajorLabel(rawName);
    if (!name) return null;
    const found = await tx.theme.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (found) {
      if (!found.isActive) {
        return tx.theme.update({ where: { id: found.id }, data: { isActive: true } });
      }
      return found;
    }
    return tx.theme.create({ data: { name, isActive: true, description } });
  }

  async function linkIndustryTheme(tx: Tx, stockId: string, industryMajorCode: string | null | undefined) {
    const code = industryMajorCode?.trim() ?? "";
    if (!code) return;
    const industryName = await getNaverIndustryMajorName(code);
    if (!industryName) return;
    const theme = await upsertThemeByName(tx, industryName, `네이버 산업대분류(${code}) 자동 매핑`);
    if (!theme) return;
    await tx.stockThemeMap.upsert({
      where: { stockId_themeId: { stockId, themeId: theme.id } },
      create: { stockId, themeId: theme.id },
      update: {},
    });
  }

  app.get("/stocks/search", async (request, reply) => {
    const { q = "", size = "20" } = request.query as { q?: string; size?: string };
    const query = q.trim();
    if (query.length < 1) return { items: [] };
    const n = Number(size);
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(50, Math.floor(n))) : 20;
    try {
      const url = new URL("https://ac.stock.naver.com/ac");
      url.searchParams.set("q", query);
      url.searchParams.set("query", query);
      url.searchParams.set("target", "stock");
      url.searchParams.set("page", "1");
      url.searchParams.set("size", String(limit));
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "stock-monitoring/1.0",
        },
      });
      if (!res.ok) {
        return reply.status(502).send({
          error: { code: "UPSTREAM_ERROR", message: `종목 검색 상류 실패(${res.status})` },
        });
      }
      const raw = (await res.json()) as {
        items?: Array<{ code?: string; name?: string; typeName?: string; typeCode?: string; category?: string }>;
      };
      const baseItems = (raw.items ?? [])
        .filter((x) => (x.category ?? "stock") === "stock")
        .map((x) => ({
          code: String(x.code ?? "").trim(),
          name: String(x.name ?? "").trim(),
          market: String(x.typeName ?? x.typeCode ?? "").trim() || null,
        }))
        .filter((x) => x.code.length > 0 && x.name.length > 0);
      const codes = [...new Set(baseItems.map((x) => x.code))];
      const linked = codes.length
        ? await prisma.stock.findMany({
            where: { code: { in: codes } },
            include: { themeMaps: { include: { theme: true } } },
          })
        : [];
      const themeNamesByCode = new Map<string, string[]>();
      for (const s of linked) {
        const names = s.themeMaps
          .filter((m) => m.theme.isActive)
          .map((m) => m.theme.name)
          .filter(Boolean);
        themeNamesByCode.set(s.code, names);
      }
      const linkedIndustryByCode = new Map(linked.map((s) => [s.code, s.industryMajorCode ?? null]));
      const industryByCode = new Map<string, string | null>();
      await Promise.all(
        codes.map(async (code) => {
          industryByCode.set(code, await fetchIndustryMajorCodeFromNaver(code));
        }),
      );
      const itemsRaw = baseItems.map((x) => ({
        ...x,
        themeNames: themeNamesByCode.get(x.code) ?? [],
        industryMajorCode: linkedIndustryByCode.get(x.code) ?? industryByCode.get(x.code) ?? null,
      }));
      const nameByIndustry = await getNaverIndustryMajorNames(itemsRaw.map((x) => x.industryMajorCode));
      const items = itemsRaw.map((x) => {
        const ic = x.industryMajorCode?.trim() ?? "";
        return {
          ...x,
          industryMajorName: ic ? (nameByIndustry.get(ic) ?? null) : null,
        };
      });
      return { items };
    } catch {
      return reply.status(502).send({ error: { code: "UPSTREAM_ERROR", message: "종목 검색 실패" } });
    }
  });

  app.get("/stocks", async () => {
    const rows = await prisma.stock.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: {
        themeMaps: { include: { theme: true } },
      },
    });
    const nameByIndustry = await getNaverIndustryMajorNames(rows.map((r) => r.industryMajorCode));
    return {
      stocks: rows.map((s) => {
        const ic = s.industryMajorCode?.trim() ?? "";
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          industryMajorCode: s.industryMajorCode,
          industryMajorName: ic ? (nameByIndustry.get(ic) ?? null) : null,
          searchAlias: s.searchAlias,
          isActive: s.isActive,
          themes: s.themeMaps
            .filter((m) => m.theme.isActive)
            .map((m) => ({
              id: m.theme.id,
              name: m.theme.name,
            })),
        };
      }),
    };
  });

  app.get("/stocks/:id/chart", async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { granularity?: string; range?: string; limit?: string };
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
    const rawLimit = Number(q.limit);
    const limitOverride =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.max(10, Math.min(20_000, Math.floor(rawLimit))) : undefined;
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
        // 분봉은 클릭 즉시 차트를 보여주고(현재 DB 기준), 당일 분봉 보강은 백그라운드에서 진행.
        // 그렇지 않으면 KIS 호출/페이지네이션 대기 때문에 최초 응답이 길어져 '캔들 1개' 상태가 오래 보일 수 있다.
        minuteBackfillInProgressByCode.set(stock.code, true);
        void maybeBackfillKisMinuteToday(prisma, env, stock.code).catch((e) => {
          logError("maybeBackfillKisMinuteToday failed", { stockCode: stock.code, err: String(e) });
        }).finally(() => {
          minuteBackfillInProgressByCode.set(stock.code, false);
        });
      } else {
        await maybeBackfillKisChartHistory(prisma, env, stock.code);
      }
    }
    const { candles, meta } = await fetchChart(prisma, stock.code, granularity, range, { limitOverride });
    const minuteBackfillInProgress =
      granularity === "minute" ? (minuteBackfillInProgressByCode.get(stock.code) ?? false) : false;
    return {
      stockId: stock.id,
      code: stock.code,
      name: stock.name,
      granularity,
      range,
      candles,
      meta: { ...meta, minuteBackfillInProgress },
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
    const ic = s.industryMajorCode?.trim() ?? "";
    const industryMajorName = ic ? await getNaverIndustryMajorName(ic) : null;
    return {
      stock: {
        id: s.id,
        code: s.code,
        name: s.name,
        industryMajorCode: s.industryMajorCode,
        industryMajorName,
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
      const created = await prisma.$transaction(async (tx) => {
        const stock = await tx.stock.create({
          data: {
            code: b.code,
            name: b.name,
            industryMajorCode: b.industryMajorCode ?? null,
            searchAlias: b.searchAlias ?? null,
            isActive: b.isActive ?? true,
          },
        });

        const themeNames = b.themeNames ?? [];
        if (themeNames.length > 0) {
          const themes = [];
          for (const rawName of themeNames) {
            const name = normalizeIndustryMajorLabel(rawName);
            if (!name) continue;
            const theme = await upsertThemeByName(tx, name, null);
            if (theme) themes.push(theme);
          }
          await tx.stockThemeMap.createMany({
            data: themes.map((t) => ({ stockId: stock.id, themeId: t.id })),
            skipDuplicates: true,
          });
        }
        await linkIndustryTheme(tx, stock.id, b.industryMajorCode ?? null);
        return stock;
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
      const updated = await prisma.$transaction(async (tx) => {
        const { code, ...rest } = parsed.data;
        const data = code !== undefined ? { ...rest, code } : rest;
        const row = await tx.stock.update({
          where: { id },
          data,
        });
        await linkIndustryTheme(tx, row.id, row.industryMajorCode);
        return row;
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
