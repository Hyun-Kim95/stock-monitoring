import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** PRD §9 — 운영자 대시보드 KPI 응답. 결손 항목은 0으로 안전 폴백. */
export async function registerPlatformOverviewRoute(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  app.get("/platform/overview", { preHandler: [platformPre] }, async () => {
    const now = new Date();
    const recentSince = new Date(now.getTime() - RECENT_WINDOW_MS);

    const [tenantCount, newUserCountLast7d, inquiryUnansweredCount, announcementActiveCount] =
      await Promise.all([
        prisma.tenant.count(),
        prisma.user.count({ where: { createdAt: { gte: recentSince } } }),
        prisma.supportInquiry.count({ where: { replies: { none: {} } } }),
        prisma.announcement.count({
          where: {
            status: "PUBLISHED",
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
          },
        }),
      ]);

    return {
      overview: {
        tenantCount,
        newUserCountLast7d,
        inquiryUnansweredCount,
        announcementActiveCount,
      },
    };
  });
}
