import Link from "next/link";
import { AdminNav } from "./AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-title">Admin Console</div>
          <div className="admin-brand-sub">stockMonitoring 운영</div>
        </div>
        <AdminNav />
        <div className="admin-sidebar-footer">
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
