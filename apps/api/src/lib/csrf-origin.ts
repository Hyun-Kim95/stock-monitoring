import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Env } from "../config.js";
import { sendError } from "./errors.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** URL 문자열을 스킴+호스트 형태로 통일 (비교용) */
export function normalizeOrigin(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** 브라우저 클라이언트 허용 출처 — WEB_PUBLIC_BASE_URL + CORS_ORIGIN(쉼표 구분 가능) */
export function collectAllowedOrigins(env: Env): string[] {
  const set = new Set<string>();
  const web = normalizeOrigin(env.WEB_PUBLIC_BASE_URL);
  if (web) set.add(web);
  const cors = env.CORS_ORIGIN.trim();
  if (cors) {
    for (const part of cors.split(",")) {
      const o = normalizeOrigin(part.trim());
      if (o) set.add(o);
    }
  }
  return [...set];
}

function headerOne(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Fastify/Node 요청 헤더에서 Origin 또는 Referer 기준으로 허용 출처 검사 (WS 업그레이드 등 공용) */
export function headersMatchAllowedOrigins(
  headers: FastifyRequest["headers"] | Record<string, string | string[] | undefined>,
  allowed: ReadonlySet<string>,
): boolean {
  const originHeader = headerOne(headers.origin);
  if (originHeader && originHeader !== "null") {
    const o = normalizeOrigin(originHeader);
    return o !== null && allowed.has(o);
  }
  const referer = headerOne(headers.referer);
  if (referer) {
    try {
      const u = new URL(referer);
      const ref = `${u.protocol}//${u.host}`;
      return allowed.has(ref);
    } catch {
      return false;
    }
  }
  return false;
}

function requestMatchesAllowedOrigin(request: FastifyRequest, allowed: ReadonlySet<string>): boolean {
  return headersMatchAllowedOrigins(request.headers, allowed);
}

/**
 * 쿠키 세션 + SameSite=None 환경에서의 CSRF 완화: 상태 변경 요청의 Origin/Referer가
 * 신뢰 출처 목록과 일치할 때만 통과.
 * `Authorization: Bearer ADMIN_API_TOKEN` 은 자동화·운영 스크립트용으로 예외.
 */
export function registerCsrfOriginProtection(app: FastifyInstance, env: Env): void {
  const allowed = new Set(collectAllowedOrigins(env));

  app.addHook("preHandler", async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;

    if (env.ADMIN_API_TOKEN && request.headers.authorization === `Bearer ${env.ADMIN_API_TOKEN}`) {
      return;
    }

    if (allowed.size === 0) {
      return sendError(reply, 503, "CSRF_CONFIG", "허용 출처가 설정되지 않았습니다. WEB_PUBLIC_BASE_URL/CORS_ORIGIN을 확인하세요.");
    }

    if (requestMatchesAllowedOrigin(request, allowed)) return;

    return sendError(reply, 403, "CSRF_REJECTED", "허용되지 않은 출처입니다.");
  });
}
