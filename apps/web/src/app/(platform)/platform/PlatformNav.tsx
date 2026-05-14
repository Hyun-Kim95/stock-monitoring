"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** PRD §4.1 — 작업 중심 평면 IA (2026-05-14) */
const LINKS = [
  { href: "/platform", label: "대시보드", desc: "운영 KPI 요약" },
  { href: "/platform/users", label: "회원", desc: "최근 가입·검색" },
  { href: "/platform/inquiries", label: "문의", desc: "크로스 테넌트" },
  { href: "/platform/announcements", label: "공지", desc: "작성·발행" },
  { href: "/platform/tenants", label: "테넌트", desc: "심층 탐색" },
  { href: "/platform/audit-logs", label: "감사 로그", desc: "운영자 액션" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="플랫폼 운영 메뉴">
      {LINKS.map((m) => {
        const active = isActive(pathname, m.href);
        return (
          <Link key={m.href} href={m.href} className={active ? "admin-nav-item active" : "admin-nav-item"}>
            <span className="admin-nav-label">{m.label}</span>
            <span className="admin-nav-desc">{m.desc}</span>
          </Link>
        );
      })}
    </nav>
  );
}
