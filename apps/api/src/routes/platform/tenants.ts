import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../../lib/auth-session.js";
import { sendZodError } from "../../lib/errors.js";
import {
  authorSelect,
  clampPageSize,
  isUuid,
  recordAuditLog,
  safePage,
} from "./lib.js";

const SettingPutSchema = z.object({
  value: z.string(),
  expectedUpdatedAt: z.string().min(1),
});

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

export async function registerPlatformTenantRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  app.get("/platform/tenants", { preHandler: [platformPre] }, async (request) => {
    const q = (request.query as { q?: string; page?: string; pageSize?: string }).q?.trim() ?? "";
    const pageSize = clampPageSize((request.query as { pageSize?: string }).pageSize);
    const page = safePage((request.query as { page?: string }).page);
    const where: Prisma.TenantWhereInput = q
      ? { name: { contains: q, mode: "insensitive" } }
      : {};
    const total = await prisma.tenant.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });
    return {
      tenants: rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.get("/platform/tenants/:tenantId", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
    return {
      tenant: {
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      },
    };
  });

  app.get(
    "/platform/tenants/:tenantId/inquiries",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      if (!isUuid(tenantId)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
      }

      const q = request.query as {
        from?: string;
        to?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
      const textQ = q.q?.trim();
      const from = q.from ? new Date(q.from) : null;
      const to = q.to ? new Date(q.to) : null;
      if (from && to && from.getTime() > to.getTime()) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "from은 to보다 이전이어야 합니다." } });
      }
      const pageSize = clampPageSize(q.pageSize);
      const page = safePage(q.page);

      const where: Prisma.SupportInquiryWhereInput = { tenantId };
      const createdAt: Prisma.DateTimeFilter = {};
      if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
      if (textQ) {
        where.OR = [
          { subject: { contains: textQ, mode: "insensitive" } },
          { message: { contains: textQ, mode: "insensitive" } },
        ];
      }

      const total = await prisma.supportInquiry.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const effectivePage = Math.min(page, totalPages);
      const skip = (effectivePage - 1) * pageSize;
      const rows = await prisma.supportInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: { select: authorSelect },
          _count: { select: { replies: true } },
        },
      });
      return {
        inquiries: rows.map((r) => ({
          id: r.id,
          subject: r.subject,
          createdAt: r.createdAt.toISOString(),
          author: r.user
            ? { id: r.user.id, email: r.user.email, displayName: r.user.displayName }
            : { id: r.userId, email: null, displayName: "삭제된 사용자" },
          replyCount: r._count.replies,
        })),
        page: effectivePage,
        pageSize,
        total,
        totalPages,
        truncated: false,
      };
    },
  );

  app.get(
    "/platform/tenants/:tenantId/settings",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      if (!isUuid(tenantId)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
      }
      const rows = await prisma.systemSetting.findMany({
        where: { tenantId },
        orderBy: { settingKey: "asc" },
      });
      return {
        settings: rows.map((r) => ({
          key: r.settingKey,
          value: r.settingValue,
          updatedAt: r.updatedAt.toISOString(),
        })),
      };
    },
  );

  app.put(
    "/platform/tenants/:tenantId/settings/:key",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const auth = getRequestAuth(request)!;
      const { tenantId, key } = request.params as { tenantId: string; key: string };
      if (!isUuid(tenantId)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
      }
      const parsed = SettingPutSchema.safeParse(request.body);
      if (!parsed.success) return sendZodError(reply, parsed.error);

      const expected = new Date(parsed.data.expectedUpdatedAt);
      if (Number.isNaN(expected.getTime())) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "expectedUpdatedAt가 올바른 날짜가 아닙니다." },
        });
      }

      const exists = await prisma.systemSetting.findUnique({
        where: { tenantId_settingKey: { tenantId, settingKey: key } },
      });
      if (!exists) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "설정 키 없음" } });
      }
      if (exists.updatedAt.getTime() !== expected.getTime()) {
        return reply.status(409).send({
          error: { code: "CONFLICT", message: "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요." },
        });
      }

      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.systemSetting.update({
          where: { tenantId_settingKey: { tenantId, settingKey: key } },
          data: { settingValue: parsed.data.value },
        });
        await recordAuditLog(tx, {
          actorUserId: auth.userId,
          action: "PLATFORM_SETTING_UPDATE",
          target: { tenantId, settingKey: key },
          metadata: { previousValue: exists.settingValue, newValue: parsed.data.value },
        });
        return updated;
      });
      return {
        setting: {
          key: row.settingKey,
          value: row.settingValue,
          updatedAt: row.updatedAt.toISOString(),
        },
      };
    },
  );

  app.get(
    "/platform/tenants/:tenantId/catalog-summary",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      if (!isUuid(tenantId)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
      }
      const [stockCount, themeCount, ruleCount] = await Promise.all([
        prisma.stock.count({ where: { tenantId } }),
        prisma.theme.count({ where: { tenantId } }),
        prisma.newsSourceRule.count({ where: { tenantId } }),
      ]);
      return { summary: { stockCount, themeCount, ruleCount } };
    },
  );

  app.get(
    "/platform/tenants/:tenantId/quote-health",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      if (!isUuid(tenantId)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
      }
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
      }

      const stocks = await prisma.stock.findMany({
        where: { tenantId, isActive: true },
        select: { code: true },
        take: 200,
      });
      if (stocks.length === 0) {
        return { stocks: [] as { stockCode: string; lastRecordedAt: string | null }[] };
      }
      const codes = stocks.map((s) => s.code);
      const latest = await prisma.stockQuoteHistory.groupBy({
        by: ["stockCode"],
        where: { stockCode: { in: codes } },
        _max: { recordedAt: true },
      });
      const map = new Map(latest.map((l) => [l.stockCode, l._max.recordedAt]));
      return {
        stocks: codes.map((code) => ({
          stockCode: code,
          lastRecordedAt: map.get(code)?.toISOString() ?? null,
        })),
      };
    },
  );
}
