"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/platform/tenants", label: "테넌트", desc: "검색·목록" },
  { href: "/platform/users", label: "사용자", desc: "전역 검색" },
] as const;

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="플랫폼 운영 메뉴">
      {LINKS.map((m) => {
        const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
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
