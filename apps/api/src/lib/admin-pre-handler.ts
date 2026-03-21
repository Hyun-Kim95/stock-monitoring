import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Env } from "../config.js";
import { sendError } from "./errors.js";

export function createAdminPreHandler(env: Env): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = env.ADMIN_API_TOKEN;
    if (!token) {
      return;
    }
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      await sendError(reply, 401, "UNAUTHORIZED", "관리자 토큰이 필요합니다.");
    }
  };
}
