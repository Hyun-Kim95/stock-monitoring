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
import { fetchNaverStockIntegrationMeta, toMarketLabelEn } from "../lib/naver-stock-integration.js";
import { redisDeleteByPrefix, redisGetJson, redisSetJson } from "../lib/redis.js";
import {
  getNaverIndustryMajorName,
  getNaverIndustryMajorNames,
  normalizeIndustryMajorLabel,
} from "../lib/naver-industry-major-name.js";
import { countActiveStocks, getMaxActiveStocks } from "../lib/stock-limits.js";
import {
  isHistoryCoverageFreshEnough,
  isMinuteCoverageFreshEnough,
  maybeBackfillKisChartHistory,
  startOrJoinKisMinuteBackfillToday,
} from "../modules/history/kis-chart-backfill.js";
import type { ChartGranularity, ChartRange } from "@stock-monitoring/shared";
import { fetchChart } from "../modules/history/quote-history.js";

/** DB에 market이 비어 있으면 네이버 basic API로 채워 저장 (integration에는 시장 필드 없음) */
async function backfillMissingStockMarkets(
  prisma: PrismaClient,
  rows: { id: string; code: string; market: string | null }[],
): Promise<Map<string, string | null>> {
  const byId = new Map(rows.map((r) => [r.id, r.market] as const));
  const missing = rows.filter((r) => !(r.market?.trim() ?? ""));
  const chunkSize = 4;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const part = missing.slice(i, i + chunkSize);
    await Promise.all(
      part.map(async (r) => {
        try {
          const meta = await fetchNaverStockIntegrationMeta(r.code);
          const m = toMarketLabelEn(meta.market);
          if (m) {
            await prisma.stock.update({ where: { id: r.id }, data: { market: m } });
            byId.set(r.id, m);
          }
        } catch (e) {
          logError("backfillMissingStockMarkets", { code: r.code, err: String(e) });
        }
      }),
    );
    if (i + chunkSize < missing.length) {
      await new Promise((res) => setTimeout(res, 120));
    }
  }
  return byId;
}

type Ctx = {
  prisma: PrismaClient;
  adminPre: preHandlerHookHandler;
  reloadMarket: () => Promise<void>;
  env: Env;
  getNxEligibilityByCode: () => Record<string, boolean | null>;
};

/** 클릭한 종목 차트: 백필을 잠깐 기다렸다가 먼저 그릴 데이터를 주고, 전체 백필은 이후에도 계속됨 */
const CHART_MINUTE_BACKFILL_BUDGET_MS = 55_000;
const CHART_HISTORY_BACKFILL_BUDGET_MS = 45_000;

function raceWithBudget(p: Promise<unknown>, budgetMs: number): Promise<void> {
  return Promise.race([
    p.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, budgetMs);
    }),
  ]);
}

export async function registerStockRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre, reloadMarket, env, getNxEligibilityByCode } = ctx;
  type Tx = Prisma.TransactionClient;
  /** 종목별 당일 분봉 KIS 보강 진행 상태 (UI 배지/상태 노출용) */
  const minuteBackfillInProgressByCode = new Map<string, boolean>();
  /** 분봉 차트 초단기 캐시 + 동일 키 동시요청 합치기 */
  const minuteChartCache = new Map<
    string,
    {
      expiresAt: number;
      data?: Awaited<ReturnType<typeof fetchChart>>;
      inFlight?: Promise<Awaited<ReturnType<typeof fetchChart>>>;
    }
  >();
  const MINUTE_CHART_CACHE_TTL_MS = 2_500;


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
      const integrationMarketByCode = new Map<string, string | null>();
      await Promise.all(
        codes.map(async (code) => {
          const meta = await fetchNaverStockIntegrationMeta(code);
          industryByCode.set(code, meta.industryMajorCode);
          integrationMarketByCode.set(code, meta.market);
        }),
      );
      const itemsRaw = baseItems.map((x) => ({
        ...x,
        themeNames: themeNamesByCode.get(x.code) ?? [],
        industryMajorCode: linkedIndustryByCode.get(x.code) ?? industryByCode.get(x.code) ?? null,
        market: integrationMarketByCode.get(x.code) ?? x.market,
      }));
      const nameByIndustry = await getNaverIndustryMajorNames(itemsRaw.map((x) => x.industryMajorCode));
      const items = itemsRaw.map((x) => {
        const ic = x.industryMajorCode?.trim() ?? "";
        return {
          ...x,
          market: toMarketLabelEn(x.market),
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
    const marketById = await backfillMissingStockMarkets(
      prisma,
      rows.map((r) => ({ id: r.id, code: r.code, market: r.market })),
    );
    const nameByIndustry = await getNaverIndustryMajorNames(rows.map((r) => r.industryMajorCode));
    const nxMap = getNxEligibilityByCode();
    return {
      stocks: rows.map((s) => {
        const ic = s.industryMajorCode?.trim() ?? "";
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          market: toMarketLabelEn(marketById.get(s.id) ?? s.market),
          industryMajorCode: s.industryMajorCode,
          industryMajorName: ic ? (nameByIndustry.get(ic) ?? null) : null,
          searchAlias: s.searchAlias,
          isActive: s.isActive,
          nxEligible: nxMap[s.code] ?? null,
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
    const q = request.query as { granularity?: string; range?: string; limit?: string; session?: string };
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
    const minuteSessionRaw = (q.session ?? "all").trim().toLowerCase();
    if (granularity === "minute" && !["all", "j", "nx"].includes(minuteSessionRaw)) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "query session=all | j | nx",
        },
      });
    }
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
        const coverage = await isMinuteCoverageFreshEnough(prisma, stock.code).catch(() => ({ ok: false }));
        if (!coverage.ok) {
          minuteBackfillInProgressByCode.set(stock.code, true);
          const p = startOrJoinKisMinuteBackfillToday(prisma, env, stock.code, {
            interactive: true,
            getNxEligibilityByCode,
          });
          void p.catch((e) => {
            logError("maybeBackfillKisMinuteToday failed", { stockCode: stock.code, err: String(e) });
          });
          void p.finally(async () => {
            minuteBackfillInProgressByCode.set(stock.code, false);
            const prefix = `${stock.code}|minute|`;
            for (const k of minuteChartCache.keys()) {
              if (k.startsWith(prefix)) minuteChartCache.delete(k);
            }
            await redisDeleteByPrefix(`chart:minute:${prefix}`);
          });
          await raceWithBudget(p, CHART_MINUTE_BACKFILL_BUDGET_MS);
        } else {
          // 이미 당일 분봉 커버리지가 충분하면 즉시 응답하고, 누락 보강은 백그라운드로 진행한다.
          void startOrJoinKisMinuteBackfillToday(prisma, env, stock.code, {
            interactive: true,
            getNxEligibilityByCode,
          }).catch(() => undefined);
        }
      } else {
        const enough = await isHistoryCoverageFreshEnough(
          prisma,
          stock.code,
          granularity as "day" | "month" | "year",
          range,
        ).catch(() => false);
        if (!enough) {
          const bh = maybeBackfillKisChartHistory(prisma, env, stock.code);
          void bh.catch((e) => {
            logError("maybeBackfillKisChartHistory failed", { stockCode: stock.code, err: String(e) });
          });
          await raceWithBudget(bh, CHART_HISTORY_BACKFILL_BUDGET_MS);
        } else {
          void maybeBackfillKisChartHistory(prisma, env, stock.code).catch((e) => {
            logError("maybeBackfillKisChartHistory failed", { stockCode: stock.code, err: String(e) });
          });
        }
      }
    }
    let chartBundle: Awaited<ReturnType<typeof fetchChart>>;
    if (granularity === "minute") {
      const minuteSession = minuteSessionRaw as "all" | "j" | "nx";
      const cacheKey = `${stock.code}|${granularity}|${range}|${limitOverride ?? "default"}|${minuteSession}`;
      const redisCacheKey = `chart:minute:${cacheKey}`;
      const now = Date.now();
      const cached = minuteChartCache.get(cacheKey);
      let minuteBundle: Awaited<ReturnType<typeof fetchChart>> | null = null;
      if (cached?.data && cached.expiresAt > now) {
        minuteBundle = cached.data;
      } else {
        const redisCached = await redisGetJson<Awaited<ReturnType<typeof fetchChart>>>(redisCacheKey);
        if (redisCached) {
          minuteChartCache.set(cacheKey, {
            expiresAt: now + MINUTE_CHART_CACHE_TTL_MS,
            data: redisCached,
          });
          minuteBundle = redisCached;
        }
      }
      if (!minuteBundle) {
        if (cached?.inFlight) {
          minuteBundle = await cached.inFlight;
        } else {
          const inFlight = fetchChart(prisma, stock.code, granularity, range, {
            limitOverride,
            minuteSession,
          });
          minuteChartCache.set(cacheKey, { expiresAt: now + MINUTE_CHART_CACHE_TTL_MS, inFlight });
          minuteBundle = await inFlight;
          minuteChartCache.set(cacheKey, {
            expiresAt: Date.now() + MINUTE_CHART_CACHE_TTL_MS,
            data: minuteBundle,
          });
          await redisSetJson(redisCacheKey, minuteBundle, MINUTE_CHART_CACHE_TTL_MS);
        }
      }
      chartBundle = minuteBundle;
    } else {
      chartBundle = await fetchChart(prisma, stock.code, granularity, range, { limitOverride });
    }
    const { candles, meta } = chartBundle;
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
    let market = toMarketLabelEn(s.market);
    if (!market) {
      const meta = await fetchNaverStockIntegrationMeta(s.code);
      const m = toMarketLabelEn(meta.market);
      if (m) {
        await prisma.stock.update({ where: { id: s.id }, data: { market: m } });
        market = m;
      }
    }
    return {
      stock: {
        id: s.id,
        code: s.code,
        name: s.name,
        market,
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
    let marketResolved = toMarketLabelEn(b.market?.trim() || null);
    if (!marketResolved) {
      const meta = await fetchNaverStockIntegrationMeta(b.code);
      marketResolved = toMarketLabelEn(meta.market);
    }
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
            market: marketResolved,
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
        const { code, market, ...rest } = parsed.data;
        const data =
          code !== undefined
            ? { ...rest, code, ...(market !== undefined ? { market: market === null ? null : toMarketLabelEn(market) } : {}) }
            : { ...rest, ...(market !== undefined ? { market: market === null ? null : toMarketLabelEn(market) } : {}) };
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
