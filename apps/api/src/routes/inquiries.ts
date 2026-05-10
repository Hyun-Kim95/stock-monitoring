import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../lib/auth-session.js";
import { sendZodError } from "../lib/errors.js";

const InquiryCreateSchema = z.object({
  subject: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(1, "내용을 입력해 주세요.").max(8000),
});

const ReplyCreateSchema = z.object({
  body: z.string().trim().min(1, "답변 내용을 입력해 주세요.").max(8000),
});

type Ctx = {
  prisma: PrismaClient;
  requireAuthPre: preHandlerHookHandler;
  adminPre: preHandlerHookHandler;
};

const authorSelect = { id: true, email: true, displayName: true } as const;

export async function registerInquiryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, requireAuthPre, adminPre } = ctx;

  app.post("/inquiries", { preHandler: [requireAuthPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const parsed = InquiryCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);
    const { subject, message } = parsed.data;
    const row = await prisma.supportInquiry.create({
      data: {
        tenantId: auth.tenantId,
        userId: auth.userId,
        subject: subject && subject.length > 0 ? subject : null,
        message,
      },
    });
    return reply.status(201).send({
      inquiry: { id: row.id, createdAt: row.createdAt.toISOString() },
    });
  });

  app.get("/inquiries", { preHandler: [adminPre] }, async (request) => {
    const auth = getRequestAuth(request)!;
    const rows = await prisma.supportInquiry.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: authorSelect },
        _count: { select: { replies: true } },
      },
    });
    return {
      inquiries: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        author: r.user,
        replyCount: r._count.replies,
      })),
    };
  });

  app.get("/inquiries/:id", { preHandler: [adminPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { id } = request.params as { id: string };
    const row = await prisma.supportInquiry.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: {
        user: { select: authorSelect },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: authorSelect } },
        },
      },
    });
    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." } });
    }
    return {
      inquiry: {
        id: row.id,
        subject: row.subject,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        author: row.user,
        replies: row.replies.map((rep) => ({
          id: rep.id,
          body: rep.body,
          createdAt: rep.createdAt.toISOString(),
          author: rep.author,
        })),
      },
    };
  });

  app.post("/inquiries/:id/replies", { preHandler: [adminPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { id } = request.params as { id: string };
    const parsed = ReplyCreateSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const inquiry = await prisma.supportInquiry.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!inquiry) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." } });
    }

    const rep = await prisma.supportInquiryReply.create({
      data: {
        inquiryId: id,
        authorUserId: auth.userId,
        body: parsed.data.body,
      },
    });
    return reply.status(201).send({
      reply: {
        id: rep.id,
        body: rep.body,
        createdAt: rep.createdAt.toISOString(),
        author: { id: auth.userId, email: auth.email, displayName: auth.displayName ?? null },
      },
    });
  });
}
