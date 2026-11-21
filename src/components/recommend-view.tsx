"use client";

// 推荐结果（设计文档 4.4）：卡片流式出现，未出现的位置显示骨架卡片。
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Flame, RotateCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/form";
import { DishImage } from "@/components/dish-image";
import { DifficultyDots, Stamp } from "@/components/ui";
import { loadDraft, resetTimeLabel, type Draft } from "@/lib/draft";
import type { RecommendEvent, RecommendInput, RecommendedDish } from "@/lib/recommend-types";
import { formatNutrient } from "@/lib/nutrition";
import { useDishImages } from "@/lib/use-dish-images";
import type { QuotaStatus } from "@/server/usage";

type CuisineMeta = Record<string, { zh: string; color: string }>;

interface Saved {
  draft: Draft;
  dishes: RecommendedDish[];
  note: string | null;
  runId: string | null;
  /** 本次会话展示过的全部菜名，换一批时排除（F12） */
  shown: string[];
}

const SESSION_KEY = "xz_recs";

function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function storeSaved(s: Saved) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

type Status =
  | { kind: "idle" }
  | { kind: "streaming" }
  | { kind: "done" }
  | { kind: "error"; code: string; message: string; resetAt?: string };

export function RecommendView({
  quota,
  cuisines,
  flavors,
  scenes,
}: {
  quota: QuotaStatus;
  cuisines: CuisineMeta;
  flavors: Record<string, string>;
  scenes: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dishes, setDishes] = useState<RecommendedDish[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const imageFor = useDishImages(dishes);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [left, setLeft] = useState<number | null>(quota.unlimited ? null : quota.remaining.recommend);
  const shownRef = useRef<string[]>([]);
  const started = useRef(false);

  const run = useCallback(
    async (d: Draft, more: boolean) => {
      setStatus({ kind: "streaming" });
      setDishes([]);
      setNote(null);
      setRunId(null);
      const body: RecommendInput = {
        main: d.items.filter((i) => i.main).map((i) => i.name),
        other: d.items.filter((i) => !i.main).map((i) => i.name),
        flavors: d.flavors,
        scene: d.scene,
        cuisines: d.cuisines,
        servings: d.servings,
        exclude: more ? shownRef.current.slice(-60) : [],
      };
      if (!more) shownRef.current = [];
      const got: RecommendedDish[] = [];
      let finalNote: string | null = null;
      let finalRun: string | null = null;
      let ended = false;
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          if (res.status === 401) router.push(`/login?next=${encodeURIComponent("/recommend?resume=1")}`);
          setStatus({ kind: "error", code: data.code ?? "model", message: data.error ?? "这次没生成出来，请稍后再试" });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          buf += value ? decoder.decode(value, { stream: true }) : "";
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line) as RecommendEvent;
            if (e.type === "start") setLeft(e.remaining);
            else if (e.type === "dish") {
              got.push(e.dish);
              setDishes([...got]);
            } else if (e.type === "done") {
              finalNote = e.note;
              finalRun = e.runId;
              ended = true;
            } else if (e.type === "error") {
              ended = true;
              setStatus({ kind: "error", code: e.code, message: e.error, resetAt: e.resetAt });
              if (e.code === "quota") setLeft(0);
              return;
            }
          }
          if (done) break;
        }
      } catch {
        setStatus({
          kind: "error",
          code: "network",
          message: got.length ? "网络中断了，已显示收到的部分" : "网络连接失败，请检查网络后再试",
        });
        if (!got.length) return;
      }
      shownRef.current = [...shownRef.current, ...got.map((x) => x.nameZh)];
      setNote(finalNote);
      setRunId(finalRun);
      if (ended || got.length) setStatus((s) => (s.kind === "error" ? s : { kind: "done" }));
      storeSaved({ draft: d, dishes: got, note: finalNote, runId: finalRun, shown: shownRef.current });
      // 额度以服务端为准
      fetch("/api/me/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then((q: QuotaStatus | null) => q && setLeft(q.unlimited ? null : q.remaining.recommend))
        .catch(() => {});
    },
    [router],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const auto = params.get("go") === "1" || params.get("resume") === "1";
    const d = loadDraft();
    if (auto && d) {
      // 去掉参数，刷新页面不会再扣一次额度
      router.replace("/recommend");
      setDraft(d);
      void run(d, false);
      return;
    }
    const saved = loadSaved();
    if (saved) {
      setDraft(saved.draft);
      setDishes(saved.dishes);
      setNote(saved.note);
      setRunId(saved.runId ?? null);
      shownRef.current = saved.shown;
      setStatus({ kind: "done" });
    } else if (d) {
      setDraft(d);
    }
  }, [params, router, run]);

  const streaming = status.kind === "streaming";
  const exhausted = left === 0;
  const title = streaming
    ? dishes.length
      ? `正在挑…已找到 ${dishes.length} 道`
      : "正在挑…"
    : dishes.length
      ? `为你挑了 ${dishes.length} 道`
      : "推荐";

  const ingredientsText = draft?.items.filter((i) => i.main).map((i) => i.name).join(" · ") || "不限食材";
  const tasteText =
    [
      ...(draft?.flavors.map((f) => flavors[f] ?? f) ?? []),
      draft?.scene ? scenes[draft.scene] : null,
      draft?.servings ? `${draft.servings} 人` : null,
      draft?.cuisines.length ? draft.cuisines.map((c) => cuisines[c]?.zh ?? c).join("、") : null,
    ]
      .filter(Boolean)
      .join(" · ") || "口味不限";

  return (
    <div className="pb-28">
      <header>
        <Link href="/?step=2" className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-text-muted">
          <ChevronLeft size={20} aria-hidden />
          修改条件
        </Link>
        <h1 className="mt-1 font-serif text-display font-black" aria-live="polite">
          {title}
        </h1>
        {draft && (
          <div className="mt-2 flex items-center gap-2 text-small">
            <span className="flex min-w-0 flex-1 gap-2 overflow-hidden">
              <span className="truncate rounded-full bg-kraft px-2.5 py-1">{ingredientsText}</span>
              <span className="truncate rounded-full bg-kraft px-2.5 py-1">{tasteText}</span>
            </span>
            <Link href="/?step=2" className="flex h-11 shrink-0 items-center font-bold text-primary">
              修改
            </Link>
          </div>
        )}
      </header>

      <ul className="mt-3 space-y-[18px]">
        {dishes.map((d) => (
          <li key={d.dishId}>
            <DishCard
              dish={{ ...d, imageUrl: imageFor(d.dishId, d.imageUrl) }}
              cuisine={cuisines[d.cuisineId]}
              href={runId ? `/t/new?run=${runId}&dish=${d.dishId}` : null}
            />
          </li>
        ))}
        {streaming &&
          Array.from({ length: Math.max(1, 3 - dishes.length) }, (_, i) => (
            <li key={`s${i}`}>
              <SkeletonCard />
            </li>
          ))}
      </ul>

      {note && <p className="mt-4 text-small text-text-muted">{note}</p>}

      {status.kind === "error" && (
        <ErrorBox status={status} quota={quota} onRetry={draft ? () => run(draft, dishes.length > 0) : undefined} />
      )}

      {status.kind === "idle" && !draft && (
        <div className="mt-8 text-center">
          <p className="text-text-muted">还没有选食材和口味。</p>
          <Link href="/" className="mt-2 inline-block text-primary">
            去选一下 →
          </Link>
        </div>
      )}

      {status.kind === "idle" && draft && (
        <Button className="mt-6" onClick={() => run(draft, false)} disabled={exhausted}>
          给我推荐{left !== null ? ` · 用 1 次，剩 ${left} 次` : ""}
        </Button>
      )}

      {status.kind === "done" && draft && dishes.length > 0 && (
        <div className="mt-6">
          {exhausted ? (
            <p className="rounded-control bg-kraft p-3 text-center text-small text-text-muted">
              今天的 {quota.limits.recommend} 次推荐用完了，{resetTimeLabel(quota.resetAt)}（你的时间）恢复。
            </p>
          ) : (
            <Button variant="secondary" onClick={() => run(draft, true)}>
              <RotateCw size={18} aria-hidden />
              换一批{left !== null ? ` · 用 1 次，剩 ${left} 次` : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DishCard({
  dish,
  cuisine,
  href,
}: {
  dish: RecommendedDish;
  cuisine?: { zh: string; color: string };
  href: string | null;
}) {
  const required = dish.toBuy.filter((t) => t.required);
  const optional = dish.toBuy.filter((t) => !t.required);
  const body = (
    <>
      <div className="relative">
        <DishImage url={dish.imageUrl} color={cuisine?.color} label={cuisine?.zh ?? ""} className="aspect-video" />
        {cuisine && dish.imageUrl && (
          <Stamp color={cuisine.color} className="absolute left-3 top-3 text-[20px]">
            {cuisine.zh}
          </Stamp>
        )}
      </div>
      <div className="px-4 pb-4 pt-3.5">
        <h2 className="font-serif text-[21px] font-black leading-[30px]">{dish.nameZh}</h2>
        <p className="text-small text-text-muted">{dish.nameOriginal ?? dish.nameEn}</p>
        <p className="mt-2 text-[15px] leading-[23px]">{dish.summary}</p>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
          <span className="inline-flex items-center gap-1">
            <Clock size={15} className="text-text-muted" aria-hidden />
            <span className="tabular">{dish.totalMinutes} 分钟</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            难度 <DifficultyDots level={dish.difficulty} />
          </span>
          {cuisine && !dish.imageUrl && <span className="text-text-muted">{cuisine.zh}</span>}
        </p>
        {dish.nutrition && (
          <p className="mt-1.5 flex items-center gap-1 text-small text-text-muted" aria-label="一人份营养估算">
            <Flame size={15} aria-hidden />
            <span className="tabular">
              每人约 <b className="text-text">{formatNutrient("kcal", dish.nutrition.kcal)} kcal</b>
              {" · "}蛋白质 {formatNutrient("protein_g", dish.nutrition.protein_g)}g · 脂肪{" "}
              {formatNutrient("fat_g", dish.nutrition.fat_g)}g · 碳水 {formatNutrient("carbs_g", dish.nutrition.carbs_g)}g
            </span>
          </p>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-[10px] border-t-[1.5px] border-dashed border-border-strong bg-surface-muted px-3 py-2.5 text-small">
          {dish.toBuy.length === 0 ? (
            <>
              <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-success" aria-hidden />
              <span className="font-bold text-success">手头的就够了，不用出门</span>
            </>
          ) : (
            <>
              <ShoppingBag size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              <span>
                <b className="mr-2 text-primary">还要买</b>
                {required.map((t) => t.name).join("、")}
                {required.length > 0 && optional.length > 0 && "　"}
                {optional.length > 0 && (
                  <span className="text-text-muted">{optional.map((t) => `${t.name}（可省）`).join("、")}</span>
                )}
              </span>
            </>
          )}
        </div>
        {href && (
          <p className="mt-3 flex items-center justify-end gap-1 text-small font-bold text-primary">
            看做法 <ChevronRight size={16} aria-hidden />
          </p>
        )}
      </div>
    </>
  );
  const cls =
    "block overflow-hidden rounded-card border border-border bg-surface motion-safe:animate-[fadein_.3s_ease-out]";
  return href ? (
    <Link href={href} className={`${cls} active:bg-surface-muted`} aria-label={`${dish.nameZh}，看做法`}>
      <article>{body}</article>
    </Link>
  ) : (
    <article className={cls}>{body}</article>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-hidden>
      <div className="aspect-video animate-pulse bg-kraft" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-2/5 animate-pulse rounded bg-surface-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}

function ErrorBox({
  status,
  quota,
  onRetry,
}: {
  status: Extract<Status, { kind: "error" }>;
  quota: QuotaStatus;
  onRetry?: () => void;
}) {
  let message = status.message;
  if (status.code === "quota") {
    message = `今天的 ${quota.limits.recommend} 次推荐用完了，${resetTimeLabel(status.resetAt ?? quota.resetAt)}（你的时间）恢复。可以先看看探索页的菜系介绍。`;
  } else if (status.code === "budget_paused") {
    message = `今天的生成名额已满，明天 ${resetTimeLabel(status.resetAt ?? quota.resetAt)}（你的时间）恢复。次数已退回。`;
  }
  const canRetry = onRetry && !["quota", "budget_paused"].includes(status.code);
  return (
    <div role="alert" className="mt-4 rounded-card border border-dashed border-border-strong bg-surface p-4">
      <p>{message}</p>
      {canRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          再试一次
        </Button>
      )}
      {status.code === "quota" && (
        <Link href="/explore" className="mt-3 inline-block text-primary">
          去探索 →
        </Link>
      )}
    </div>
  );
}
