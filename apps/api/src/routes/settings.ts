import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { preHandlerHookHandler } from "fastify";
import { SettingUpsertSchema } from "@stock-monitoring/shared";
import { sendZodError } from "../lib/errors.js";

type Ctx = {
  prisma: PrismaClient;
  adminPre: preHandlerHookHandler;
  /** 시세 소스·폴링 주기 변경 시 즉시 반영 */
  reloadMarket?: () => Promise<void>;
};

function maskValue(key: string, value: string): string {
  const k = key.toUpperCase();
  if (k.includes("SECRET") || k.includes("API_KEY") || k.endsWith("_KEY") || k.includes("TOKEN")) {
    if (value.length <= 4) return "****";
    return `${value.slice(0, 2)}…${value.slice(-2)}`;
  }
  return value;
}

export async function registerSettingsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre, reloadMarket } = ctx;

  app.get("/settings", async () => {
    const rows = await prisma.systemSetting.findMany({ orderBy: { settingKey: "asc" } });
    return {
      settings: rows.map((r) => ({
        key: r.settingKey,
        value: maskValue(r.settingKey, r.settingValue),
        masked: maskValue(r.settingKey, r.settingValue) !== r.settingValue,
        updatedAt: r.updatedAt,
      })),
    };
  });

  app.get("/settings/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const row = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "설정 없음" } });
    }
    return {
      setting: {
        key: row.settingKey,
        value: maskValue(row.settingKey, row.settingValue),
        masked: maskValue(row.settingKey, row.settingValue) !== row.settingValue,
        updatedAt: row.updatedAt,
      },
    };
  });

  app.put("/settings/:key", { preHandler: [adminPre] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const parsed = SettingUpsertSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const row = await prisma.systemSetting.upsert({
      where: { settingKey: key },
      update: { settingValue: parsed.data.value },
      create: { settingKey: key, settingValue: parsed.data.value },
    });
    if (
      reloadMarket &&
      (key === "market_data.provider" || key === "market_data.poll_interval_ms")
    ) {
      await reloadMarket();
    }
    return {
      setting: {
        key: row.settingKey,
        value: maskValue(row.settingKey, row.settingValue),
        updatedAt: row.updatedAt,
      },
    };
  });
}
