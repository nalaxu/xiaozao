// 3D 工作台的纯逻辑（docs/xiaozao-3d-interaction-plan.md 第 4.3 节）：哪些食材有模型、摆在哪、拖放后怎么变。
// 工作台只是 draft.items 的投影，不保存第二份食材列表；完整清单始终由下方的 HTML 标签提供。
//
// 布局按真实厨房：左边砧板放主料（要下刀的主角），右边搪瓷菜盆放配菜和辅料。
// 把食材拖到砧板 = 设为主料，拖进菜盆 = 改为配菜；砧板满了时拖上去会和最近的主料互换。
import type { DraftItem } from "./draft";

/** 有程序化模型的食材；其余显示通用占位 */
export const MODELED = [
  "番茄", "鸡蛋", "土豆", "豆腐", "洋葱", "鸡肉",
  "猪肉", "牛肉", "牛肉末", "青椒", "白菜", "胡萝卜", "蘑菇",
  "葱", "姜", "蒜", "辣椒", "黄瓜", "茄子", "西兰花", "虾",
] as const;
export type ModelKind = (typeof MODELED)[number] | "generic";

/** 外形足够接近、直接共用模型的食材 */
const SHARED: Record<string, ModelKind> = { 五花肉: "猪肉" };

export function modelKind(name: string): ModelKind {
  if ((MODELED as readonly string[]).includes(name)) return name as ModelKind;
  return SHARED[name] ?? "generic";
}

export type Zone = "board" | "basin";

/**
 * 场景尺寸（场景单位，台面中心为原点，y 向上，z 朝向镜头）。
 * 砧板上表面 y = 0；台面在 y = -0.16；菜盆盆底内侧略高于台面。
 */
export const SCENE = {
  counterY: -0.16,
  // 砧板在前排靠左，菜盆在后排靠右，像灶台边真实的摆法；比左右并排更紧凑，手机竖屏上食材更大
  board: { x: -0.5, z: 0.35, w: 2, d: 1.3 },
  basin: { x: 0.95, z: -1.05, rim: 0.82, floorY: -0.13 },
  /** 拖动时食材能到达的范围 */
  bounds: { minX: -1.58, maxX: 1.9, minZ: -2.0, maxZ: 1.06 },
} as const;

/** 砧板最多摆几样主料、菜盆最多摆几样配菜，再多显示“另有 N 样”，不无限缩小模型 */
export const MAX_ON_BOARD = 6;
export const MAX_IN_BASIN = 7;

export interface BoardSlot {
  name: string;
  main: boolean;
  kind: ModelKind;
  zone: Zone;
  /** 场景中的位置；y 是食材底部所在高度 */
  x: number;
  y: number;
  z: number;
  scale: number;
}

// 砧板上主料的位置（相对砧板中心）：一排最多 3 样，再多分前后两排
const BOARD_SPOTS: Record<number, [number, number][]> = {
  1: [[0, 0.05]],
  2: [[-0.42, 0.05], [0.42, 0.05]],
  3: [[-0.62, 0.05], [0, 0.05], [0.62, 0.05]],
  4: [[-0.42, -0.28], [0.42, -0.28], [-0.42, 0.33], [0.42, 0.33]],
  5: [[-0.62, -0.28], [0, -0.28], [0.62, -0.28], [-0.38, 0.33], [0.38, 0.33]],
  6: [[-0.62, -0.28], [0, -0.28], [0.62, -0.28], [-0.62, 0.33], [0, 0.33], [0.62, 0.33]],
};

/** 菜盆里配菜的位置（相对盆心）：少时围在中间，多了中间一样、四周一圈 */
function basinSpots(n: number): [number, number][] {
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-0.24, 0], [0.24, 0]];
  if (n === 3) return ring(3, 0.27, -Math.PI / 2);
  return [[0, 0], ...ring(n - 1, 0.42, -Math.PI / 2)];
}

function ring(n: number, r: number, start: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

/**
 * 主料上砧板、配菜进菜盆，各自按加入顺序摆放（刚动过的东西不会在别处乱跳）。
 * 超出上限的不摆，数量记在 hidden，完整清单在下方标签里。
 */
export function boardLayout(items: Pick<DraftItem, "name" | "main">[]): { slots: BoardSlot[]; hidden: number } {
  const mains = items.filter((i) => i.main).slice(0, MAX_ON_BOARD);
  const sides = items.filter((i) => !i.main).slice(0, MAX_IN_BASIN);
  const { board, basin } = SCENE;
  const boardScale = mains.length <= 2 ? 1 : 0.86;
  const slots: BoardSlot[] = [
    ...mains.map((item, i) => {
      const [dx, dz] = BOARD_SPOTS[mains.length][i];
      return { name: item.name, main: true, kind: modelKind(item.name), zone: "board" as const, x: board.x + dx, y: 0, z: board.z + dz, scale: boardScale };
    }),
    ...basinSpots(sides.length).map(([dx, dz], i) => ({
      name: sides[i].name,
      main: false,
      kind: modelKind(sides[i].name),
      zone: "basin" as const,
      x: basin.x + dx,
      y: basin.floorY,
      z: basin.z + dz,
      scale: 0.72,
    })),
  ];
  return { slots, hidden: items.length - slots.length };
}

/** 台面上一点落在哪个区域（拖放判定，边缘留一点余量，手指不用对得很准） */
export function zoneAt(x: number, z: number): Zone | null {
  const { board, basin } = SCENE;
  if (Math.hypot(x - basin.x, z - basin.z) <= basin.rim + 0.12) return "basin";
  if (Math.abs(x - board.x) <= board.w / 2 + 0.12 && Math.abs(z - board.z) <= board.d / 2 + 0.12) return "board";
  return null;
}

export type DropResult =
  | { type: "none" }
  | { type: "place"; name: string; main: boolean }
  | { type: "swap"; toMain: string; toSide: string };

/**
 * 把 name 拖到 (x, z) 松手后该做什么：
 * 配菜拖到砧板 → 设为主料；主料已满时与落点最近的主料互换。主料拖进菜盆 → 改为配菜。其余原样放回。
 */
export function dropResult(
  items: Pick<DraftItem, "name" | "main">[],
  slots: BoardSlot[],
  name: string,
  x: number,
  z: number,
  maxMain: number,
): DropResult {
  const item = items.find((i) => i.name === name);
  const zone = zoneAt(x, z);
  if (!item || !zone) return { type: "none" };
  if (zone === "basin") return item.main ? { type: "place", name, main: false } : { type: "none" };
  if (item.main) return { type: "none" };
  if (items.filter((i) => i.main).length < maxMain) return { type: "place", name, main: true };
  const onBoard = slots.filter((s) => s.zone === "board");
  if (onBoard.length === 0) return { type: "none" };
  const nearest = onBoard.reduce((a, b) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a));
  return { type: "swap", toMain: name, toSide: nearest.name };
}
