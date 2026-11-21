"use client";

// 做好了（设计文档 4.7）：先放一段庆祝动画（光芒、成品徽章、火花、三颗星），再点一下评价，原因可选。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Star, UtensilsCrossed } from "lucide-react";
import { recordRating } from "@/lib/cook-events";
import { LIMITS, VERDICTS, VERDICT_LABELS, type Verdict } from "@/lib/preference-options";

export function CookDone({
  tutorialId,
  dishName,
  dishImage = null,
  stats,
  exitHref,
  ratingsRecorded,
  sample = false,
  onBack,
}: {
  tutorialId: string;
  dishName: string;
  dishImage?: string | null;
  /** 这次做了几步、用了多久（分钟，拿不准时为 null） */
  stats?: { steps: number; minutes: number | null };
  exitHref: string;
  ratingsRecorded: boolean;
  /** 示例教程：不评价，引导登录 */
  sample?: boolean;
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

  if (sample) {
    return (
      <Celebration dishName={dishName} dishImage={dishImage} stats={stats}>
        <p className="text-text-muted">这是示例教程。登录后可以按你手头的食材和口味生成，做完还能记下好不好吃。</p>
        <Link
          href="/login"
          className="mt-6 flex h-[52px] w-full items-center justify-center rounded-control bg-primary font-bold text-primary-contrast"
        >
          登录
        </Link>
        <Link href={exitHref} className="mt-2 flex h-11 items-center justify-center text-text-muted">
          回到教程
        </Link>
      </Celebration>
    );
  }

  return (
    <Celebration dishName={dishName} dishImage={dishImage} stats={stats}>
      <h2 className="text-h2 font-bold">做得怎么样？</h2>
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="评价">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={verdict === v}
            onClick={() => pick(v)}
            className={`flex h-[88px] flex-col items-center justify-center gap-1 rounded-control border-2 font-bold ${
              verdict === v ? "border-primary bg-primary-soft text-primary" : "border-border bg-bg/60"
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
    </Celebration>
  );
}

// 火花：从徽章中心向四周飞出，角度均匀、距离和大小错开
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08);
  const dist = 110 + ((i * 37) % 70);
  return {
    x: Math.round(Math.cos(angle) * dist),
    y: Math.round(Math.sin(angle) * dist),
    size: 10 + ((i * 5) % 12),
    delay: 260 + ((i * 53) % 260),
    color: i % 3 === 0 ? "#ff8a4c" : i % 3 === 1 ? "#f6d58a" : "#fff3cf",
  };
});

function Celebration({
  dishName,
  dishImage,
  stats,
  children,
}: {
  dishName: string;
  dishImage: string | null;
  stats?: { steps: number; minutes: number | null };
  children: ReactNode;
}) {
  const [skip, setSkip] = useState(false);
  const [imageOk, setImageOk] = useState(Boolean(dishImage));

  // 一声轻快的上行和弦 + 短振动。“做好了”是用户点的，此时可以播放声音
  useEffect(() => {
    try {
      navigator.vibrate?.([40, 60, 80]);
    } catch {}
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const t0 = ctx.currentTime + 0.12;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = "triangle";
        osc.frequency.value = f;
        const at = t0 + i * 0.09;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(at);
        osc.stop(at + 1);
      });
    } catch {}
    const close = setTimeout(() => void ctx?.close().catch(() => {}), 2500);
    return () => clearTimeout(close);
  }, []);

  const facts = [
    stats?.steps ? `${stats.steps} 步` : null,
    stats?.minutes ? `用时 ${stats.minutes} 分钟` : null,
  ].filter(Boolean);

  return (
    <div
      className={`cel-root relative h-full overflow-hidden ${skip ? "cel-skip" : ""}`}
      onPointerDown={() => setSkip(true)}
    >
      <div className="cel-backdrop pointer-events-none absolute inset-0" aria-hidden>
        <div className="cel-rays" />
      </div>
      <div className="relative mx-auto flex h-full max-w-[560px] flex-col overflow-y-auto px-6 pb-6 pt-8 text-center">
        <div className="relative mx-auto mt-2 flex h-[230px] w-[230px] shrink-0 items-center justify-center" aria-hidden>
          <span className="cel-flash" />
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="cel-spark"
              style={
                {
                  "--x": `${s.x}px`,
                  "--y": `${s.y}px`,
                  "--s": `${s.size}px`,
                  "--d": `${s.delay}ms`,
                  "--c": s.color,
                } as CSSProperties
              }
            />
          ))}
          <div className="cel-medal">
            <div className="cel-medal-inner flex items-center justify-center">
              {dishImage && imageOk ? (
                // eslint-disable-next-line @next/next/no-img-element -- 已缩好的成品示意图，离线时可能读不到，失败就换成图标
                <img src={dishImage} alt="" className="h-full w-full object-cover" onError={() => setImageOk(false)} />
              ) : (
                <UtensilsCrossed size={64} strokeWidth={1.5} className="text-[#f6d58a]" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-1 flex justify-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Star
              key={i}
              size={i === 1 ? 34 : 28}
              fill="currentColor"
              strokeWidth={1}
              className={`cel-star ${i === 1 ? "-mt-1.5" : ""}`}
              style={{ "--d": `${880 + i * 140}ms` } as CSSProperties}
            />
          ))}
        </div>

        <div className="cel-title mt-3 flex items-center justify-center gap-3">
          <span className="cel-line origin-right" aria-hidden />
          <h1 className="font-brush text-[44px] leading-none text-[#f6d58a] [text-shadow:0_0_18px_rgba(246,213,138,0.45)]">
            做好了
          </h1>
          <span className="cel-line cel-line-r origin-left" aria-hidden />
        </div>
        <p className="cel-sub mt-2 font-serif text-h1 font-black">{dishName}</p>
        {facts.length > 0 && <p className="cel-sub mt-1 text-small text-text-muted">{facts.join(" · ")}，开吃吧</p>}

        <div className="cel-after mt-7">{children}</div>
      </div>
    </div>
  );
}
