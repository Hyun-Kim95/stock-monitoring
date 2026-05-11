import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getRequestAuth } from "../lib/auth-session.js";
import { sendZodError } from "../lib/errors.js";

const MAX_SEARCH = 100;
const DUPLICATE_REPLY_WINDOW_MS = 60_000;

const ReplyBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

const SettingPutSchema = z.object({
  value: z.string(),
  expectedUpdatedAt: z.string().min(1),
});

type Ctx = {
  prisma: PrismaClient;
  platformPre: preHandlerHookHandler;
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function clampPageSize(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : 15;
  if (!Number.isFinite(n)) return 15;
  return Math.min(Math.max(Math.floor(n), 1), 50);
}

function safePage(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

const authorSelect = { id: true, email: true, displayName: true } as const;

export async function registerPlatformRoutes(app: FastifyInstance, ctx: Ctx) {
  const { prisma, platformPre } = ctx;

  app.get("/platform/tenants", { preHandler: [platformPre] }, async (request) => {
    const q = (request.query as { q?: string; page?: string; pageSize?: string }).q?.trim() ?? "";
    const pageSize = clampPageSize((request.query as { pageSize?: string }).pageSize);
    const page = safePage((request.query as { page?: string }).page);
    const where: Prisma.TenantWhereInput = q
      ? { name: { contains: q, mode: "insensitive" } }
      : {};
    const total = await prisma.tenant.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });
    return {
      tenants: rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.get("/platform/tenants/:tenantId", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
    return {
      tenant: { id: t.id, name: t.name, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() },
    };
  });

  app.get("/platform/users/search", { preHandler: [platformPre] }, async (request, reply) => {
    const q = (request.query as { q?: string }).q?.trim() ?? "";
    if (!q) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "검색어(q)가 필요합니다." } });
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
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "userId 형식이 올바르지 않습니다." } });
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
    await prisma.platformAuditLog.create({
      data: {
        actorUserId: auth.userId,
        action: "PLATFORM_USER_VIEW",
        targetUserId: userId,
        metadata: { path: "/platform/users/:userId" },
      },
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

  app.get("/platform/tenants/:tenantId/inquiries", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });

    const q = request.query as { from?: string; to?: string; q?: string; page?: string; pageSize?: string };
    const textQ = q.q?.trim();
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if (from && to && from.getTime() > to.getTime()) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "from은 to보다 이전이어야 합니다." } });
    }
    const pageSize = clampPageSize(q.pageSize);
    const page = safePage(q.page);

    const where: Prisma.SupportInquiryWhereInput = { tenantId };
    const createdAt: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    if (textQ) {
      where.OR = [
        { subject: { contains: textQ, mode: "insensitive" } },
        { message: { contains: textQ, mode: "insensitive" } },
      ];
    }

    const total = await prisma.supportInquiry.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * pageSize;
    const rows = await prisma.supportInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        user: { select: authorSelect },
        _count: { select: { replies: true } },
      },
    });
    return {
      inquiries: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        createdAt: r.createdAt.toISOString(),
        author: r.user
          ? { id: r.user.id, email: r.user.email, displayName: r.user.displayName }
          : { id: r.userId, email: null, displayName: "삭제된 사용자" },
        replyCount: r._count.replies,
      })),
      page: effectivePage,
      pageSize,
      total,
      totalPages,
      truncated: false,
    };
  });

  app.get("/platform/inquiries/:inquiryId", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { inquiryId } = request.params as { inquiryId: string };
    if (!isUuid(inquiryId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "inquiryId 형식이 올바르지 않습니다." } });
    }
    const row = await prisma.supportInquiry.findUnique({
      where: { id: inquiryId },
      include: {
        user: { select: authorSelect },
        replies: { orderBy: { createdAt: "asc" }, include: { author: { select: authorSelect } } },
      },
    });
    if (!row) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의 없음" } });

    await prisma.platformAuditLog.create({
      data: {
        actorUserId: auth.userId,
        action: "PLATFORM_INQUIRY_VIEW",
        tenantId: row.tenantId,
        inquiryId: row.id,
        metadata: {},
      },
    });

    const author = row.user
      ? { id: row.user.id, email: row.user.email, displayName: row.user.displayName }
      : { id: row.userId, email: null, displayName: null as string | null };

    return {
      inquiry: {
        id: row.id,
        tenantId: row.tenantId,
        subject: row.subject,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        author,
        replies: row.replies.map((rep) => ({
          id: rep.id,
          body: rep.body,
          createdAt: rep.createdAt.toISOString(),
          author: rep.author,
        })),
      },
    };
  });

  app.post("/platform/inquiries/:inquiryId/replies", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { inquiryId } = request.params as { inquiryId: string };
    if (!isUuid(inquiryId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "inquiryId 형식이 올바르지 않습니다." } });
    }
    const parsed = ReplyBodySchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const inquiry = await prisma.supportInquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true, tenantId: true },
    });
    if (!inquiry) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "문의 없음" } });
    }

    const since = new Date(Date.now() - DUPLICATE_REPLY_WINDOW_MS);
    const dup = await prisma.supportInquiryReply.findFirst({
      where: {
        inquiryId,
        authorUserId: auth.userId,
        body: parsed.data.body,
        createdAt: { gte: since },
      },
    });
    if (dup) {
      return reply.status(409).send({
        error: { code: "CONFLICT", message: "짧은 시간 내 동일 답변이 이미 등록되었습니다." },
      });
    }

    const rep = await prisma.$transaction(async (tx) => {
      const r = await tx.supportInquiryReply.create({
        data: {
          inquiryId,
          authorUserId: auth.userId,
          body: parsed.data.body,
        },
      });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: auth.userId,
          action: "PLATFORM_INQUIRY_REPLY",
          tenantId: inquiry.tenantId,
          inquiryId,
          metadata: { replyId: r.id },
        },
      });
      return r;
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

  app.get("/platform/tenants/:tenantId/settings", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
    const rows = await prisma.systemSetting.findMany({
      where: { tenantId },
      orderBy: { settingKey: "asc" },
    });
    return {
      settings: rows.map((r) => ({
        key: r.settingKey,
        value: r.settingValue,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

  app.put("/platform/tenants/:tenantId/settings/:key", { preHandler: [platformPre] }, async (request, reply) => {
    const auth = getRequestAuth(request)!;
    const { tenantId, key } = request.params as { tenantId: string; key: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const parsed = SettingPutSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed.error);

    const expected = new Date(parsed.data.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "expectedUpdatedAt가 올바른 날짜가 아닙니다." } });
    }

    const exists = await prisma.systemSetting.findUnique({
      where: { tenantId_settingKey: { tenantId, settingKey: key } },
    });
    if (!exists) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "설정 키 없음" } });
    }
    if (exists.updatedAt.getTime() !== expected.getTime()) {
      return reply.status(409).send({
        error: { code: "CONFLICT", message: "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요." },
      });
    }

    const [row] = await prisma.$transaction([
      prisma.systemSetting.update({
        where: { tenantId_settingKey: { tenantId, settingKey: key } },
        data: { settingValue: parsed.data.value },
      }),
      prisma.platformAuditLog.create({
        data: {
          actorUserId: auth.userId,
          action: "PLATFORM_SETTING_UPDATE",
          tenantId,
          settingKey: key,
          metadata: { previousValue: exists.settingValue },
        },
      }),
    ]);
    return {
      setting: {
        key: row.settingKey,
        value: row.settingValue,
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  });

  app.get("/platform/tenants/:tenantId/catalog-summary", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });
    const [stockCount, themeCount, ruleCount] = await Promise.all([
      prisma.stock.count({ where: { tenantId } }),
      prisma.theme.count({ where: { tenantId } }),
      prisma.newsSourceRule.count({ where: { tenantId } }),
    ]);
    return { summary: { stockCount, themeCount, ruleCount } };
  });

  app.get("/platform/tenants/:tenantId/quote-health", { preHandler: [platformPre] }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!isUuid(tenantId)) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "tenantId 형식이 올바르지 않습니다." } });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "테넌트 없음" } });

    const stocks = await prisma.stock.findMany({
      where: { tenantId, isActive: true },
      select: { code: true },
      take: 200,
    });
    if (stocks.length === 0) {
      return { stocks: [] as { stockCode: string; lastRecordedAt: string | null }[] };
    }
    const codes = stocks.map((s) => s.code);
    const latest = await prisma.stockQuoteHistory.groupBy({
      by: ["stockCode"],
      where: { stockCode: { in: codes } },
      _max: { recordedAt: true },
    });
    const map = new Map(latest.map((l) => [l.stockCode, l._max.recordedAt]));
    return {
      stocks: codes.map((code) => ({
        stockCode: code,
        lastRecordedAt: map.get(code)?.toISOString() ?? null,
      })),
    };
  });
}
