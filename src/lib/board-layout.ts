// 3D 砧板的纯逻辑（docs/xiaozao-3d-interaction-plan.md 第 4.3 节）：哪些食材有模型、显示哪几样、摆在哪。
// 砧板只是 draft.items 的投影，不保存第二份食材列表；完整清单始终由下方的 HTML 标签提供。
import type { DraftItem } from "./draft";

/** 试验版有程序化模型的 6 种食材；其余显示通用占位 */
export const MODELED = ["番茄", "鸡蛋", "土豆", "豆腐", "洋葱", "鸡肉"] as const;
export type ModelKind = (typeof MODELED)[number] | "generic";

export function modelKind(name: string): ModelKind {
  return (MODELED as readonly string[]).includes(name) ? (name as ModelKind) : "generic";
}

/** 砧板上最多同时摆几样，再多显示“另有 N 样”，不无限缩小模型 */
export const MAX_ON_BOARD = 7;

export interface BoardSlot {
  name: string;
  main: boolean;
  kind: ModelKind;
  /** 砧板平面上的位置（场景单位，砧板中心为原点） */
  x: number;
  z: number;
}

const SPACING = 0.78;

/**
 * 按加入顺序摆放：切换主料时食材留在原地（刚点过的东西不能从手指下跑开），主料靠红圈和“主”字区分。
 * 超过 MAX_ON_BOARD 时优先摆主料，被省略的在下方清单里。
 */
export function boardLayout(items: Pick<DraftItem, "name" | "main">[]): { slots: BoardSlot[]; hidden: number } {
  const keep = new Set(
    [...items.filter((i) => i.main), ...items.filter((i) => !i.main)].slice(0, MAX_ON_BOARD).map((i) => i.name),
  );
  const shown = items.filter((i) => keep.has(i.name));
  const n = shown.length;
  const rows = n <= 4 ? 1 : 2;
  const firstRow = Math.ceil(n / rows);
  const slots = shown.map((item, i) => {
    const row = i < firstRow ? 0 : 1;
    const inRow = row === 0 ? firstRow : n - firstRow;
    const col = row === 0 ? i : i - firstRow;
    return {
      name: item.name,
      main: item.main,
      kind: modelKind(item.name),
      x: (col - (inRow - 1) / 2) * SPACING,
      z: rows === 1 ? 0.05 : row === 0 ? -0.46 : 0.46,
    };
  });
  return { slots, hidden: items.length - n };
}
