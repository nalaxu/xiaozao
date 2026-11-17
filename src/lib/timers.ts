// 烹饪模式的计时器（PRD F24；技术方案第 11 节）。
// 记录结束时刻而不是倒数秒数，切到后台、锁屏或刷新后回来依然准确。
import type { TutorialIngredient, TutorialStep } from "./tutorial-types";

export interface CookTimer {
  id: string;
  label: string;
  /** 所属步骤（从 0 开始） */
  step: number;
  seconds: number;
  endsAt: number;
}

export function remainingSeconds(t: Pick<CookTimer, "endsAt">, now: number) {
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}

/** 4:05、12:00、1:02:03 */
export function formatClock(total: number) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 计时器名称取自该步骤提到的食材（主料优先），找不到时用“第 N 步” */
export function timerLabel(
  step: Pick<TutorialStep, "action">,
  ingredients: Pick<TutorialIngredient, "name_zh" | "group">[],
  index: number,
) {
  const order: TutorialIngredient["group"][] = ["main", "aux", "seasoning"];
  for (const group of order) {
    const hit = ingredients
      .filter((i) => i.group === group && i.name_zh && step.action.includes(i.name_zh))
      .sort((a, b) => step.action.indexOf(a.name_zh) - step.action.indexOf(b.name_zh))[0];
    if (hit) return hit.name_zh.length > 6 ? hit.name_zh.slice(0, 6) : hit.name_zh;
  }
  return `第 ${index + 1} 步`;
}

const key = (tutorialId: string) => `xz_timers_${tutorialId}`;

export function loadTimers(tutorialId: string): CookTimer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(tutorialId)) ?? "[]") as CookTimer[];
    return Array.isArray(raw) ? raw.filter((t) => typeof t.endsAt === "number" && typeof t.label === "string") : [];
  } catch {
    return [];
  }
}

export function saveTimers(tutorialId: string, timers: CookTimer[]) {
  try {
    if (timers.length) localStorage.setItem(key(tutorialId), JSON.stringify(timers));
    else localStorage.removeItem(key(tutorialId));
  } catch {}
}
