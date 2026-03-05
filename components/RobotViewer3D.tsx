"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/RobotArm.glb";
useGLTF.preload(MODEL_URL);

const DEG = Math.PI / 180;

// Local rotation axis for each joint (J1–J6) based on the GLB node hierarchy.
// J1 = base yaw (Y), J2–J6 = arm elevation links (Z in local space).
// Adjust sign (+1 / -1) if a joint moves in the opposite direction on hardware.
const JOINT_AXES: [number, number, number][] = [
  [0,  1, 0],   // J1 — base rotation (Y)
  [0,  0, 1],   // J2 — shoulder (Z)
  [0,  0, 1],   // J3 — elbow (Z)
  [1,  0, 0],   // J4 — forearm roll (X)
  [0,  0, 1],   // J5 — wrist pitch (Z)
  [1,  0, 0],   // J6 — wrist roll (X)
];

// ─── Inner scene (must live inside <Canvas>) ─────────────────────────────────
function RobotScene({ joints }: { joints: number[] }) {
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
      const [ax, ay, az] = JOINT_AXES[i];
      const rad = deg * DEG;
      node.rotation.set(ax * rad, ay * rad, az * rad);
    });
  });

  return <primitive object={scene} />;
}

// ─── Loading fallback ─────────────────────────────────────────────────────────
function Loader() {
  return (
    <mesh>
      <boxGeometry args={[0.05, 0.05, 0.05]} />
      <meshStandardMaterial color="#334155" />
    </mesh>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
export interface RobotViewer3DProps {
  joints?: number[];
  className?: string;
}

export default function RobotViewer3D({ joints = [0, 0, 0, 0, 0, 0], className }: RobotViewer3DProps) {
  return (
    <div className={`w-full h-full ${className ?? ""}`} style={{ background: "#0f172a" }}>
      <Canvas
        camera={{ position: [1.0, 0.8, 1.0], fov: 45 }}
        shadows
        gl={{ antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[4, 8, 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.1}
          shadow-camera-far={20}
        />
        <pointLight position={[-2, 2, -2]} intensity={0.5} color="#93c5fd" />
        <pointLight position={[2, 0.5, 2]} intensity={0.3} color="#fde68a" />

        {/* Model */}
        <Suspense fallback={<Loader />}>
          <RobotScene joints={joints} />
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.5}
            scale={3}
            blur={1.5}
            color="#000000"
          />
        </Suspense>

        {/* Controls */}
        <OrbitControls
          enablePan={false}
          minDistance={0.4}
          maxDistance={5}
          target={[0, 0.3, 0]}
          makeDefault
        />

        {/* Grid floor */}
        <gridHelper args={[3, 20, "#1e3a5f", "#0f2847"]} />
      </Canvas>
    </div>
  );
}
