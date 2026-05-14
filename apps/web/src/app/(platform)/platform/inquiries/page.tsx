"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;
const MAX_TENANT_OPTIONS = 50;

type InquiryRow = {
  id: string;
  subject: string | null;
  createdAt: string;
  author: { id: string; email: string | null; displayName: string | null };
  tenant: { id: string; name: string } | null;
  replyCount: number;
};

type ListResponse = {
  inquiries: InquiryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

type TenantOpt = { id: string; name: string };
type TenantOptionsResponse = { tenants: TenantOpt[]; total: number };

type RepliedFilter = "" | "true" | "false";

type Filters = {
  q: string;
  tenantId: string;
  from: string;
  to: string;
  repliedOnly: RepliedFilter;
};

const EMPTY_FILTERS: Filters = { q: "", tenantId: "", from: "", to: "", repliedOnly: "" };

export default function PlatformInquiriesPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tenantOpts, setTenantOpts] = useState<TenantOpt[]>([]);
  const [tenantTotal, setTenantTotal] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ page: "1", pageSize: String(MAX_TENANT_OPTIONS) });
        const res = await apiGet<TenantOptionsResponse>(`/platform/tenants?${qs.toString()}`);
        if (mounted) {
          setTenantOpts(res.tenants);
          setTenantTotal(res.total);
        }
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
      if (applied.q.trim()) qs.set("q", applied.q.trim());
      if (applied.tenantId) qs.set("tenantId", applied.tenantId);
      if (applied.from) qs.set("from", new Date(applied.from).toISOString());
      if (applied.to) qs.set("to", new Date(applied.to).toISOString());
      if (applied.repliedOnly) qs.set("repliedOnly", applied.repliedOnly);
      const res = await apiGet<ListResponse>(`/platform/inquiries?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError && e.status === 400) {
        const msg = (e.body as { error?: { message?: string } } | null)?.error?.message;
        setErr(msg ?? "필터 값이 올바르지 않습니다.");
      } else {
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "문의 목록을 불러오지 못했습니다.");
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
    setApplied({
      q: draft.q.trim(),
      tenantId: draft.tenantId,
      from: draft.from,
      to: draft.to,
      repliedOnly: draft.repliedOnly,
    });
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const tenantSelect = useMemo(() => {
    return (
      <select
        value={draft.tenantId}
        onChange={(e) => setDraft((d) => ({ ...d, tenantId: e.target.value }))}
        aria-label="테넌트 필터"
        style={{ minWidth: 160 }}
      >
        <option value="">전체 테넌트</option>
        {tenantOpts.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }, [draft.tenantId, tenantOpts]);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 20 }}>문의</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        모든 테넌트의 사용자 문의를 한 화면에서 조회합니다. 테넌트·기간·답변 여부로 필터링할 수 있습니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>필터</div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            value={draft.q}
            onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
            placeholder="제목·본문 키워드"
            aria-label="키워드"
            style={{ minWidth: 200, flex: "1 1 200px" }}
          />
          {tenantSelect}
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
          <select
            value={draft.repliedOnly}
            onChange={(e) =>
              setDraft((d) => ({ ...d, repliedOnly: e.target.value as RepliedFilter }))
            }
            aria-label="답변 여부"
          >
            <option value="">전체</option>
            <option value="false">미답변</option>
            <option value="true">답변완료</option>
          </select>
          <button type="submit" className="btn">검색</button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>초기화</button>
        </form>
        {tenantTotal > tenantOpts.length ? (
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
            테넌트가 {tenantTotal}개입니다. 옵션에는 상위 {tenantOpts.length}개만 노출됩니다.
            나머지 테넌트는 <Link href="/platform/tenants">테넌트 메뉴</Link>에서 진입한 뒤 깊이 탐색하세요.
          </p>
        ) : null}
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>{err}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.inquiries.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>조건에 맞는 문의가 없습니다.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 720 }}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>테넌트</th>
                  <th>작성자</th>
                  <th>답변</th>
                  <th>작성일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.inquiries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.subject ?? "(제목 없음)"}</td>
                    <td>{row.tenant?.name ?? "—"}</td>
                    <td>
                      {row.author.displayName ?? row.author.email ?? "—"}
                      {row.author.email ? (
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                          {row.author.email}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: row.replyCount > 0 ? "var(--up-bg, #1f6f1f33)" : "var(--down-bg, #6f1f1f33)",
                          color: row.replyCount > 0 ? "var(--up, #2da32d)" : "var(--down, #d24545)",
                        }}
                      >
                        {row.replyCount > 0 ? `답변 ${row.replyCount}` : "미답변"}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/platform/inquiries/${row.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 12 }}
                      >
                        상세
                      </Link>
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
