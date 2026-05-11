"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;

type UserRow = { id: string; email: string; displayName: string | null; createdAt: string };

type SearchResponse = {
  users: UserRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

export default function PlatformUsersSearchPage() {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!q.trim()) {
      setData(null);
      setErr(null);
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ q: q.trim(), page: String(page), pageSize: String(PAGE_SIZE) });
      const res = await apiGet<SearchResponse>(`/platform/users/search?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError && e.status === 400) {
        setErr("검색어가 필요합니다.");
      } else {
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "검색에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) {
      setErr("검색어를 입력하세요.");
      setData(null);
      return;
    }
    setPage(1);
    setQ(draft.trim());
    setErr(null);
  }

  function resetFilters() {
    setDraft("");
    setQ("");
    setPage(1);
    setData(null);
    setErr(null);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>사용자 검색</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        이메일·표시명·UUID 일부 검색. 결과는 서버 상한(100건)까지이며 초과 시 안내합니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          검색
        </div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="이메일, 이름, 사용자 ID"
            aria-label="사용자 검색어"
            style={{ minWidth: 220, flex: "1 1 220px" }}
          />
          <button type="submit" className="btn">
            검색
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>
            초기화
          </button>
        </form>
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>
          {err}
        </p>
      ) : null}

      {data?.truncated ? (
        <p role="status" style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
          검색 결과가 많아 상위 100건만 조회했습니다. 검색어를 좁혀 주세요.
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>검색 중…</p>
      ) : q && data && data.users.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>일치하는 사용자가 없습니다.</p>
      ) : q && data && data.users.length > 0 ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 520 }}>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>표시명</th>
                  <th>가입</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.displayName ?? "—"}</td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/platform/users/${u.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
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
      ) : !q ? (
        <p style={{ color: "var(--muted-foreground)" }}>검색어를 입력한 뒤 검색을 누르세요.</p>
      ) : null}
    </div>
  );
}
