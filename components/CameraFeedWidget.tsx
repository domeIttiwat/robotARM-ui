"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wifi, WifiOff, ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { loadJetsonConfig, makeWsUrl } from "@/lib/jetsonConfig";

interface DetectorPayload {
  cam_left:     string;
  cam_right:    string;
  safety_level: 0 | 1 | 2;
  distance_mm:  number | null;
  tcp:          { x: number; y: number; z: number };
  person:       { x: number; y: number; z: number } | null;
  rail_pos:     number;
}

const LEVELS = [
  {
    bg:   "bg-green-500/12 dark:bg-green-500/8",
    ring: "ring-green-500/25",
    text: "text-green-600 dark:text-green-400",
    dot:  "bg-green-400",
    label: "ปกติ",
    Icon: ShieldCheck,
  },
  {
    bg:   "bg-orange-500/12 dark:bg-orange-500/8",
    ring: "ring-orange-500/25",
    text: "text-orange-600 dark:text-orange-400",
    dot:  "bg-orange-400",
    label: "เตือน — ช้าลง",
    Icon: AlertTriangle,
  },
  {
    bg:   "bg-red-500/12 dark:bg-red-500/8",
    ring: "ring-red-500/25",
    text: "text-red-600 dark:text-red-400",
    dot:  "bg-red-500",
    label: "หยุดฉุกเฉิน",
    Icon: ShieldAlert,
  },
] as const;

const CAM_LABELS = ["CAM-L  45°", "CAM-R  45°"];

export default function CameraFeedWidget() {
  const [connected, setConnected] = useState(false);
  const [data, setData]           = useState<DetectorPayload | null>(null);
  const [wsUrl, setWsUrl]         = useState("ws://localhost:8765");
  const wsRef = useRef<WebSocket | null>(null);

  // Load URL from localStorage after mount (respects Jetson IP config)
  useEffect(() => {
    const cfg = loadJetsonConfig();
    setWsUrl(makeWsUrl(cfg.ip, cfg.safetyPort));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => { setConnected(false); wsRef.current = null; };
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data) as DetectorPayload); } catch { /* ignore */ }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  // Auto-reconnect when offline
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => { if (!wsRef.current) connect(); }, 3000);
    return () => clearInterval(id);
  }, [connected, connect]);

  const level = data?.safety_level ?? 0;
  const ls    = LEVELS[level];
  const LevelIcon = ls.Icon;

  return (
    <div className="tesla-card p-5 flex-1 flex flex-col overflow-hidden min-h-0">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            connected ? `${ls.dot} animate-pulse` : "bg-gray-300 dark:bg-gray-600"
          }`} />
          Camera Safety
        </h3>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black transition-colors ${
          connected
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
            : "bg-gray-100 dark:bg-[#1a2540] text-gray-500"
        }`}>
          {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
          <span className="ml-0.5">{connected ? "Live" : "Offline"}</span>
        </div>
      </div>

      {/* ── Safety Level Banner ──────────────────────────────────────────── */}
      <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl ring-1 mb-3 shrink-0 ${ls.bg} ${ls.ring} ${
        level === 2 ? "animate-pulse" : ""
      }`}>
        <LevelIcon size={15} className={ls.text} />
        <span className={`text-xs font-black ${ls.text}`}>{ls.label}</span>
        {data?.distance_mm != null ? (
          <span className={`ml-auto text-sm font-mono font-black tabular-nums ${ls.text}`}>
            {data.distance_mm.toFixed(0)}
            <span className="text-[10px] font-normal opacity-60 ml-0.5">mm</span>
          </span>
        ) : (
          <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">ไม่พบคน</span>
        )}
      </div>

      {/* ── Camera Feeds ─────────────────────────────────────────────────── */}
      {connected && data ? (
        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
          {(["cam_left", "cam_right"] as const).map((key, i) => (
            <div
              key={key}
              className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] flex-1 min-h-0"
            >
              {/* Top-left badge */}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-black text-white/85 tracking-wide">
                  {CAM_LABELS[i]}
                </span>
              </div>

              {/* Safety level indicator top-right */}
              {data.safety_level > 0 && (
                <div className={`absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full text-[9px] font-black ${
                  data.safety_level === 2
                    ? "bg-red-600/80 text-white"
                    : "bg-orange-500/80 text-white"
                }`}>
                  {data.safety_level === 2 ? "STOP" : "SLOW"}
                </div>
              )}

              {data[key] ? (
                <img
                  src={`data:image/jpeg;base64,${data[key]}`}
                  alt={key}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-xs">
                  รอสัญญาณ...
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── Offline Placeholder ──────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-[#0d1a2e] rounded-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-[#162035] flex items-center justify-center">
            <WifiOff size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-bold">ไม่ได้เชื่อมต่อ</p>
            <p className="text-gray-400 dark:text-gray-600 text-[10px] mt-1.5 font-mono leading-relaxed">
              python detector/mock_detector.py
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
