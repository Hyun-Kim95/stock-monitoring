import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Env } from "../config.js";
import { sendError } from "./errors.js";

/** 직접 preHandler에서 호출할 수 있는 관리자 토큰 검사 (다른 훅과 합성할 때 사용) */
export async function requireAdminToken(
  request: FastifyRequest,
  reply: FastifyReply,
  env: Env,
): Promise<void> {
  const token = env.ADMIN_API_TOKEN;
  if (!token) {
    return;
  }
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${token}`) {
    await sendError(reply, 401, "UNAUTHORIZED", "관리자 토큰이 필요합니다.");
  }
}

export function createAdminPreHandler(env: Env): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAdminToken(request, reply, env);
  };
}
