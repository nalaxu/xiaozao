"use client";

// 试验版的 6 种食材与通用占位，全部用 Three.js 基础几何程序化生成：不下载模型文件、没有授权问题，
// 整套几何不到几十 KB 显存。每个模型的底部落在 y = 0（砧板表面），中心在原点。
// 几何体和材质在模块里只建一次、所有实例共用；作为属性传入的对象不会在卸载时被 R3F 释放。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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
  generic: "#a8b98f",
};

function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
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
  g.computeVertexNormals();
  return g;
}

const geo = {
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
    return new THREE.LatheGeometry(pts, 28);
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
    return new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  }),
  meat: once(() => deformedSphere(0.2, [1.45, 0.8, 0.95], (n) => 0.08 * Math.max(0, n.x))),
  bone: once(() => new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10)),
  knob: once(() => new THREE.SphereGeometry(0.05, 12, 8)),
  generic: once(() => deformedSphere(0.2, [1, 0.6, 1], (n) => 0.03 * Math.sin(5 * n.x) * Math.cos(4 * n.z))),
};

// 材质同样全局共用，加删食材不会反复创建、也不会遗留未释放的材质
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness: number) {
  const key = `${color}/${roughness}`;
  let m = materials.get(key);
  if (!m) materials.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })));
  return m;
}

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
  // 横躺在砧板上
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
  generic: Generic,
};

export function IngredientModel({ kind }: { kind: ModelKind }) {
  const Model = MODELS[kind];
  return <Model />;
}
