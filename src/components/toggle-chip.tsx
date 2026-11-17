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
      className={`inline-flex h-9 items-center rounded-full px-3.5 text-small ${
        on ? "bg-primary-soft font-bold text-primary" : "bg-surface-muted text-text"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
