"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api-client";

type Summary = { summary: { stockCount: number; themeCount: number; ruleCount: number } };

export default function PlatformCatalogSummaryPage() {
  const params = useParams();
  const tenantId = String(params.tenantId ?? "");
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<Summary>(`/platform/tenants/${encodeURIComponent(tenantId)}/catalog-summary`);
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
      <h1 style={{ margin: "0 0 16px", fontSize: 20 }}>카탈로그 요약</h1>
      {loading ? (
        <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>
      ) : err ? (
        <p role="alert" style={{ color: "var(--down)" }}>
          {err}
        </p>
      ) : data ? (
        <ul style={{ fontSize: 15, lineHeight: 1.8 }}>
          <li>종목 수: {data.summary.stockCount}</li>
          <li>테마 수: {data.summary.themeCount}</li>
          <li>뉴스 규칙 수: {data.summary.ruleCount}</li>
        </ul>
      ) : null}
      <p style={{ marginTop: 20 }}>
        <Link href={`/platform/tenants/${tenantId}`} className="btn btn-secondary">
          ← 테넌트 허브
        </Link>
      </p>
    </div>
  );
}
