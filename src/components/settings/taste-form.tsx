"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/form";
import { LIMITS, VERDICT_LABELS } from "@/lib/preference-options";
import { putPreferences, Section } from "./controls";

interface Rated {
  tutorialId: string;
  verdict: "good" | "ok" | "never";
  reason: string | null;
  nameZh: string;
}

export function TasteForm(props: {
  summary: string;
  notes: string;
  rated: Rated[];
  recording: { taste: boolean; ratings: boolean };
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(props.notes);
  const [saved, setSaved] = useState(props.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [rated, setRated] = useState(props.rated);

  const save = async () => {
    setBusy(true);
    setError(false);
    const ok = await putPreferences({ tasteNotes: notes.trim() || null }).catch(() => false);
    setBusy(false);
    if (!ok) return setError(true);
    setSaved(notes);
    router.refresh();
  };

  const remove = async (id: string) => {
    const before = rated;
    setRated((r) => r.filter((x) => x.tutorialId !== id));
    const res = await fetch(`/api/ratings?tutorialId=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setRated(before);
    else router.refresh();
  };

  const group = (v: "good" | "never") => rated.filter((r) => r.verdict === v);
  const off = (what: string) => (
    <span className="text-warning">
      “{what}”记录已关闭，不会用于推荐。<Link href="/me/privacy" className="underline">去打开</Link>
    </span>
  );

  return (
    <>
      <section className="rounded-card bg-primary-soft p-4">
        <h2 className="text-small font-bold text-primary">小灶目前对你的理解</h2>
        <p className="mt-1">{props.summary || "还没有。填一下忌口、厨具，或做完菜后评价一下，这里就会有内容。"}</p>
        <p className="mt-2 text-caption text-text-muted">推荐和教程时只把这段话交给 AI，不包含你的名字、邮箱等身份信息。</p>
      </section>

      <Section title="口味描述" sub={props.recording.taste ? "用自己的话写，比如“偏爱酸辣，不太能吃辣”“少油少盐”。" : off("口味偏好")}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={LIMITS.tasteNotes}
          rows={4}
          aria-label="口味描述"
          placeholder="偏爱酸辣和蒜香，不太能吃辣"
          className="w-full rounded-control border border-border bg-surface p-3 outline-none focus:border-primary"
        />
        <div className="mt-1 flex items-center justify-between text-caption text-text-muted">
          <span>{error ? <span className="text-danger">没保存上，请再试一次</span> : notes !== saved ? "还没保存" : ""}</span>
          <span className="tabular">
            {notes.length}/{LIMITS.tasteNotes}
          </span>
        </div>
        <Button variant="secondary" className="mt-3" onClick={save} loading={busy} disabled={notes === saved}>
          保存口味描述
        </Button>
      </Section>

      <Section title="评价过的菜" sub={props.recording.ratings ? "好评的菜会让相近的推荐更多，“不会再做”的菜不再推荐。不准的可以移除。" : off("评价")}>
        {rated.length === 0 ? (
          <p className="text-text-muted">还没有评价。做完一道菜点“做好了”就可以评价。</p>
        ) : (
          (["good", "never"] as const).map((v) =>
            group(v).length ? (
              <div key={v} className="mb-4">
                <p className="mb-1 text-small text-text-muted">
                  {VERDICT_LABELS[v].emoji} {VERDICT_LABELS[v].label}
                </p>
                <ul className="divide-y divide-border rounded-card border border-border bg-surface">
                  {group(v).map((r) => (
                    <li key={r.tutorialId} className="flex items-center gap-2 py-1 pl-3">
                      <Link href={`/t/${r.tutorialId}`} className="min-w-0 flex-1 py-2">
                        <span className="font-bold">{r.nameZh}</span>
                        {r.reason && <span className="block truncate text-small text-text-muted">{r.reason}</span>}
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(r.tutorialId)}
                        aria-label={`移除对${r.nameZh}的评价`}
                        className="flex h-11 w-11 items-center justify-center text-text-muted"
                      >
                        <X size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )
        )}
      </Section>
    </>
  );
}
