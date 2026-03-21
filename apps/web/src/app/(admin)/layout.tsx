import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ fontWeight: 700 }}>
          ← 대시보드
        </Link>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/admin/stocks">종목</Link>
          <Link href="/admin/themes">테마</Link>
          <Link href="/admin/news-rules">뉴스 규칙</Link>
          <Link href="/admin/settings">설정</Link>
        </nav>
        <AdminTokenHint />
      </header>
      <main style={{ padding: 16, flex: 1 }}>{children}</main>
    </div>
  );
}

function AdminTokenHint() {
  return (
    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
      관리자 API는 브라우저 <code>localStorage.adminToken</code> 또는{" "}
      <code>NEXT_PUBLIC_ADMIN_TOKEN</code>으로 Bearer 전송합니다.
    </span>
  );
}
