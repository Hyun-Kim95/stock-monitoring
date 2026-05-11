"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { apiSend } from "@/lib/api-client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { PlatformNav } from "./PlatformNav";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, refresh } = useAuthSession();
  const canOperate = Boolean(user?.isPlatformOperator);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.isPlatformOperator) {
      router.replace("/");
    }
  }, [loading, router, user]);

  async function logout() {
    await apiSend("/auth/logout", "POST");
    await refresh();
    router.replace("/login");
  }

  if (loading) return <div style={{ padding: 24 }}>세션 확인 중...</div>;
  if (!user || !canOperate) return null;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-title">플랫폼 운영</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{user.email}</div>
        </div>
        <Link href="/" className="btn btn-secondary admin-back-dashboard">
          ← 서비스 홈
        </Link>
        <PlatformNav />
        <div className="admin-sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ width: "100%" }}>
            <ThemeToggle className="btn btn-secondary" />
          </div>
          <button type="button" className="btn" onClick={() => void logout()} style={{ width: "100%" }}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-main-inner">{children}</div>
      </main>
    </div>
  );
}
