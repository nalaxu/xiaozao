"use client";

// 3D 工作台场景（docs/xiaozao-3d-interaction-plan.md 第 4.3、9、12 节）：左边砧板放主料，右边搪瓷菜盆放配菜和辅料，
// 食材可以在两处之间拖动。只由 kitchen-board.tsx 按需加载，three.js 不进入首页主包。
// 镜头固定、无实时阴影；按需渲染（frameloop="demand"），只有动画或拖动进行中才逐帧绘制。
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SCENE, zoneAt, type BoardSlot, type Zone } from "@/lib/board-layout";
import { IngredientModel } from "./ingredient-models";

export interface BoardSceneProps {
  slots: BoardSlot[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  /** 拖动松手：食材名与台面上的落点，由外壳决定是否改主料 */
  onDrop: (name: string, x: number, z: number) => void;
  reducedMotion: boolean;
  /**
   * 名称标签（HTML，由外壳渲染在画布上方）。场景每帧把食材位置投影到屏幕，直接改写标签的 transform，
   * 不经过 React 状态。键为食材名；区域标题用 "zone:board" / "zone:basin"。
   */
  labels: Map<string, HTMLElement>;
  /** 场景已画出第一帧 */
  onReady: () => void;
  /** WebGL 上下文丢失等无法继续的情况 */
  onFail: (reason: string) => void;
}

interface DragState {
  name: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** 移动超过阈值后才算拖动，否则松手当作点按 */
  active: boolean;
  x: number;
  z: number;
}
type DragRef = MutableRefObject<DragState | null>;

const DROP_HEIGHT = 1.5;
const DRAG_LIFT = 0.32;
const DRAG_THRESHOLD = 6;

export default function BoardScene(props: BoardSceneProps) {
  // 卸载时 R3F 会主动丢弃上下文，同样触发 webglcontextlost；那不是故障，不能当成失败回退
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const drag = useRef<DragState | null>(null);
  const items = useRef<THREE.Group>(null);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 2.7, 2.55], fov: 30, near: 0.1, far: 30 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (alive.current) props.onFail("context-lost");
        });
        requestAnimationFrame(props.onReady);
      }}
      onPointerMissed={() => props.onSelect(null)}
      aria-hidden
    >
      <hemisphereLight args={["#fff6e8", "#8a5a33", 1.5]} />
      <directionalLight position={[-2, 4, 2.5]} intensity={1.7} color="#fff1dc" />
      <FitCamera />
      <Board drag={drag} slots={props.slots} />
      <Basin drag={drag} slots={props.slots} />
      <ZoneLabels labels={props.labels} drag={drag} slots={props.slots} />
      <DragController drag={drag} items={items} onSelect={props.onSelect} onDrop={props.onDrop} />
      <group ref={items}>
        {props.slots.map((s) => (
          <BoardItem
            key={s.name}
            slot={s}
            selected={props.selected === s.name}
            drag={drag}
            reducedMotion={props.reducedMotion}
            labels={props.labels}
          />
        ))}
      </group>
    </Canvas>
  );
}

// 镜头方向固定；按画布宽高比找到恰好框住砧板、菜盆和区域标题的距离与位置（手机竖屏时自动拉远）。
// 只取真实物体的轮廓点，不取包围盒的空角，画面才不会四周留出大片空台面。
const CAMERA_DIR = new THREE.Vector3(0, 2.7, 2.55).normalize();
const { bounds } = SCENE;
const ITEM_H = 0.4;
const FIT_POINTS = (() => {
  const { board, basin, counterY } = SCENE;
  const pts: THREE.Vector3[] = [];
  for (const x of [board.x - board.w / 2, board.x + board.w / 2])
    for (const z of [board.z - board.d / 2, board.z + board.d / 2 + 0.22])
      for (const y of [counterY, ITEM_H]) pts.push(new THREE.Vector3(x, y, z));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = basin.x + Math.cos(a) * basin.rim;
    const z = basin.z + Math.sin(a) * basin.rim;
    pts.push(new THREE.Vector3(x, counterY, z), new THREE.Vector3(x, basin.floorY + ITEM_H, z));
  }
  // 菜盆后方的区域标题
  pts.push(new THREE.Vector3(basin.x, counterY, basin.z - basin.rim - 0.3));
  return pts;
})();
function FitCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    const p = new THREE.Vector3();
    const target = new THREE.Vector3();
    const place = (d: number) => {
      camera.position.copy(CAMERA_DIR).multiplyScalar(d).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
    };
    // 画面中所有轮廓点的范围（归一化设备坐标）
    const extent = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const c of FIT_POINTS) {
        p.copy(c).project(camera);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      return { x0, x1, y0, y1 };
    };
    const fits = (d: number) => {
      place(d);
      const e = extent();
      return Math.max(-e.x0, e.x1) <= 0.97 && Math.max(-e.y0, e.y1) <= 0.95;
    };
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // 二分查找恰好放得下的最近距离
    const fitDistance = () => {
      let lo = 1.5;
      let hi = 30;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    // 先找距离，再把画面中心挪到轮廓中心（左右平移 x，上下平移 z），重复几次收敛
    for (let round = 0; round < 4; round++) {
      const d = fitDistance();
      place(d);
      const e = extent();
      target.x += ((e.x0 + e.x1) / 2) * d * tanHalf * camera.aspect;
      target.z -= (((e.y0 + e.y1) / 2) * d * tanHalf) / CAMERA_DIR.y;
    }
    place(fitDistance());
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 拖动中、松手会改变主料状态的那个区域（放回原处不提示） */
function dropTarget(drag: DragState | null, slots: BoardSlot[]): Zone | null {
  if (!drag?.active) return null;
  const zone = zoneAt(drag.x, drag.z);
  const from = slots.find((s) => s.name === drag.name)?.zone;
  return zone && zone !== from ? zone : null;
}

/** 区域被拖入时轻微发亮 */
function useZoneGlow(material: THREE.MeshStandardMaterial, zone: Zone, drag: DragRef, slots: BoardSlot[]) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    material.emissive.set(cssColor("--primary", "#b5421a"));
    material.emissiveIntensity = 0;
    return () => material.dispose();
  }, [material]);
  useFrame((_, delta) => {
    const want = dropTarget(drag.current, slots) === zone ? 0.22 : 0;
    const k = THREE.MathUtils.damp(material.emissiveIntensity, want, 12, Math.min(delta, 1 / 30));
    material.emissiveIntensity = Math.abs(k - want) < 0.002 ? want : k;
    if (material.emissiveIntensity !== want) invalidate();
  });
}

const boardGeo = new RoundedBoxGeometry(SCENE.board.w, 0.16, SCENE.board.d, 4, 0.07);
const grooveGeo = new THREE.RingGeometry(0.1, 0.135, 4, 1);

function Board({ drag, slots }: { drag: DragRef; slots: BoardSlot[] }) {
  const boardMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c8955b", roughness: 0.85 }), []);
  const grooveMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b07d47", roughness: 0.9 }), []);
  useEffect(() => () => grooveMat.dispose(), [grooveMat]);
  useZoneGlow(boardMat, "board", drag, slots);
  const { x, z, w, d } = SCENE.board;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={boardGeo} material={boardMat} position={[0, -0.08, 0]} />
      {/* 挂绳孔，让它一眼看出是砧板 */}
      <mesh geometry={grooveGeo} material={grooveMat} position={[-w / 2 + 0.2, 0.002, -d / 2 + 0.18]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} scale={[0.55, 0.55, 1]} />
    </group>
  );
}

// 白底蓝边的搪瓷盆：剖面从外底 → 外壁 → 盆沿 → 内壁 → 内底，旋转一周得到有厚度的浅盆
const BASIN_PROFILE: [number, number][] = [
  [0.001, 0], [0.6, 0], [0.64, 0.02], [0.86, 0.22], [0.885, 0.25],
  [0.865, 0.255], [0.84, 0.235], [0.62, 0.04], [0.57, 0.03], [0.001, 0.03],
];
// 剖面按 0.885 的盆沿半径画，再横向缩放到 SCENE.basin.rim
const BASIN_K = SCENE.basin.rim / 0.885;
const basinGeo = new THREE.LatheGeometry(BASIN_PROFILE.map(([r, y]) => new THREE.Vector2(r * BASIN_K, y)), 64);
const rimGeo = new THREE.TorusGeometry(0.878 * BASIN_K, 0.02, 10, 64);

function Basin({ drag, slots }: { drag: DragRef; slots: BoardSlot[] }) {
  const enamel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.32, side: THREE.DoubleSide }), []);
  const rim = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2f5d9e", roughness: 0.35 }), []);
  useEffect(() => () => rim.dispose(), [rim]);
  useZoneGlow(enamel, "basin", drag, slots);
  const { x, z } = SCENE.basin;
  return (
    <group position={[x, SCENE.counterY, z]}>
      <mesh geometry={basinGeo} material={enamel} />
      <mesh geometry={rimGeo} material={rim} position={[0, 0.252, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

// 区域标题的位置：砧板前沿外、菜盆后沿外的台面上，都不压住食材
const ZONE_ANCHORS: [Zone, THREE.Vector3][] = [
  ["board", new THREE.Vector3(SCENE.board.x, SCENE.counterY, SCENE.board.z + SCENE.board.d / 2 + 0.13)],
  ["basin", new THREE.Vector3(SCENE.basin.x, SCENE.counterY, SCENE.basin.z - SCENE.basin.rim - 0.24)],
];
function ZoneLabels({ labels, drag, slots }: { labels: Map<string, HTMLElement>; drag: DragRef; slots: BoardSlot[] }) {
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const target = dropTarget(drag.current, slots);
    for (const [zone, anchor] of ZONE_ANCHORS) {
      const el = labels.get(`zone:${zone}`);
      if (!el) continue;
      p.copy(anchor).project(camera);
      el.style.transform = `translate(${(((p.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - p.y) / 2) * size.height).toFixed(1)}px) translate(-50%, -50%)`;
      el.style.opacity = "1";
      el.dataset.active = target === zone ? "1" : "0";
    }
  });
  return null;
}

/**
 * 拖动：在食材上按下（R3F 事件）开始跟踪，之后用窗口级指针事件跟手，手指移出画布也不丢。
 * 手机上在食材上按下时阻止页面滚动；按在空处仍可正常上下滑动页面。
 */
function DragController({
  drag,
  items,
  onSelect,
  onDrop,
}: {
  drag: DragRef;
  items: MutableRefObject<THREE.Group | null>;
  onSelect: (name: string | null) => void;
  onDrop: (name: string, x: number, z: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const handlers = useRef({ onSelect, onDrop });
  handlers.current = { onSelect, onDrop };

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const toNdc = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !items.current) return;
      toNdc(t.clientX, t.clientY);
      // 只认食材本身，不认它下面的阴影
      if (ray.intersectObject(items.current, true).some((h) => !h.object.userData.decor)) e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.active = true;
        handlers.current.onSelect(null);
        el.style.cursor = "grabbing";
      }
      toNdc(e.clientX, e.clientY);
      if (ray.ray.intersectPlane(plane, hit)) {
        d.x = THREE.MathUtils.clamp(hit.x, bounds.minX + 0.2, bounds.maxX - 0.2);
        d.z = THREE.MathUtils.clamp(hit.z, bounds.minZ + 0.1, bounds.maxZ - 0.1);
      }
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      el.style.cursor = "";
      if (d.active) handlers.current.onDrop(d.name, d.x, d.z);
      else handlers.current.onSelect(d.name);
      invalidate();
    };
    const onCancel = (e: PointerEvent) => {
      if (drag.current?.pointerId !== e.pointerId) return;
      drag.current = null;
      el.style.cursor = "";
      invalidate();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [gl, camera, invalidate, drag, items]);
  return null;
}

// 柔和的接触阴影：径向渐变贴图，比实时阴影便宜得多
let shadowTexture: THREE.Texture | null = null;
function contactShadow() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(60,30,10,0.55)");
  g.addColorStop(1, "rgba(60,30,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  return shadowTexture;
}
const shadowGeo = new THREE.PlaneGeometry(1, 1);
let shadowMat: THREE.MeshBasicMaterial | null = null;
const anchor = new THREE.Vector3();
const DECOR = { decor: true };

function BoardItem({
  slot,
  selected,
  drag,
  reducedMotion,
  labels,
}: {
  slot: BoardSlot;
  selected: boolean;
  drag: DragRef;
  reducedMotion: boolean;
  labels: Map<string, HTMLElement>;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  // 动画状态放在 ref 里：业务状态（选中、主料）已经在 React 里更新，画面随后追上，不阻塞点击
  const motion = useRef({ x: slot.x, z: slot.z, y: slot.y + (reducedMotion ? 0 : DROP_HEIGHT), vy: 0, s: slot.scale });

  shadowMat ??= new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false });

  useEffect(() => invalidate(), [slot.x, slot.z, slot.main, selected, invalidate]);

  useFrame(({ camera, size }, delta) => {
    const m = motion.current;
    const dt = Math.min(delta, 1 / 30);
    const d = drag.current;
    const dragging = d?.active && d.name === slot.name;
    const tx = dragging ? d.x : slot.x;
    const tz = dragging ? d.z : slot.z;
    const ts = slot.scale * (dragging ? 1.08 : selected ? 1.12 : 1);
    // 跨区移动（砧板 ↔ 菜盆）时先抬高，越过盆沿再落下
    const away = Math.hypot(m.x - tx, m.z - tz);
    const ty = dragging ? DRAG_LIFT : slot.y + (selected ? 0.07 : 0) + Math.min(0.32, away * 0.45);
    // 下落：弹簧 + 落地时轻微回弹
    m.vy += (-120 * (m.y - ty) - 11 * m.vy) * dt;
    m.y += m.vy * dt;
    if (!dragging && m.y < ty && m.vy < 0) {
      m.y = ty;
      m.vy = Math.abs(m.vy) > 0.6 ? -m.vy * 0.3 : 0;
    }
    const follow = dragging ? 30 : reducedMotion ? 60 : 9;
    m.x = THREE.MathUtils.damp(m.x, tx, follow, dt);
    m.z = THREE.MathUtils.damp(m.z, tz, follow, dt);
    m.s = THREE.MathUtils.damp(m.s, ts, 14, dt);

    group.current?.position.set(m.x, m.y, m.z);
    group.current?.scale.setScalar(m.s);
    const ground = zoneAt(m.x, m.z) === "basin" ? SCENE.basin.floorY : zoneAt(m.x, m.z) === "board" ? 0 : SCENE.counterY;
    if (shadow.current) {
      const k = 1 - Math.min(1, Math.max(0, m.y - ground) / DROP_HEIGHT) * 0.6;
      shadow.current.position.set(m.x, ground + 0.003, m.z + 0.04);
      shadow.current.scale.setScalar(0.72 * k * m.s);
    }

    const label = labels.get(slot.name);
    if (label) {
      anchor.set(m.x, m.y, m.z + 0.26 * m.s).project(camera);
      const x = ((anchor.x + 1) / 2) * size.width;
      const y = ((1 - anchor.y) / 2) * size.height;
      label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      label.style.opacity = "1";
    }

    const settled =
      !dragging &&
      Math.abs(m.y - ty) < 0.0005 &&
      Math.abs(m.vy) < 0.001 &&
      Math.abs(m.x - tx) < 0.0005 &&
      Math.abs(m.z - tz) < 0.0005 &&
      Math.abs(m.s - ts) < 0.0005;
    if (!settled) invalidate();
  });

  const press = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.button !== 0 || drag.current) return;
    drag.current = { name: slot.name, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, x: slot.x, z: slot.z };
  };

  return (
    <>
      <mesh ref={shadow} geometry={shadowGeo} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} userData={DECOR} />
      <group
        ref={group}
        onPointerDown={press}
        onPointerOver={() => {
          if (!drag.current) gl.domElement.style.cursor = "grab";
        }}
        onPointerOut={() => {
          if (!drag.current) gl.domElement.style.cursor = "";
        }}
      >
        <IngredientModel kind={slot.kind} />
      </group>
    </>
  );
}
