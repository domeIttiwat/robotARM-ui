"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Sparkle, Zap, RotateCcw } from "lucide-react";
import { useViewerSettings, DEFAULT_SETTINGS, ViewerSettings } from "@/hooks/useViewerSettings";

const MODEL_URL   = "/models/RobotArm2.glb";
const HDR_URL     = "/models/ferndale_studio_12_4k.hdr";
const QUALITY_KEY = "robotViewerQuality";
useGLTF.preload(MODEL_URL);

const DEG = Math.PI / 180;

const BASE_AXES: [number, number, number][] = [
  [0, 0, 1],   // J1
  [1, 0, 0],   // J2
  [1, 0, 0],   // J3
  [0, 1, 0],   // J4
  [1, 0, 0],   // J5
  [0, 1, 0],   // J6
];

// ─── Exposure controller ──────────────────────────────────────────────────────
function ExposureController({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = exposure; }, [gl, exposure]);
  return null;
}

// ─── Background controller ────────────────────────────────────────────────────
function BackgroundController({ bgMode, bgColor }: { bgMode: ViewerSettings["bgMode"]; bgColor: string }) {
  const { scene } = useThree();
  useEffect(() => {
    if (bgMode !== "hdr") scene.background = new THREE.Color(bgColor);
    return () => { scene.background = null; };
  }, [scene, bgMode, bgColor]);
  return null;
}

// ─── Reset controller ─────────────────────────────────────────────────────────
function ResetController({ trigger }: { trigger: number }) {
  const { controls } = useThree();
  useEffect(() => {
    if (trigger > 0) (controls as { reset?: () => void } | null)?.reset?.();
  }, [trigger, controls]);
  return null;
}

// ─── Material controller ──────────────────────────────────────────────────────
// Discovers real material names from the loaded GLB, reports them via callback,
// then applies per-material colour overrides + shared surface properties.
// Must sit inside <Suspense> after <RobotScene> so meshes are in the Three.js scene.
function MaterialController({
  matColors,
  metallic, roughness, envMapIntensity,
  onDiscovered,
}: {
  matColors: Record<string, string>;
  metallic: number;
  roughness: number;
  envMapIntensity: number;
  onDiscovered?: (names: string[]) => void;
}) {
  const { scene } = useThree();
  const reportedRef    = useRef<string>("");
  const matColorsRef   = useRef(matColors);
  const metallicRef    = useRef(metallic);
  const roughnessRef   = useRef(roughness);
  const envMapRef      = useRef(envMapIntensity);
  const onDiscoveredRef = useRef(onDiscovered);

  // Keep refs current every render (no extra effects needed)
  matColorsRef.current    = matColors;
  metallicRef.current     = metallic;
  roughnessRef.current    = roughness;
  envMapRef.current       = envMapIntensity;
  onDiscoveredRef.current = onDiscovered;

  // Apply material properties every frame so color-picker drags are instant
  useFrame(() => {
    const names: string[] = [];

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!mat) return;
        const m = mat as THREE.MeshStandardMaterial;

        if (m.name && !names.includes(m.name)) names.push(m.name);

        if (m.name && m.name in matColorsRef.current && "color" in m)
          m.color.set(matColorsRef.current[m.name]);

        if ("metalness"       in m) m.metalness      = metallicRef.current;
        if ("roughness"       in m) m.roughness       = roughnessRef.current;
        if ("envMapIntensity" in m) m.envMapIntensity = envMapRef.current;
      });
    });

    const key = names.slice().sort().join(",");
    if (key !== reportedRef.current && names.length > 0) {
      reportedRef.current = key;
      onDiscoveredRef.current?.(names);
    }
  });

  return null;
}

// ─── Robot joints animation ───────────────────────────────────────────────────
function RobotScene({ joints, flips, offsets }: { joints: number[]; flips: number[]; offsets: number[] }) {
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
      const rad = (deg + (offsets[i] ?? 0)) * DEG * flips[i];
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
  /** If provided, always use HQ mode with these exact settings (used by config page preview) */
  settingsOverride?: ViewerSettings;
  /** Called once (and on model reload) with the list of material names found in the GLB */
  onMaterialsDiscovered?: (names: string[]) => void;
}

export default function RobotViewer3D({
  joints = [0, 0, 0, 0, 0, 0],
  flips  = [1, 1, 1, 1, 1, 1],
  className,
  settingsOverride,
  onMaterialsDiscovered,
}: RobotViewer3DProps) {
  const { settings: storedSettings } = useViewerSettings();

  const [hq, setHq] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(QUALITY_KEY);
    return stored === null ? true : stored === "true";
  });
  const [resetTrigger, setResetTrigger] = useState(0);

  const isHQ = settingsOverride != null || hq;
  const s    = settingsOverride ?? storedSettings;

  const toggleHq = () => {
    setHq((prev) => {
      const next = !prev;
      localStorage.setItem(QUALITY_KEY, String(next));
      return next;
    });
  };

  const canvasBg = s.bgMode !== "hdr" ? s.bgColor : "#0f172a";

  return (
    <div className={`w-full h-full relative ${className ?? ""}`} style={{ background: canvasBg }}>
      {!settingsOverride && (
        <div className="absolute top-3 right-3 z-10 flex gap-2 pointer-events-none">
          <button
            onClick={() => setResetTrigger((n) => n + 1)}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
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
          >
            {hq ? <Sparkle size={12} /> : <Zap size={12} />}
            {hq ? "HQ" : "LQ"}
          </button>
        </div>
      )}

      <Canvas camera={{ position: [1.0, 0.8, 1.0], fov: 45 }} shadows={isHQ} gl={{ antialias: isHQ }}>
        <BackgroundController bgMode={s.bgMode} bgColor={s.bgColor} />

        {isHQ ? (
          <>
            <ambientLight intensity={s.ambientIntensity} />
            <directionalLight position={[4, 8, 4]} intensity={s.directIntensity} castShadow shadow-mapSize={[1024, 1024]} />
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
          {isHQ && <Environment files={HDR_URL} background={s.bgMode === "hdr"} />}

          <RobotScene joints={joints} flips={flips} offsets={s.jOffsets ?? DEFAULT_SETTINGS.jOffsets} />

          <MaterialController
            matColors={s.matColors ?? {}}
            metallic={s.metallic ?? DEFAULT_SETTINGS.metallic}
            roughness={s.minRoughness}
            envMapIntensity={isHQ ? s.envMapIntensity : 0}
            onDiscovered={onMaterialsDiscovered}
          />

          {isHQ && (
            <ContactShadows
              position={[0, 0, 0]}
              opacity={s.shadowOpacity ?? DEFAULT_SETTINGS.shadowOpacity}
              scale={3}
              blur={s.shadowBlur ?? DEFAULT_SETTINGS.shadowBlur}
              color="#000000"
            />
          )}

        </Suspense>

        <ExposureController exposure={isHQ ? Math.pow(2, s.exposure) : 1.0} />
        <OrbitControls enablePan={false} minDistance={0.4} maxDistance={5} target={[0, 0.3, 0]} makeDefault />
        <ResetController trigger={resetTrigger} />
        <gridHelper args={[3, 20, "#1e3a5f", "#0f2847"]} />
      </Canvas>
    </div>
  );
}
