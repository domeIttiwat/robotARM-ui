"use client";

import { Suspense, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/RobotArm.glb";
const HDR_URL   = "/models/ferndale_studio_12_4k.hdr";
useGLTF.preload(MODEL_URL);

function SplashScene() {
  const { scene } = useGLTF(MODEL_URL);

  // Slow gentle sway — tilt up/down slightly while spinning
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    scene.rotation.y = t * 0.25;
    scene.rotation.x = Math.sin(t * 0.15) * 0.06;
  });

  return <primitive object={scene} />;
}

// Point camera at mid-height of the robot and set exposure
function CameraSetup() {
  const { camera, gl } = useThree();
  useEffect(() => {
    camera.lookAt(0, 0.35, 0);
    gl.toneMappingExposure = 0.85;
  }, [camera, gl]);
  return null;
}

function MaterialSetup() {
  const { scene } = useThree();
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (!mat || !("envMapIntensity" in mat)) return;
          const m = mat as THREE.MeshStandardMaterial;
          m.envMapIntensity = 0.55;
          if (m.roughness < 0.4) m.roughness = 0.4;
          m.needsUpdate = true;
        });
      }
    });
  }, [scene]);
  return null;
}

export default function SplashRobotViewer() {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0.75, 0.55, 0.75], fov: 52 }}
        gl={{ antialias: true }}
        shadows
      >
        <CameraSetup />
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 8, 4]} intensity={1.5} castShadow />

        <Suspense fallback={null}>
          <Environment files={HDR_URL} background={false} />
          <MaterialSetup />
          <SplashScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
