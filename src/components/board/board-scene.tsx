"use client";

// 3D 砧板场景（docs/xiaozao-3d-interaction-plan.md 第 4.3、9、12 节）。只由 kitchen-board.tsx 按需加载，
// three.js 不进入首页主包。镜头固定、无实时阴影；按需渲染（frameloop="demand"），只有动画进行中才逐帧绘制。
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { BoardSlot } from "@/lib/board-layout";
import { IngredientModel } from "./ingredient-models";

export interface BoardSceneProps {
  slots: BoardSlot[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  reducedMotion: boolean;
  /**
   * 食材名称标签（HTML，由外壳渲染在画布上方）。场景每帧把食材位置投影到屏幕，直接改写标签的 transform，
   * 不经过 React 状态，也不为每个标签单独建 React 根。
   */
  labels: Map<string, HTMLElement>;
  /** 场景已画出第一帧 */
  onReady: () => void;
  /** WebGL 上下文丢失等无法继续的情况 */
  onFail: (reason: string) => void;
}

const DROP_HEIGHT = 1.5;

export default function BoardScene(props: BoardSceneProps) {
  // 卸载时 R3F 会主动丢弃上下文，同样触发 webglcontextlost；那不是故障，不能当成失败回退
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [0, 2.7, 2.55], fov: 30, near: 0.1, far: 20 }}
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
      <Board />
      {props.slots.map((s) => (
        <BoardItem
          key={s.name}
          slot={s}
          selected={props.selected === s.name}
          onSelect={props.onSelect}
          reducedMotion={props.reducedMotion}
          labels={props.labels}
        />
      ))}
    </Canvas>
  );
}

// 镜头方向固定；窄屏（手机竖屏）时按宽高比把镜头拉远，保证整块砧板左右都在画面内
const CAMERA_DIR = new THREE.Vector3(0, 2.7, 2.55).normalize();
const BASE_DISTANCE = 3.71;
const HALF_WIDTH = 1.9;
function FitCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(BASE_DISTANCE, HALF_WIDTH / (tanHalf * aspect));
    camera.position.copy(CAMERA_DIR).multiplyScalar(d);
    camera.lookAt(0, 0, 0.08);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

const boardGeo = new RoundedBoxGeometry(3.5, 0.16, 1.95, 4, 0.07);
const boardMat = new THREE.MeshStandardMaterial({ color: "#c8955b", roughness: 0.85 });
const grooveMat = new THREE.MeshStandardMaterial({ color: "#b07d47", roughness: 0.9 });
const grooveGeo = new THREE.RingGeometry(0.1, 0.135, 4, 1);

function Board() {
  return (
    <group>
      <mesh geometry={boardGeo} material={boardMat} position={[0, -0.08, 0]} />
      {/* 挂绳孔，让它一眼看出是砧板 */}
      <mesh geometry={grooveGeo} material={grooveMat} position={[1.48, 0.002, -0.66]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} scale={[0.55, 0.55, 1]} />
    </group>
  );
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
const ringGeo = new THREE.RingGeometry(0.3, 0.345, 48);
const ringMats = new Map<string, THREE.MeshBasicMaterial>();
const anchor = new THREE.Vector3();
/** 标签放在食材前方（靠近镜头一侧） */
const LABEL_OFFSET_Z = 0.3;

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function BoardItem({
  slot,
  selected,
  onSelect,
  reducedMotion,
  labels,
}: {
  slot: BoardSlot;
  selected: boolean;
  onSelect: (name: string) => void;
  reducedMotion: boolean;
  labels: Map<string, HTMLElement>;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  // 动画状态放在 ref 里：业务状态（选中、主料）已经在 React 里更新，画面随后追上，不阻塞点击
  const motion = useRef({ x: slot.x, z: slot.z, y: reducedMotion ? 0 : DROP_HEIGHT, vy: 0, s: 1 });

  shadowMat ??= new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false });
  // 主料圈与界面主色一致（深色模式下读到的是深色主题的值）
  const accent = cssColor("--primary", "#b5421a");
  let ringMat = ringMats.get(accent);
  if (!ringMat) ringMats.set(accent, (ringMat = new THREE.MeshBasicMaterial({ color: accent })));

  useEffect(() => invalidate(), [slot.x, slot.z, slot.main, selected, invalidate]);

  useFrame(({ camera, size }, delta) => {
    const m = motion.current;
    const dt = Math.min(delta, 1 / 30);
    const lift = selected ? 0.07 : 0;
    // 下落：弹簧 + 落到砧板时轻微回弹
    m.vy += (-120 * (m.y - lift) - 11 * m.vy) * dt;
    m.y += m.vy * dt;
    if (m.y < lift && m.vy < 0) {
      m.y = lift;
      m.vy = Math.abs(m.vy) > 0.6 ? -m.vy * 0.3 : 0;
    }
    m.x = THREE.MathUtils.damp(m.x, slot.x, reducedMotion ? 60 : 10, dt);
    m.z = THREE.MathUtils.damp(m.z, slot.z, reducedMotion ? 60 : 10, dt);
    m.s = THREE.MathUtils.damp(m.s, selected ? 1.12 : 1, 14, dt);

    group.current?.position.set(m.x, m.y, m.z);
    group.current?.scale.setScalar(m.s);
    if (shadow.current) {
      const k = 1 - Math.min(1, m.y / DROP_HEIGHT) * 0.6;
      shadow.current.position.set(m.x, 0.003, m.z + 0.04);
      shadow.current.scale.setScalar(0.72 * k * m.s);
    }
    ring.current?.position.set(m.x, 0.004, m.z);

    const label = labels.get(slot.name);
    if (label) {
      anchor.set(m.x, m.y, m.z + LABEL_OFFSET_Z).project(camera);
      const x = ((anchor.x + 1) / 2) * size.width;
      const y = ((1 - anchor.y) / 2) * size.height;
      label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      label.style.opacity = "1";
    }

    const settled =
      Math.abs(m.y - lift) < 0.0005 &&
      Math.abs(m.vy) < 0.001 &&
      Math.abs(m.x - slot.x) < 0.0005 &&
      Math.abs(m.z - slot.z) < 0.0005 &&
      Math.abs(m.s - (selected ? 1.12 : 1)) < 0.0005;
    if (!settled) invalidate();
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(slot.name);
  };

  return (
    <>
      <mesh ref={shadow} geometry={shadowGeo} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} />
      {slot.main && <mesh ref={ring} geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[slot.x, 0.004, slot.z]} />}
      <group
        ref={group}
        onClick={pick}
        onPointerOver={() => (gl.domElement.style.cursor = "pointer")}
        onPointerOut={() => (gl.domElement.style.cursor = "")}
      >
        <IngredientModel kind={slot.kind} />
      </group>
    </>
  );
}
