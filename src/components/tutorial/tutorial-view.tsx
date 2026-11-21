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
  MessageCircleQuestion,
  ShieldCheck,
  Thermometer,
  Timer,
} from "lucide-react";
import { Button } from "@/components/form";
import { DishImage } from "@/components/dish-image";
import { ActionBar } from "@/components/overlay";
import { DifficultyDots, HeatBadge, Stamp } from "@/components/ui";
import {
  HEAT_LABELS,
  type TutorialContent,
  type TutorialIngredient,
  type TutorialStep,
} from "@/lib/tutorial-types";
import { VERDICT_LABELS, type Verdict } from "@/lib/preference-options";
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
  /** 自己的评价 */
  rating?: Verdict | null;
  /** 离线外壳里打开：不能追问、不能收藏 */
  offline?: boolean;
  /** 在线打开已生成的教程时传入，存一份离线副本 */
  offlineRecord?: Omit<OfflineTutorial, "openedAt">;
  /** 示例教程（未登录可看）：顶部横幅，“开始做”进示例的烹饪模式，不能追问 */
  sample?: { cookHref: string; draft?: boolean };
}

export function TutorialView(props: TutorialViewProps) {
  const { content, streaming, cuisine } = props;
  const overview = content?.overview;
  const [units, setUnits] = useState<UnitSystem>(props.units);
  const [askOpen, setAskOpen] = useState(false);
  const [followups, setFollowups] = useState(props.followups);

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
  const keyPoints = (content?.key_points ?? []).filter((k): k is string => Boolean(k));
  const done = !streaming;

  return (
    <div className="pb-28 lg:-mx-[120px] lg:grid lg:grid-cols-[320px_1fr] lg:gap-10">
      {props.sample && (
        <div className="-mx-4 -mt-4 mb-4 bg-primary-soft px-4 py-3 text-small lg:col-span-2 lg:mx-0 lg:mt-0 lg:rounded-card">
          {props.sample.draft && <strong className="mr-1 text-primary">[草稿，仅管理员可见]</strong>}
          这是示例教程。
          <Link href="/login" className="font-bold text-primary underline underline-offset-2">
            登录
          </Link>
          后可以按你的食材生成。
        </div>
      )}
      {/* 左栏（桌面固定）：图片、概览、食材 */}
      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-96px)] lg:self-start lg:overflow-y-auto lg:pb-8">
        <div className="relative -mx-4 -mt-4 lg:mx-0 lg:mt-0">
          <DishImage
            url={props.dish.imageUrl}
            color={cuisine?.color}
            label={cuisine?.zh ?? ""}
            className="aspect-[4/3] lg:rounded-card"
            caption=""
          />
          <Link
            href={props.backHref}
            aria-label="返回"
            className="absolute left-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-text shadow-float"
          >
            <ChevronLeft size={22} aria-hidden />
          </Link>
          {favorite !== undefined && !props.offline && (
            <button
              type="button"
              onClick={toggleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? "取消收藏" : "收藏"}
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-text shadow-float"
            >
              <Bookmark size={20} fill={favorite ? "currentColor" : "none"} className={favorite ? "text-primary" : ""} aria-hidden />
            </button>
          )}
        </div>

        <header className="mt-4">
          <p className="text-caption text-text-muted">AI 生成示意图，成品可能不同</p>
          {props.cookedAt && (
            <p className="mb-2 mt-3 inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-small font-bold text-success">
              <CheckCircle2 size={14} aria-hidden /> 你做过
              {props.rating && ` · ${VERDICT_LABELS[props.rating].label}`}
            </p>
          )}
          {cuisine && (
            <div className="mb-2.5 mt-1">
              <Stamp color={cuisine.color}>{cuisine.zh}</Stamp>
            </div>
          )}
          <h1 className="font-serif text-[30px] font-black leading-[40px]">{overview?.name_zh ?? props.dish.nameZh}</h1>
          {(overview?.name_en || overview?.name_original) && (
            <p className="text-small text-text-muted">
              {[overview?.name_en, overview?.name_original].filter(Boolean).join(" · ")}
            </p>
          )}
          {overview?.flavor_desc && <p className="mt-2.5">{overview.flavor_desc}</p>}
          {overview?.total_minutes !== undefined && (
            <dl className="mt-4 grid grid-cols-4 border-y border-border text-center">
              <Fact label="总时间">
                <span className="tabular">{overview.total_minutes} 分钟</span>
              </Fact>
              <Fact label="动手">
                {overview.active_minutes !== undefined ? <span className="tabular">{overview.active_minutes} 分钟</span> : "—"}
              </Fact>
              <Fact label="难度">
                {overview.difficulty ? <DifficultyDots level={overview.difficulty as 1 | 2 | 3} /> : "—"}
              </Fact>
              <Fact label="份量">{overview.servings !== undefined ? `${overview.servings} 人` : "—"}</Fact>
            </dl>
          )}
        </header>

        <section className="mt-7" aria-labelledby="ingredients-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="ingredients-title" className="font-serif text-h1 font-black">
                备料
              </h2>
              {overview?.servings ? (
                <p className="text-small text-text-muted">按 {overview.servings} 人份算好，调料不是按人数直接翻倍</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
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
          <Ingredients content={content} factor={1} units={units} />
        </section>
      </div>

      {/* 右栏：开火前看一眼、步骤、背景 */}
      <div>
        {keyPoints.length > 0 && (
          <section className="mt-8 lg:mt-0" aria-labelledby="keypoints-title">
            <h2 id="keypoints-title" className="mb-3 font-serif text-h1 font-black">
              做之前看一眼
            </h2>
            <ul className="space-y-2.5">
              {keyPoints.map((k, i) => (
                <li key={i} className="flex gap-3 rounded-[4px_16px_16px_16px] bg-primary-soft px-4 py-3.5">
                  <span className="shrink-0 font-brush text-[24px] leading-[26px] text-primary" aria-hidden>
                    {NUMERALS[i] ?? i + 1}
                  </span>
                  <span className="text-[15px] leading-[23px]">{k}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={keyPoints.length > 0 ? "mt-8" : "mt-8 lg:mt-0"} aria-labelledby="steps-title">
          <h2 id="steps-title" className="mb-1 font-serif text-h1 font-black">
            开火
          </h2>
          {steps.length === 0 && streaming && <SkeletonLines n={4} />}
          <ol className="divide-y divide-border">
            {steps.map((s, i) => (
              <StepItem key={i} index={i} step={s} units={units} />
            ))}
          </ol>
          {streaming && steps.length > 0 && (
            <p className="mt-4 animate-pulse text-small text-text-muted">{props.status ?? "正在写步骤…"}</p>
          )}
        </section>

        {done && content?.background && (
          <details className="group mt-6 border-b border-border">
            <summary className="flex h-[52px] cursor-pointer list-none items-center justify-between font-serif font-bold">
              这道菜的来历
              <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="pb-4 text-text-muted">{content.background}</p>
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
            {!props.offline && !props.sample && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setAskOpen(true)}
                disabled={!props.tutorialId}
              >
                <MessageCircleQuestion size={18} aria-hidden /> 问一问
              </Button>
            )}
            {props.tutorialId || props.sample ? (
              <Link
                href={props.sample?.cookHref ?? `/t/${props.tutorialId}/cook`}
                className="flex h-[54px] flex-[2] items-center justify-center gap-1 rounded-control bg-primary text-[17px] font-bold text-primary-contrast shadow-cta active:brightness-90"
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
          initial={followups}
          limit={props.followupLimit}
          onChange={setFollowups}
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
    <div className="mt-3.5 rounded-[18px] border border-border bg-surface px-4 pb-2.5 pt-1.5">
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id}>
            <p className="pb-0.5 pt-3 font-serif text-small font-bold tracking-[2px] text-primary">{g.label}</p>
            <ul className="divide-y divide-dashed divide-border">
              {list.map((i, idx) => (
                <IngredientRow key={`${i.name_zh}-${idx}`} item={i} factor={factor} units={units} sub={subFor(i.name_zh!)} />
              ))}
            </ul>
          </div>
        );
      })}
      {unmatched.length > 0 && (
        <div>
          <p className="pb-1 pt-3 font-serif text-small font-bold tracking-[2px] text-success">替代</p>
          <ul className="space-y-2 rounded-control bg-success-soft p-3 text-small">
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
    <li className="py-2.5">
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
            className="shrink-0 rounded-[6px] bg-success-soft px-2 py-0.5 text-caption font-bold text-success"
          >
            替代
          </button>
        )}
        <span className="tabular shrink-0 text-right">
          {amount ? `${amount.value}${amount.value ? " " : ""}${amount.unit}` : ""}
        </span>
      </div>
      {open && sub && (
        <p className="mt-2 rounded-[10px] bg-success-soft px-3 py-2.5 text-small">
          可以用 <b>{sub.substitute}</b>
          {sub.difference && <span className="text-text-muted">。{sub.difference}</span>}
        </p>
      )}
    </li>
  );
}

function StepItem({ index, step, units }: { index: number; step: DeepPartial<TutorialStep>; units: UnitSystem }) {
  return (
    <li className="flex gap-3.5 py-4">
      <span className="w-[30px] shrink-0 text-center font-serif text-[28px] font-black leading-[30px] text-primary">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {(step.heat || step.oven_c || step.timer_seconds) && (
          <div className="flex flex-wrap gap-2 text-[13px]">
            {step.heat && step.heat !== "off" && (
              <HeatBadge heat={step.heat} label={HEAT_LABELS[step.heat as TutorialStep["heat"] & string]} />
            )}
            {step.oven_c ? <Badge icon={<Thermometer size={13} aria-hidden />}>烤箱 {formatTemp(step.oven_c, units)}</Badge> : null}
            {step.timer_seconds ? (
              <Badge icon={<Timer size={13} aria-hidden />} muted>
                {formatDuration(step.timer_seconds)}
              </Badge>
            ) : null}
          </div>
        )}
        <p>{step.action}</p>
        {step.cue && (
          <p>
            <span className="mr-1.5 text-small text-text-muted">看到</span>
            <b className="marker">{step.cue}</b>
          </p>
        )}
        {step.warning && (
          <p className="flex gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-small">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            {step.warning}
          </p>
        )}
      </div>
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-l border-border py-3 first:border-l-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="flex h-[22px] items-center text-[15px] font-bold">{children}</dd>
    </div>
  );
}

const NUMERALS = ["一", "二", "三", "四", "五"];

function Badge({ icon, children, muted = false }: { icon: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
        muted ? "bg-kraft text-text" : "bg-primary-soft text-primary"
      }`}
    >
      {icon}
      {children}
    </span>
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
    <div className="flex h-11 items-center rounded-full bg-kraft p-[3px]" role="group" aria-label="单位">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-full rounded-full px-3 text-small ${value === o.value ? "bg-ink font-bold text-ink-contrast" : "text-text"}`}
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
