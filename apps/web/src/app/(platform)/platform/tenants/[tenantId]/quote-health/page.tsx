"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api-client";

type Health = { stocks: { stockCode: string; lastRecordedAt: string | null }[] };

export default function PlatformQuoteHealthPage() {
  const params = useParams();
  const tenantId = String(params.tenantId ?? "");
  const [data, setData] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<Health>(`/platform/tenants/${encodeURIComponent(tenantId)}/quote-health`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setErr(e instanceof ApiError ? `오류 ${e.status}` : "불러오기 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        테넌트 <code style={{ fontSize: 12 }}>{tenantId}</code>
      </p>
      <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>시세 수집 건강도</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-foreground)" }}>
        활성 종목 최대 200개 코드에 대해 `StockQuoteHistory` 최신 시각을 표시합니다. 히스토리가 없으면 빈칸입니다.
      </p>

      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : err ? (
        <p role="alert" style={{ color: "var(--down)" }}>
          {err}
        </p>
      ) : !data || data.stocks.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)" }}>활성 종목이 없거나 데이터가 없습니다.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", minWidth: 360 }}>
            <thead>
              <tr>
                <th>종목 코드</th>
                <th>최근 기록</th>
              </tr>
            </thead>
            <tbody>
              {data.stocks.map((s) => (
                <tr key={s.stockCode}>
                  <td style={{ fontFamily: "var(--font-mono), monospace" }}>{s.stockCode}</td>
                  <td style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                    {s.lastRecordedAt ? new Date(s.lastRecordedAt).toLocaleString("ko-KR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href={`/platform/tenants/${tenantId}`} className="btn btn-secondary">
          ← 테넌트 허브
        </Link>
      </p>
    </div>
  );
}
