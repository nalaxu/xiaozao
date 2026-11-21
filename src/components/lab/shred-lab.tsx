"use client";

// 土豆切丝动画原型的外壳：字幕、播放控制、尺寸标注、出错回退。three.js 只在本页按需加载。
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { SHRED, type PhaseId } from "@/lib/shred-timeline";

const ShredScene = dynamic(() => import("./shred-scene"), { ssr: false });

const CAPTIONS: Record<PhaseId, { step: string; title: string; detail: string }> = {
  slice: { step: "①", title: "切片", detail: "从切平的一面开始，切成约 3 毫米厚的薄片" },
  stack: { step: "②", title: "码片", detail: "把片子错开叠成一排，像倒下的多米诺" },
  shred: { step: "③", title: "切丝", detail: "刀垂直落下，每次往后挪 3 毫米，一刀一根丝" },
  done: { step: "✓", title: "切好了", detail: "粗细均匀，约 3 毫米粗、5–6 厘米长" },
};
const CHAPTERS = SHRED.phases.filter((p) => p.id !== "done");

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("切丝动画出错", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ShredLab() {
  const time = useRef(0);
  const [now, setNow] = useState(0);
  const [phase, setPhase] = useState<PhaseId>("slice");
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [seek, setSeek] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const sliceLabel = useRef<HTMLSpanElement>(null);
  const stripLabel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let ok = false;
    try {
      const c = document.createElement("canvas");
      ok = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {}
    setWebgl(ok);
    // 减少动态效果时不自动播放，直接停在切好的样子；用户点播放仍可观看
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      time.current = SHRED.total;
      setSeek((s) => s + 1);
    } else {
      setPlaying(true);
    }
  }, []);

  function jump(t: number, play: boolean) {
    time.current = t;
    setNow(t);
    setSeek((s) => s + 1);
    setPlaying(play);
  }

  function togglePlay() {
    if (playing) setPlaying(false);
    else jump(time.current >= SHRED.total ? 0 : time.current, true);
  }

  const caption = CAPTIONS[phase];
  const unavailable = webgl === false || failed;

  return (
    <div>
      <div className="relative h-[280px] overflow-hidden rounded-card bg-[color-mix(in_srgb,var(--kraft)_78%,#8a5a33)] lg:h-[380px]">
        {unavailable ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-small text-text-muted">
            这台设备暂时显示不了 3D 动画。下方的文字步骤同样完整。
          </p>
        ) : (
          <>
            {!ready && <div className="absolute inset-x-8 inset-y-10 animate-pulse rounded-[12px] bg-[#c8955b]/45" aria-hidden />}
            <div className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}>
              {webgl && (
                <SceneBoundary onError={() => setFailed(true)}>
                  <ShredScene
                    time={time}
                    playing={playing}
                    speed={slow ? 0.5 : 1}
                    seek={seek}
                    onTime={(t, p) => {
                      setNow(t);
                      setPhase(p);
                    }}
                    onEnd={() => setPlaying(false)}
                    onReady={() => setReady(true)}
                    onFail={() => setFailed(true)}
                    labels={{ slices: sliceLabel, strips: stripLabel }}
                  />
                </SceneBoundary>
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
              <span ref={sliceLabel} style={{ opacity: 0 }} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold leading-[18px] text-ink-contrast transition-opacity">
                约 3 毫米厚
              </span>
              <span ref={stripLabel} style={{ opacity: 0 }} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold leading-[18px] text-ink-contrast transition-opacity">
                约 3 毫米粗 · 5–6 厘米长
              </span>
            </div>
            <span className="absolute left-2.5 top-2.5 z-20 rounded-full bg-surface/90 px-2 py-0.5 text-caption text-text-muted">动作示意 · 节奏已放慢</span>
          </>
        )}
      </div>

      {/* 字幕：当前在做哪一步。读屏用户也能跟上 */}
      <div className="mt-3 rounded-card bg-surface p-3" aria-live="polite">
        <p className="font-bold">
          <span className="mr-1.5 text-primary">{caption.step}</span>
          {caption.title}
        </p>
        <p className="mt-0.5 text-small text-text-muted">{caption.detail}</p>
      </div>

      {!unavailable && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "暂停" : "播放"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast active:opacity-80"
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <input
              type="range"
              min={0}
              max={SHRED.total}
              step={0.01}
              value={now}
              onChange={(e) => jump(Number(e.target.value), false)}
              aria-label="动画进度"
              className="h-11 flex-1 accent-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => jump(0, true)}
              aria-label="从头再看一遍"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-muted active:bg-surface-muted"
            >
              <RotateCcw size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CHAPTERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => jump(p.start, true)}
                aria-pressed={phase === p.id}
                className={`h-10 rounded-[10px] border px-3 text-small ${
                  phase === p.id ? "border-ink bg-ink font-bold text-ink-contrast" : "border-border bg-surface active:bg-surface-muted"
                }`}
              >
                {CAPTIONS[p.id].step} {CAPTIONS[p.id].title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSlow((s) => !s)}
              aria-pressed={slow}
              className={`ml-auto h-10 rounded-[10px] border px-3 text-small ${
                slow ? "border-primary bg-primary-soft font-bold text-primary" : "border-border bg-surface text-text-muted"
              }`}
            >
              慢放 0.5×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
