"use client";

import type { ComponentProps } from "react";

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
  loading?: boolean;
}) {
  const styles = {
    primary:
      "bg-primary text-primary-contrast shadow-cta active:brightness-90 disabled:bg-kraft disabled:text-text-muted disabled:shadow-none",
    secondary: "border-[1.5px] border-ink bg-transparent text-text active:bg-surface-muted disabled:border-border disabled:text-text-muted",
    ghost: "text-primary active:bg-primary-soft disabled:text-text-muted",
    danger: "bg-danger text-white active:brightness-90 disabled:bg-surface-muted disabled:text-text-muted",
    "danger-ghost": "text-danger active:bg-surface-muted disabled:text-text-muted",
  }[variant];
  return (
    <button
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-control text-[17px] font-bold ${styles} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`h-[52px] w-full rounded-control border border-border bg-surface px-4 text-body text-text outline-none placeholder:text-text-muted focus:border-primary ${className}`}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 text-small text-danger">
      {children}
    </p>
  );
}

export async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "网络连接失败，请检查网络后再试" } as T & { error?: string } };
  }
}
