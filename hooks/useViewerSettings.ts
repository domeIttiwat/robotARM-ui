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
  shadowBlur: number;       // 0.5-10 (floor shadow blur, HQ only)
  jOffsets: number[];       // per-joint display offset in degrees (J1-J6), visual only
  reflectorEnabled: boolean;    // HQ only
  reflectorStrength: number;    // 0-1  (mix strength)
  reflectorGlossiness: number;  // 0-1  (0=blurry/matte, 1=crisp/mirror)
  reflectorColor: string;       // hex color of the floor plane
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
  reflectorEnabled: true,
  reflectorStrength: 0.8,
  reflectorGlossiness: 0.4,
  reflectorColor: "#0a0a1a",
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
