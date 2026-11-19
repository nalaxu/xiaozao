"use client";

import Link from "next/link";
import { Bookmark, Compass, CookingPot, UserRound } from "lucide-react";
import { useRealPathname } from "@/lib/use-real-pathname";

const TABS = [
  { href: "/", label: "做菜", icon: CookingPot },
  { href: "/saved", label: "收藏", icon: Bookmark },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/me", label: "我的", icon: UserRound },
] as const;

// 推荐、教程、烹饪模式等页面隐藏标签栏（设计文档第 2 节）
const HIDDEN_PREFIXES = ["/recommend", "/t/", "/samples/", "/login", "/welcome", "/admin"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = useRealPathname();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <>
      {/* 桌面：顶部导航 */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-bg/95 backdrop-blur lg:block">
        <nav className="mx-auto flex h-14 max-w-[960px] items-center gap-8 px-6" aria-label="主导航">
          <Link href="/" className="font-brush text-[30px] leading-none text-primary">
            小灶
          </Link>
          <ul className="flex gap-6">
            {TABS.map((tab) => (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={isActive(pathname, tab.href) ? "page" : undefined}
                  className="text-small text-text-muted hover:text-text aria-[current=page]:font-bold aria-[current=page]:text-text"
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* 手机与平板：底部标签栏 */}
      {!hidden && (
        <nav
          aria-label="主导航"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="mx-auto grid h-16 max-w-[640px] grid-cols-4">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-full flex-col items-center justify-center gap-0.5 text-caption ${
                      active ? "font-bold text-primary" : "text-text-muted"
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.75} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}
