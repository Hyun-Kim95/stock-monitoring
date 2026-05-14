import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getRequestAuth } from "../../lib/auth-session.js";
import { sendZodError } from "../../lib/errors.js";
import { z } from "zod";
import {
  authorSelect,
  clampPageSize,
  DUPLICATE_REPLY_WINDOW_MS,
  isUuid,
  recordAuditLog,
  safePage,
} from "./lib.js";

const ReplyBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

export async function registerPlatformInquiryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  /** PRD §4.2 S-04 (보강, 2026-05-14) — 크로스 테넌트 통합 문의 목록. */
  app.get("/platform/inquiries", { preHandler: [platformPre] }, async (request, reply) => {
    const q = request.query as {
      tenantId?: string;
      from?: string;
      to?: string;
      q?: string;
      repliedOnly?: string;
      page?: string;
      pageSize?: string;
    };

    if (q.tenantId && !isUuid(q.tenantId)) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." },
      });
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

    const textQ = q.q?.trim();
    const pageSize = clampPageSize(q.pageSize);
    const page = safePage(q.page);

    const where: Prisma.SupportInquiryWhereInput = {};
    if (q.tenantId) where.tenantId = q.tenantId;

    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    if (textQ) {
      where.OR = [
        { subject: { contains: textQ, mode: "insensitive" } },
        { message: { contains: textQ, mode: "insensitive" } },
      ];
    }

    const repliedOnly = q.repliedOnly === "true" ? true : q.repliedOnly === "false" ? false : null;
    if (repliedOnly === true) {
      where.replies = { some: {} };
    } else if (repliedOnly === false) {
      where.replies = { none: {} };
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
        tenant: { select: { id: true, name: true } },
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
        tenant: r.tenant ? { id: r.tenant.id, name: r.tenant.name } : null,
        replyCount: r._count.replies,
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.get("/platform/inquiries/:inquiryId", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { inquiryId } = request.params as { inquiryId: string };
    if (!isUuid(inquiryId)) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "inquiryId 형식이 올바르지 않습니다." },
      });
    }
    const row = await prisma.supportInquiry.findUnique({
      where: { id: inquiryId },
      include: {
        user: { select: authorSelect },
        replies: { orderBy: { createdAt: "asc" }, include: { author: { select: authorSelect } } },
      },
    });
    if (!row) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의 없음" } });

    await recordAuditLog(prisma, {
      actorUserId: auth.userId,
      action: "PLATFORM_INQUIRY_VIEW",
      target: { tenantId: row.tenantId, inquiryId: row.id },
    });

    const author = row.user
      ? { id: row.user.id, email: row.user.email, displayName: row.user.displayName }
      : { id: row.userId, email: null, displayName: null as string | null };

    return {
      inquiry: {
        id: row.id,
        tenantId: row.tenantId,
        subject: row.subject,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        author,
        replies: row.replies.map((rep) => ({
          id: rep.id,
          body: rep.body,
          createdAt: rep.createdAt.toISOString(),
          author: rep.author,
        })),
      },
    };
  });

  app.post(
    "/platform/inquiries/:inquiryId/replies",
    { preHandler: [platformPre] },
    async (request, reply) => {
      const auth = getRequestAuth(request)!;
      const { inquiryId } = request.params as { inquiryId: string };
      if (!isUuid(inquiryId)) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "inquiryId 형식이 올바르지 않습니다." },
        });
      }
      const parsed = ReplyBodySchema.safeParse(request.body);
      if (!parsed.success) return sendZodError(reply, parsed.error);

      const inquiry = await prisma.supportInquiry.findUnique({
        where: { id: inquiryId },
        select: { id: true, tenantId: true },
      });
      if (!inquiry) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의 없음" } });
      }

      const since = new Date(Date.now() - DUPLICATE_REPLY_WINDOW_MS);
      const dup = await prisma.supportInquiryReply.findFirst({
        where: {
          inquiryId,
          authorUserId: auth.userId,
          body: parsed.data.body,
          createdAt: { gte: since },
        },
      });
      if (dup) {
        return reply.status(409).send({
          error: { code: "CONFLICT", message: "짧은 시간 내 동일 답변이 이미 등록되었습니다." },
        });
      }

      const rep = await prisma.$transaction(async (tx) => {
        const r = await tx.supportInquiryReply.create({
          data: {
            inquiryId,
            authorUserId: auth.userId,
            body: parsed.data.body,
          },
        });
        await recordAuditLog(tx, {
          actorUserId: auth.userId,
          action: "PLATFORM_INQUIRY_REPLY",
          target: { tenantId: inquiry.tenantId, inquiryId },
          metadata: { replyId: r.id },
        });
        return r;
      });

      return reply.status(201).send({
        reply: {
          id: rep.id,
          body: rep.body,
          createdAt: rep.createdAt.toISOString(),
          author: { id: auth.userId, email: auth.email, displayName: auth.displayName ?? null },
        },
      });
    },
  );
}
