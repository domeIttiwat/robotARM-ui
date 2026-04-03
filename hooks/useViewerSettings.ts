"use client";

import { useState, useEffect, useCallback } from "react";

const KEY = "robotViewerSettings";

export interface ViewerSettings {
  exposure: number;         // EV: -2 to +2  → toneMappingExposure = 2^exposure
  ambientIntensity: number; // 0-2
  directIntensity: number;  // 0-3
  envMapIntensity: number;  // 0-1  (HDR reflection strength)
  minRoughness: number;     // 0-1  (direct roughness applied to all materials)
  metallic: number;         // 0-1  (metalness applied to all materials)
  bgMode: "dark" | "hdr" | "color";
  bgColor: string;          // hex color
  matColors: Record<string, string>; // material name → hex color (keyed by actual GLB material name)
  shadowOpacity: number;    // 0-1  (floor shadow opacity, HQ only)
  shadowBlur: number;       // 0.1-10 (floor shadow blur, HQ only)
  jOffsets: number[];       // per-joint display offset in degrees (J1-J6), visual only
  hdrFile: string;          // filename of the active HDR environment map in /models/
  fogEnabled: boolean;
  fogType: "linear" | "exp";
  fogColor: string;
  fogNear: number;              // linear fog start distance
  fogFar: number;               // linear fog end distance
  fogDensity: number;           // exponential fog density
  aoEnabled: boolean;           // HQ only — screen-space ambient occlusion
  aoIntensity: number;          // 0-1
  motionBlurEnabled: boolean;   // HQ only — afterimage motion blur
  motionBlurStrength: number;   // 0-0.98 (AfterimagePass damp value)
  // ── Collision / skeleton settings ────────────────────────────────────────
  capsulesVisible: boolean;      // show glow capsules around robot segments
  capsuleRadiusWarn: number;    // outer warn-zone radius (m) — robot slows
  capsuleRadiusStop: number;    // inner stop-zone radius (m) — robot stops
  skeletonVisible: boolean;     // show human body glow overlay in 3D
  skeletonMockMode: boolean;    // use generated mock skeleton (no real WS data needed)
  skeletonMockX: number;        // mock person X position in meters
  skeletonMockZ: number;        // mock person Z position in meters
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  exposure: -0.39,
  ambientIntensity: 0.3,
  directIntensity: 1.6,
  envMapIntensity: 0.4,
  minRoughness: 0.45,
  metallic: 0.5,
  bgMode: "dark",
  bgColor: "#0f172a",
  matColors: {},  // empty = use original GLTF material colors
  shadowOpacity: 0.5,
  shadowBlur: 1.5,
  jOffsets: [0, 0, 0, 0, 0, 0],
  hdrFile: "ferndale_studio_12_4k.hdr",
  fogEnabled: false,
  fogType: "linear",
  fogColor: "#0f172a",
  fogNear: 2.0,
  fogFar: 8.0,
  fogDensity: 0.15,
  aoEnabled: false,
  aoIntensity: 0.5,
  motionBlurEnabled: false,
  motionBlurStrength: 0.7,
  // Collision / skeleton defaults
  capsulesVisible:    true,
  capsuleRadiusWarn:  0.35,
  capsuleRadiusStop:  0.18,
  skeletonVisible:   true,
  skeletonMockMode:  false,
  skeletonMockX:     0.6,
  skeletonMockZ:     0.6,
};

function load(): ViewerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // Deep-merge matColors (Record<string,string>)
      matColors: { ...DEFAULT_SETTINGS.matColors, ...parsed.matColors },
      jOffsets:  parsed.jOffsets ?? DEFAULT_SETTINGS.jOffsets,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useViewerSettings() {
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_SETTINGS);

  useEffect(() => { setSettings(load()); }, []);

  const update = useCallback((patch: Partial<ViewerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, reset };
}
