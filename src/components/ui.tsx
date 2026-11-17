// 基础组件，样式见 docs/DESIGN.md 6.5。
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { CuisineGroup } from "@/lib/kb";

export function Chip({
  children,
  selected = false,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-9 items-center rounded-full px-3.5 text-small ${
        selected ? "bg-primary-soft font-bold text-primary" : "bg-surface-muted text-text"
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-card border border-border bg-surface ${className}`} {...props} />;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="text-h2 font-bold">{children}</h2>
      {sub && <span className="text-small text-text-muted">{sub}</span>}
    </div>
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-contrast active:brightness-90"
      : "border border-border bg-surface text-text active:bg-surface-muted";
  return (
    <Link
      className={`flex h-[52px] w-full items-center justify-center rounded-control text-body font-bold ${styles} ${className}`}
      {...props}
    />
  );
}

const GROUP_VAR: Record<CuisineGroup, string> = {
  chinese: "var(--group-chinese)",
  "east-southeast-asia": "var(--group-east-southeast-asia)",
  "south-asia-middle-east": "var(--group-south-asia-middle-east)",
  "europe-americas": "var(--group-europe-americas)",
};

/** 菜系配色：分组主色上按序号微调明度（设计文档 6.2） */
export function cuisineColor(group: CuisineGroup, indexInGroup: number): string {
  const shift = [0, 12, -10, 22, -18][indexInGroup % 5];
  const base = GROUP_VAR[group];
  return shift >= 0
    ? `color-mix(in oklab, ${base} ${100 - shift}%, white)`
    : `color-mix(in oklab, ${base} ${100 + shift}%, black)`;
}

/** 图片占位：纯色块 + 白色菜系名（PRD 4.3、设计文档 4.4） */
export function CuisinePlaceholder({
  color,
  label,
  className = "",
}: {
  color: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center text-h2 font-bold text-white ${className}`}
      style={{ background: color }}
      aria-hidden
    >
      {label}
    </div>
  );
}

export function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span aria-label={`难度 ${level}/3`} className="tracking-[2px] text-primary">
      {"●".repeat(level)}
      <span className="text-border">{"●".repeat(3 - level)}</span>
    </span>
  );
}
