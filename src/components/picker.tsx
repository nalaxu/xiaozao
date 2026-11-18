"use client";

// 首页两步：① 食材（拍照 / 输入 / 常用）→ ② 口味（味型 · 场景 · 菜系）。设计文档 4.1–4.3。
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Flame, Plus, Search, X } from "lucide-react";
import fridgeImage from "@/assets/fridge.webp";
import { Button } from "@/components/form";
import { ToggleChip } from "@/components/toggle-chip";
import { ActionBar, Sheet } from "@/components/overlay";
import { emptyDraft, loadDraft, resetTimeLabel, saveDraft, type Draft, type DraftItem } from "@/lib/draft";
import { buildIngredientIndex } from "@/lib/ingredients";
import type { Ingredient } from "@/lib/kb/schema";
import { shrinkPhoto } from "@/lib/photo";
import type { QuotaStatus } from "@/server/usage";

export interface PickerOptions {
  ingredients: Ingredient[];
  common: string[];
  flavors: { id: string; zh: string; tier: "primary" | "more"; description: string }[];
  scenes: { id: string; zh: string; guidance: string }[];
  cuisineGroups: { label: string; cuisines: { id: string; zh: string }[] }[];
}

interface Account {
  quota: QuotaStatus;
  /** 全站当日预算已用完（PRD 6.3 达 $100） */
  paused?: boolean;
  last: { flavors: string[]; scene: string | null; cuisine: string | null } | null;
}

const MAX_MAIN = 5;
const MAX_ITEMS = 30;
const MAX_FLAVORS = 3;
const MAX_PHOTOS = 3;
const PHOTO_NOTICE_KEY = "xz_photo_notice";

export function Picker({ options, account }: { options: PickerOptions; account: Account | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const step = params.get("step") === "2" ? 2 : 1;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);

  // 首次进入：读取草稿；没有草稿时带出上次的口味（F13）
  useEffect(() => {
    const saved = loadDraft();
    if (saved) setDraft(saved);
    else if (account?.last) setDraft({ ...emptyDraft(), ...account.last });
    setReady(true);
  }, [account]);

  useEffect(() => {
    if (ready) saveDraft(draft);
  }, [draft, ready]);

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d));

  return step === 1 ? (
    <IngredientStep
      options={options}
      account={account}
      draft={draft}
      update={update}
      onNext={() => router.push("/?step=2", { scroll: true })}
    />
  ) : (
    <TasteStep options={options} account={account} draft={draft} update={update} onBack={() => router.push("/")} />
  );
}

// ─── 第一步：食材 ───────────────────────────────────────────

function IngredientStep({
  options,
  account,
  draft,
  update,
  onNext,
}: {
  options: PickerOptions;
  account: Account | null;
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  onNext: () => void;
}) {
  const router = useRouter();
  const index = useMemo(() => buildIngredientIndex(options.ingredients), [options.ingredients]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoState>({ status: "idle" });
  const [notice, setNotice] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = query.trim() ? index.suggest(query, 6) : [];
  const has = (name: string) => draft.items.some((i) => i.name === name);

  function add(raw: string) {
    const text = raw.trim().slice(0, 30);
    if (!text) return;
    const hit = index.normalize(text);
    const name = hit?.zh ?? text;
    update((d) => {
      if (d.items.some((i) => i.name === name) || d.items.length >= MAX_ITEMS) return d;
      const mains = d.items.filter((i) => i.main).length;
      // 新加入的前 3 个默认为主料（设计文档 4.1）
      const item: DraftItem = { name, main: mains < 3, known: Boolean(hit) };
      return { ...d, items: [...d.items, item] };
    });
    setQuery("");
  }

  function toggleMain(name: string) {
    update((d) => {
      const mains = d.items.filter((i) => i.main).length;
      return {
        ...d,
        items: d.items.map((i) =>
          i.name === name ? { ...i, main: i.main ? false : mains < MAX_MAIN } : i,
        ),
      };
    });
  }

  const remove = (name: string) =>
    update((d) => {
      const gone = d.items.find((i) => i.name === name);
      const stats = gone?.photo && d.photoStats ? { ...d.photoStats, removed: d.photoStats.removed + 1 } : d.photoStats;
      return { ...d, items: d.items.filter((i) => i.name !== name), photoStats: stats };
    });

  function startPhoto() {
    if (!account) {
      router.push(`/login?next=${encodeURIComponent("/")}&reason=photo`);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem(PHOTO_NOTICE_KEY) === "1";
    } catch {}
    if (!seen) setNotice(true);
    else fileRef.current?.click();
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_PHOTOS);
    const previews = list.map((f) => URL.createObjectURL(f));
    setPhoto({ status: "working", previews });
    try {
      const images = await Promise.all(list.map((f) => shrinkPhoto(f)));
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = (await res.json().catch(() => ({}))) as RecognizeResponse;
      if (!res.ok) {
        setPhoto({ status: "failed", message: data.error ?? "没认出来，手动输入也很快" });
        inputRef.current?.focus();
        return;
      }
      if (data.notFood || !data.items?.length) {
        setPhoto({ status: "failed", message: "这张照片里好像没有食材，换个角度再拍一张？" });
        return;
      }
      const sure = data.items.filter((i) => i.confidence === "high");
      const unsure = data.items.filter((i) => i.confidence === "low" && !has(i.name));
      update((d) => {
        let mains = d.items.filter((i) => i.main).length;
        const items = [...d.items];
        let added = 0;
        for (const it of sure) {
          if (items.some((x) => x.name === it.name) || items.length >= MAX_ITEMS) continue;
          items.push({ name: it.name, main: mains < 3, known: it.inDictionary, photo: true });
          added++;
          if (mains < 3) mains++;
        }
        const prev = d.photoStats ?? { recognized: 0, removed: 0 };
        return { ...d, items, photoStats: { ...prev, recognized: prev.recognized + added } };
      });
      setPhoto({ status: "done", unsure, remaining: data.remaining ?? null });
    } catch {
      setPhoto({ status: "failed", message: "没认出来，手动输入也很快" });
      inputRef.current?.focus();
    } finally {
      previews.forEach((p) => URL.revokeObjectURL(p));
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const recognizeLeft = account ? (account.quota.unlimited ? null : account.quota.remaining.recognize) : null;
  const mainCount = draft.items.filter((i) => i.main).length;

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-brush text-[32px] leading-none text-primary lg:hidden">
          <Flame size={22} strokeWidth={2} aria-hidden />
          小灶
        </p>
        {account && <QuotaBadge quota={account.quota} />}
      </div>
      <Greeting />

      <div className="mt-4 space-y-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- 静态配图，已压成 WebP。用 import 得到带内容哈希的地址（/_next/static/media/…），换图即换地址，不怕旧缓存 */}
          <img
            src={fridgeImage.src}
            alt=""
            width={960}
            height={640}
            className="h-[136px] w-full rounded-card object-cover object-[50%_45%] lg:h-[180px]"
          />
          <button
            type="button"
            onClick={startPhoto}
            disabled={photo.status === "working" || recognizeLeft === 0}
            className="relative mx-3 -mt-[34px] flex w-[calc(100%-24px)] items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left shadow-float active:bg-surface-muted disabled:text-text-muted"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast">
              <Camera size={22} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold">拍一下冰箱或台面</span>
              <span className="text-small text-text-muted">
                {!account
                  ? "登录后就能拍照认食材"
                  : recognizeLeft === 0
                    ? "今天的次数用完了"
                    : recognizeLeft !== null
                      ? `认出来的食材直接放上砧板 · 剩 ${recognizeLeft} 次`
                      : "认出来的食材直接放上砧板"}
              </span>
            </span>
            <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-text-muted" aria-hidden />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />

        <PhotoStatus photo={photo} onAdd={add} onDismiss={() => setPhoto({ status: "idle" })} />

        <div className="relative">
          <label className="flex h-12 items-center gap-3 rounded-control border border-border bg-surface px-4 focus-within:border-primary">
            <Search size={20} strokeWidth={1.75} className="text-text-muted" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add(query);
                }
              }}
              placeholder="输入食材，中英文都行，如 cilantro"
              aria-label="输入食材"
              maxLength={30}
              enterKeyHint="done"
              className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-text-muted"
            />
          </label>
          {query.trim() && (
            <ul className="absolute inset-x-0 top-[52px] z-10 overflow-hidden rounded-control border border-border bg-surface shadow-[var(--shadow-float)]">
              {suggestions.map((s) => (
                <li key={s.zh}>
                  <button
                    type="button"
                    onClick={() => add(s.zh)}
                    className="flex h-11 w-full items-center gap-2 px-4 text-left active:bg-surface-muted"
                  >
                    <span>{s.zh}</span>
                    <span className="text-small text-text-muted">{s.en.us}</span>
                    {has(s.zh) && <Check size={16} className="ml-auto text-primary" aria-label="已添加" />}
                  </button>
                </li>
              ))}
              {!index.normalize(query) && (
                <li>
                  <button
                    type="button"
                    onClick={() => add(query)}
                    className="flex h-11 w-full items-center gap-2 px-4 text-left text-text-muted active:bg-surface-muted"
                  >
                    <Plus size={16} aria-hidden /> 添加“{query.trim()}”
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <section className="mt-4" aria-label="常用食材">
        <p className="text-small text-text-muted">常用</p>
        <div className="no-scrollbar -mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {options.common
            .filter((n) => !has(n))
            .map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => add(n)}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-surface pl-2.5 pr-3.5 text-[15px] active:bg-surface-muted"
              >
                <span className="h-[7px] w-[7px] rounded-full border-[1.5px] border-border-strong" aria-hidden />
                {n}
              </button>
            ))}
        </div>
      </section>

      <section className="mt-4 rounded-[18px] bg-kraft p-3 pb-3.5" aria-labelledby="board-title">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <h2 id="board-title" className="font-serif font-bold">
            砧板上{draft.items.length > 0 && ` · ${draft.items.length} 样`}
          </h2>
          {draft.items.length > 0 && (
            <span className="text-caption text-text-muted">
              点一下切换主料 · 主料 {mainCount}/{MAX_MAIN}
            </span>
          )}
        </div>
        {draft.items.length > 0 ? (
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {draft.items.map((i) => (
              <li key={i.name}>
                <ItemChip item={i} onToggle={() => toggleMain(i.name)} onRemove={() => remove(i.name)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-control border-[1.5px] border-dashed border-border-strong px-3 py-4 text-center text-small text-text-muted">
            砧板还空着。拍一下，或者从上面点几样。
          </p>
        )}
        {draft.items.length > 0 && mainCount === 0 && (
          <p className="mt-2 text-small text-text-muted">没选主料时，会把这些都当作“手头还有”的食材。</p>
        )}
      </section>

      <ActionBar>
        <Button onClick={onNext}>{draft.items.length ? "下一步：选口味" : "跳过，直接选口味"}</Button>
      </ActionBar>

      {notice && (
        <Sheet onClose={() => setNotice(false)} title="拍照识别食材">
          <p className="text-text-muted">照片会发送给模型服务商识别食材，识别后不保存。一次最多 3 张。</p>
          <Button
            className="mt-6"
            onClick={() => {
              try {
                localStorage.setItem(PHOTO_NOTICE_KEY, "1");
              } catch {}
              setNotice(false);
              fileRef.current?.click();
            }}
          >
            知道了，去拍照
          </Button>
        </Sheet>
      )}
    </div>
  );
}

interface RecognizeResponse {
  notFood?: boolean;
  items?: { name: string; inDictionary: boolean; confidence: "high" | "low"; quantityHint: string | null }[];
  remaining?: number | null;
  error?: string;
}

type PhotoState =
  | { status: "idle" }
  | { status: "working"; previews: string[] }
  | { status: "done"; unsure: NonNullable<RecognizeResponse["items"]>; remaining: number | null }
  | { status: "failed"; message: string };

function PhotoStatus({
  photo,
  onAdd,
  onDismiss,
}: {
  photo: PhotoState;
  onAdd: (name: string) => void;
  onDismiss: () => void;
}) {
  if (photo.status === "idle") return null;
  if (photo.status === "working") {
    return (
      <div className="flex items-center gap-3 rounded-card bg-surface-muted p-3" role="status">
        <div className="flex gap-2">
          {photo.previews.map((src) => (
            <div key={src} className="relative h-14 w-14 overflow-hidden rounded-control">
              {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览，不经过图片优化 */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 animate-pulse bg-primary/30" />
            </div>
          ))}
        </div>
        <span className="text-small">正在认食材…</span>
      </div>
    );
  }
  if (photo.status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-card bg-surface-muted p-3 text-small" role="alert">
        <span className="flex-1">{photo.message}</span>
        <button type="button" onClick={onDismiss} aria-label="关闭" className="text-text-muted">
          <X size={18} />
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-card bg-surface-muted p-3 text-small" role="status">
      <div className="flex items-start gap-2">
        <span className="flex-1">认出来的已经加到下面了。认错了可以直接删掉，漏了的在输入框里补上。</span>
        <button type="button" onClick={onDismiss} aria-label="关闭" className="text-text-muted">
          <X size={18} />
        </button>
      </div>
      {photo.unsure.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-text-muted">不太确定</span>
          {photo.unsure.map((i) => (
            <button
              key={i.name}
              type="button"
              onClick={() => onAdd(i.name)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-border bg-surface px-3 text-text-muted"
            >
              <Plus size={14} aria-hidden />
              {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemChip({ item, onToggle, onRemove }: { item: DraftItem; onToggle: () => void; onRemove: () => void }) {
  const style = item.main
    ? "border border-ink bg-ink font-bold text-ink-contrast"
    : `bg-surface ${item.known ? "border border-border-strong" : "border-[1.5px] border-dashed border-text-muted"}`;
  return (
    <span className={`inline-flex h-10 items-center rounded-[10px] text-[15px] ${style}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.main}
        aria-label={`${item.name}，${item.main ? "主料" : "手头还有"}`}
        className="flex h-full items-center gap-1 pl-3 pr-1"
      >
        {item.main && <Check size={15} strokeWidth={2.5} className="text-marker" aria-hidden />}
        {item.name}
      </button>
      <button type="button" onClick={onRemove} aria-label={`删除${item.name}`} className="flex h-full items-center pl-1 pr-2.5 opacity-60">
        <X size={14} />
      </button>
    </span>
  );
}

// ─── 第二步：口味 ───────────────────────────────────────────

function TasteStep({
  options,
  account,
  draft,
  update,
  onBack,
}: {
  options: PickerOptions;
  account: Account | null;
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [showMore, setShowMore] = useState(() =>
    draft.flavors.some((f) => options.flavors.find((x) => x.id === f)?.tier === "more"),
  );
  const [cuisineOpen, setCuisineOpen] = useState(false);
  const flavors = options.flavors.filter((f) => f.tier === "primary" || showMore);
  const picked = draft.flavors.map((id) => options.flavors.find((f) => f.id === id)).filter((f) => f !== undefined);
  const cuisineName = options.cuisineGroups.flatMap((g) => g.cuisines).find((c) => c.id === draft.cuisine)?.zh;

  function toggleFlavor(id: string) {
    update((d) => {
      if (d.flavors.includes(id)) return { ...d, flavors: d.flavors.filter((f) => f !== id) };
      if (d.flavors.length >= MAX_FLAVORS) return d;
      return { ...d, flavors: [...d.flavors, id] };
    });
  }

  const nothing = !draft.items.length && !draft.flavors.length && !draft.scene && !draft.cuisine;
  const quota = account?.quota;
  const left = quota ? (quota.unlimited ? null : quota.remaining.recommend) : null;
  const exhausted = left === 0;

  let label = nothing ? "随便，给我惊喜" : "给我推荐";
  if (left !== null && !exhausted) label += ` · 用 1 次，剩 ${left} 次`;

  function go() {
    // 识别修改率：拍照加入的食材里，发起推荐前被删掉的比例
    if (account && draft.photoStats?.recognized) {
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "recognize_edit", props: draft.photoStats }),
        keepalive: true,
      }).catch(() => {});
      draft.photoStats = undefined;
    }
    saveDraft(draft);
    if (!account) router.push(`/login?next=${encodeURIComponent("/recommend?resume=1")}`);
    else router.push("/recommend?go=1");
  }

  return (
    <div className="pb-24">
      <header className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 px-2 text-text-muted">
          <ChevronLeft size={20} aria-hidden />
          食材{draft.items.length > 0 && ` · ${draft.items.length} 样`}
        </button>
        <span className="flex items-center gap-1.5 text-small text-text-muted">
          <span className="h-1 w-[18px] rounded-sm bg-primary" aria-hidden />
          <span className="h-1 w-[18px] rounded-sm bg-primary" aria-hidden />
          第 2 步，共 2 步
        </span>
      </header>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-display font-black">想吃什么味道？</h1>
        <span className="shrink-0 text-small text-text-muted">
          最多 {MAX_FLAVORS} 个 · 已选 {draft.flavors.length}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {flavors.map((f) => {
          const on = draft.flavors.includes(f.id);
          const full = !on && draft.flavors.length >= MAX_FLAVORS;
          return (
            <ToggleChip key={f.id} on={on} disabled={full} onClick={() => toggleFlavor(f.id)} title={f.description}>
              {f.zh}
            </ToggleChip>
          );
        })}
      </div>
      {!showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="mt-2 flex h-11 items-center gap-1 text-small font-bold text-primary"
        >
          更多味型 <ChevronDown size={16} aria-hidden />
        </button>
      )}
      {picked.length > 0 && (
        <div className="mt-3 flex items-start gap-2.5 rounded-control border border-dashed border-border-strong bg-surface px-3.5 py-3">
          <span className="stamp shrink-0 bg-primary text-[17px]" aria-hidden>
            味
          </span>
          <p className="text-small text-text">
            {picked.map((f, i) => (
              <span key={f.id}>
                {i > 0 && " "}
                <b>{f.zh}</b>：{f.description}
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="font-serif text-h2 font-bold">今天的情况</h2>
        <span className="text-small text-text-muted">可不选</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {options.scenes.map((s) => {
          const on = draft.scene === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              title={s.guidance}
              onClick={() => update((d) => ({ ...d, scene: d.scene === s.id ? null : s.id }))}
              className={`flex h-14 items-center justify-center rounded-[12px] border px-1 text-[15px] font-bold ${
                on ? "border-ink bg-ink text-ink-contrast" : "border-border bg-surface text-text active:bg-surface-muted"
              }`}
            >
              {s.zh}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setCuisineOpen(true)}
        className="mt-6 flex h-[52px] w-full items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 text-[15px] active:bg-surface-muted"
      >
        <span className="font-bold">菜系</span>
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[var(--group-chinese)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--group-east-southeast-asia)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--group-south-asia-middle-east)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--group-europe-americas)]" />
        </span>
        <span className="flex-1 text-right text-text-muted">{cuisineName ?? "不限，可不选"}</span>
        <ChevronDown size={18} className="text-text-muted" aria-hidden />
      </button>

      <ActionBar>
        {account?.paused && quota ? (
          <p className="rounded-control bg-kraft p-3 text-center text-small text-text-muted">
            今天的生成名额已满，{resetTimeLabel(quota.resetAt)}（你的时间）恢复。收藏的教程照常可以看和做。
          </p>
        ) : exhausted && quota ? (
          <p className="rounded-control bg-kraft p-3 text-center text-small text-text-muted">
            今天的 {quota.limits.recommend} 次推荐用完了，{resetTimeLabel(quota.resetAt)}（你的时间）恢复。
          </p>
        ) : (
          <Button onClick={go}>{label}</Button>
        )}
      </ActionBar>

      {cuisineOpen && (
        <Sheet title="选菜系" onClose={() => setCuisineOpen(false)}>
          <div className="space-y-4">
            <ToggleChip
              on={!draft.cuisine}
              onClick={() => {
                update((d) => ({ ...d, cuisine: null }));
                setCuisineOpen(false);
              }}
            >
              不限
            </ToggleChip>
            {options.cuisineGroups.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-small text-text-muted">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.cuisines.map((c) => (
                    <ToggleChip
                      key={c.id}
                      on={draft.cuisine === c.id}
                      onClick={() => {
                        update((d) => ({ ...d, cuisine: c.id }));
                        setCuisineOpen(false);
                      }}
                    >
                      {c.zh}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ─── 小组件 ─────────────────────────────────────────────────

function QuotaBadge({ quota }: { quota: QuotaStatus }) {
  if (quota.unlimited) return <span className="text-small text-text-muted">管理员 · 不限次数</span>;
  const left = quota.remaining.recommend;
  return (
    <span className="flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-small text-text-muted">
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: quota.limits.recommend }, (_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < left ? "bg-primary" : "bg-border-strong"}`} />
        ))}
      </span>
      今日剩 {left} 次
    </span>
  );
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 按用户本地时间问候；服务端渲染时先显示不带时间的版本 */
function Greeting() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const h = now?.getHours() ?? 18;
  const [meal, when] =
    h < 10 ? ["早饭时间", "今早"] : h < 14 ? ["午饭时间", "中午"] : h < 21 ? ["晚饭时间", "今晚"] : ["夜宵时间", "今晚"];
  return (
    <section className="mt-3">
      <p className="h-[18px] text-small tracking-[1px] text-text-muted">{now && `${WEEKDAYS[now.getDay()]} · ${meal}`}</p>
      <h1 className="mt-1 font-serif text-[30px] font-black leading-[40px] tracking-[0.5px]">
        冰箱里有什么，
        <br />
        <span className="marker">{now ? when : "今天"}</span>就做什么。
      </h1>
    </section>
  );
}
