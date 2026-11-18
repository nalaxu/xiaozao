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
        selected ? "bg-primary font-bold text-primary-contrast" : "bg-surface-muted text-text"
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
      <h2 className="font-serif text-h1 font-black">{children}</h2>
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
      ? "bg-primary text-primary-contrast shadow-cta active:brightness-90"
      : "border-[1.5px] border-ink bg-transparent text-text active:bg-surface-muted";
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

/** 印章底色：分组色加深一档，保证白字对比度不低于 4.5:1（设计文档 6.2） */
export function stampColor(color: string): string {
  return `color-mix(in oklab, ${color} 72%, black)`;
}

/** 菜系印章 */
export function Stamp({ color, children, className = "" }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={`stamp ${className || "text-[18px]"}`} style={{ background: stampColor(color) }}>
      {children}
    </span>
  );
}

const HEAT_LEVEL: Record<string, number> = { low: 1, medium_low: 1, medium: 2, medium_high: 2, high: 3 };

/** 火力徽标：1–3 簇火苗 + 文字（设计文档 6.5） */
export function HeatBadge({ heat, label, className = "" }: { heat: string; label: string; className?: string }) {
  const level = HEAT_LEVEL[heat] ?? 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-primary-soft px-2.5 py-0.5 font-bold text-primary ${className}`}
    >
      {[0, 1, 2].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-[1em] w-[1em]"
          fill={i < level ? "currentColor" : "none"}
          stroke="currentColor"
          strokeOpacity={i < level ? 1 : 0.45}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ))}
      <span className="ml-1">{label}</span>
    </span>
  );
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
      className={`flex items-center justify-center font-brush text-[32px] leading-none text-white ${className}`}
      style={{ background: stampColor(color) }}
      aria-hidden
    >
      {label}
    </div>
  );
}

export function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span role="img" aria-label={`难度 ${level}/3`} className="inline-flex items-center gap-[3px] align-middle">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-[7px] w-[7px] rounded-full ${i <= level ? "bg-ink" : "border-[1.5px] border-border-strong"}`}
        />
      ))}
    </span>
  );
}
