"use client";

import { useState, useEffect, useCallback } from "react";

const KEY = "robotViewerSettings";

export interface ViewerSettings {
  exposure: number;         // EV: -2 to +2  → toneMappingExposure = 2^exposure
  ambientIntensity: number; // 0-2
  directIntensity: number;  // 0-3
  envMapIntensity: number;  // 0-1
  minRoughness: number;     // 0-1
  bgMode: "dark" | "hdr" | "color";
  bgColor: string;          // hex color
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  exposure: -0.39,
  ambientIntensity: 0.3,
  directIntensity: 1.6,
  envMapIntensity: 0.4,
  minRoughness: 0.45,
  bgMode: "dark",
  bgColor: "#0f172a",
};

function load(): ViewerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
