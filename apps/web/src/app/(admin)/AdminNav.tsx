"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENUS = [
  { href: "/admin/stocks", tour: "admin-nav-stocks", label: "종목 관리", desc: "종목 검색·등록·비활성" },
  { href: "/admin/themes", tour: "admin-nav-themes", label: "테마 관리", desc: "테마 생성·종목 매핑" },
  { href: "/admin/news-rules", tour: "admin-nav-news-rules", label: "뉴스 규칙", desc: "검색 포함/제외 규칙" },
  { href: "/admin/inquiries", tour: "admin-nav-contact", label: "문의하기", desc: "문의·답변 확인" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav">
      {MENUS.map((m) => {
        const active = pathname === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            data-tour={m.tour}
            className={active ? "admin-nav-item active" : "admin-nav-item"}
          >
            <span className="admin-nav-label">{m.label}</span>
            <span className="admin-nav-desc">{m.desc}</span>
          </Link>
        );
      })}
    </nav>
  );
}

