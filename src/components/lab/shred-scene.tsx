"use client";

// 土豆切丝教学动画（原型）。画面完全由 src/lib/shred-timeline.ts 按时间算出，这里只负责把位置写进 three.js。
// 不做布尔切割：土豆本体用裁剪平面一点点“变短”，码好的片子同样用裁剪平面让位给预先算好的丝。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  knifeAt,
  phaseAt,
  POTATO,
  potatoBodyAt,
  SHRED,
  shredClipAt,
  slicePoseAt,
  stripPoseAt,
  T,
  W,
  type PhaseId,
} from "@/lib/shred-timeline";

export interface ShredSceneProps {
  /** 当前时间（秒），由外壳持有；播放时场景每帧推进 */
  time: MutableRefObject<number>;
  playing: boolean;
  speed: number;
  /** 外壳跳转、拖动进度条时递增，让场景重画一帧 */
  seek: number;
  onTime: (t: number, phase: PhaseId) => void;
  onEnd: () => void;
  onReady: () => void;
  onFail: () => void;
  /** 尺寸标注（HTML），位置由场景每帧投影写入 */
  labels: { slices: RefObject<HTMLElement | null>; strips: RefObject<HTMLElement | null> };
}

const COLORS = { flesh: "#f3e4b4", skin: "#8a6238", board: "#c8955b", blade: "#d5dade", handle: "#5b3a24" };

export default function ShredScene(props: ShredSceneProps) {
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
      gl={{ antialias: true, alpha: true, powerPreference: "low-power", localClippingEnabled: true }}
      camera={{ fov: 30, near: 0.1, far: 30 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (alive.current) props.onFail();
        });
        requestAnimationFrame(props.onReady);
      }}
      aria-hidden
    >
      <hemisphereLight args={["#fff6e8", "#8a5a33", 1.4]} />
      <directionalLight position={[-1.5, 4, 3]} intensity={1.8} color="#fff1dc" />
      <FitCamera />
      <Clock {...props} />
      <Board />
      <Potato time={props.time} />
      <Slices time={props.time} />
      <Strips time={props.time} />
      <Knife time={props.time} />
      <Labels time={props.time} labels={props.labels} />
    </Canvas>
  );
}

// 从右前方斜看：既能看到刀面，也能看清丝的粗细
const CAMERA_DIR = new THREE.Vector3(0.75, 1.15, 1.35).normalize();
const TARGET = new THREE.Vector3(0.15, 0.1, -0.3);
function FitCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(5.2, 2.3 / (tanHalf * aspect));
    camera.position.copy(CAMERA_DIR).multiplyScalar(d).add(TARGET);
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
  return null;
}

/** 推进时间；播放时持续请求下一帧，暂停时只在跳转后画一帧 */
function Clock({ time, playing, speed, seek, onTime, onEnd }: ShredSceneProps) {
  const invalidate = useThree((s) => s.invalidate);
  const lastReport = useRef({ at: -1, phase: "" });
  useEffect(() => invalidate(), [seek, playing, invalidate]);
  useFrame((_, delta) => {
    if (playing) {
      // 单帧最多推进 1/8 秒：低帧率手机上仍按真实时间播放，切回前台时也不会一下跳过一大段
      time.current = Math.min(SHRED.total, time.current + Math.min(delta, 1 / 8) * speed);
      if (time.current >= SHRED.total) onEnd();
      else invalidate();
    }
    const t = time.current;
    const phase = phaseAt(t).id;
    // 外壳的字幕和进度条不需要每帧更新
    if (phase !== lastReport.current.phase || Math.abs(t - lastReport.current.at) > 0.1 || !playing) {
      lastReport.current = { at: t, phase };
      onTime(t, phase);
    }
  }, -1);
  return null;
}

function Board() {
  const geo = useMemo(() => new RoundedBoxGeometry(4.8, 0.16, 3, 4, 0.07), []);
  return (
    <mesh geometry={geo} position={[0.1, -0.08, -0.2]}>
      <meshStandardMaterial color={COLORS.board} roughness={0.85} />
    </mesh>
  );
}

function ellipseAt(x: number) {
  const s = Math.sqrt(Math.max(0, 1 - (x / POTATO.halfLen) ** 2));
  return { a: POTATO.halfHeight * s, b: POTATO.halfWidth * s };
}

/** 土豆本体：椭球 + 裁剪平面保留 x < cutX，切面补一块果肉色的椭圆 */
function Potato({ time }: { time: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const cap = useRef<THREE.Mesh>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  const skin = useMemo(
    () => new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.9, clippingPlanes: [plane], side: THREE.DoubleSide }),
    [plane],
  );
  useFrame(() => {
    const p = potatoBodyAt(time.current);
    group.current?.position.set(p.offsetX, 0, p.offsetZ);
    plane.constant = p.cutX + p.offsetX;
    const { a, b } = ellipseAt(p.cutX);
    cap.current?.position.set(p.cutX, POTATO.centerY, 0);
    cap.current?.scale.set(b, a, 1);
  });
  return (
    <group ref={group}>
      <mesh material={skin} position={[0, POTATO.centerY, 0]} scale={[POTATO.halfLen, POTATO.halfHeight, POTATO.halfWidth]}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <mesh ref={cap} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color={COLORS.flesh} roughness={0.6} />
      </mesh>
    </group>
  );
}

/** 切下的片子：椭圆薄片，上下面是果肉、侧边一圈土豆皮。切丝时保留 x > clipX 的部分 */
function Slices({ time }: { time: MutableRefObject<number> }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 1000), []);
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: COLORS.flesh, roughness: 0.6, clippingPlanes: [plane], side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.9, clippingPlanes: [plane], side: THREE.DoubleSide }),
    ],
    [plane],
  );
  const geometries = useMemo(
    () =>
      SHRED.slices.map((s) => {
        const shape = new THREE.Shape();
        shape.absellipse(0, 0, s.a, s.b, 0, Math.PI * 2, false, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 40 });
        // 平放：椭圆在 xz 平面，厚度沿 y 居中
        g.rotateX(Math.PI / 2);
        g.translate(0, T / 2, 0);
        return g;
      }),
    [],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  useFrame(() => {
    const t = time.current;
    const clip = shredClipAt(t);
    plane.constant = clip === null ? 1000 : -clip;
    SHRED.slices.forEach((_, k) => {
      const mesh = refs.current[k];
      if (!mesh) return;
      const p = slicePoseAt(k, t);
      mesh.visible = p.free;
      mesh.position.set(p.x, p.y, 0);
      mesh.rotation.set(0, 0, p.rotZ);
    });
  });

  return SHRED.slices.map((s, k) => (
    <mesh
      key={s.index}
      ref={(m) => {
        refs.current[k] = m;
      }}
      geometry={geometries[k]}
      material={materials}
    />
  ));
}

/** 丝：一个 InstancedMesh，每根按时间轴决定是否出现、倾倒和散开 */
function Strips({ time }: { time: MutableRefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    SHRED.strips.forEach((strip, i) => {
      const pose = stripPoseAt(strip, time.current);
      if (!pose.visible) tmp.s.set(0, 0, 0);
      else tmp.s.set(W * 0.92, T, strip.length);
      // 绕底边倾倒，而不是绕中心转
      tmp.p.set(pose.x - Math.sin(pose.rotZ) * (T / 2), pose.y - T / 2 + Math.cos(pose.rotZ) * (T / 2), pose.z);
      tmp.q.setFromEuler(tmp.e.set(0, 0, pose.rotZ));
      im.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SHRED.strips.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={COLORS.flesh} roughness={0.55} />
    </instancedMesh>
  );
}

/** 菜刀：刀刃沿 z，刀柄朝镜头一侧。位置的 y 是刃口高度 */
function Knife({ time }: { time: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = knifeAt(time.current);
    group.current?.position.set(k.x, k.y, -0.1);
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.014, 0.84, 1.9]} />
        <meshStandardMaterial color={COLORS.blade} metalness={0.25} roughness={0.32} />
      </mesh>
      {/* 刃口一道亮线，让刀落在哪里更清楚 */}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.016, 0.024, 1.9]} />
        <meshStandardMaterial color="#f4f6f8" metalness={0.1} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.66, 1.33]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.07, 0.17, 0.8]} />
        <meshStandardMaterial color={COLORS.handle} roughness={0.7} />
      </mesh>
    </group>
  );
}

/** 两处尺寸标注：片子倒下后标厚度，切完后标丝的粗细和长度 */
function Labels({ time, labels }: { time: MutableRefObject<number>; labels: ShredSceneProps["labels"] }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const t = time.current;
    const place = (el: HTMLElement | null, x: number, y: number, z: number, show: boolean) => {
      if (!el) return;
      v.set(x, y, z).project(camera);
      el.style.transform = `translate(${(((v.x + 1) / 2) * size.width).toFixed(1)}px, ${(((1 - v.y) / 2) * size.height).toFixed(1)}px) translate(-50%, -100%)`;
      el.style.opacity = show ? "1" : "0";
    };
    const slicePhase = SHRED.phases[0];
    const first = slicePoseAt(0, t);
    place(labels.slices.current, first.x, first.y + 0.35, 0.45, t > SHRED.slicing[1].cut && t < slicePhase.end + 0.6);
    place(labels.strips.current, 0.35, 0.12, 0.75, t > SHRED.shredEnd + 0.6);
  });
  return null;
}
