import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../../lib/auth-session.js";
import { sendZodError } from "../../lib/errors.js";
import { clampPageSize, isUuid, recordAuditLog, safePage } from "./lib.js";

const ScopeEnum = z.enum(["GLOBAL", "TENANT"]);
const StatusEnum = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

const CreateSchema = z
  .object({
    scope: ScopeEnum,
    tenantId: z.string().uuid().optional().nullable(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20000),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    audienceRoles: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scope === "TENANT" && !data.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tenantId"],
        message: "scope=TENANT인 경우 tenantId가 필요합니다.",
      });
    }
    if (data.scope === "GLOBAL" && data.tenantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tenantId"],
        message: "scope=GLOBAL에는 tenantId를 지정할 수 없습니다.",
      });
    }
    if (data.startsAt && data.endsAt) {
      const s = new Date(data.startsAt).getTime();
      const e = new Date(data.endsAt).getTime();
      if (Number.isFinite(s) && Number.isFinite(e) && s > e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endsAt"],
          message: "endsAt은 startsAt 이후여야 합니다.",
        });
      }
    }
  });

const UpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(20000).optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    audienceRoles: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    status: StatusEnum.optional(),
  })
  .strict();

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

type AnnouncementRow = Prisma.AnnouncementGetPayload<{
  include: {
    tenant: { select: { id: true; name: true } };
    createdBy: { select: { id: true; email: true; displayName: true } };
  };
}>;

function serialize(row: AnnouncementRow) {
  return {
    id: row.id,
    scope: row.scope,
    tenantId: row.tenantId,
    tenant: row.tenant ? { id: row.tenant.id, name: row.tenant.name } : null,
    title: row.title,
    body: row.body,
    status: row.status,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    audienceRoles: row.audienceRoles ?? [],
    createdBy: row.createdBy
      ? { id: row.createdBy.id, email: row.createdBy.email, displayName: row.createdBy.displayName }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const announcementInclude = {
  tenant: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true, displayName: true } },
} as const;

export async function registerPlatformAnnouncementRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  app.get("/platform/announcements", { preHandler: [platformPre] }, async (request, reply) => {
    const q = request.query as {
      scope?: string;
      status?: string;
      tenantId?: string;
      activeOn?: string;
      page?: string;
      pageSize?: string;
    };

    const where: Prisma.AnnouncementWhereInput = {};
    if (q.scope) {
      const parsed = ScopeEnum.safeParse(q.scope);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "scope 값이 올바르지 않습니다." } });
      }
      where.scope = parsed.data;
    }
    if (q.status) {
      const parsed = StatusEnum.safeParse(q.status);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "status 값이 올바르지 않습니다." } });
      }
      where.status = parsed.data;
    }
    if (q.tenantId) {
      if (!isUuid(q.tenantId)) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." },
        });
      }
      where.tenantId = q.tenantId;
    }
    if (q.activeOn) {
      const ts = new Date(q.activeOn);
      if (Number.isNaN(ts.getTime())) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "activeOn이 올바른 날짜가 아닙니다." },
        });
      }
      where.AND = [
        { OR: [{ startsAt: null }, { startsAt: { lte: ts } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: ts } }] },
      ];
    }

    const pageSize = clampPageSize(q.pageSize);
    const page = safePage(q.page);
    const total = await prisma.announcement.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.announcement.findMany({
      where,
      orderBy: [{ startsAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: announcementInclude,
      skip,
      take: pageSize,
    });

    return {
      announcements: rows.map(serialize),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.post("/platform/announcements", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const parsed = CreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    if (parsed.data.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: parsed.data.tenantId },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "지정한 tenantId의 테넌트가 없습니다." },
        });
      }
    }

    const status = parsed.data.status ?? "DRAFT";
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.announcement.create({
        data: {
          scope: parsed.data.scope,
          tenantId: parsed.data.scope === "TENANT" ? parsed.data.tenantId! : null,
          title: parsed.data.title,
          body: parsed.data.body,
          status,
          startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
          audienceRoles: parsed.data.audienceRoles ?? [],
          createdById: auth.userId,
        },
        include: announcementInclude,
      });
      await recordAuditLog(tx, {
        actorUserId: auth.userId,
        action: status === "PUBLISHED" ? "PLATFORM_ANNOUNCEMENT_PUBLISH" : "PLATFORM_ANNOUNCEMENT_CREATE",
        target: { tenantId: row.tenantId },
        metadata: {
          announcementId: row.id,
          scope: row.scope,
          status,
          title: row.title,
        },
      });
      return row;
    });

    return reply.status(201).send({ announcement: serialize(created) });
  });

  app.get("/platform/announcements/:id", { preHandler: [platformPre] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "id 형식이 올바르지 않습니다." } });
    }
    const row = await prisma.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });
    if (!row) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "공지 없음" } });
    return { announcement: serialize(row) };
  });

  app.put("/platform/announcements/:id", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "id 형식이 올바르지 않습니다." } });
    }
    const parsed = UpdateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "공지 없음" } });
    }

    const nextStartsAt =
      parsed.data.startsAt === undefined
        ? existing.startsAt
        : parsed.data.startsAt === null
          ? null
          : new Date(parsed.data.startsAt);
    const nextEndsAt =
      parsed.data.endsAt === undefined
        ? existing.endsAt
        : parsed.data.endsAt === null
          ? null
          : new Date(parsed.data.endsAt);
    if (nextStartsAt && nextEndsAt && nextStartsAt.getTime() > nextEndsAt.getTime()) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "endsAt은 startsAt 이후여야 합니다." },
      });
    }

    const data: Prisma.AnnouncementUpdateInput = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.body !== undefined) data.body = parsed.data.body;
    if (parsed.data.startsAt !== undefined)
      data.startsAt = parsed.data.startsAt === null ? null : new Date(parsed.data.startsAt);
    if (parsed.data.endsAt !== undefined)
      data.endsAt = parsed.data.endsAt === null ? null : new Date(parsed.data.endsAt);
    if (parsed.data.audienceRoles !== undefined) data.audienceRoles = parsed.data.audienceRoles;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.announcement.update({
        where: { id },
        data,
        include: announcementInclude,
      });
      const action =
        parsed.data.status && parsed.data.status !== existing.status
          ? parsed.data.status === "PUBLISHED"
            ? "PLATFORM_ANNOUNCEMENT_PUBLISH"
            : parsed.data.status === "ARCHIVED"
              ? "PLATFORM_ANNOUNCEMENT_ARCHIVE"
              : "PLATFORM_ANNOUNCEMENT_UPDATE"
          : "PLATFORM_ANNOUNCEMENT_UPDATE";
      await recordAuditLog(tx, {
        actorUserId: auth.userId,
        action,
        target: { tenantId: row.tenantId },
        metadata: {
          announcementId: row.id,
          previousStatus: existing.status,
          nextStatus: row.status,
        },
      });
      return row;
    });

    return { announcement: serialize(updated) };
  });

  app.delete(
    "/platform/announcements/:id",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const auth = getRequestAuth(request)!;
      const { id } = request.params as { id: string };
      if (!isUuid(id)) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION_ERROR", message: "id 형식이 올바르지 않습니다." } });
      }
      const existing = await prisma.announcement.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "공지 없음" } });
      }

      await prisma.$transaction(async (tx) => {
        await tx.announcement.delete({ where: { id } });
        await recordAuditLog(tx, {
          actorUserId: auth.userId,
          action: "PLATFORM_ANNOUNCEMENT_DELETE",
          target: { tenantId: existing.tenantId },
          metadata: {
            announcementId: id,
            previousStatus: existing.status,
            title: existing.title,
          },
        });
      });

      return reply.status(204).send();
    },
  );
}
