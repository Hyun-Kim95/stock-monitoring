import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../lib/auth-session.js";

const PreferenceSchema = z.object({
  pinnedStockIds: z.array(z.string()).max(200).optional(),
  filterText: z.string().max(200).optional(),
  marketFilter: z.string().max(30).optional(),
  sessionFilter: z.string().max(30).optional(),
  nxtFilter: z.string().max(30).optional(),
  themeFilterIds: z.array(z.string()).max(100).optional(),
  changeAlertThreshold: z.number().int().min(0).max(100).nullable().optional(),
});

type Ctx = {
  prisma: PrismaClient;
  requireAuthPre: preHandlerHookHandler;
};

export async function registerPreferenceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, requireAuthPre } = ctx;

  app.get("/me/preferences", { preHandler: [requireAuthPre] }, async (request) => {
    const auth = getRequestAuth(request)!;
    const pref = await prisma.userPreference.findUnique({ where: { userId: auth.userId } });
    if (!pref) {
      return {
        preference: {
          pinnedStockIds: [],
          filterText: "",
          marketFilter: "ALL",
          sessionFilter: "ALL",
          nxtFilter: "ALL",
          themeFilterIds: [],
          changeAlertThreshold: null,
        },
      };
    }
    return {
      preference: {
        pinnedStockIds: pref.pinnedStockIds,
        filterText: pref.filterText,
        marketFilter: pref.marketFilter,
        sessionFilter: pref.sessionFilter,
        nxtFilter: pref.nxtFilter,
        themeFilterIds: pref.themeFilterIds,
        changeAlertThreshold: pref.changeAlertThreshold,
      },
    };
  });

  app.put("/me/preferences", { preHandler: [requireAuthPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const parsed = PreferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "입력 형식이 올바르지 않습니다." } });
    }
    const data = parsed.data;
    const row = await prisma.userPreference.upsert({
      where: { userId: auth.userId },
      create: {
        userId: auth.userId,
        pinnedStockIds: data.pinnedStockIds ?? [],
        filterText: data.filterText ?? "",
        marketFilter: data.marketFilter ?? "ALL",
        sessionFilter: data.sessionFilter ?? "ALL",
        nxtFilter: data.nxtFilter ?? "ALL",
        themeFilterIds: data.themeFilterIds ?? [],
        changeAlertThreshold: data.changeAlertThreshold ?? null,
      },
      update: {
        ...(data.pinnedStockIds !== undefined ? { pinnedStockIds: data.pinnedStockIds } : {}),
        ...(data.filterText !== undefined ? { filterText: data.filterText } : {}),
        ...(data.marketFilter !== undefined ? { marketFilter: data.marketFilter } : {}),
        ...(data.sessionFilter !== undefined ? { sessionFilter: data.sessionFilter } : {}),
        ...(data.nxtFilter !== undefined ? { nxtFilter: data.nxtFilter } : {}),
        ...(data.themeFilterIds !== undefined ? { themeFilterIds: data.themeFilterIds } : {}),
        ...(data.changeAlertThreshold !== undefined ? { changeAlertThreshold: data.changeAlertThreshold } : {}),
      },
    });
    return { updatedAt: row.updatedAt };
  });
}
