// 土豆切丝教学动画的时间轴与几何（docs/xiaozao-3d-interaction-plan.md 第 7.3 节“切法”模板的原型）。
// 纯函数：给定时间 t（秒）算出每样东西的位置。可以从任意时刻开始、拖动进度条、跳到某一段，
// 画面不依赖上一段动画是否真的播放过（方案 7.6）。
//
// 尺度：1 个场景单位 = 5 厘米。片厚、丝宽都是 3 毫米，标注的是目标尺寸，不是屏幕上的长度。

export const UNIT_CM = 5;
/** 片厚 3 mm */
export const T = 0.3 / UNIT_CM;
/** 丝宽 3 mm */
export const W = 0.3 / UNIT_CM;
export const SLICES = 6;

/** 土豆：长 10 cm、宽 6.5 cm、高 5 cm 的椭球，躺在砧板上 */
export const POTATO = { halfLen: 1, halfWidth: 0.65, halfHeight: 0.5, centerY: 0.5 };
/** 土豆右端已切掉一小块，切面在这里；从这里往左一片片切 */
export const FIRST_CUT_X = 0.5;

/** 刀抬起时刃口离砧板的高度 */
const KNIFE_UP = 1.15;
const KNIFE_AWAY = 3.2;

export interface SliceSpec {
  index: number;
  /** 立在土豆上时的中心 x */
  standX: number;
  /** 截面的竖直半轴（片子放平后沿 x） */
  a: number;
  /** 截面的前后半轴（沿 z） */
  b: number;
  /** 码成一排后的位置 */
  rowX: number;
  rowY: number;
  /** 倒下后靠在前一片上的角度（弧度，0 为平放） */
  lean: number;
}

export interface StripSpec {
  slice: number;
  /** 所在格（第几刀切下来的） */
  cell: number;
  x: number;
  y: number;
  /** 丝的长度（沿 z） */
  length: number;
  /** 切下后的轻微倾倒与散开（确定性的伪随机，每次播放一样） */
  lean: number;
  spreadX: number;
  spreadZ: number;
}

export interface Stroke {
  /** 刀落下的位置（刃口所在平面的 x） */
  x: number;
  start: number;
  /** 刃口碰到砧板、这一刀切断的时刻 */
  cut: number;
  end: number;
  /** 这一刀抬多高 */
  lift: number;
}

export type PhaseId = "slice" | "stack" | "shred" | "done";
export interface Phase {
  id: PhaseId;
  start: number;
  end: number;
}

const ROW_STEP = 0.24;
const ROW_CENTER = 0.35;

function rand(seed: number) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const ease = {
  inOut: (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  inCubic: (u: number) => u * u * u,
  out: (u: number) => 1 - (1 - u) ** 3,
};
export const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function buildSlices(): SliceSpec[] {
  const raw = Array.from({ length: SLICES }, (_, k) => {
    const x = FIRST_CUT_X - (k + 0.5) * T;
    const s = Math.sqrt(1 - (x / POTATO.halfLen) ** 2);
    return { index: k, standX: x, a: POTATO.halfHeight * s, b: POTATO.halfWidth * s };
  });
  // 码片：第一片在最右，后面每片往左错开一点、叠在上面，整排居中
  const left = -(SLICES - 1) * ROW_STEP - raw[SLICES - 1].a;
  const right = raw[0].a;
  const shift = ROW_CENTER - (left + right) / 2;
  return raw.map((s) => ({
    ...s,
    rowX: shift - s.index * ROW_STEP,
    rowY: T / 2 + s.index * T * 0.35,
    lean: 0.25 + 0.12 * s.index,
  }));
}

function buildStrips(slices: SliceSpec[]) {
  const xmin = Math.min(...slices.map((s) => s.rowX - s.a));
  const xmax = Math.max(...slices.map((s) => s.rowX + s.a));
  const cells = Math.ceil((xmax - xmin) / W - 1e-9);
  const strips: StripSpec[] = [];
  for (const s of slices) {
    for (let m = 0; m < cells; m++) {
      const xc = xmin + (m + 0.5) * W;
      const u = (xc - s.rowX) / s.a;
      if (Math.abs(u) >= 1) continue;
      const length = 2 * s.b * Math.sqrt(1 - u * u);
      if (length < 0.1) continue;
      const seed = s.index * 1000 + m;
      strips.push({
        slice: s.index,
        cell: m,
        x: xc,
        y: s.rowY,
        length,
        lean: 0.08 + 0.22 * rand(seed),
        spreadX: (m - cells / 2) * 0.01 + (rand(seed + 7) - 0.5) * 0.04,
        spreadZ: (rand(seed + 13) - 0.5) * 0.22,
      });
    }
  }
  return { xmin, xmax, cells, strips };
}

// ─── 时间轴 ───────────────────────────────────────────────

const INTRO = 0.6;
const SLICE_STROKE = 0.45;
const FALL = 0.4;
const SLICE_END = INTRO + SLICES * SLICE_STROKE + 0.4;
const STACK_END = SLICE_END + 1.4;
const SHRED_ENTER = 0.4;
/** 前三刀慢放，看清动作；之后按正常切丝的节奏 */
const SLOW_STROKES = 3;
const SLOW_STROKE = 0.5;
const FAST_STROKE = 0.11;

function buildStrokes(cells: number, xmin: number) {
  const slicing: Stroke[] = Array.from({ length: SLICES }, (_, k) => {
    const start = INTRO + k * SLICE_STROKE;
    return { x: FIRST_CUT_X - (k + 1) * T, start, cut: start + 0.2, end: start + SLICE_STROKE, lift: KNIFE_UP };
  });
  const shredding: Stroke[] = [];
  let t = STACK_END + SHRED_ENTER;
  for (let m = 0; m < cells; m++) {
    const d = m < SLOW_STROKES ? SLOW_STROKE : FAST_STROKE;
    shredding.push({ x: xmin + (m + 1) * W, start: t, cut: t + d * 0.45, end: t + d, lift: m < SLOW_STROKES ? 0.6 : 0.3 });
    t += d;
  }
  return { slicing, shredding };
}

function build() {
  const slices = buildSlices();
  const { xmin, xmax, cells, strips } = buildStrips(slices);
  const { slicing, shredding } = buildStrokes(cells, xmin);
  const shredEnd = shredding[shredding.length - 1].end;
  const total = shredEnd + 1.4;
  const phases: Phase[] = [
    { id: "slice", start: 0, end: SLICE_END },
    { id: "stack", start: SLICE_END, end: STACK_END },
    { id: "shred", start: STACK_END, end: shredEnd },
    { id: "done", start: shredEnd, end: total },
  ];
  return { slices, strips, xmin, xmax, cells, slicing, shredding, shredEnd, total, phases };
}

export const SHRED = build();

export function phaseAt(t: number): Phase {
  return SHRED.phases.find((p) => t < p.end) ?? SHRED.phases[SHRED.phases.length - 1];
}

/** 已经切断了几刀 */
function cutsDone(strokes: Stroke[], t: number) {
  let n = 0;
  while (n < strokes.length && strokes[n].cut <= t) n++;
  return n;
}

/** 一刀之内刃口的高度：落下 → 停一下 → 抬起 */
function strokeHeight(s: Stroke, t: number) {
  if (t <= s.start || t >= s.end) return s.lift;
  if (t < s.cut) return s.lift * (1 - ease.inCubic(clamp01((t - s.start) / (s.cut - s.start))));
  const hold = s.cut + (s.end - s.cut) * 0.15;
  if (t < hold) return 0;
  return s.lift * ease.out(clamp01((t - hold) / (s.end - hold)));
}

function knifeOver(strokes: Stroke[], t: number) {
  const i = strokes.findIndex((s) => t < s.end);
  const s = strokes[i];
  const next = strokes[i + 1];
  // 抬刀时同时移到下一刀的位置
  const hold = s.cut + (s.end - s.cut) * 0.15;
  const x = next && t > hold ? lerp(s.x, next.x, ease.inOut(clamp01((t - hold) / (s.end - hold)))) : s.x;
  return { x, y: strokeHeight(s, t) };
}

/** 刀：x 为刃口平面位置，y 为刃口离砧板的高度 */
export function knifeAt(t: number): { x: number; y: number } {
  const { slicing, shredding, shredEnd } = SHRED;
  if (t < INTRO) return { x: slicing[0].x, y: lerp(KNIFE_AWAY, KNIFE_UP, ease.out(clamp01(t / INTRO))) };
  if (t < slicing[SLICES - 1].end) return knifeOver(slicing, t);
  if (t < STACK_END) {
    // 抬到画面外，再平移到切丝的起点
    const from = slicing[SLICES - 1].end;
    const u = ease.inOut(clamp01((t - from) / 0.5));
    const v = ease.inOut(clamp01((t - from) / (STACK_END - from)));
    return { x: lerp(slicing[SLICES - 1].x, shredding[0].x, v), y: lerp(KNIFE_UP, KNIFE_AWAY, u) };
  }
  if (t < shredding[0].start) {
    const u = ease.out(clamp01((t - STACK_END) / SHRED_ENTER));
    return { x: shredding[0].x, y: lerp(KNIFE_AWAY, shredding[0].lift, u) };
  }
  if (t < shredEnd) return knifeOver(shredding, t);
  const last = shredding[shredding.length - 1];
  return { x: last.x, y: lerp(last.lift, KNIFE_AWAY, ease.inOut(clamp01((t - shredEnd) / 0.5))) };
}

/** 土豆剩下的部分：保留 x < cutX 的部分，并在码片时挪到砧板后方 */
export function potatoBodyAt(t: number) {
  const cuts = cutsDone(SHRED.slicing, t);
  const u = ease.inOut(clamp01((t - SLICE_END) / (STACK_END - SLICE_END)));
  return { cutX: FIRST_CUT_X - cuts * T, offsetX: lerp(0, -0.75, u), offsetZ: lerp(0, -0.95, u) };
}

export interface SlicePose {
  x: number;
  y: number;
  /** 绕 z 轴的转角：π/2 立着，0 平放 */
  rotZ: number;
  /** 这一片是否已经切离土豆（未切离的不单独显示，由土豆本体表现） */
  free: boolean;
}

/** 片子倒下：绕底部右侧的边翻倒，同时落到砧板上 */
function fallenPose(s: SliceSpec, e: number) {
  const phi = lerp(Math.PI / 2, s.lean, e);
  const pivotX = s.standX + T / 2;
  const pivotY = (POTATO.centerY - s.a) * (1 - e);
  return {
    x: pivotX + s.a * Math.cos(phi) - (T / 2) * Math.sin(phi),
    y: pivotY + s.a * Math.sin(phi) + (T / 2) * Math.cos(phi),
    rotZ: phi,
  };
}

export function slicePoseAt(k: number, t: number): SlicePose {
  const s = SHRED.slices[k];
  const stroke = SHRED.slicing[k];
  if (t < stroke.cut) return { x: s.standX, y: POTATO.centerY, rotZ: Math.PI / 2, free: false };
  const fall = fallenPose(s, ease.inCubic(clamp01((t - stroke.cut) / FALL)));
  const u = ease.inOut(clamp01((t - (SLICE_END + 0.1 + k * 0.05)) / (STACK_END - SLICE_END - 0.4)));
  if (u <= 0) return { ...fall, free: true };
  return { x: lerp(fall.x, s.rowX, u), y: lerp(fall.y, s.rowY, u), rotZ: lerp(fall.rotZ, 0, u), free: true };
}

/** 码好的片子从 clipX 往左已经切成丝；clipX 为 null 表示还没开始切丝 */
export function shredClipAt(t: number): number | null {
  const n = cutsDone(SHRED.shredding, t);
  return n === 0 ? null : SHRED.xmin + n * W;
}

export interface StripPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  rotZ: number;
}

export function stripPoseAt(strip: StripSpec, t: number): StripPose {
  const stroke = SHRED.shredding[strip.cell];
  if (t < stroke.cut) return { visible: false, x: strip.x, y: strip.y, z: 0, rotZ: 0 };
  const lean = ease.out(clamp01((t - stroke.cut) / 0.15));
  const spread = ease.inOut(clamp01((t - SHRED.shredEnd - 0.2) / 1));
  return {
    visible: true,
    x: strip.x - 0.004 * lean + strip.spreadX * spread,
    y: strip.y,
    z: strip.spreadZ * spread,
    rotZ: strip.lean * lean,
  };
}
