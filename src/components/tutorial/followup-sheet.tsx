"use client";

// 追问对话层（设计文档 4.5、PRD F20）。教程页里整体问；烹饪模式里按当前步骤问，可以拍一张锅里的照片。
import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Send, X } from "lucide-react";
import { FieldError, postJson } from "@/components/form";
import { Sheet } from "@/components/overlay";
import { shrinkPhoto } from "@/lib/photo";

export interface Followup {
  id: string;
  question: string;
  answer: string | null;
  /** 烹饪模式里第几步问的（从 0 开始） */
  step?: number | null;
  withPhoto?: boolean;
  /** 本次打开页面时拍的照片，只在本机显示，不上传保存 */
  photo?: string;
}

const PRESETS = ["没有___怎么办", "能用空气炸锅吗", "能提前做吗"];
const STEP_PRESETS = ["现在这样对吗？", "火是不是太大了", "可以下一步了吗", "糊了 / 太干了怎么补救"];
const PHOTO_QUESTION = "看看现在锅里这样对吗？";

export function FollowupSheet({
  tutorialId,
  initial,
  limit,
  onClose,
  onChange,
  step,
  initialPhoto,
}: {
  tutorialId: string;
  initial: Followup[];
  limit: number;
  onClose: () => void;
  /** 问答有更新时回传，关掉再打开也能接着看 */
  onChange?: (items: Followup[]) => void;
  /** 烹饪模式：当前步骤，可以拍照问 */
  step?: { index: number; action: string };
  /** 从步骤页直接拍照进来时带上的照片 */
  initialPhoto?: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [question, setQuestion] = useState("");
  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const left = Math.max(0, limit - items.length);
  const cooking = step !== undefined;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [items.length, busy]);

  useEffect(() => {
    if (initialPhoto) inputRef.current?.focus();
  }, [initialPhoto]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setError("这张照片读不出来，换一张试试");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function ask(q: string) {
    const text = q.trim() || (photo ? PHOTO_QUESTION : "");
    if (!text || busy || left <= 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("现在没有网络，连上网再问");
      return;
    }
    setBusy(true);
    setError(null);
    const sent = photo;
    const res = await postJson<{ id: string; answer: string }>(`/api/tutorials/${tutorialId}/followups`, {
      question: text,
      ...(cooking ? { step: step.index } : {}),
      ...(sent ? { image: sent } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "这次没答上来，再问一次？");
      return;
    }
    const next = [
      ...items,
      {
        id: res.data.id,
        question: text,
        answer: res.data.answer,
        step: cooking ? step.index : null,
        withPhoto: Boolean(sent),
        photo: sent ?? undefined,
      },
    ];
    setItems(next);
    onChange?.(next);
    setQuestion("");
    setPhoto(null);
  }

  const presets = cooking ? STEP_PRESETS : PRESETS;

  return (
    <Sheet title={cooking ? `问问 · 第 ${step.index + 1} 步` : "问一问"} onClose={onClose}>
      {cooking && (
        <p className="-mt-2 mb-4 line-clamp-2 rounded-control bg-surface-muted px-3 py-2 text-small text-text-muted">
          {step.action}
        </p>
      )}
      <div className="space-y-4">
        {items.length === 0 && cooking && (
          <p className="text-small text-text-muted">
            拿不准火候、颜色、稠度的时候，拍一张锅里的样子发过来，或者直接问。
          </p>
        )}
        {items.map((f) => (
          <div key={f.id} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] space-y-1.5 rounded-card bg-primary-soft px-3 py-2">
              {(f.step != null || f.withPhoto) && (
                <p className="flex items-center gap-1.5 text-caption text-text-muted">
                  {f.step != null && <span>第 {f.step + 1} 步</span>}
                  {f.withPhoto && !f.photo && (
                    <span className="inline-flex items-center gap-0.5">
                      <ImageIcon size={12} aria-hidden /> 附了照片
                    </span>
                  )}
                </p>
              )}
              {f.photo && (
                // eslint-disable-next-line @next/next/no-img-element -- 本机拍的照片预览，不经过图片优化
                <img src={f.photo} alt="附带的照片" className="max-h-40 rounded-[10px] object-cover" />
              )}
              <p>{f.question}</p>
            </div>
            <p className="max-w-[90%] whitespace-pre-line rounded-card bg-surface-muted px-3 py-2">{f.answer}</p>
          </div>
        ))}
        {busy && (
          <p className="w-fit animate-pulse rounded-card bg-surface-muted px-3 py-2 text-text-muted">
            {photo ? "正在看照片…" : "正在想…"}
          </p>
        )}
        <div ref={endRef} />
      </div>

      {left > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => (p.includes("___") ? setQuestion(p.replace("___", "")) : ask(p))}
                disabled={busy}
                className="h-9 rounded-full bg-surface-muted px-3.5 text-small"
              >
                {p}
              </button>
            ))}
          </div>
          {photo && (
            <div className="mt-3 flex items-center gap-3 rounded-control border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- 本机预览 */}
              <img src={photo} alt="准备发送的照片" className="h-14 w-14 rounded-[8px] object-cover" />
              <span className="flex-1 text-small text-text-muted">照片只用来回答这一次，不保存</span>
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="去掉照片"
                className="flex h-11 w-11 items-center justify-center text-text-muted"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            {cooking && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || photoBusy}
                aria-label="拍一张锅里的照片"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control border border-border bg-surface text-primary disabled:text-text-muted"
              >
                <Camera size={20} className={photoBusy ? "animate-pulse" : ""} />
              </button>
            )}
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={photo ? PHOTO_QUESTION : cooking ? "这一步想问什么？" : "关于这道菜，想问什么？"}
              aria-label="追问内容"
              maxLength={300}
              className="h-12 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || (!question.trim() && !photo)}
              aria-label="发送"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-primary text-primary-contrast disabled:bg-surface-muted disabled:text-text-muted"
            >
              <Send size={18} />
            </button>
          </form>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => onFile(e.target.files)}
          />
          <p className="mt-2 text-caption text-text-muted">这份教程还能问 {left} 次</p>
        </>
      ) : (
        <p className="mt-4 text-small text-text-muted">这份教程的 {limit} 次追问用完了。</p>
      )}
      <FieldError>{error}</FieldError>
    </Sheet>
  );
}
