"use client";

// 3D 砧板的外壳（docs/xiaozao-3d-interaction-plan.md 第 9.2、9.5、12.3 节）。本文件不引用 three.js：
// 是否启用、WebGL 检测、加载占位、出错回退都在这里，场景本身按需加载。任何失败都只是不显示 3D，
// 下方的 HTML 食材标签一直完整可用，选择数据不受影响。
import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Star, X } from "lucide-react";
import { boardLayout } from "@/lib/board-layout";
import type { DraftItem } from "@/lib/draft";

const BoardScene = dynamic(() => import("./board-scene"), { ssr: false });

const PREF_KEY = "xz_board3d";

function readPref(): boolean | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {}
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * 是否显示 3D 砧板。服务端开关 ENABLE_3D_BOARD=1 时默认开启；试用时可在网址加 ?board3d=1 / ?board3d=0
 * 单独为这台设备打开或关闭（记在 localStorage）。用户点“简洁”关闭后同样记住。
 */
export function useBoard3d(flag: boolean) {
  const [state, setState] = useState<"off" | "on" | "failed">("off");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("board3d");
    if (q === "1" || q === "0") writePref(q === "1");
    const want = readPref() ?? flag;
    // 首次挂载时读取浏览器能力与偏好，服务端渲染时一律按关闭处理
    if (want && hasWebGL()) setState("on");
  }, [flag]);

  return {
    active: state === "on",
    fail: () => setState("failed"),
    turnOff: () => {
      writePref(false);
      setState("off");
    },
  };
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D 砧板出错，已回退到普通标签", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function KitchenBoard({
  items,
  maxMain,
  onToggleMain,
  onRemove,
  onFail,
  onTurnOff,
}: {
  items: DraftItem[];
  maxMain: number;
  onToggleMain: (name: string) => void;
  onRemove: (name: string) => void;
  onFail: () => void;
  onTurnOff: () => void;
}) {
  const { slots, hidden } = useMemo(() => boardLayout(items), [items]);
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const labels = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // 被删掉（包括从下方标签删掉）的食材不再保持选中
  const selected = picked && items.find((i) => i.name === picked);
  const mainCount = items.filter((i) => i.main).length;

  return (
    <div className="relative mt-2.5 h-[196px] overflow-hidden rounded-[14px] bg-[color-mix(in_srgb,var(--kraft)_78%,#8a5a33)] lg:h-[230px]">
      {/* 同尺寸占位：场景加载前不跳动 */}
      {!ready && <div className="absolute inset-x-6 inset-y-8 animate-pulse rounded-[12px] bg-[#c8955b]/45" aria-hidden />}
      <div className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}>
        <SceneBoundary onError={onFail}>
          <BoardScene
            slots={slots}
            selected={selected ? selected.name : null}
            onSelect={setPicked}
            reducedMotion={reducedMotion}
            labels={labels.current}
            onReady={() => setReady(true)}
            onFail={onFail}
          />
        </SceneBoundary>
      </div>

      {/* 名称标签：位置由场景每帧写入；主料除颜色外还有“主”字，不只靠颜色区分。读屏用下方的标签清单 */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      >
        {slots.map((s) => (
          <span
            key={s.name}
            ref={(el) => {
              if (el) labels.current.set(s.name, el);
              else labels.current.delete(s.name);
            }}
            style={{ opacity: 0 }}
            className={`absolute left-0 top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] leading-[18px] shadow-sm ${
              s.main ? "bg-ink font-bold text-ink-contrast" : "bg-surface text-text"
            } ${selected && selected.name === s.name ? "ring-2 ring-primary" : ""}`}
          >
            {s.main && <span className="mr-0.5 text-marker">主</span>}
            {s.name}
          </span>
        ))}
      </div>

      {items.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center text-small font-bold text-[#4a3018]">
          砧板还空着。拍一下，或者从上面点几样。
        </p>
      )}
      {hidden > 0 && (
        <span className="pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-full bg-surface/90 px-2 py-0.5 text-caption text-text-muted">
          另有 {hidden} 样，见下方清单
        </span>
      )}
      <button
        type="button"
        onClick={onTurnOff}
        className="absolute right-2 top-2 z-20 rounded-full bg-surface/85 px-2.5 py-1 text-caption text-text-muted active:bg-surface"
      >
        简洁
      </button>

      {selected && (
        <div
          className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 rounded-[12px] border border-border bg-surface p-1.5 pl-3 shadow-float"
          role="group"
          aria-label={`${selected.name}的操作`}
        >
          <span className="min-w-0 flex-1 truncate font-bold">
            {selected.name}
            <span className="ml-1.5 text-small font-normal text-text-muted">{selected.main ? "主料" : "手头还有"}</span>
          </span>
          <button
            type="button"
            onClick={() => onToggleMain(selected.name)}
            disabled={!selected.main && mainCount >= maxMain}
            className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-border-strong px-2.5 text-small active:bg-surface-muted disabled:opacity-50"
          >
            <Star size={14} aria-hidden />
            {selected.main ? "改为手头还有" : mainCount >= maxMain ? `主料已满 ${maxMain} 样` : "设为主料"}
          </button>
          <button
            type="button"
            onClick={() => {
              onRemove(selected.name);
              setPicked(null);
            }}
            className="h-9 rounded-[10px] px-2.5 text-small text-danger active:bg-surface-muted"
          >
            移除
          </button>
          <button
            type="button"
            onClick={() => setPicked(null)}
            aria-label="关闭"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-text-muted active:bg-surface-muted"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
