"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;
const MAX_TENANT_OPTIONS = 50;

type AuditLog = {
  id: string;
  action: string;
  actor: { id: string; email: string | null; displayName: string | null } | null;
  tenantId: string | null;
  tenantName: string | null;
  targetUserId: string | null;
  inquiryId: string | null;
  settingKey: string | null;
  metadata: unknown;
  createdAt: string;
};

type ListResponse = {
  logs: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

type TenantOpt = { id: string; name: string };

const ACTION_OPTIONS = [
  { value: "", label: "전체 액션" },
  { value: "PLATFORM_SETTING_UPDATE", label: "설정 변경" },
  { value: "PLATFORM_INQUIRY_REPLY", label: "문의 답변" },
  { value: "PLATFORM_INQUIRY_VIEW", label: "문의 조회" },
  { value: "PLATFORM_USER_VIEW", label: "사용자 조회" },
  { value: "PLATFORM_ANNOUNCEMENT_CREATE", label: "공지 생성" },
  { value: "PLATFORM_ANNOUNCEMENT_PUBLISH", label: "공지 발행" },
  { value: "PLATFORM_ANNOUNCEMENT_UPDATE", label: "공지 수정" },
  { value: "PLATFORM_ANNOUNCEMENT_ARCHIVE", label: "공지 취소" },
  { value: "PLATFORM_ANNOUNCEMENT_DELETE", label: "공지 삭제" },
];

type Filters = {
  actorUserId: string;
  tenantId: string;
  action: string;
  from: string;
  to: string;
};

const EMPTY: Filters = { actorUserId: "", tenantId: "", action: "", from: "", to: "" };

export default function PlatformAuditLogsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tenantOpts, setTenantOpts] = useState<TenantOpt[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ page: "1", pageSize: String(MAX_TENANT_OPTIONS) });
        const res = await apiGet<{ tenants: TenantOpt[] }>(`/platform/tenants?${qs.toString()}`);
        if (mounted) setTenantOpts(res.tenants);
      } catch {
        if (mounted) setTenantOpts([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (applied.actorUserId) qs.set("actorUserId", applied.actorUserId);
      if (applied.tenantId) qs.set("tenantId", applied.tenantId);
      if (applied.action) qs.set("action", applied.action);
      if (applied.from) qs.set("from", new Date(applied.from).toISOString());
      if (applied.to) qs.set("to", new Date(applied.to).toISOString());
      const res = await apiGet<ListResponse>(`/platform/audit-logs?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError && e.status === 400) {
        const msg = (e.body as { error?: { message?: string } } | null)?.error?.message;
        setErr(msg ?? "필터 값이 올바르지 않습니다.");
      } else {
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "감사 로그를 불러오지 못했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setApplied({ ...draft, actorUserId: draft.actorUserId.trim() });
  }

  function resetFilters() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 20 }}>감사 로그</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        플랫폼 운영자 액션 기록(180일 보존). 운영자·테넌트·액션·기간으로 필터링합니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>필터</div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            value={draft.actorUserId}
            onChange={(e) => setDraft((d) => ({ ...d, actorUserId: e.target.value }))}
            placeholder="운영자 UUID"
            aria-label="운영자 UUID"
            style={{ minWidth: 240, flex: "0 1 280px" }}
          />
          <select
            value={draft.tenantId}
            onChange={(e) => setDraft((d) => ({ ...d, tenantId: e.target.value }))}
            aria-label="테넌트"
          >
            <option value="">전체 테넌트</option>
            {tenantOpts.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            aria-label="액션"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            aria-label="시작일"
          />
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            aria-label="종료일"
          />
          <button type="submit" className="btn">검색</button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>초기화</button>
        </form>
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>{err}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.logs.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>조건에 맞는 감사 로그가 없습니다.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 920 }}>
              <thead>
                <tr>
                  <th>시각</th>
                  <th>운영자</th>
                  <th>액션</th>
                  <th>테넌트</th>
                  <th>대상</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td>
                      {log.actor?.displayName ?? log.actor?.email ?? "—"}
                      {log.actor?.email ? (
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{log.actor.email}</div>
                      ) : null}
                    </td>
                    <td><code style={{ fontSize: 12 }}>{log.action}</code></td>
                    <td>{log.tenantName ?? (log.tenantId ? log.tenantId : "—")}</td>
                    <td style={{ fontSize: 13 }}>
                      {log.settingKey ? (
                        <div>설정 키: <code>{log.settingKey}</code></div>
                      ) : null}
                      {log.inquiryId ? <div>문의 ID: <code>{log.inquiryId.slice(0, 8)}…</code></div> : null}
                      {log.targetUserId ? <div>사용자 ID: <code>{log.targetUserId.slice(0, 8)}…</code></div> : null}
                      {!log.settingKey && !log.inquiryId && !log.targetUserId ? "—" : null}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted-foreground)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {log.metadata ? (
                        <code title={JSON.stringify(log.metadata)}>
                          {JSON.stringify(log.metadata).slice(0, 80)}
                        </code>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={data.page}
            totalPages={data.totalPages}
            disabled={loading}
            onPageChange={(p) => setPage(p)}
          />
        </>
      )}
    </div>
  );
}
