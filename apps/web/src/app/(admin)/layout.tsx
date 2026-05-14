"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./AdminNav";
import { AdminOnboardingTour } from "@/components/AdminOnboardingTour";
import { apiSend } from "@/lib/api-client";
import { useAdminOnboarding } from "@/hooks/useAdminOnboarding";
import { useAuthSession, type SessionUser } from "@/hooks/useAuthSession";
import { useEnforceAccess } from "@/hooks/useEnforceAccess";

function isTenantAdmin(u: SessionUser): boolean {
  return u.role === "OWNER" || u.role === "ADMIN";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, refresh } = useAuthSession();
  const gate = useEnforceAccess({ loading, user, isAllowed: isTenantAdmin, refresh });
  const canAdmin = gate === "ok";
  const { tourOpen, openTour, finishTour } = useAdminOnboarding({ enabled: canAdmin });

  const logout = useCallback(async () => {
    await apiSend("/auth/logout", "POST");
    await refresh();
    router.replace("/login");
  }, [refresh, router]);

  if (gate !== "ok" || !user) {
    return <div style={{ padding: 24 }}>세션 확인 중...</div>;
  }

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
          <button type="button" className="btn" onClick={() => void logout()} style={{ width: "100%" }}>
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
