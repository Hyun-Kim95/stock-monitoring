"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;

type UserRow = { id: string; email: string; displayName: string | null; createdAt: string };

type ListResponse = {
  users: UserRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

export default function PlatformUsersPage() {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      const trimmed = q.trim();
      const path = trimmed
        ? `/platform/users/search?${new URLSearchParams({
            q: trimmed,
            page: String(page),
            pageSize: String(PAGE_SIZE),
          }).toString()}`
        : `/platform/users?${qs.toString()}`;
      const res = await apiGet<ListResponse>(path);
      setData(res);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError && e.status === 400) {
        setErr("검색어가 올바르지 않습니다.");
      } else {
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "목록을 불러오지 못했습니다.");
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
    setPage(1);
    setQ(draft.trim());
  }

  function resetFilters() {
    setDraft("");
    setQ("");
    setPage(1);
  }

  const isSearch = q.trim().length > 0;

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 20 }}>회원</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        검색어 없이는 최근 가입 순으로 보이고, 검색어가 있으면 이메일·표시명·UUID로 매칭합니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>필터</div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="이메일, 이름, 사용자 ID"
            aria-label="회원 검색"
            style={{ minWidth: 220, flex: "1 1 220px" }}
          />
          <button type="submit" className="btn">검색</button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>초기화</button>
        </form>
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>{err}</p>
      ) : null}

      {data?.truncated ? (
        <p role="status" style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>
          검색 결과가 많아 상위 100건만 조회했습니다. 검색어를 좁혀 주세요.
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.users.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>
          {isSearch ? "일치하는 회원이 없습니다." : "가입한 회원이 없습니다."}
        </p>
      ) : (
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
                      <Link
                        href={`/platform/users/${u.id}`}
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
