import { randomBytes } from "node:crypto";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type { PrismaClient, MemberRole, OAuthProvider } from "@prisma/client";

const SESSION_COOKIE = "sm_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

type AuthContext = {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  role: MemberRole;
};

function parseCookies(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const chunk of raw.split(";")) {
    const idx = chunk.indexOf("=");
    if (idx < 0) continue;
    const key = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export async function createSession(prisma: PrismaClient, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);
  await prisma.session.create({
    data: { userId, token, expiresAt },
  });
  return { token, expiresAt };
}

export async function revokeSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function resolveAuthFromRequest(prisma: PrismaClient, request: FastifyRequest): Promise<AuthContext | null> {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => undefined);
    return null;
  }
  const membership = session.user.memberships[0];
  if (!membership) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    tenantId: membership.tenantId,
    role: membership.role,
  };
}

export function setRequestAuth(request: FastifyRequest, auth: AuthContext | null) {
  (request as FastifyRequest & { auth?: AuthContext | null }).auth = auth;
}

export function getRequestAuth(request: FastifyRequest): AuthContext | null {
  return ((request as FastifyRequest & { auth?: AuthContext | null }).auth ?? null);
}

export function createRequireAuthPreHandler(): preHandlerHookHandler {
  return async (request, reply) => {
    const auth = getRequestAuth(request);
    if (!auth) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } });
    }
  };
}

export function createRequireAdminRolePreHandler(): preHandlerHookHandler {
  return async (request, reply) => {
    const auth = getRequestAuth(request);
    if (!auth) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } });
    }
    if (auth.role !== "OWNER" && auth.role !== "ADMIN") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "관리 권한이 필요합니다." } });
    }
  };
}

export function providerToEnum(provider: "google" | "kakao" | "naver"): OAuthProvider {
  if (provider === "google") return "GOOGLE";
  if (provider === "kakao") return "KAKAO";
  return "NAVER";
}
