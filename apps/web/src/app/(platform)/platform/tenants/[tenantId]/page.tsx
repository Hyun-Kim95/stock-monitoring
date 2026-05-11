"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, apiGet } from "@/lib/api-client";

type TenantDetail = {
  tenant: { id: string; name: string; createdAt: string; updatedAt: string };
};

export default function PlatformTenantHubPage() {
  const params = useParams();
  const tenantId = String(params.tenantId ?? "");
  const [data, setData] = useState<TenantDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<TenantDetail>(`/platform/tenants/${encodeURIComponent(tenantId)}`);
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

  if (loading) return <p style={{ color: "var(--muted-foreground)" }}>불러오는 중…</p>;
  if (err || !data) {
    return (
      <div>
        <p role="alert" style={{ color: "var(--down)" }}>
          {err ?? "테넌트를 찾을 수 없습니다."}
        </p>
        <Link href="/platform/tenants" className="btn btn-secondary" style={{ marginTop: 12 }}>
          목록으로
        </Link>
      </div>
    );
  }

  const { tenant } = data;

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
        테넌트 ID <code style={{ fontSize: 12 }}>{tenant.id}</code>
      </p>
      <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>{tenant.name}</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--muted-foreground)" }}>
        생성 {new Date(tenant.createdAt).toLocaleString("ko-KR")} · 수정{" "}
        {new Date(tenant.updatedAt).toLocaleString("ko-KR")}
      </p>

      <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <Link href={`/platform/tenants/${tenant.id}/inquiries`} className="admin-nav-item">
          <span className="admin-nav-label">문의 목록</span>
          <span className="admin-nav-desc">기간·키워드 필터</span>
        </Link>
        <Link href={`/platform/tenants/${tenant.id}/settings`} className="admin-nav-item">
          <span className="admin-nav-label">시스템 설정</span>
          <span className="admin-nav-desc">키·값 편집 (낙관적 잠금)</span>
        </Link>
        <Link href={`/platform/tenants/${tenant.id}/catalog`} className="admin-nav-item">
          <span className="admin-nav-label">카탈로그 요약</span>
          <span className="admin-nav-desc">종목·테마·규칙 수</span>
        </Link>
        <Link href={`/platform/tenants/${tenant.id}/quote-health`} className="admin-nav-item">
          <span className="admin-nav-label">시세 수집 건강도</span>
          <span className="admin-nav-desc">활성 종목별 최근 기록</span>
        </Link>
        <Link href="/platform/tenants" className="btn btn-secondary" style={{ marginTop: 8 }}>
          ← 테넌트 목록
        </Link>
      </div>
    </div>
  );
}
