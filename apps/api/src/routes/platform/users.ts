import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getRequestAuth } from "../../lib/auth-session.js";
import { clampPageSize, isUuid, MAX_SEARCH, recordAuditLog, safePage } from "./lib.js";

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

export async function registerPlatformUserRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  /** PRD §4.2 S-07 — 회원 기본 목록(검색어 없이도 동작). 최근 가입 desc. */
  app.get("/platform/users", { preHandler: [platformPre] }, async (request) => {
    const pageSize = clampPageSize((request.query as { pageSize?: string }).pageSize);
    const page = safePage((request.query as { page?: string }).page);

    const total = await prisma.user.count();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        createdAt: u.createdAt.toISOString(),
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.get("/platform/users/search", { preHandler: [platformPre] }, async (request, reply) => {
    const q = (request.query as { q?: string }).q?.trim() ?? "";
    if (!q) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "검색어(q)가 필요합니다." } });
    }
    const page = safePage((request.query as { page?: string }).page);
    const pageSize = clampPageSize((request.query as { pageSize?: string }).pageSize);
    const or: Prisma.UserWhereInput[] = [
      { email: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
    ];
    if (isUuid(q)) or.push({ id: q });

    const rows = await prisma.user.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
      take: MAX_SEARCH + 1,
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    const truncated = rows.length > MAX_SEARCH;
    const slice = truncated ? rows.slice(0, MAX_SEARCH) : rows;
    const total = slice.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const pageRows = slice.slice(skip, skip + pageSize);

    return {
      users: pageRows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        createdAt: u.createdAt.toISOString(),
      })),
      page: effectivePage,
      pageSize,
      total: slice.length,
      totalPages,
      truncated,
    };
  });

  app.get("/platform/users/:userId", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { userId } = request.params as { userId: string };
    if (!isUuid(userId)) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "userId 형식이 올바르지 않습니다." } });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { tenant: { select: { id: true, name: true } } } },
        oauthAccounts: { select: { provider: true, createdAt: true } },
      },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "사용자 없음" } });
    }
    await recordAuditLog(prisma, {
      actorUserId: auth.userId,
      action: "PLATFORM_USER_VIEW",
      target: { targetUserId: userId },
      metadata: { path: "/platform/users/:userId" },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        oauthAccounts: user.oauthAccounts.map((o) => ({
          provider: o.provider,
          createdAt: o.createdAt.toISOString(),
        })),
        memberships: user.memberships.map((m) => ({
          tenantId: m.tenantId,
          tenantName: m.tenant.name,
          role: m.role,
        })),
      },
    };
  });
}
