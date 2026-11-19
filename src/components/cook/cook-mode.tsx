"use client";

// 烹饪模式（设计文档 4.6；PRD F22–F25）：一屏一步、大字、屏幕常亮、多个计时器、随时看食材。
// 进入后不依赖网络：内容由页面一次性传入，记录事件失败时存在本机稍后补发。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ListChecks, Thermometer, Timer, Type, X } from "lucide-react";
import { Sheet } from "@/components/overlay";
import { HeatBadge } from "@/components/ui";
import { CookDone } from "./cook-done";
import { Ingredients } from "@/components/tutorial/tutorial-view";
import { flushCookEvents, recordCookEvent } from "@/lib/cook-events";
import { saveOffline, type OfflineTutorial } from "@/lib/offline";
import { HEAT_LABELS, type TutorialContent, type TutorialStep } from "@/lib/tutorial-types";
import { formatClock, loadTimers, remainingSeconds, saveTimers, timerLabel, type CookTimer } from "@/lib/timers";
import { formatTemp, type UnitSystem } from "@/lib/units";

interface Props {
  tutorialId: string;
  content: TutorialContent;
  units: UnitSystem;
  exitHref: string;
  /** 在线打开时传入，用来存一份离线副本；离线外壳里已是本机数据，不传 */
  offlineRecord?: Omit<OfflineTutorial, "openedAt">;
  /** 评价记录开关；离线时不知道，按开着处理（关着的话服务端不会保存） */
  ratingsRecorded?: boolean;
  /** 示例教程：未登录也能用，不记录开始/完成，也不评价 */
  sample?: boolean;
}

const BIG_KEY = "xz_cook_big";

export function CookMode({
  tutorialId,
  content,
  units: defaultUnits,
  exitHref,
  offlineRecord,
  ratingsRecorded = true,
  sample = false,
}: Props) {
  const steps = content.steps;
  const total = steps.length;
  const stepKey = `xz_cook_step_${tutorialId}`;

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [servings, setServings] = useState(content.overview.servings);
  const [units, setUnits] = useState<UnitSystem>(defaultUnits);
  const [big, setBig] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [finished, setFinished] = useState(false);
  const [wakeNote, setWakeNote] = useState(false);
  const [timers, setTimers] = useState<CookTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<string>());
  const audio = useRef<AudioContext | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const started = useRef(false);

  // 恢复进度、份量、单位与字号；记录“进入烹饪模式”；存一份离线副本
  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(stepKey));
      if (saved > 0 && saved < total) setIndex(saved);
      const u = localStorage.getItem("xz_units");
      if (u === "metric" || u === "us") setUnits(u);
      setBig(localStorage.getItem(BIG_KEY) === "1");
    } catch {}
    const s = Number(new URLSearchParams(window.location.search).get("servings"));
    if (Number.isInteger(s) && s >= 1 && s <= 12) setServings(s);
    setTimers(loadTimers(tutorialId));
    for (const t of loadTimers(tutorialId)) if (t.endsAt <= Date.now() - 60_000) fired.current.add(t.id);

    if (!started.current) {
      started.current = true;
      if (!sample) void flushCookEvents().then(() => recordCookEvent(tutorialId, "start"));
      if (offlineRecord) void saveOffline(offlineRecord);
    }
    const onOnline = () => void flushCookEvents();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // offlineRecord 只在进入时存一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialId, stepKey, total]);

  useEffect(() => {
    try {
      sessionStorage.setItem(stepKey, String(index));
    } catch {}
  }, [index, stepKey]);

  // 屏幕常亮（F23）。切回前台时重新申请，系统会在后台自动释放
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = async () => {
      if (!("wakeLock" in navigator)) {
        setWakeNote(true);
        return;
      }
      try {
        const l = await navigator.wakeLock.request("screen");
        if (alive) lock = l;
        else void l.release();
      } catch {}
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  // 计时器走字
  useEffect(() => {
    if (!timers.length) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timers.length]);

  const updateTimers = useCallback(
    (fn: (list: CookTimer[]) => CookTimer[]) =>
      setTimers((list) => {
        const next = fn(list);
        saveTimers(tutorialId, next);
        return next;
      }),
    [tutorialId],
  );

  const ringing = timers.filter((t) => t.endsAt <= now);

  // 到点：振动 + 提示音，提醒层不关就每 4 秒再响一次
  useEffect(() => {
    const fresh = ringing.filter((t) => !fired.current.has(t.id));
    if (fresh.length) {
      fresh.forEach((t) => fired.current.add(t.id));
      alarm(audio.current);
    }
  }, [ringing]);
  useEffect(() => {
    if (!ringing.length) return;
    const id = setInterval(() => alarm(audio.current), 4000);
    return () => clearInterval(id);
  }, [ringing.length]);

  const startTimer = (stepIndex: number, step: TutorialStep) => {
    if (!step.timer_seconds) return;
    // 提示音需要在用户点按时解锁
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {}
    const t: CookTimer = {
      id: `${stepIndex}-${Date.now()}`,
      label: timerLabel(step, content.ingredients, stepIndex),
      step: stepIndex,
      seconds: step.timer_seconds,
      endsAt: Date.now() + step.timer_seconds * 1000,
    };
    setNow(Date.now());
    updateTimers((list) => [...list, t]);
  };
  const cancelTimer = (id: string) => updateTimers((list) => list.filter((t) => t.id !== id));
  const dismissRinging = () => updateTimers((list) => list.filter((t) => t.endsAt > Date.now()));

  const go = useCallback(
    (delta: 1 | -1) => {
      if (delta === 1 && index === total - 1) {
        setFinished(true);
        if (!sample) void recordCookEvent(tutorialId, "complete");
        try {
          sessionStorage.removeItem(stepKey);
        } catch {}
        return;
      }
      const next = Math.min(total - 1, Math.max(0, index + delta));
      if (next === index) return;
      setDir(delta === 1 ? "next" : "prev");
      setIndex(next);
    },
    [index, total, tutorialId, stepKey, sample],
  );

  // 键盘：← → 翻页，空格下一步（设计文档 5）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || finished || ringing.length) return;
      if (e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea")) {
        if (e.key === " ") return;
      }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, sheet, finished, ringing.length]);

  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const toggleBig = () => {
    setBig((b) => {
      try {
        localStorage.setItem(BIG_KEY, b ? "0" : "1");
      } catch {}
      return !b;
    });
  };

  const step = steps[index];
  const stepTimers = timers.filter((t) => t.step === index && t.endsAt > now);
  const factor = servings / (content.overview.servings || 1);

  return (
    <div className="cook-contrast fixed inset-0 z-30 flex flex-col bg-bg text-text">
      {/* 顶部：关闭、进度、食材 */}
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-2 px-2">
          <Link href={exitHref} aria-label="退出烹饪模式" className="flex h-11 w-11 items-center justify-center">
            <X size={24} aria-hidden />
          </Link>
          <p className="tabular flex-1 text-center font-bold" aria-live="polite">
            {finished ? "做好了" : `第 ${index + 1} 步 / 共 ${total} 步`}
          </p>
          <button
            type="button"
            onClick={toggleBig}
            aria-pressed={big}
            aria-label="放大字号"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Type size={22} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="flex h-11 items-center gap-1 px-2 font-bold"
          >
            食材 <ListChecks size={20} aria-hidden />
          </button>
        </div>
        <div className="h-1 bg-surface-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${finished ? 100 : ((index + 1) / total) * 100}%` }}
          />
        </div>
        {wakeNote && (
          <div className="flex items-center gap-2 bg-surface-muted px-4 py-2 text-small">
            <span className="flex-1">这个浏览器不能保持屏幕常亮，请在系统设置中延长锁屏时间。</span>
            <button type="button" onClick={() => setWakeNote(false)} aria-label="关闭提示" className="p-1">
              <X size={16} />
            </button>
          </div>
        )}
      </header>

      {/* 当前步骤 */}
      <div className="relative flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {finished ? (
          <CookDone
            tutorialId={tutorialId}
            dishName={content.overview.name_zh}
            exitHref={exitHref}
            ratingsRecorded={ratingsRecorded}
            sample={sample}
            onBack={() => setFinished(false)}
          />
        ) : (
          <div
            key={index}
            className={`absolute inset-0 overflow-y-auto ${dir === "next" ? "cook-in-next" : "cook-in-prev"}`}
          >
            <article className="mx-auto max-w-[720px] px-6 pb-6 pt-6">
              {((step.heat && step.heat !== "off") || step.oven_c) && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {step.heat && step.heat !== "off" && (
                    <HeatBadge heat={step.heat} label={HEAT_LABELS[step.heat]} className="bg-transparent px-0 text-[20px]" />
                  )}
                  {step.oven_c ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-[18px] font-bold text-primary">
                      <Thermometer size={18} aria-hidden /> 烤箱 {formatTemp(step.oven_c, units)}
                    </span>
                  ) : null}
                </div>
              )}
              <p className={`font-semibold ${big ? "text-[34px] leading-[48px]" : "text-cook"}`}>{step.action}</p>
              {step.cue && (
                <div className="mt-6 rounded-card bg-surface-muted px-[18px] py-4">
                  <p className="text-small tracking-[1px] text-text-muted">看到这个样子就对了</p>
                  <p
                    className={`mt-1.5 font-bold text-[var(--cue)] ${big ? "text-[28px] leading-[40px]" : "text-[22px] leading-[32px]"}`}
                  >
                    {step.cue}
                  </p>
                </div>
              )}
              {step.warning && (
                <p className="mt-6 flex gap-2 rounded-control border-2 border-warning p-3 text-h2">
                  <AlertTriangle size={22} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  {step.warning}
                </p>
              )}
              {step.timer_seconds ? (
                <div className="mt-8">
                  {stepTimers.length ? (
                    stepTimers.map((t) => (
                      <div
                        key={t.id}
                        className="flex h-16 items-center justify-between gap-3 rounded-control border-2 border-primary px-4"
                      >
                        <span className="flex items-center gap-2 text-h2 font-bold">
                          <Timer size={24} aria-hidden />
                          <span className="tabular">计时中 {formatClock(remainingSeconds(t, now))}</span>
                        </span>
                        <button type="button" onClick={() => cancelTimer(t.id)} className="h-11 px-2 text-text-muted">
                          取消
                        </button>
                      </div>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => startTimer(index, step)}
                      className="flex h-16 w-full items-center justify-center gap-2 rounded-control border-2 border-primary text-h2 font-bold text-primary active:bg-primary-soft"
                    >
                      <Timer size={24} aria-hidden />
                      开始计时 <span className="tabular">{formatClock(step.timer_seconds)}</span>
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          </div>
        )}
      </div>

      {/* 计时器悬浮条（可多个） */}
      {timers.length > 0 && (
        <div
          className={`mx-auto flex w-full max-w-[720px] gap-2 overflow-x-auto px-4 ${
            finished ? "pb-[calc(12px+env(safe-area-inset-bottom))]" : "pb-2"
          }`}
          aria-label="计时器"
        >
          {timers.map((t) => {
            const left = remainingSeconds(t, now);
            return (
              <div
                key={t.id}
                className={`flex shrink-0 items-center rounded-full shadow-float ${
                  left === 0 ? "animate-pulse bg-primary text-primary-contrast" : "bg-text text-bg"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (finished) setFinished(false);
                    setDir(t.step >= index ? "next" : "prev");
                    setIndex(t.step);
                  }}
                  className="flex h-11 items-center gap-1.5 pl-3.5 pr-1 font-bold"
                  aria-label={`${t.label}，剩 ${formatClock(left)}，跳到第 ${t.step + 1} 步`}
                >
                  <Timer size={16} aria-hidden />
                  {t.label} <span className="tabular">{left === 0 ? "到了" : formatClock(left)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => cancelTimer(t.id)}
                  aria-label={`取消${t.label}计时`}
                  className="flex h-11 w-9 items-center justify-center opacity-70"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 翻页 */}
      {!finished && (
        <nav className="grid grid-cols-2 border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label="翻页">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="flex h-[72px] items-center justify-center gap-1 border-r border-border text-h2 font-bold disabled:text-text-muted disabled:opacity-40"
          >
            <ChevronLeft size={24} aria-hidden /> 上一步
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-[72px] items-center justify-center gap-1 bg-primary text-h2 font-bold text-primary-contrast"
          >
            {index === total - 1 ? "做好了" : "下一步"} <ChevronRight size={24} aria-hidden />
          </button>
        </nav>
      )}

      {sheet && (
        <Sheet title={`食材 · ${servings} 人份`} onClose={() => setSheet(false)}>
          <Ingredients content={content} factor={factor} units={units} />
        </Sheet>
      )}

      {/* 到点提醒：全屏闪烁，点一下关闭 */}
      {ringing.length > 0 && (
        <button
          type="button"
          onClick={dismissRinging}
          className="cook-alarm fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primary px-6 text-center text-primary-contrast"
          role="alertdialog"
          aria-label="计时结束"
        >
          <Timer size={64} aria-hidden />
          <span className="text-[40px] font-bold leading-tight">
            {ringing.map((t) => t.label).join("、")}
            <br />
            时间到
          </span>
          <span className="text-h2">点一下关闭</span>
        </button>
      )}
    </div>
  );
}

/** 振动 + 三声短促提示音 */
function alarm(ctx: AudioContext | null) {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {}
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.35);
      osc.stop(t0 + i * 0.35 + 0.3);
    }
  } catch {}
}
