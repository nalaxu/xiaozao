"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 后台导航（设计文档第 9 节）。花费页是首页
const NAV = [
  { href: "/admin", label: "花费" },
  { href: "/admin/invites", label: "邀请码" },
  { href: "/admin/waitlist", label: "申请" },
  { href: "/admin/accounts", label: "账号" },
  { href: "/admin/images", label: "图片库" },
  { href: "/admin/metrics", label: "指标" },
  { href: "/admin/knowledge", label: "知识库" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="后台导航">
      {NAV.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 font-bold ${
              active ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 危险操作的二次确认（停用账号等） */
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
