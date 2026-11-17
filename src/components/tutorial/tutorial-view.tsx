"use client";

// 教程（设计文档 4.5、PRD 4.3）。流式生成时传入不完整的内容，已有部分先显示。
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Lightbulb,
  MessageCircleQuestion,
  Minus,
  Plus,
  ShieldCheck,
  Thermometer,
  Timer,
} from "lucide-react";
import { Button } from "@/components/form";
import { DishImage } from "@/components/dish-image";
import { ActionBar } from "@/components/overlay";
import { DifficultyDots } from "@/components/ui";
import {
  HEAT_LABELS,
  type TutorialContent,
  type TutorialIngredient,
  type TutorialStep,
} from "@/lib/tutorial-types";
import { saveOffline, setOfflineFavorite, type OfflineTutorial } from "@/lib/offline";
import { formatAmount, formatDuration, formatTemp, type UnitSystem } from "@/lib/units";
import { FollowupSheet, type Followup } from "./followup-sheet";

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type PartialContent = DeepPartial<TutorialContent>;

const GROUPS: { id: TutorialIngredient["group"]; label: string }[] = [
  { id: "main", label: "主料" },
  { id: "aux", label: "辅料" },
  { id: "seasoning", label: "调料" },
];

const UNITS_KEY = "xz_units";

export interface TutorialViewProps {
  tutorialId: string | null;
  content: PartialContent | null;
  streaming: boolean;
  /** 流式时正在做的事，如“正在写步骤…” */
  status?: string | null;
  dish: { id: string; nameZh: string; imageUrl: string | null };
  cuisine: { zh: string; color: string } | undefined;
  units: UnitSystem;
  followups: Followup[];
  followupLimit: number;
  backHref: string;
  /** 已收藏；undefined 表示不显示收藏按钮（生成中、离线） */
  favorite?: boolean;
  /** 最近一次做好的时间 */
  cookedAt?: string | null;
  /** 离线外壳里打开：不能追问、不能收藏 */
  offline?: boolean;
  /** 在线打开已生成的教程时传入，存一份离线副本 */
  offlineRecord?: Omit<OfflineTutorial, "openedAt">;
}

export function TutorialView(props: TutorialViewProps) {
  const { content, streaming, cuisine } = props;
  const overview = content?.overview;
  const baseServings = overview?.servings && overview.servings > 0 ? overview.servings : 2;
  const [servings, setServings] = useState<number | null>(null);
  const [units, setUnits] = useState<UnitSystem>(props.units);
  const [askOpen, setAskOpen] = useState(false);
  const shown = servings ?? baseServings;
  const factor = shown / baseServings;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(UNITS_KEY);
      if (saved === "metric" || saved === "us") setUnits(saved);
    } catch {}
  }, []);

  const changeUnits = (u: UnitSystem) => {
    setUnits(u);
    try {
      localStorage.setItem(UNITS_KEY, u);
    } catch {}
  };

  const [favorite, setFavorite] = useState(props.favorite);
  const [favBusy, setFavBusy] = useState(false);
  const record = props.offlineRecord;

  // 流式生成完后才知道可以收藏
  useEffect(() => {
    if (props.favorite !== undefined) setFavorite((f) => f ?? props.favorite);
  }, [props.favorite]);

  // 打开过的教程存到本机，离线也能看（技术方案第 11 节）
  useEffect(() => {
    if (record) void saveOffline(record);
  }, [record]);

  const toggleFavorite = async () => {
    if (!props.tutorialId || favorite === undefined || favBusy) return;
    const on = !favorite;
    setFavorite(on);
    setFavBusy(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tutorialId: props.tutorialId, on }),
      });
      if (!res.ok) throw new Error();
      if (record && on) await saveOffline({ ...record, favorite: true });
      else await setOfflineFavorite(props.tutorialId, on);
    } catch {
      setFavorite(!on);
    } finally {
      setFavBusy(false);
    }
  };

  const steps = (content?.steps ?? []).filter((s): s is DeepPartial<TutorialStep> => Boolean(s?.action));
  const done = !streaming;

  return (
    <div className="pb-28 lg:-mx-[120px] lg:grid lg:grid-cols-[320px_1fr] lg:gap-10">
      {/* 左栏（桌面固定）：图片、概览、食材 */}
      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-96px)] lg:self-start lg:overflow-y-auto lg:pb-8">
        <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0">
          <DishImage
            url={props.dish.imageUrl}
            color={cuisine?.color}
            label={cuisine?.zh ?? ""}
            className="aspect-[4/3] lg:rounded-card"
            caption="AI 生成示意图，成品可能不同"
          />
          <Link
            href={props.backHref}
            aria-label="返回"
            className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <ChevronLeft size={22} aria-hidden />
          </Link>
          {favorite !== undefined && !props.offline && (
            <button
              type="button"
              onClick={toggleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? "取消收藏" : "收藏"}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <Bookmark size={20} fill={favorite ? "currentColor" : "none"} aria-hidden />
            </button>
          )}
        </div>

        <header className="mt-4">
          {props.cookedAt && (
            <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-small text-success">
              <CheckCircle2 size={14} aria-hidden /> 你做过
            </p>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-display font-bold">{overview?.name_zh ?? props.dish.nameZh}</h1>
            {cuisine && (
              <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-0.5 text-small">{cuisine.zh}</span>
            )}
          </div>
          {(overview?.name_en || overview?.name_original) && (
            <p className="text-small text-text-muted">
              {[overview?.name_en, overview?.name_original].filter(Boolean).join(" · ")}
            </p>
          )}
          {overview?.flavor_desc && <p className="mt-2">{overview.flavor_desc}</p>}
          {overview?.total_minutes !== undefined && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-small text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} aria-hidden />
                <span className="tabular">共 {overview.total_minutes} 分钟</span>
              </span>
              {overview.active_minutes !== undefined && <span>· 动手 {overview.active_minutes} 分钟</span>}
              {overview.difficulty && (
                <span>
                  · 难度 <DifficultyDots level={overview.difficulty as 1 | 2 | 3} />
                </span>
              )}
              {overview.servings !== undefined && <span>· {overview.servings} 人份</span>}
            </p>
          )}
        </header>

        <section className="mt-6" aria-labelledby="ingredients-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ingredients-title" className="text-h2 font-bold">
              食材
            </h2>
            <div className="flex items-center gap-3">
              <Stepper
                value={shown}
                onChange={setServings}
                min={1}
                max={12}
                label={(n) => `${n} 人份`}
                disabled={!overview?.servings}
              />
              <Segmented
                value={units}
                onChange={changeUnits}
                options={[
                  { value: "metric", label: "公制" },
                  { value: "us", label: "美制" },
                ]}
              />
            </div>
          </div>
          <Ingredients content={content} factor={factor} units={units} />
        </section>
      </div>

      {/* 右栏：步骤、关键点、背景 */}
      <div>
        <section className="mt-8 lg:mt-0" aria-labelledby="steps-title">
          <h2 id="steps-title" className="mb-3 text-h2 font-bold">
            步骤
          </h2>
          {steps.length === 0 && streaming && <SkeletonLines n={4} />}
          <ol className="space-y-5">
            {steps.map((s, i) => (
              <StepItem key={i} index={i} step={s} units={units} />
            ))}
          </ol>
          {streaming && steps.length > 0 && (
            <p className="mt-4 animate-pulse text-small text-text-muted">{props.status ?? "正在写步骤…"}</p>
          )}
        </section>

        {done && !!content?.key_points?.length && (
          <section className="mt-8 rounded-card bg-primary-soft p-4" aria-labelledby="keypoints-title">
            <h2 id="keypoints-title" className="mb-2 flex items-center gap-2 font-bold text-primary">
              <Lightbulb size={18} aria-hidden /> 关键点
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              {content.key_points.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </section>
        )}

        {done && content?.background && (
          <details className="group mt-6 rounded-card border border-border bg-surface">
            <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 font-bold">
              背景
              <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-4 pb-4 text-text-muted">{content.background}</p>
          </details>
        )}

        {done && (
          <section className="mt-6 space-y-2 text-small text-text-muted" aria-label="安全提示">
            {(content?.safety_notes ?? []).map((n, i) => (
              <p key={i} className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
                {n}
              </p>
            ))}
            <p className="pt-2 text-caption">教程由 AI 生成，过敏与饮食禁忌请自行确认。</p>
          </section>
        )}
      </div>

      <ActionBar aboveTabs={false}>
        {streaming ? (
          <Button disabled>{props.status ?? "正在写步骤…"}</Button>
        ) : (
          <div className="flex gap-3">
            {!props.offline && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setAskOpen(true)}
                disabled={!props.tutorialId}
              >
                <MessageCircleQuestion size={18} aria-hidden /> 问一问
              </Button>
            )}
            {props.tutorialId ? (
              <Link
                href={`/t/${props.tutorialId}/cook${servings !== null && servings !== baseServings ? `?servings=${servings}` : ""}`}
                className="flex h-[52px] flex-[2] items-center justify-center gap-1 rounded-control bg-primary font-bold text-primary-contrast active:brightness-90"
              >
                开始做 <ChevronRight size={20} aria-hidden />
              </Link>
            ) : (
              <Button className="flex-[2]" disabled>
                开始做
              </Button>
            )}
          </div>
        )}
      </ActionBar>

      {askOpen && props.tutorialId && (
        <FollowupSheet
          tutorialId={props.tutorialId}
          initial={props.followups}
          limit={props.followupLimit}
          onClose={() => setAskOpen(false)}
        />
      )}
    </div>
  );
}

export function Ingredients({ content, factor, units }: { content: PartialContent | null; factor: number; units: UnitSystem }) {
  const items = (content?.ingredients ?? []).filter((i): i is DeepPartial<TutorialIngredient> => Boolean(i?.name_zh));
  const subs = (content?.substitutions ?? []).filter((s) => s?.for && s.substitute);
  const subFor = (name: string) => subs.find((s) => s!.for!.includes(name) || name.includes(s!.for!));
  const unmatched = subs.filter((s) => !items.some((i) => s!.for!.includes(i.name_zh!) || i.name_zh!.includes(s!.for!)));

  if (!items.length) return <SkeletonLines n={5} />;
  return (
    <div className="mt-3 space-y-4">
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id}>
            <p className="mb-1 text-small text-text-muted">{g.label}</p>
            <ul className="divide-y divide-border rounded-card border border-border bg-surface">
              {list.map((i, idx) => (
                <IngredientRow key={`${i.name_zh}-${idx}`} item={i} factor={factor} units={units} sub={subFor(i.name_zh!)} />
              ))}
            </ul>
          </div>
        );
      })}
      {unmatched.length > 0 && (
        <div>
          <p className="mb-1 text-small text-text-muted">替代</p>
          <ul className="space-y-2 rounded-card border border-border bg-surface p-3 text-small">
            {unmatched.map((s, i) => (
              <li key={i}>
                <b>{s!.for}</b> → {s!.substitute}
                {s!.difference && <span className="text-text-muted">（{s!.difference}）</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function IngredientRow({
  item,
  factor,
  units,
  sub,
}: {
  item: DeepPartial<TutorialIngredient>;
  factor: number;
  units: UnitSystem;
  sub?: DeepPartial<TutorialContent["substitutions"][number]>;
}) {
  const [open, setOpen] = useState(false);
  const amount =
    item.unit !== undefined && item.amount !== undefined
      ? formatAmount(item.amount ?? null, item.unit as TutorialIngredient["unit"], factor, units)
      : null;
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 flex-1">
          <span>{item.name_zh}</span>
          {item.optional && <span className="ml-1.5 text-caption text-text-muted">可省</span>}
          {item.name_en && <span className="ml-2 text-small text-text-muted">{item.name_en}</span>}
          {item.prep && <span className="block text-small text-text-muted">{item.prep}</span>}
        </div>
        {sub && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 rounded-full border border-primary px-2 text-caption text-primary"
          >
            替代
          </button>
        )}
        <span className="tabular shrink-0 text-right font-bold">
          {amount ? `${amount.value}${amount.value ? " " : ""}${amount.unit}` : ""}
        </span>
      </div>
      {open && sub && (
        <p className="mt-2 rounded-control bg-surface-muted p-2 text-small">
          可以用 <b>{sub.substitute}</b>
          {sub.difference && <span className="text-text-muted">。{sub.difference}</span>}
        </p>
      )}
    </li>
  );
}

function StepItem({ index, step, units }: { index: number; step: DeepPartial<TutorialStep>; units: UnitSystem }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-small font-bold text-primary-contrast">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {(step.heat || step.oven_c || step.timer_seconds) && (
          <div className="mb-1 flex flex-wrap gap-2 text-caption">
            {step.heat && step.heat !== "off" && (
              <Badge icon={<Flame size={12} aria-hidden />}>{HEAT_LABELS[step.heat as TutorialStep["heat"] & string]}</Badge>
            )}
            {step.oven_c ? <Badge icon={<Thermometer size={12} aria-hidden />}>烤箱 {formatTemp(step.oven_c, units)}</Badge> : null}
            {step.timer_seconds ? (
              <Badge icon={<Timer size={12} aria-hidden />}>{formatDuration(step.timer_seconds)}</Badge>
            ) : null}
          </div>
        )}
        <p>{step.action}</p>
        {step.cue && <p className="mt-1 font-bold">看到：{step.cue}</p>}
        {step.warning && (
          <p className="mt-2 flex gap-2 rounded-control bg-surface-muted p-2 text-small">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            {step.warning}
          </p>
        )}
      </div>
    </li>
  );
}

function Badge({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-bold text-primary">
      {icon}
      {children}
    </span>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: (n: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-full border border-border bg-surface">
      <button
        type="button"
        aria-label="减少份量"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center disabled:opacity-30"
      >
        <Minus size={16} />
      </button>
      <span className="tabular min-w-[4em] text-center text-small" aria-live="polite">
        {label(value)}
      </span>
      <button
        type="button"
        aria-label="增加份量"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-9 w-9 items-center justify-center disabled:opacity-30"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-full bg-surface-muted p-0.5" role="group" aria-label="单位">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3 text-small ${value === o.value ? "bg-surface font-bold shadow-sm" : "text-text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SkeletonLines({ n }: { n: number }) {
  return (
    <div className="mt-3 space-y-2" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-surface-muted" style={{ width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}
