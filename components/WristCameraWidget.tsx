"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, WifiOff, Eye, Layers } from "lucide-react";
import { loadJetsonConfig, makeWsUrl } from "@/lib/jetsonConfig";

interface WristPayload {
  frame_rgb:   string;
  frame_depth: string;
  mode:        "rgb" | "depth";
  objects:     Array<{ label: string; confidence: number; bbox: number[]; xyz?: number[] }>;
  fps:         number;
  has_depth:   boolean;
}

export default function WristCameraWidget() {
  const [connected, setConnected] = useState(false);
  const [data, setData]           = useState<WristPayload | null>(null);
  const [viewMode, setViewMode]   = useState<"rgb" | "depth">("rgb");
  const [wsUrl, setWsUrl]         = useState("ws://localhost:8766");
  const wsRef = useRef<WebSocket | null>(null);

  // Load URL from localStorage after mount (respects Jetson IP config)
  useEffect(() => {
    const cfg = loadJetsonConfig();
    setWsUrl(makeWsUrl(cfg.ip, cfg.wristPort));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => { setConnected(false); wsRef.current = null; };
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data) as WristPayload); } catch { /* ignore */ }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => { if (!wsRef.current) connect(); }, 3000);
    return () => clearInterval(id);
  }, [connected, connect]);

  const switchMode = (mode: "rgb" | "depth") => {
    setViewMode(mode);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ display_mode: mode }));
    }
  };

  const frame = viewMode === "depth" ? data?.frame_depth : data?.frame_rgb;

  return (
    <div className="tesla-card p-4 flex flex-col overflow-hidden min-h-0 flex-1">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-indigo-400 animate-pulse" : "bg-gray-300 dark:bg-gray-600"}`} />
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Wrist Cam</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* RGB / Depth toggle — only when connected */}
          {connected && data && (
            <div className="flex gap-0.5 bg-gray-100 dark:bg-[#111d35] rounded-full p-0.5">
              <button
                onClick={() => switchMode("rgb")}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all flex items-center gap-1 ${
                  viewMode === "rgb"
                    ? "bg-white dark:bg-[#1a2540] text-black dark:text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Eye size={9} /> RGB
              </button>
              <button
                onClick={() => switchMode("depth")}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all flex items-center gap-1 ${
                  viewMode === "depth"
                    ? "bg-white dark:bg-[#1a2540] text-indigo-600 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Layers size={9} /> Depth
              </button>
            </div>
          )}

          {/* WS / FPS badge */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
            connected
              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
              : "bg-gray-100 dark:bg-[#1a2540] text-gray-500"
          }`}>
            {connected ? <Wifi size={8} /> : <WifiOff size={8} />}
            <span className="ml-0.5">
              {connected && data ? `${data.fps.toFixed(0)} fps` : connected ? "…" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Camera feed ──────────────────────────────────────────────────── */}
      {connected && data ? (
        <div className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] flex-1 min-h-0">
          {/* Top-left badge */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[9px] font-black text-white/85 tracking-wide">WRIST</span>
          </div>

          {/* Depth indicator */}
          {viewMode === "depth" && (
            <div className="absolute top-2 right-2 z-10 bg-indigo-600/80 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
              DEPTH
            </div>
          )}

          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="wrist cam"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-xs">
              รอสัญญาณ…
            </div>
          )}

          {/* Detected object labels */}
          {data.objects.length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-1">
              {data.objects.slice(0, 3).map((obj, i) => (
                <span
                  key={i}
                  className="bg-yellow-400/90 text-black text-[9px] font-black px-2 py-0.5 rounded-full"
                >
                  {obj.label} {(obj.confidence * 100).toFixed(0)}%
                  {obj.xyz && (
                    <span className="opacity-70 ml-1 font-mono">
                      {obj.xyz[2].toFixed(0)}mm
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Offline placeholder ────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-[#0d1a2e] rounded-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#162035] flex items-center justify-center">
            <WifiOff size={20} className="text-gray-300 dark:text-gray-600" />
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold">Wrist Cam ออฟไลน์</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1 font-mono">
              python wrist-cam/mock_wrist.py
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
