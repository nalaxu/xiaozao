"use client";

import type { ReactNode } from "react";

/** 可多选的标签按钮（首页口味、设置页过敏原与厨具） */
export function ToggleChip({
  on,
  disabled,
  onClick,
  title,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex h-11 items-center rounded-full border px-4 text-[15px] ${
        on
          ? "border-primary bg-primary font-bold text-primary-contrast"
          : "border-border bg-surface text-text active:bg-surface-muted"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
