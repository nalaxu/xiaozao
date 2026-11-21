"use client";

// 21 种常用食材与通用占位，全部用 Three.js 基础几何程序化生成：不下载模型文件、没有授权问题，
// 整套几何只占几十 KB 显存。每个模型的底部落在 y = 0（台面或砧板表面），中心在原点，长度方向大致沿 x。
// 几何体和材质在模块里只建一次、所有实例共用；作为属性传入的对象不会在卸载时被 R3F 释放。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelKind } from "@/lib/board-layout";

const COLORS = {
  tomato: "#d9412b",
  leaf: "#4f7a2e",
  egg: "#ecd2ad",
  potato: "#c49a5a",
  tofu: "#f4ecd8",
  onion: "#c47a35",
  chicken: "#eeb9a0",
  bone: "#f3ebdd",
  lean: "#c95a4d",
  fat: "#f6e6db",
  rind: "#efcfb4",
  beef: "#9b2d26",
  marbling: "#f0d4c8",
  mince: "#b0483d",
  pepper: "#3a8a2a",
  stemDark: "#2f5e22",
  carrot: "#e8742a",
  carrotTop: "#5c9a34",
  mushroomCap: "#d6bd96",
  mushroomStem: "#efe4cf",
  scallionWhite: "#f1f0e2",
  scallionGreen: "#5f9b3a",
  ginger: "#d6ac6c",
  garlic: "#efe7dc",
  chili: "#c62a1f",
  cucumber: "#3b6b27",
  eggplant: "#5b2b63",
  calyx: "#4a6e2e",
  broccoli: "#3d7a2c",
  broccoliStalk: "#9cbf62",
  shrimp: "#ef8a5e",
  shrimpTail: "#e0603c",
  eye: "#2b1e16",
  generic: "#a8b98f",
};

function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

/** 合并接缝处的重复顶点再算法线，避免球面、旋转体上出现一条亮缝 */
function smooth(g: THREE.BufferGeometry) {
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const merged = mergeVertices(g);
  merged.computeVertexNormals();
  return merged;
}

/** 平移到底部贴着 y = 0 */
function sitOnGround(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  return g;
}

/** 球面按函数微调半径，做出不规则的天然形状 */
function deformedSphere(radius: number, scale: [number, number, number], bump: (v: THREE.Vector3) => number) {
  const g = new THREE.SphereGeometry(radius, 32, 20);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.multiplyScalar(1 + bump(n));
    p.setXYZ(i, v.x * scale[0], v.y * scale[1], v.z * scale[2]);
  }
  return smooth(g);
}

/**
 * 横躺在台面上的长条蔬菜（胡萝卜、黄瓜、茄子、辣椒、白菜）：沿长度方向 t ∈ [0, 1] 给出半径，
 * 可加表面起伏、在台面平面内弯曲，以及按位置上色（顶点色）。根部在 -x，尖端在 +x，底部贴地。
 */
function lying(
  length: number,
  radius: (t: number) => number,
  opts: { bend?: number; bump?: (t: number, a: number) => number; color?: (t: number) => THREE.Color; flatten?: number } = {},
) {
  const N = 48;
  const pts = Array.from({ length: N + 1 }, (_, i) => new THREE.Vector2(Math.max(0.001, radius(i / N)), (i / N) * length));
  const g = new THREE.LatheGeometry(pts, 28);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const colors = opts.color ? new Float32Array(p.count * 3) : null;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = v.y / length;
    const k = 1 + (opts.bump?.(t, Math.atan2(v.z, v.x)) ?? 0);
    const x = v.y - length / 2;
    const y = v.x * k * (opts.flatten ?? 1);
    const z = v.z * k + (opts.bend ?? 0) * ((2 * t - 1) ** 2 - 1);
    p.setXYZ(i, x, y, z);
    if (colors) opts.color!(t).toArray(colors, i * 3);
  }
  if (colors) g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return sitOnGround(smooth(g));
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 末端收圆：t 在 [0, w] 内半径按四分之一圆从 0 长到 1 */
const capped = (t: number, w: number) => Math.sqrt(Math.max(0, 1 - Math.max(0, 1 - t / w) ** 2));

const geo = {
  // —— 原有 6 种 ——
  tomato: once(() =>
    deformedSphere(0.26, [1, 0.8, 1], (n) => 0.035 * Math.cos(5 * Math.atan2(n.z, n.x)) * Math.max(0, n.y) - 0.08 * Math.max(0, n.y) ** 6),
  ),
  sepal: once(() => new THREE.SphereGeometry(1, 10, 6)),
  stem: once(() => new THREE.CylinderGeometry(0.018, 0.024, 0.07, 8)),
  egg: once(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const y = -1 + (2 * i) / 24;
      pts.push(new THREE.Vector2(Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.16 * y) * 0.16, (y + 1) * 0.21));
    }
    return smooth(new THREE.LatheGeometry(pts, 28));
  }),
  potato: once(() =>
    deformedSphere(0.24, [1.3, 0.72, 0.92], (n) => 0.07 * Math.sin(3 * n.x + 1) * Math.sin(4 * n.y + 2) * Math.cos(3 * n.z)),
  ),
  tofu: once(() => new RoundedBoxGeometry(0.46, 0.26, 0.46, 3, 0.05)),
  onion: once(() => {
    const raw = [
      [0, 0], [0.08, 0.005], [0.17, 0.035], [0.24, 0.1], [0.27, 0.18], [0.25, 0.27],
      [0.19, 0.35], [0.11, 0.42], [0.05, 0.48], [0.025, 0.54], [0.012, 0.58], [0, 0.6],
    ];
    return smooth(new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x, y)), 28));
  }),
  meat: once(() => deformedSphere(0.2, [1.45, 0.8, 0.95], (n) => 0.08 * Math.max(0, n.x))),
  bone: once(() => new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10)),
  knob: once(() => new THREE.SphereGeometry(0.05, 12, 8)),
  generic: once(() => deformedSphere(0.2, [1, 0.6, 1], (n) => 0.03 * Math.sin(5 * n.x) * Math.cos(4 * n.z))),

  // —— 新增 15 种 ——
  // 猪肉：五花肉式的肥瘦相间，一眼能认出是猪肉
  porkLayer: once(() => new RoundedBoxGeometry(0.52, 0.04, 0.36, 2, 0.012)),
  // 牛肉：深红的一整块方肉（超椭球，介于球和方块之间），表面几道雪花
  beef: once(() =>
    sitOnGround(
      deformedSphere(0.2, [1.25, 0.6, 0.9], (n) => {
        const box = 1 / (n.x ** 4 + n.y ** 4 + n.z ** 4) ** 0.25 - 1;
        return 0.75 * box + 0.03 * Math.sin(4 * n.x + 1) * Math.cos(3 * n.z);
      }),
    ),
  ),
  streak: once(() => new THREE.SphereGeometry(1, 10, 6)),
  // 牛肉末：底部平、表面细碎起伏的一小堆
  mince: once(() => {
    const g = new THREE.SphereGeometry(0.22, 40, 24);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const r = 1 + 0.1 * Math.sin(23 * n.x) * Math.sin(19 * n.y + 1) * Math.sin(21 * n.z + 2);
      p.setXYZ(i, v.x * r * 1.1, Math.max(0, v.y * r) * 0.8, v.z * r);
    }
    return smooth(g);
  }),
  // 青椒：四棱、顶部凹进去
  pepper: once(() =>
    sitOnGround(
      deformedSphere(0.2, [1, 1.05, 1], (n) => {
        const lobes = 0.09 * Math.cos(4 * Math.atan2(n.z, n.x)) * (1 - Math.abs(n.y)) ** 0.6;
        return lobes - 0.16 * Math.max(0, n.y) ** 8 + 0.04 * Math.cos(4 * Math.atan2(n.z, n.x)) * Math.max(0, -n.y) ** 3;
      }),
    ),
  ),
  pepperStem: once(() => new THREE.CylinderGeometry(0.018, 0.026, 0.09, 8)),
  // 白菜：根部白、叶子绿、叶尖起皱
  cabbage: once(() => {
    const white = new THREE.Color("#eef1d6");
    const green = new THREE.Color("#8fbf55");
    return lying(
      0.8,
      (t) => (t < 0.8 ? (0.12 + 0.08 * smoothstep(0, 0.8, t)) * capped(t, 0.04) : 0.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2))),
      {
        bump: (t, a) => 0.07 * Math.sin(9 * a + 8 * t) * smoothstep(0.45, 0.7, t) + 0.02 * Math.sin(5 * a),
        color: (t) => white.clone().lerp(green, smoothstep(0.42, 0.62, t)),
        flatten: 0.85,
      },
    );
  }),
  // 胡萝卜：粗头圆、细尾尖，带几道浅横纹
  carrot: once(() =>
    lying(0.62, (t) => 0.085 * (1 - t) ** 0.8 * capped(t, 0.06), {
      bump: (t) => -0.05 * Math.max(0, Math.sin(38 * t)) ** 10,
      bend: 0.02,
    }),
  ),
  carrotTop: once(() => new THREE.ConeGeometry(0.022, 0.26, 6)),
  // 蘑菇：蘑菇伞 + 柄
  mushroomCap: once(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * 0.15, Math.sin(a) * 0.11));
    }
    pts.reverse();
    pts.push(new THREE.Vector2(0.13, -0.012), new THREE.Vector2(0.05, -0.02), new THREE.Vector2(0.001, -0.02));
    return smooth(new THREE.LatheGeometry(pts, 28));
  }),
  mushroomStem: once(() => new THREE.CylinderGeometry(0.045, 0.055, 0.11, 14)),
  // 葱：葱白一段、葱绿一段
  scallionWhite: once(() => new THREE.CylinderGeometry(0.026, 0.028, 0.3, 10).rotateZ(Math.PI / 2)),
  scallionGreen: once(() => new THREE.CylinderGeometry(0.012, 0.024, 0.55, 10).rotateZ(Math.PI / 2)),
  root: once(() => new THREE.SphereGeometry(0.03, 8, 6)),
  // 姜：几块不规则的疙瘩连在一起
  gingerBody: once(() => deformedSphere(0.12, [1.6, 0.62, 0.9], (n) => 0.08 * Math.sin(5 * n.x) * Math.cos(4 * n.z + 1))),
  gingerKnob: once(() => deformedSphere(0.07, [1.3, 0.75, 1], (n) => 0.1 * Math.sin(6 * n.y + n.x))),
  // 蒜：一整头蒜，瓣与瓣之间有棱，顶部收尖
  garlic: once(() =>
    sitOnGround(
      deformedSphere(0.14, [1, 0.9, 1], (n) => {
        const a = Math.atan2(n.z, n.x);
        return 0.05 * Math.abs(Math.cos(4 * a)) * (1 - n.y * n.y) + 0.4 * Math.max(0, n.y) ** 7 - 0.12 * Math.max(0, -n.y) ** 6;
      }),
    ),
  ),
  clove: once(() => deformedSphere(1, [0.07, 0.05, 0.035], (n) => 0.25 * Math.max(0, n.x) ** 4)),
  // 辣椒：细长、弯，尖端收尖
  chili: once(() => lying(0.42, (t) => 0.042 * (1 - t) ** 0.7 * capped(t, 0.08), { bend: 0.06 })),
  chiliStem: once(() => new THREE.CylinderGeometry(0.01, 0.016, 0.07, 6).rotateZ(Math.PI / 2)),
  // 黄瓜：两头圆，表面带小刺瘤
  cucumber: once(() =>
    lying(0.7, (t) => 0.066 * Math.sqrt(Math.max(0, 1 - Math.abs(2 * t - 1) ** 6)), {
      bump: (t, a) => 0.07 * Math.max(0, Math.sin(34 * t) * Math.sin(7 * a)) ** 6,
      bend: 0.03,
    }),
  ),
  // 茄子：长条紫茄，越往尾部越粗
  eggplant: once(() => lying(0.74, (t) => (0.045 + 0.03 * smoothstep(0.1, 0.85, t)) * capped(t, 0.04) * capped(1 - t, 0.12), { bend: 0.09 })),
  calyx: once(() => new THREE.ConeGeometry(0.06, 0.09, 10).rotateZ(Math.PI / 2)),
  // 西兰花：浅绿的茎，上面一团团深绿的花球
  broccoliStalk: once(() => new THREE.CylinderGeometry(0.05, 0.07, 0.17, 12)),
  floret: once(() => deformedSphere(0.09, [1, 0.85, 1], (n) => 0.1 * Math.max(0, Math.sin(13 * n.x) * Math.sin(11 * n.y) * Math.sin(12 * n.z)))),
  // 虾：蜷成 C 形的一节节身子，带尾扇
  shrimpSegment: once(() => new THREE.SphereGeometry(1, 14, 10)),
};

// 材质同样全局共用，加删食材不会反复创建、也不会遗留未释放的材质
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness: number) {
  const key = `${color}/${roughness}`;
  let m = materials.get(key);
  if (!m) materials.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })));
  return m;
}
/** 顶点色材质（白菜从白到绿） */
const vertexColorMat = once(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }));

function Tomato() {
  const skin = mat(COLORS.tomato, 0.38);
  const leaf = mat(COLORS.leaf, 0.7);
  const top = 0.26 * 0.8 * 2 - 0.02;
  return (
    <group>
      <mesh geometry={geo.tomato()} material={skin} position={[0, 0.26 * 0.8, 0]} />
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={geo.sepal()}
            material={leaf}
            position={[Math.cos(a) * 0.06, top, Math.sin(a) * 0.06]}
            rotation={[0, -a, 0.25]}
            scale={[0.075, 0.012, 0.025]}
          />
        );
      })}
      <mesh geometry={geo.stem()} material={leaf} position={[0, top + 0.03, 0]} />
    </group>
  );
}

function Egg() {
  const shell = mat(COLORS.egg, 0.55);
  // 横躺着
  return <mesh geometry={geo.egg()} material={shell} rotation={[0, 0.4, Math.PI / 2]} position={[0.21, 0.135, 0]} />;
}

function Potato() {
  const skin = mat(COLORS.potato, 0.92);
  return <mesh geometry={geo.potato()} material={skin} position={[0, 0.24 * 0.72, 0]} rotation={[0, 0.5, 0]} />;
}

function Tofu() {
  const body = mat(COLORS.tofu, 0.75);
  return <mesh geometry={geo.tofu()} material={body} position={[0, 0.13, 0]} rotation={[0, 0.35, 0]} />;
}

function Onion() {
  const skin = mat(COLORS.onion, 0.45);
  return <mesh geometry={geo.onion()} material={skin} />;
}

function Chicken() {
  const meat = mat(COLORS.chicken, 0.6);
  const bone = mat(COLORS.bone, 0.5);
  return (
    <group rotation={[0, -0.5, 0]} position={[0.06, 0, 0]}>
      <mesh geometry={geo.meat()} material={meat} position={[-0.08, 0.16, 0]} />
      <mesh geometry={geo.bone()} material={bone} position={[0.27, 0.1, 0]} rotation={[0, 0, Math.PI / 2 - 0.25]} />
      <mesh geometry={geo.knob()} material={bone} position={[0.4, 0.075, 0.03]} />
      <mesh geometry={geo.knob()} material={bone} position={[0.4, 0.075, -0.03]} />
    </group>
  );
}

const PORK_LAYERS = ["lean", "fat", "lean", "fat", "rind"] as const;
function Pork() {
  return (
    <group rotation={[0, 0.3, 0]}>
      {PORK_LAYERS.map((layer, i) => (
        <mesh
          key={i}
          geometry={geo.porkLayer()}
          material={mat(COLORS[layer], layer === "rind" ? 0.5 : 0.7)}
          position={[0, 0.02 + i * 0.036, 0]}
          scale={[1 - i * 0.012, layer === "rind" ? 0.5 : 1, 1 - i * 0.012]}
        />
      ))}
    </group>
  );
}

const STREAKS: [number, number, number][] = [[-0.1, -0.05, 0.4], [0.04, 0.06, -0.3], [0.12, -0.08, 0.9]];
function Beef() {
  // 超椭球顶面较平，雪花贴在最高处略下
  const top = geo.beef().boundingBox!.max.y - 0.006;
  return (
    <group rotation={[0, -0.25, 0]}>
      <mesh geometry={geo.beef()} material={mat(COLORS.beef, 0.62)} />
      {STREAKS.map(([x, z, r], i) => (
        <mesh key={i} geometry={geo.streak()} material={mat(COLORS.marbling, 0.6)} position={[x * 0.8, top, z * 0.8]} rotation={[0, r, 0]} scale={[0.06, 0.008, 0.011]} />
      ))}
    </group>
  );
}

function Mince() {
  return <mesh geometry={geo.mince()} material={mat(COLORS.mince, 0.85)} />;
}

function Pepper() {
  // 顶部凹进去，柄插在凹处，比外轮廓最高点略低
  const top = geo.pepper().boundingBox!.max.y - 0.03;
  return (
    <group>
      <mesh geometry={geo.pepper()} material={mat(COLORS.pepper, 0.28)} />
      <mesh geometry={geo.pepperStem()} material={mat(COLORS.stemDark, 0.6)} position={[0.01, top, 0]} rotation={[0, 0, -0.3]} />
    </group>
  );
}

function Cabbage() {
  return <mesh geometry={geo.cabbage()} material={vertexColorMat()} rotation={[0, 0.2, 0]} />;
}

function Carrot() {
  const leaf = mat(COLORS.carrotTop, 0.7);
  return (
    <group rotation={[0, -0.2, 0]} position={[0.08, 0, 0]}>
      <mesh geometry={geo.carrot()} material={mat(COLORS.carrot, 0.55)} />
      {[-0.35, 0, 0.35].map((a, i) => (
        <mesh key={i} geometry={geo.carrotTop()} material={leaf} position={[-0.31 - 0.11 * Math.cos(a), 0.085, 0.11 * Math.sin(a)]} rotation={[0, a, Math.PI / 2]} />
      ))}
    </group>
  );
}

function Mushroom() {
  const cap = mat(COLORS.mushroomCap, 0.7);
  const stem = mat(COLORS.mushroomStem, 0.8);
  return (
    <group>
      <group position={[-0.07, 0, -0.02]}>
        <mesh geometry={geo.mushroomStem()} material={stem} position={[0, 0.055, 0]} />
        <mesh geometry={geo.mushroomCap()} material={cap} position={[0, 0.12, 0]} />
      </group>
      {/* 第二朵侧躺 */}
      <group position={[0.15, 0.1, 0.06]} rotation={[0.3, 0.5, -1.25]} scale={0.8}>
        <mesh geometry={geo.mushroomStem()} material={stem} position={[0, -0.04, 0]} />
        <mesh geometry={geo.mushroomCap()} material={cap} position={[0, 0.03, 0]} />
      </group>
    </group>
  );
}

function Scallion() {
  const white = mat(COLORS.scallionWhite, 0.55);
  const green = mat(COLORS.scallionGreen, 0.55);
  return (
    <group rotation={[0, 0.15, 0]}>
      {[-0.06, 0, 0.06].map((z, i) => (
        <group key={i} position={[0, 0.026, z]} rotation={[0, (i - 1) * 0.07, 0]}>
          <mesh geometry={geo.root()} material={white} position={[-0.43, 0, 0]} scale={[0.7, 0.8, 1]} />
          <mesh geometry={geo.scallionWhite()} material={white} position={[-0.27, 0, 0]} />
          <mesh geometry={geo.scallionGreen()} material={green} position={[0.15, -0.004, 0]} />
        </group>
      ))}
    </group>
  );
}

const GINGER_KNOBS: [number, number, number][] = [[0.2, 0.08, 0.6], [0.05, -0.12, -0.9], [-0.18, 0.1, 2.4]];
function Ginger() {
  const skin = mat(COLORS.ginger, 0.9);
  return (
    <group rotation={[0, 0.4, 0]}>
      <mesh geometry={geo.gingerBody()} material={skin} position={[0, 0.072, 0]} />
      {GINGER_KNOBS.map(([x, z, r], i) => (
        <mesh key={i} geometry={geo.gingerKnob()} material={skin} position={[x, 0.055, z]} rotation={[0, r, 0]} />
      ))}
    </group>
  );
}

function Garlic() {
  const skin = mat(COLORS.garlic, 0.6);
  return (
    <group>
      <mesh geometry={geo.garlic()} material={skin} position={[-0.05, 0, 0]} />
      <mesh geometry={geo.clove()} material={skin} position={[0.17, 0.035, 0.08]} rotation={[Math.PI / 2, 0, 0.6]} />
    </group>
  );
}

function Chili() {
  const skin = mat(COLORS.chili, 0.3);
  const stem = mat(COLORS.calyx, 0.6);
  return (
    <group>
      {[
        [0, -0.06, 0.15],
        [0.03, 0.07, -0.35],
      ].map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <mesh geometry={geo.chili()} material={skin} />
          <mesh geometry={geo.chiliStem()} material={stem} position={[-0.24, 0.04, -0.06]} />
        </group>
      ))}
    </group>
  );
}

function Cucumber() {
  return <mesh geometry={geo.cucumber()} material={mat(COLORS.cucumber, 0.55)} rotation={[0, -0.15, 0]} />;
}

function Eggplant() {
  return (
    <group rotation={[0, 0.15, 0]}>
      <mesh geometry={geo.eggplant()} material={mat(COLORS.eggplant, 0.25)} />
      <mesh geometry={geo.calyx()} material={mat(COLORS.calyx, 0.7)} position={[-0.37, 0.05, -0.09]} />
    </group>
  );
}

const FLORETS: [number, number, number][] = [
  [0, 0.3, 0],
  [0.1, 0.25, 0.04],
  [-0.09, 0.25, 0.06],
  [0.02, 0.24, -0.1],
  [-0.05, 0.22, -0.08],
  [0.08, 0.22, -0.07],
  [0.03, 0.23, 0.11],
];
function Broccoli() {
  const head = mat(COLORS.broccoli, 0.9);
  return (
    <group>
      <mesh geometry={geo.broccoliStalk()} material={mat(COLORS.broccoliStalk, 0.7)} position={[0, 0.085, 0]} />
      {FLORETS.map(([x, y, z], i) => (
        <mesh key={i} geometry={geo.floret()} material={head} position={[x, y, z]} />
      ))}
    </group>
  );
}

// 虾身沿 C 形弧线由粗到细，躺在台面上
const SHRIMP_BODY = Array.from({ length: 7 }, (_, i) => {
  const a = Math.PI * 1.1 - (i / 6) * Math.PI * 1.25;
  const r = 0.052 - i * 0.0045;
  return { x: Math.cos(a) * 0.11, z: Math.sin(a) * 0.11, r, a };
});
function ShrimpOne() {
  const body = mat(COLORS.shrimp, 0.45);
  const tail = SHRIMP_BODY[SHRIMP_BODY.length - 1];
  return (
    <group>
      {SHRIMP_BODY.map((s, i) => (
        <mesh key={i} geometry={geo.shrimpSegment()} material={body} position={[s.x, s.r * 0.85, s.z]} scale={[s.r * 1.15, s.r * 0.85, s.r]} rotation={[0, -s.a, 0]} />
      ))}
      {/* 头 */}
      <mesh geometry={geo.shrimpSegment()} material={body} position={[Math.cos(Math.PI * 1.25) * 0.12, 0.05, Math.sin(Math.PI * 1.25) * 0.12]} scale={[0.07, 0.048, 0.05]} rotation={[0, -Math.PI * 1.25 + 0.6, 0]} />
      <mesh geometry={geo.shrimpSegment()} material={mat(COLORS.eye, 0.4)} position={[Math.cos(Math.PI * 1.3) * 0.15, 0.07, Math.sin(Math.PI * 1.3) * 0.15]} scale={0.012} />
      {/* 尾扇 */}
      {[-0.5, 0.5].map((d, i) => (
        <mesh key={i} geometry={geo.shrimpSegment()} material={mat(COLORS.shrimpTail, 0.45)} position={[tail.x + 0.04, 0.02, tail.z + 0.025 + d * 0.03]} rotation={[0, d, 0]} scale={[0.045, 0.01, 0.022]} />
      ))}
    </group>
  );
}
function Shrimp() {
  return (
    <group>
      <group position={[-0.1, 0, 0.02]} rotation={[0, 0.3, 0]}>
        <ShrimpOne />
      </group>
      <group position={[0.14, 0, -0.04]} rotation={[0, 2.4, 0]} scale={0.9}>
        <ShrimpOne />
      </group>
    </group>
  );
}

function Generic() {
  const body = mat(COLORS.generic, 0.8);
  return <mesh geometry={geo.generic()} material={body} position={[0, 0.12, 0]} />;
}

const MODELS: Record<ModelKind, () => React.JSX.Element> = {
  番茄: Tomato,
  鸡蛋: Egg,
  土豆: Potato,
  豆腐: Tofu,
  洋葱: Onion,
  鸡肉: Chicken,
  猪肉: Pork,
  牛肉: Beef,
  牛肉末: Mince,
  青椒: Pepper,
  白菜: Cabbage,
  胡萝卜: Carrot,
  蘑菇: Mushroom,
  葱: Scallion,
  姜: Ginger,
  蒜: Garlic,
  辣椒: Chili,
  黄瓜: Cucumber,
  茄子: Eggplant,
  西兰花: Broccoli,
  虾: Shrimp,
  generic: Generic,
};

export function IngredientModel({ kind }: { kind: ModelKind }) {
  const Model = MODELS[kind];
  return <Model />;
}
