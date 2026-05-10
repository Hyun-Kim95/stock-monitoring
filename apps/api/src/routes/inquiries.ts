import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../lib/auth-session.js";
import { sendZodError } from "../lib/errors.js";

const InquiryCreateSchema = z.object({
  subject: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(1, "내용을 입력해 주세요.").max(8000),
});

type Ctx = {
  prisma: PrismaClient;
  requireAuthPre: preHandlerHookHandler;
};

export async function registerInquiryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, requireAuthPre } = ctx;

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
}
