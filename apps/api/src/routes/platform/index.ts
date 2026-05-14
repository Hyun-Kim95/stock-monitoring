import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerPlatformOverviewRoute } from "./overview.js";
import { registerPlatformTenantRoutes } from "./tenants.js";
import { registerPlatformUserRoutes } from "./users.js";
import { registerPlatformInquiryRoutes } from "./inquiries.js";
import { registerPlatformAnnouncementRoutes } from "./announcements.js";
import { registerPlatformAuditRoutes } from "./audit.js";

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

/**
 * 플랫폼 운영자 사이트(`/platform/*`) 라우트를 한 번에 등록한다.
 * 모듈별 분할은 [docs/requirements/platform-operator-site/api-contract.md](docs/requirements/platform-operator-site/api-contract.md)
 * 와 PRD §4.1 IA(대시보드/회원/문의/공지/테넌트/감사 로그) 정합.
 */
export async function registerPlatformRoutes(app: FastifyInstance, ctx: Ctx) {
  await registerPlatformOverviewRoute(app, ctx);
  await registerPlatformTenantRoutes(app, ctx);
  await registerPlatformUserRoutes(app, ctx);
  await registerPlatformInquiryRoutes(app, ctx);
  await registerPlatformAnnouncementRoutes(app, ctx);
  await registerPlatformAuditRoutes(app, ctx);
}
