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

export async function registerSettingsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, adminPre, reloadMarket } = ctx;

  app.get("/settings", async () => {
    const rows = await prisma.systemSetting.findMany({ orderBy: { settingKey: "asc" } });
    return {
      settings: rows.map((r) => ({
        key: r.settingKey,
        value: r.settingValue,
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
        value: row.settingValue,
        updatedAt: row.updatedAt,
      },
    };
  });

  app.put("/settings/:key", { preHandler: [adminPre] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const parsed = SettingUpsertSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const exists = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
    if (!exists) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "존재하는 setting_key만 수정할 수 있습니다." },
      });
    }
    const row = await prisma.systemSetting.update({
      where: { settingKey: key },
      data: { settingValue: parsed.data.value },
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
        value: row.settingValue,
        updatedAt: row.updatedAt,
      },
    };
  });
}
