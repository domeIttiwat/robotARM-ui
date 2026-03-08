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
