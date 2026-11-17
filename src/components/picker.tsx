"use client";

// 首页两步：① 食材（拍照 / 输入 / 常用）→ ② 口味（味型 · 场景 · 菜系）。设计文档 4.1–4.3。
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, Plus, Search, X } from "lucide-react";
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

  const remove = (name: string) => update((d) => ({ ...d, items: d.items.filter((i) => i.name !== name) }));

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
        for (const it of sure) {
          if (items.some((x) => x.name === it.name) || items.length >= MAX_ITEMS) continue;
          items.push({ name: it.name, main: mains < 3, known: it.inDictionary });
          if (mains < 3) mains++;
        }
        return { ...d, items };
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
      <div className="flex items-baseline justify-between">
        <p className="text-h2 font-bold text-primary lg:hidden">小灶</p>
        {account && <QuotaBadge quota={account.quota} />}
      </div>
      <h1 className="mt-4 text-h1 font-bold">今天手头有什么？</h1>

      <div className="mt-4 space-y-3">
        <button
          type="button"
          onClick={startPhoto}
          disabled={photo.status === "working" || recognizeLeft === 0}
          className="flex h-14 w-full items-center gap-3 rounded-card border border-border bg-surface px-4 text-left active:bg-surface-muted disabled:text-text-muted"
        >
          <Camera size={22} strokeWidth={1.75} className="text-primary" aria-hidden />
          <span className="flex-1">拍一下冰箱或台面</span>
          <span className="text-caption text-text-muted">
            {!account
              ? "登录后可用"
              : recognizeLeft === 0
                ? "今天的次数用完了"
                : recognizeLeft !== null
                  ? `剩 ${recognizeLeft} 次`
                  : ""}
          </span>
        </button>
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
          <label className="flex h-[52px] items-center gap-3 rounded-control border border-border bg-surface px-4 focus-within:border-primary">
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
              placeholder="输入食材，中英文都行"
              aria-label="输入食材"
              maxLength={30}
              enterKeyHint="done"
              className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-text-muted"
            />
          </label>
          {query.trim() && (
            <ul className="absolute inset-x-0 top-[56px] z-10 overflow-hidden rounded-control border border-border bg-surface shadow-[var(--shadow-float)]">
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-small text-text-muted">常用</span>
        {options.common
          .filter((n) => !has(n))
          .map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => add(n)}
              className="inline-flex h-9 items-center rounded-full bg-surface-muted px-3.5 text-small active:brightness-95"
            >
              {n}
            </button>
          ))}
      </div>

      {draft.items.length > 0 && (
        <section className="mt-6" aria-label="已选食材">
          <p className="mb-2 text-small text-text-muted">
            已选 {draft.items.length} 样 · 点选今天想用的主料（最多 {MAX_MAIN} 个）
          </p>
          <ul className="flex flex-wrap gap-2">
            {draft.items.map((i) => (
              <li key={i.name}>
                <ItemChip item={i} onToggle={() => toggleMain(i.name)} onRemove={() => remove(i.name)} />
              </li>
            ))}
          </ul>
          {mainCount === 0 && (
            <p className="mt-2 text-small text-text-muted">没选主料时，会把这些都当作“手头还有”的食材。</p>
          )}
        </section>
      )}

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
    ? "bg-primary text-primary-contrast"
    : `border bg-surface ${item.known ? "border-border" : "border-dashed border-text-muted"}`;
  return (
    <span className={`inline-flex h-9 items-center rounded-full text-small ${style}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.main}
        aria-label={`${item.name}，${item.main ? "主料" : "手头还有"}`}
        className="flex h-full items-center gap-1 pl-3.5 pr-1"
      >
        {item.main && <Check size={14} strokeWidth={2.5} aria-hidden />}
        {item.name}
      </button>
      <button type="button" onClick={onRemove} aria-label={`删除${item.name}`} className="flex h-full items-center pl-1 pr-2.5 opacity-70">
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
    saveDraft(draft);
    if (!account) router.push(`/login?next=${encodeURIComponent("/recommend?resume=1")}`);
    else router.push("/recommend?go=1");
  }

  return (
    <div className="pb-24">
      <header className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="-ml-2 flex h-11 items-center gap-1 px-2 text-text-muted">
          <ChevronLeft size={20} aria-hidden />
          食材
        </button>
        {account && <QuotaBadge quota={account.quota} />}
      </header>

      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-h1 font-bold">想吃什么味道？</h1>
        <span className="text-small text-text-muted">最多选 {MAX_FLAVORS} 个</span>
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
          className="mt-2 flex h-11 items-center gap-1 text-small text-text-muted"
        >
          更多 <ChevronDown size={16} aria-hidden />
        </button>
      )}

      <h2 className="mt-6 text-h2 font-bold">
        今天的情况 <span className="text-small font-normal text-text-muted">可不选</span>
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.scenes.map((s) => (
          <ToggleChip
            key={s.id}
            on={draft.scene === s.id}
            onClick={() => update((d) => ({ ...d, scene: d.scene === s.id ? null : s.id }))}
            title={s.guidance}
          >
            {s.zh}
          </ToggleChip>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-h2 font-bold">
          菜系 <span className="text-small font-normal text-text-muted">可不选</span>
        </h2>
        <button
          type="button"
          onClick={() => setCuisineOpen(true)}
          className="flex h-11 items-center gap-1 rounded-control px-3 text-primary active:bg-primary-soft"
        >
          {cuisineName ?? "不限"} <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      <ActionBar>
        {exhausted && quota ? (
          <p className="rounded-control bg-surface-muted p-3 text-center text-small text-text-muted">
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
  return <span className="text-small text-text-muted">今日推荐剩 {quota.remaining.recommend} 次</span>;
}

