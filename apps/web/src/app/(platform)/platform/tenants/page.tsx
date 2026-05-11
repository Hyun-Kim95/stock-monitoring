"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../_components/PaginationFooter";

const PAGE_SIZE = 15;

type TenantRow = { id: string; name: string; createdAt: string };

type TenantsResponse = {
  tenants: TenantRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  truncated: boolean;
};

export default function PlatformTenantsPage() {
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TenantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      qs.set("page", String(page));
      qs.set("pageSize", String(PAGE_SIZE));
      const res = await apiGet<TenantsResponse>(`/platform/tenants?${qs.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "목록을 불러오지 못했습니다.");
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

  return (
    <div>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>테넌트</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        테넌트 이름으로 검색하고 상세·문의·설정으로 이동합니다.
      </p>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          필터
        </div>
        <form
          onSubmit={(e) => void runSearch(e)}
          style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
        >
          <input
            id="tenant-q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="이름 검색"
            aria-label="테넌트 이름 검색"
            style={{ minWidth: 200, flex: "1 1 200px" }}
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

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.tenants.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>테넌트가 없습니다.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 480 }}>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>생성일</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.tenants.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {new Date(t.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/platform/tenants/${t.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
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
