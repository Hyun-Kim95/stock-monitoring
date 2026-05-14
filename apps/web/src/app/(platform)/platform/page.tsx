"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet } from "@/lib/api-client";

type OverviewResponse = {
  overview: {
    tenantCount: number;
    newUserCountLast7d: number;
    inquiryUnansweredCount: number;
    announcementActiveCount: number;
  };
};

type CardSpec = {
  key: keyof OverviewResponse["overview"];
  label: string;
  href: string;
  hint: string;
};

const CARDS: CardSpec[] = [
  {
    key: "tenantCount",
    label: "전체 테넌트",
    href: "/platform/tenants",
    hint: "테넌트 목록 보기",
  },
  {
    key: "newUserCountLast7d",
    label: "최근 7일 신규 회원",
    href: "/platform/users",
    hint: "회원 목록 보기",
  },
  {
    key: "inquiryUnansweredCount",
    label: "미답변 문의",
    href: "/platform/inquiries?repliedOnly=false",
    hint: "문의 통합 목록",
  },
  {
    key: "announcementActiveCount",
    label: "활성 공지",
    href: "/platform/announcements?status=PUBLISHED",
    hint: "공지 관리",
  },
];

export default function PlatformDashboardPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await apiGet<OverviewResponse>("/platform/overview");
        if (mounted) setData(res);
      } catch (e) {
        if (!mounted) return;
        setData(null);
        setErr(e instanceof ApiError ? `오류 ${e.status}` : "운영 요약을 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>대시보드</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--muted-foreground)" }}>
        운영 핵심 지표를 한눈에 확인합니다. 카드를 누르면 상세 화면으로 이동합니다.
      </p>

      {err ? (
        <p role="alert" style={{ color: "var(--down)", marginBottom: 12 }}>
          {err}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {CARDS.map((card) => {
          const value = loading || !data ? null : data.overview[card.key];
          return (
            <Link
              key={card.key}
              href={card.href}
              className="panel"
              style={{
                padding: 16,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600 }} aria-live="polite">
                {loading ? "…" : value === null ? "—" : value.toLocaleString("ko-KR")}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{card.hint} →</div>
            </Link>
          );
        })}
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <div className="panel-h" style={{ margin: "-16px -16px 12px" }}>
          빠른 이동
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Link href="/platform/users" className="btn btn-secondary">
            회원 관리
          </Link>
          <Link href="/platform/inquiries" className="btn btn-secondary">
            문의 통합
          </Link>
          <Link href="/platform/announcements" className="btn btn-secondary">
            공지 작성
          </Link>
          <Link href="/platform/tenants" className="btn btn-secondary">
            테넌트 탐색
          </Link>
          <Link href="/platform/audit-logs" className="btn btn-secondary">
            감사 로그
          </Link>
        </div>
      </div>
    </div>
  );
}
