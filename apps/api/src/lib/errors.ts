import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.status(status).send({
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}

export function sendZodError(reply: FastifyReply, err: ZodError) {
  return sendError(reply, 400, "VALIDATION_ERROR", "요청 본문이 올바르지 않습니다.", err.flatten());
}
