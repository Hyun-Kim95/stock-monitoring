"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Scope = "GLOBAL" | "TENANT";

type AnnouncementRow = {
  id: string;
  scope: Scope;
  tenant: { id: string; name: string } | null;
  title: string;
  status: Status;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: { id: string; email: string | null; displayName: string | null } | null;
  createdAt: string;
};

type ListResponse = {
  announcements: AnnouncementRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

type Filters = {
  scope: "" | Scope;
  status: "" | Status;
};

const EMPTY: Filters = { scope: "", status: "" };

const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "초안",
  PUBLISHED: "발행",
  ARCHIVED: "취소",
};

const SCOPE_LABEL: Record<Scope, string> = {
  GLOBAL: "전역",
  TENANT: "테넌트",
};

export default function PlatformAnnouncementsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (applied.scope) qs.set("scope", applied.scope);
      if (applied.status) qs.set("status", applied.status);
      const res = await apiGet<ListResponse>(`/platform/announcements?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "공지 목록을 불러오지 못했습니다.");
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
    setApplied(draft);
  }

  function resetFilters() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 20 }}>공지</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
            운영자가 작성하는 공지의 작성·발행·취소를 관리합니다. 노출 UI는 다음 사이클에서 적용됩니다.
          </p>
        </div>
        <Link href="/platform/announcements/new" className="btn">
          + 새 공지
        </Link>
      </div>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>필터</div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <select
            value={draft.scope}
            onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value as Filters["scope"] }))}
            aria-label="스코프 필터"
          >
            <option value="">전체 스코프</option>
            <option value="GLOBAL">전역</option>
            <option value="TENANT">테넌트</option>
          </select>
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as Filters["status"] }))}
            aria-label="상태 필터"
          >
            <option value="">전체 상태</option>
            <option value="DRAFT">초안</option>
            <option value="PUBLISHED">발행</option>
            <option value="ARCHIVED">취소</option>
          </select>
          <button type="submit" className="btn">검색</button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>초기화</button>
        </form>
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>{err}</p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.announcements.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>조건에 맞는 공지가 없습니다.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 760 }}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>스코프</th>
                  <th>테넌트</th>
                  <th>상태</th>
                  <th>게시 기간</th>
                  <th>작성자</th>
                  <th>작성일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.announcements.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{SCOPE_LABEL[row.scope]}</td>
                    <td>{row.tenant?.name ?? "—"}</td>
                    <td>{STATUS_LABEL[row.status]}</td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {row.startsAt ? new Date(row.startsAt).toLocaleString("ko-KR") : "—"} ~{" "}
                      {row.endsAt ? new Date(row.endsAt).toLocaleString("ko-KR") : "상시"}
                    </td>
                    <td>{row.createdBy?.displayName ?? row.createdBy?.email ?? "—"}</td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {new Date(row.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/platform/announcements/${row.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 12 }}
                      >
                        편집
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
