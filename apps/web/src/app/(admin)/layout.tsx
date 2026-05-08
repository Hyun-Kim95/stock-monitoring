"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./AdminNav";
import { apiSend } from "@/lib/api-client";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, refresh } = useAuthSession();

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
          <div className="admin-brand-title">Admin Console</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{user.email}</div>
        </div>
        <AdminNav />
        <div className="admin-sidebar-footer">
          <button type="button" className="btn" onClick={logout} style={{ width: "100%", marginBottom: 8 }}>
            로그아웃
          </button>
          <Link href="/" className="admin-back-link">
            ← 대시보드로 돌아가기
          </Link>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-main-inner">{children}</div>
      </main>
    </div>
  );
}
