"use client";

// 设置页共用的控件：食材标签输入、自动保存、开关、返回头部。
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Plus, Search, X } from "lucide-react";
import { buildIngredientIndex } from "@/lib/ingredients";
import type { Ingredient } from "@/lib/kb/schema";

export type SlimIngredient = Pick<Ingredient, "zh" | "aliases" | "en" | "category">;

export function SettingsHeader({ title, back = "/me", sub }: { title: string; back?: string; sub?: string }) {
  return (
    <header className="mb-4">
      <Link href={back} className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-text-muted">
        <ChevronLeft size={18} aria-hidden /> 我的
      </Link>
      <h1 className="font-serif text-display font-black">{title}</h1>
      {sub && <p className="mt-1 text-small text-text-muted">{sub}</p>}
    </header>
  );
}

/** 改动后自动保存（停手 600 毫秒后发出），返回状态文字 */
export function useAutoSave<T>(save: (value: T) => Promise<boolean>) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(save);
  latest.current = save;
  const queue = useCallback((value: T) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(async () => {
      const ok = await latest.current(value).catch(() => false);
      setStatus(ok ? "saved" : "error");
    }, 600);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return { queue, status };
}

export function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  const text = { idle: "", saving: "正在保存…", saved: "已保存", error: "没保存上，请检查网络后再改一次" }[status];
  return (
    <p role="status" className={`h-5 text-small ${status === "error" ? "text-danger" : "text-text-muted"}`}>
      {text}
    </p>
  );
}

export async function putPreferences(patch: Record<string, unknown>) {
  const res = await fetch("/api/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

/** 食材标签输入：联想词典里的食材，词典外的原样保留（与首页食材输入一致） */
export function TagInput({
  ingredients,
  value,
  onChange,
  placeholder,
  label,
  max,
}: {
  ingredients: SlimIngredient[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  label: string;
  max: number;
}) {
  const index = useMemo(
    () => buildIngredientIndex(ingredients.map((i) => ({ ...i, pairs: [] }))),
    [ingredients],
  );
  const [query, setQuery] = useState("");
  const suggestions = query.trim() ? index.suggest(query, 6) : [];

  const add = (raw: string) => {
    const text = raw.trim().slice(0, 30);
    if (!text) return;
    const name = index.normalize(text)?.zh ?? text;
    if (!value.includes(name) && value.length < max) onChange([...value, name]);
    setQuery("");
  };

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label={`已添加的${label}`}>
          {value.map((v) => (
            <li key={v} className="inline-flex h-9 items-center gap-1 rounded-full bg-primary-soft pl-3.5 pr-1 text-small font-bold text-primary">
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`移除${v}`}
                className="flex h-8 w-8 items-center justify-center"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <label className="flex h-[52px] items-center gap-3 rounded-control border border-border bg-surface px-4 focus-within:border-primary">
          <Search size={20} strokeWidth={1.75} className="text-text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add(query);
              }
            }}
            placeholder={value.length >= max ? `最多 ${max} 个` : placeholder}
            disabled={value.length >= max}
            aria-label={label}
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
                  {value.includes(s.zh) && <Check size={16} className="ml-auto text-primary" aria-label="已添加" />}
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
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? "left-[24px]" : "left-1"}`}
      />
    </button>
  );
}

export function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-h2 font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-small text-text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
