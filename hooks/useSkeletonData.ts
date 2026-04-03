"use client";

import { useEffect, useRef, useState } from "react";
import type { SkeletonPayload, SkeletonPerson, SkeletonKeypoint } from "@/types/skeleton";

// ─── Mock skeleton generator ──────────────────────────────────────────────────
// Generates a standing person of ~1.7m height at world position (x, z).
// Y-axis is up. All coordinates are in meters.
export function generateMockPerson(x: number, z: number, heightM = 1.70): SkeletonPerson {
  const h = heightM;
  const ground = 0;

  // Proportional offsets (fraction of height)
  const nose:    SkeletonKeypoint = { x,               y: ground + h * 0.94, z, visibility: 1 };
  const lShould: SkeletonKeypoint = { x: x - 0.22,     y: ground + h * 0.80, z, visibility: 1 };
  const rShould: SkeletonKeypoint = { x: x + 0.22,     y: ground + h * 0.80, z, visibility: 1 };
  const lElbow:  SkeletonKeypoint = { x: x - 0.32,     y: ground + h * 0.62, z, visibility: 1 };
  const rElbow:  SkeletonKeypoint = { x: x + 0.32,     y: ground + h * 0.62, z, visibility: 1 };
  const lWrist:  SkeletonKeypoint = { x: x - 0.30,     y: ground + h * 0.44, z, visibility: 1 };
  const rWrist:  SkeletonKeypoint = { x: x + 0.30,     y: ground + h * 0.44, z, visibility: 1 };
  const lHip:    SkeletonKeypoint = { x: x - 0.13,     y: ground + h * 0.52, z, visibility: 1 };
  const rHip:    SkeletonKeypoint = { x: x + 0.13,     y: ground + h * 0.52, z, visibility: 1 };
  const lAnkle:  SkeletonKeypoint = { x: x - 0.09,     y: ground + h * 0.04, z, visibility: 1 };
  const rAnkle:  SkeletonKeypoint = { x: x + 0.09,     y: ground + h * 0.04, z, visibility: 1 };

  return {
    id: 0,
    keypoints: {
      0: nose,
      11: lShould, 12: rShould,
      13: lElbow,  14: rElbow,
      15: lWrist,  16: rWrist,
      23: lHip,    24: rHip,
      27: lAnkle,  28: rAnkle,
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
interface UseSkeletonDataOptions {
  wsUrl: string;          // ws://IP:PORT
  enabled?: boolean;      // connect at all
  mockMode?: boolean;     // override with fake skeleton instead of WS
  mockX?: number;         // mock person X position in meters
  mockZ?: number;         // mock person Z position in meters
}

export function useSkeletonData({
  wsUrl,
  enabled = true,
  mockMode = false,
  mockX = 0.6,
  mockZ = 0.6,
}: UseSkeletonDataOptions) {
  const [persons,     setPersons]     = useState<SkeletonPerson[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef      = useRef<WebSocket | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Mock mode: update persons whenever position changes ───────────────────
  useEffect(() => {
    if (!mockMode) return;
    setIsConnected(false);
    setPersons([generateMockPerson(mockX, mockZ)]);
  }, [mockMode, mockX, mockZ]);

  // ── WebSocket mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mockMode || !enabled) {
      // Close any existing WS if switching to mock/disabled
      wsRef.current?.close();
      wsRef.current = null;
      if (!mockMode) setPersons([]);
      return;
    }

    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setIsConnected(true);
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const data: SkeletonPayload = JSON.parse(ev.data);
          setPersons(data.persons ?? []);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        setPersons([]);
        // Reconnect after 3s
        timerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [wsUrl, enabled, mockMode]);

  return { persons, isConnected };
}
