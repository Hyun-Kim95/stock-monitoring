"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./AdminNav";
import { AdminOnboardingTour } from "@/components/AdminOnboardingTour";
import { apiSend } from "@/lib/api-client";
import { useAdminOnboarding } from "@/hooks/useAdminOnboarding";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, refresh } = useAuthSession();
  const canAdmin = Boolean(user && (user.role === "OWNER" || user.role === "ADMIN"));
  const { tourOpen, openTour, finishTour } = useAdminOnboarding({ enabled: !loading && canAdmin });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [loading, router, user]);

  async function logout() {
    await apiSend("/auth/logout", "POST");
    await refresh();
    router.replace("/login");
  }

  if (loading) return <div style={{ padding: 24 }}>세션 확인 중...</div>;
  if (!user) return null;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div className="admin-brand-title">설정</div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px", flexShrink: 0 }}
              data-tour="admin-help-replay"
              aria-label="설정 화면 설명 다시 보기"
              onClick={openTour}
            >
              사용법
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{user.email}</div>
        </div>
        <Link href="/" className="btn btn-secondary admin-back-dashboard" data-tour="admin-back-dashboard">
          ← 대시보드로 돌아가기
        </Link>
        <AdminNav />
        <div className="admin-sidebar-footer">
          <button type="button" className="btn" onClick={logout} style={{ width: "100%" }}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-main-inner">{children}</div>
      </main>
      <AdminOnboardingTour open={tourOpen} onFinish={finishTour} />
    </div>
  );
}
