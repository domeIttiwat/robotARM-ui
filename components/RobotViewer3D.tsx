"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Sparkle, Zap, RotateCcw } from "lucide-react";

const MODEL_URL  = "/models/RobotArm.glb";
const HDR_URL    = "/models/ferndale_studio_12_4k.hdr";
const QUALITY_KEY = "robotViewerQuality";
useGLTF.preload(MODEL_URL);

const DEG = Math.PI / 180;

const BASE_AXES: [number, number, number][] = [
  [0, 0, 1],   // J1 — local Z → world Y (base yaw)
  [1, 0, 0],   // J2 — local X → world X (shoulder)
  [1, 0, 0],   // J3 — local X → world X (elbow)
  [0, 1, 0],   // J4 — local Y → world Z (forearm roll)
  [1, 0, 0],   // J5 — local X → world X (wrist pitch)
  [0, 1, 0],   // J6 — local Y → world Z (wrist roll)
];

// ─── Exposure controller (inside Canvas) ─────────────────────────────────────
function ExposureController({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = exposure; }, [gl, exposure]);
  return null;
}

// ─── Reset controller (inside Canvas, watches trigger) ────────────────────────
function ResetController({ trigger }: { trigger: number }) {
  const { controls } = useThree();
  useEffect(() => {
    if (trigger > 0) (controls as { reset?: () => void } | null)?.reset?.();
  }, [trigger, controls]);
  return null;
}

// ─── Soft env-reflection setup ────────────────────────────────────────────────
function EnvReflectionSetup({ intensity }: { intensity: number }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (!mat || !("envMapIntensity" in mat)) return;
          const m = mat as THREE.MeshStandardMaterial;
          m.envMapIntensity = intensity;
          // keep roughness ≥ 0.45 so reflections stay blurry
          if (m.roughness < 0.45) m.roughness = 0.45;
          m.needsUpdate = true;
        });
      }
    });
  }, [scene, intensity]);
  return null;
}

// ─── Inner scene ──────────────────────────────────────────────────────────────
function RobotScene({ joints, flips }: { joints: number[]; flips: number[] }) {
  const { scene } = useGLTF(MODEL_URL);
  const nodeRefs = useRef<(THREE.Object3D | null)[]>([null, null, null, null, null, null]);

  useEffect(() => {
    ["J1", "J2", "J3", "J4", "J5", "J6"].forEach((name, i) => {
      nodeRefs.current[i] = scene.getObjectByName(name) ?? null;
    });
  }, [scene]);

  useFrame(() => {
    joints.forEach((deg, i) => {
      const node = nodeRefs.current[i];
      if (!node) return;
      const [ax, ay, az] = BASE_AXES[i];
      const rad = deg * DEG * flips[i];
      node.rotation.set(ax * rad, ay * rad, az * rad);
    });
  });

  return <primitive object={scene} />;
}

function Loader() {
  return (
    <mesh>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial color="#334155" />
    </mesh>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface RobotViewer3DProps {
  joints?: number[];
  flips?: number[];
  className?: string;
}

export default function RobotViewer3D({
  joints = [0, 0, 0, 0, 0, 0],
  flips  = [1, 1, 1, 1, 1, 1],
  className,
}: RobotViewer3DProps) {
  const [hq, setHq] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(QUALITY_KEY);
    return stored === null ? true : stored === "true";
  });
  const [resetTrigger, setResetTrigger] = useState(0);

  const toggleHq = () => {
    setHq((prev) => {
      const next = !prev;
      localStorage.setItem(QUALITY_KEY, String(next));
      return next;
    });
  };

  return (
    <div className={`w-full h-full relative ${className ?? ""}`} style={{ background: "#0f172a" }}>
      {/* Overlay buttons */}
      <div className="absolute top-3 right-3 z-10 flex gap-2 pointer-events-none">
        <button
          onClick={() => setResetTrigger((n) => n + 1)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
          title="Reset view"
        >
          <RotateCcw size={12} /> Reset View
        </button>
        <button
          onClick={toggleHq}
          className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold backdrop-blur-sm transition-colors ${
            hq
              ? "bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300"
              : "bg-white/10 hover:bg-white/20 text-white/50"
          }`}
          title={hq ? "High Quality (คลิกเพื่อปิด HDR)" : "Low Quality (คลิกเพื่อเปิด HDR)"}
        >
          {hq ? <Sparkle size={12} /> : <Zap size={12} />}
          {hq ? "HQ" : "LQ"}
        </button>
      </div>

      <Canvas
        camera={{ position: [1.0, 0.8, 1.0], fov: 45 }}
        shadows={hq}
        gl={{ antialias: hq }}
      >
        {hq ? (
          <>
            <ambientLight intensity={0.3} />
            <directionalLight position={[4, 8, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
          </>
        ) : (
          <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[4, 8, 4]} intensity={1.4} />
            <pointLight position={[-2, 2, -2]} intensity={0.5} color="#93c5fd" />
            <pointLight position={[2, 0.5, 2]} intensity={0.3} color="#fde68a" />
          </>
        )}

        <Suspense fallback={<Loader />}>
          {hq && <Environment files={HDR_URL} background={false} />}
          {hq && <EnvReflectionSetup intensity={0.4} />}
          <RobotScene joints={joints} flips={flips} />
          {hq && <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={3} blur={1.5} color="#000000" />}
        </Suspense>

        <ExposureController exposure={hq ? 0.763 : 1.0} />
        <OrbitControls enablePan={false} minDistance={0.4} maxDistance={5} target={[0, 0.3, 0]} makeDefault />
        <ResetController trigger={resetTrigger} />
        <gridHelper args={[3, 20, "#1e3a5f", "#0f2847"]} />
      </Canvas>
    </div>
  );
}
