import type { PrismaClient, Prisma } from "@prisma/client";

export const MAX_SEARCH = 100;
export const DUPLICATE_REPLY_WINDOW_MS = 60_000;

export const authorSelect = { id: true, email: true, displayName: true } as const;

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function clampPageSize(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : 15;
  if (!Number.isFinite(n)) return 15;
  return Math.min(Math.max(Math.floor(n), 1), 50);
}

export function safePage(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** ISO 문자열을 안전하게 Date로 파싱. 빈 값이면 null, 유효하지 않으면 'invalid'. */
export function parseDateOrNull(raw: string | undefined): Date | null | "invalid" {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export type AuditLogTarget = {
  tenantId?: string | null;
  targetUserId?: string | null;
  inquiryId?: string | null;
  settingKey?: string | null;
};

/**
 * 감사 로그 한 행을 기록한다. 비즈니스 쓰기와 같은 트랜잭션에서 호출하려면 `tx`에
 * `Prisma.TransactionClient`를 넘긴다. 단독 사용(조회 감사 등) 시에는 `prisma`를 그대로 넘긴다.
 * PRD §4.4 A-04 — 쓰기 액션은 비즈니스 쓰기와 동일 트랜잭션이어야 한다.
 */
export async function recordAuditLog(
  tx: PrismaClient | Prisma.TransactionClient,
  params: {
    actorUserId: string;
    action: string;
    target?: AuditLogTarget;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.platformAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      tenantId: params.target?.tenantId ?? null,
      targetUserId: params.target?.targetUserId ?? null,
      inquiryId: params.target?.inquiryId ?? null,
      settingKey: params.target?.settingKey ?? null,
      metadata: params.metadata ?? undefined,
    },
  });
}
