"use client";

// 追问对话层（设计文档 4.5、PRD F20）。
import { useState } from "react";
import { Send } from "lucide-react";
import { FieldError, postJson } from "@/components/form";
import { Sheet } from "@/components/overlay";

export interface Followup {
  id: string;
  question: string;
  answer: string | null;
}

const PRESETS = ["没有___怎么办", "能用空气炸锅吗", "能提前做吗"];

export function FollowupSheet({
  tutorialId,
  initial,
  limit,
  onClose,
}: {
  tutorialId: string;
  initial: Followup[];
  limit: number;
  onClose: () => void;
}) {
  const [items, setItems] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, limit - items.length);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy || left <= 0) return;
    setBusy(true);
    setError(null);
    const res = await postJson<{ id: string; answer: string }>(`/api/tutorials/${tutorialId}/followups`, {
      question: text,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "这次没答上来，再问一次？");
      return;
    }
    setItems((xs) => [...xs, { id: res.data.id, question: text, answer: res.data.answer }]);
    setQuestion("");
  }

  return (
    <Sheet title="问一问" onClose={onClose}>
      <div className="space-y-4">
        {items.map((f) => (
          <div key={f.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-card bg-primary-soft px-3 py-2">{f.question}</p>
            <p className="max-w-[90%] rounded-card bg-surface-muted px-3 py-2">{f.answer}</p>
          </div>
        ))}
        {busy && <p className="w-fit animate-pulse rounded-card bg-surface-muted px-3 py-2 text-text-muted">正在想…</p>}
      </div>

      {left > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
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
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="关于这道菜，想问什么？"
              aria-label="追问内容"
              maxLength={300}
              className="h-12 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label="发送"
              className="flex h-12 w-12 items-center justify-center rounded-control bg-primary text-primary-contrast disabled:bg-surface-muted disabled:text-text-muted"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="mt-2 text-caption text-text-muted">还能问 {left} 次</p>
        </>
      ) : (
        <p className="mt-4 text-small text-text-muted">这份教程的 {limit} 次追问用完了。</p>
      )}
      <FieldError>{error}</FieldError>
    </Sheet>
  );
}
