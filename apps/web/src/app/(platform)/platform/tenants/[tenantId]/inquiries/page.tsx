"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api-client";
import { PaginationFooter } from "../../../_components/PaginationFooter";

const PAGE_SIZE = 15;

type Author = { id: string; email: string | null; displayName: string | null };

type InquiryRow = {
  id: string;
  subject: string | null;
  createdAt: string;
  author: Author;
  replyCount: number;
};

type ListResponse = {
  inquiries: InquiryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function PlatformTenantInquiriesPage() {
  const params = useParams();
  const tenantId = String(params.tenantId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (q.trim()) qs.set("q", q.trim());
      const res = await apiGet<ListResponse>(
        `/platform/tenants/${encodeURIComponent(tenantId)}/inquiries?${qs.toString()}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setErr(e instanceof ApiError ? `오류 ${e.status}` : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, from, to, q]);

  useEffect(() => {
    if (!tenantId) return;
    void load();
  }, [tenantId, load]);

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setFrom(draftFrom.trim());
    setTo(draftTo.trim());
    setQ(draftQ.trim());
  }

  function resetFilters() {
    setDraftFrom("");
    setDraftTo("");
    setDraftQ("");
    setFrom("");
    setTo("");
    setQ("");
    setPage(1);
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        테넌트 <code style={{ fontSize: 12 }}>{tenantId}</code>
      </p>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>문의 목록</h1>

      <div className="panel" style={{ padding: 12, marginBottom: 16 }}>
        <div className="panel-h" style={{ margin: "-12px -12px 12px" }}>
          필터
        </div>
        <form onSubmit={(e) => void applyFilter(e)} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 13 }}>
              시작
              <input
                type="datetime-local"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              종료
              <input
                type="datetime-local"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="제목·본문 키워드"
              aria-label="문의 키워드"
              style={{ minWidth: 200, flex: "1 1 200px" }}
            />
            <button type="submit" className="btn">
              검색
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetFilters}>
              초기화
            </button>
          </div>
        </form>
      </div>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>
          {err}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : !data || data.inquiries.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>문의가 없습니다.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 560 }}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>작성자</th>
                  <th>답변</th>
                  <th>작성</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.inquiries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.subject ?? "(제목 없음)"}</td>
                    <td style={{ fontSize: 13 }}>
                      {row.author.displayName ?? row.author.email ?? row.author.id}
                    </td>
                    <td>{row.replyCount}</td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/platform/inquiries/${row.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
                        열기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter page={data.page} totalPages={data.totalPages} disabled={loading} onPageChange={setPage} />
        </>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href={`/platform/tenants/${tenantId}`} className="btn btn-secondary">
          ← 테넌트 허브
        </Link>
      </p>
    </div>
  );
}
