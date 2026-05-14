import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { clampPageSize, isUuid, safePage } from "./lib.js";

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

export async function registerPlatformAuditRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  app.get("/platform/audit-logs", { preHandler: [platformPre] }, async (request, reply) => {
    const q = request.query as {
      actorUserId?: string;
      tenantId?: string;
      action?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };

    if (q.actorUserId && !isUuid(q.actorUserId)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "actorUserId 형식이 올바르지 않습니다." } });
    }
    if (q.tenantId && !isUuid(q.tenantId)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }

    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if (from && Number.isNaN(from.getTime())) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "from이 올바른 날짜가 아닙니다." } });
    }
    if (to && Number.isNaN(to.getTime())) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "to가 올바른 날짜가 아닙니다." } });
    }
    if (from && to && from.getTime() > to.getTime()) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "from은 to보다 이전이어야 합니다." } });
    }

    const where: Prisma.PlatformAuditLogWhereInput = {};
    if (q.actorUserId) where.actorUserId = q.actorUserId;
    if (q.tenantId) where.tenantId = q.tenantId;
    if (q.action) where.action = q.action;
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    const pageSize = clampPageSize(q.pageSize);
    const page = safePage(q.page);
    const total = await prisma.platformAuditLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
      },
    });

    const tenantIds = Array.from(
      new Set(rows.map((r) => r.tenantId).filter((id): id is string => Boolean(id))),
    );
    const tenantMap = tenantIds.length
      ? new Map(
          (
            await prisma.tenant.findMany({
              where: { id: { in: tenantIds } },
              select: { id: true, name: true },
            })
          ).map((t) => [t.id, t.name]),
        )
      : new Map<string, string>();

    return {
      logs: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: r.actor
          ? { id: r.actor.id, email: r.actor.email, displayName: r.actor.displayName }
          : null,
        tenantId: r.tenantId,
        tenantName: r.tenantId ? tenantMap.get(r.tenantId) ?? null : null,
        targetUserId: r.targetUserId,
        inquiryId: r.inquiryId,
        settingKey: r.settingKey,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });
}
