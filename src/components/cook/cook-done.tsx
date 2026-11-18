"use client";

// 做好了之后的评价（设计文档 4.7）：点一下就记下，原因可选。
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { recordRating } from "@/lib/cook-events";
import { LIMITS, VERDICTS, VERDICT_LABELS, type Verdict } from "@/lib/preference-options";

export function CookDone({
  tutorialId,
  dishName,
  exitHref,
  ratingsRecorded,
  onBack,
}: {
  tutorialId: string;
  dishName: string;
  exitHref: string;
  ratingsRecorded: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<Promise<void>>(Promise.resolve());

  const pick = (v: Verdict) => {
    setVerdict(v);
    // 依次发出，保证最后一次点选（或带原因的那次）是最终结果
    pending.current = pending.current.then(() => recordRating(tutorialId, v, null));
  };

  const finish = async () => {
    setBusy(true);
    if (verdict && reason.trim()) pending.current = pending.current.then(() => recordRating(tutorialId, verdict, reason.trim()));
    await pending.current;
    // 整页跳转：教程页要重新读出“你做过 · 好吃”；离线时由 Service Worker 接管
    router.push(exitHref);
    router.refresh();
  };

  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col justify-center overflow-y-auto px-6 py-6 text-center">
      <p className="text-[48px] leading-none" aria-hidden>
        🍽
      </p>
      <h1 className="mt-3 font-serif text-display font-black">做好了，开吃吧</h1>
      <h2 className="mt-8 text-h2 font-bold">{dishName}做得怎么样？</h2>
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="评价">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={verdict === v}
            onClick={() => pick(v)}
            className={`flex h-[88px] flex-col items-center justify-center gap-1 rounded-control border-2 font-bold ${
              verdict === v ? "border-primary bg-primary-soft text-primary" : "border-border"
            }`}
          >
            <span className="text-[28px] leading-none" aria-hidden>
              {VERDICT_LABELS[v].emoji}
            </span>
            {VERDICT_LABELS[v].label}
          </button>
        ))}
      </div>
      {verdict && (
        <label className="mt-4 block text-left text-small">
          说一句原因（可选）
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={LIMITS.reason}
            placeholder={verdict === "never" ? "例如太腥、步骤太多" : "例如酸辣刚好、下次少放糖"}
            className="mt-1 h-[52px] w-full rounded-control border border-border bg-surface px-4 text-body outline-none focus:border-primary"
          />
        </label>
      )}
      <p className="mt-3 h-5 text-small text-text-muted" role="status">
        {!ratingsRecorded ? "你关闭了评价记录，评价不会被记录。" : verdict ? "记下了，下次推荐会参考。" : ""}
      </p>
      <button
        type="button"
        onClick={finish}
        disabled={busy}
        className="mt-4 flex h-[52px] w-full items-center justify-center rounded-control bg-primary font-bold text-primary-contrast"
      >
        {verdict ? "完成" : "跳过，回到教程"}
      </button>
      <button type="button" onClick={onBack} className="mt-2 h-11 text-text-muted">
        回到最后一步
      </button>
    </div>
  );
}
