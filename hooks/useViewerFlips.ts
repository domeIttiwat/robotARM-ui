"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "robotViewerFlips";
const DEFAULT_FLIPS = [1, 1, 1, 1, 1, 1]; // +1 = normal, -1 = flipped

function loadFlips(): number[] {
  if (typeof window === "undefined") return DEFAULT_FLIPS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLIPS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 6) return parsed;
  } catch {}
  return DEFAULT_FLIPS;
}

export function useViewerFlips() {
  const [flips, setFlipsState] = useState<number[]>(DEFAULT_FLIPS);

  // Load from localStorage on mount (client-only)
  useEffect(() => {
    setFlipsState(loadFlips());
  }, []);

  const setFlips = useCallback((next: number[]) => {
    setFlipsState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleFlip = useCallback((index: number) => {
    setFlipsState((prev) => {
      const next = [...prev];
      next[index] = prev[index] === 1 ? -1 : 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { flips, setFlips, toggleFlip };
}
