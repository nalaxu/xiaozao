"use client";

// 推荐结果（设计文档 4.4）：卡片流式出现，未出现的位置显示骨架卡片。
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Clock, RotateCw } from "lucide-react";
import { Button } from "@/components/form";
import { CuisinePlaceholder, DifficultyDots } from "@/components/ui";
import { loadDraft, resetTimeLabel, type Draft } from "@/lib/draft";
import type { RecommendEvent, RecommendInput, RecommendedDish } from "@/lib/recommend-types";
import type { QuotaStatus } from "@/server/usage";

type CuisineMeta = Record<string, { zh: string; color: string }>;

interface Saved {
  draft: Draft;
  dishes: RecommendedDish[];
  note: string | null;
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
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [left, setLeft] = useState<number | null>(quota.unlimited ? null : quota.remaining.recommend);
  const shownRef = useRef<string[]>([]);
  const started = useRef(false);

  const run = useCallback(
    async (d: Draft, more: boolean) => {
      setStatus({ kind: "streaming" });
      setDishes([]);
      setNote(null);
      const body: RecommendInput = {
        main: d.items.filter((i) => i.main).map((i) => i.name),
        other: d.items.filter((i) => !i.main).map((i) => i.name),
        flavors: d.flavors,
        scene: d.scene,
        cuisine: d.cuisine,
        exclude: more ? shownRef.current.slice(-60) : [],
      };
      if (!more) shownRef.current = [];
      const got: RecommendedDish[] = [];
      let finalNote: string | null = null;
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
      if (ended || got.length) setStatus((s) => (s.kind === "error" ? s : { kind: "done" }));
      storeSaved({ draft: d, dishes: got, note: finalNote, shown: shownRef.current });
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
    [...(draft?.flavors.map((f) => flavors[f] ?? f) ?? []), draft?.scene ? scenes[draft.scene] : null, draft?.cuisine ? cuisines[draft.cuisine]?.zh : null]
      .filter(Boolean)
      .join(" · ") || "口味不限";

  return (
    <div className="pb-28">
      <header>
        <Link href="/?step=2" className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-text-muted">
          <ChevronLeft size={20} aria-hidden />
          修改条件
        </Link>
        <h1 className="mt-1 text-h1 font-bold" aria-live="polite">
          {title}
        </h1>
        {draft && (
          <p className="mt-1 flex items-center gap-2 text-small text-text-muted">
            <span className="min-w-0 flex-1 truncate">
              {ingredientsText} | {tasteText}
            </span>
            <Link href="/?step=2" className="shrink-0 text-primary">
              修改
            </Link>
          </p>
        )}
      </header>

      <ul className="mt-4 space-y-4">
        {dishes.map((d) => (
          <li key={d.dishId}>
            <DishCard dish={d} cuisine={cuisines[d.cuisineId]} />
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
            <p className="rounded-control bg-surface-muted p-3 text-center text-small text-text-muted">
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

function DishCard({ dish, cuisine }: { dish: RecommendedDish; cuisine?: { zh: string; color: string } }) {
  const required = dish.toBuy.filter((t) => t.required);
  const optional = dish.toBuy.filter((t) => !t.required);
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface motion-safe:animate-[fadein_.3s_ease-out]">
      <div className="relative aspect-video">
        {dish.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 图片已按尺寸生成 WebP */}
            <img src={dish.imageUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 text-caption text-white">AI 示意图</span>
          </>
        ) : (
          <CuisinePlaceholder color={cuisine?.color ?? "var(--surface-muted)"} label={cuisine?.zh ?? ""} className="h-full w-full" />
        )}
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-h2 font-bold">{dish.nameZh}</h2>
          <span className="shrink-0 text-small text-text-muted">{cuisine?.zh}</span>
        </div>
        <p className="text-small text-text-muted">{dish.nameOriginal ?? dish.nameEn}</p>
        <p className="mt-2">{dish.summary}</p>
        <p className="mt-2 flex items-center gap-1.5 text-small text-text-muted">
          <Clock size={14} aria-hidden />
          <span className="tabular">{dish.totalMinutes} 分钟</span>
          <span aria-hidden>·</span>
          难度 <DifficultyDots level={dish.difficulty} />
        </p>
        <p className="mt-2 text-small">
          {dish.toBuy.length === 0 ? (
            <span className="text-success">手头的就够了</span>
          ) : (
            <>
              <span className="text-text-muted">还需：</span>
              {required.map((t) => t.name).join("、")}
              {required.length > 0 && optional.length > 0 && "、"}
              {optional.length > 0 && (
                <span className="text-text-muted">{optional.map((t) => `${t.name}（可省）`).join("、")}</span>
              )}
            </>
          )}
        </p>
        <p className="mt-3 text-caption text-text-muted">详细教程即将开放</p>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface" aria-hidden>
      <div className="aspect-video animate-pulse bg-surface-muted" />
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
    <div role="alert" className="mt-4 rounded-card bg-surface-muted p-4">
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
