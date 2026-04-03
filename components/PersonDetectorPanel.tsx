"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Wifi, WifiOff, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { loadJetsonConfig, makeWsUrl } from "@/lib/jetsonConfig";

interface PersonPayload {
  cam_left:     string;         // base64 JPEG
  cam_right:    string;         // base64 JPEG
  safety_level: 0 | 1 | 2;
  distance_mm:  number | null;
  tcp:          { x: number; y: number; z: number };
  person:       { x: number; y: number; z: number } | null;
  rail_pos:     number;
}

const LEVEL_STYLE = [
  { bg: "bg-green-500",  text: "text-green-500",  label: "ปกติ",           icon: ShieldCheck  },
  { bg: "bg-orange-500", text: "text-orange-500", label: "เตือน — ช้าลง",  icon: AlertTriangle },
  { bg: "bg-red-600",    text: "text-red-600",    label: "หยุดฉุกเฉิน",    icon: ShieldAlert  },
] as const;

export default function PersonDetectorPanel({ onClose }: { onClose: () => void }) {
  const [connected, setConnected]     = useState(false);
  const [data, setData]               = useState<PersonPayload | null>(null);
  const [threshWarn, setThreshWarn]   = useState(600);
  const [threshStop, setThreshStop]   = useState(300);
  const [wsUrl, setWsUrl]             = useState("ws://localhost:8765");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const cfg = loadJetsonConfig();
    setWsUrl(makeWsUrl(cfg.ip, cfg.safetyPort));
  }, []);

  // ── WebSocket connection ─────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen  = () => setConnected(true);
    ws.onclose = () => { setConnected(false); wsRef.current = null; };
    ws.onerror = () => { setConnected(false); };

    ws.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as PersonPayload;
        setData(parsed);
      } catch { /* ignore */ }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  // Auto-reconnect every 3s when disconnected
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => { if (!wsRef.current) connect(); }, 3000);
    return () => clearInterval(id);
  }, [connected, connect]);

  // Send threshold updates to Python service
  const sendThresholds = useCallback((warn: number, stop: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ thresh_warn: warn, thresh_stop: stop }));
    }
  }, []);

  const level    = data?.safety_level ?? 0;
  const lvlStyle = LEVEL_STYLE[level];
  const LevelIcon = lvlStyle.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="tesla-card w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/7 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[14px] bg-gray-100 dark:bg-[#1a2540] flex items-center justify-center">
              <Camera size={18} className="text-gray-600 dark:text-[#90a8c8]" />
            </div>
            <div>
              <h2 className="text-xl font-black leading-tight">Person Detector</h2>
              <p className="text-xs text-gray-400 dark:text-[#9aa8c8] font-bold mt-0.5">ตรวจจับคนผ่านกล้อง</p>
            </div>
            {/* WS status badge */}
            <div className={`ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
              connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {connected ? "เชื่อมต่อแล้ว" : "ไม่ได้เชื่อมต่อ"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* Safety level banner */}
          <div className={`flex items-center gap-3 p-4 rounded-2xl ${
            level === 0 ? "bg-green-50 dark:bg-green-900/20"
            : level === 1 ? "bg-orange-50 dark:bg-orange-900/20"
            : "bg-red-50 dark:bg-red-900/20 animate-pulse"
          }`}>
            <LevelIcon size={24} className={lvlStyle.text} />
            <div>
              <p className={`font-black text-lg ${lvlStyle.text}`}>{lvlStyle.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data?.distance_mm != null
                  ? `ระยะห่าง TCP ↔ คน: ${data.distance_mm.toFixed(0)} mm`
                  : "ไม่พบคน"}
              </p>
            </div>
            {data?.distance_mm != null && (
              <p className={`ml-auto text-3xl font-mono font-black ${lvlStyle.text}`}>
                {data.distance_mm.toFixed(0)}<span className="text-base font-light opacity-60 ml-1">mm</span>
              </p>
            )}
          </div>

          {/* Camera feeds side-by-side */}
          {connected ? (
            <div className="grid grid-cols-2 gap-3">
              {(["cam_left", "cam_right"] as const).map((key, i) => (
                <div key={key} className="rounded-2xl overflow-hidden bg-black relative">
                  <p className="absolute top-2 left-2 z-10 text-white text-[10px] font-black bg-black/50 px-2 py-0.5 rounded-full">
                    {i === 0 ? "CAM-L (45°)" : "CAM-R (45°)"}
                  </p>
                  {data?.[key] ? (
                    <img
                      src={`data:image/jpeg;base64,${data[key]}`}
                      alt={key}
                      className="w-full h-auto object-cover"
                      style={{ maxHeight: 240 }}
                    />
                  ) : (
                    <div className="w-full flex items-center justify-center text-gray-600 text-sm" style={{ height: 180 }}>
                      รอสัญญาณ...
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 dark:bg-[#111d35] p-10 text-center text-gray-400 text-sm">
              <WifiOff size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold">ไม่ได้เชื่อมต่อกับ Detector Service</p>
              <p className="text-xs mt-1 opacity-70">รัน: <code className="font-mono">python detector/main.py</code></p>
            </div>
          )}

          {/* Position info */}
          {data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl">
                <p className="text-[10px] font-black text-purple-400 uppercase mb-2">TCP Position (mm)</p>
                <div className="grid grid-cols-3 gap-x-2 text-xs font-mono text-purple-700 dark:text-purple-300">
                  <div><span className="opacity-50">X </span>{data.tcp.x.toFixed(0)}</div>
                  <div><span className="opacity-50">Y </span>{data.tcp.y.toFixed(0)}</div>
                  <div><span className="opacity-50">Z </span>{data.tcp.z.toFixed(0)}</div>
                </div>
                <p className="text-[10px] text-purple-400 mt-2">Rail: {data.rail_pos.toFixed(1)} mm</p>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl">
                <p className="text-[10px] font-black text-orange-400 uppercase mb-2">Person Position (mm)</p>
                {data.person ? (
                  <div className="grid grid-cols-3 gap-x-2 text-xs font-mono text-orange-700 dark:text-orange-300">
                    <div><span className="opacity-50">X </span>{data.person.x.toFixed(0)}</div>
                    <div><span className="opacity-50">Y </span>{data.person.y.toFixed(0)}</div>
                    <div><span className="opacity-50">Z </span>{data.person.z.toFixed(0)}</div>
                  </div>
                ) : (
                  <p className="text-xs text-orange-400 opacity-60">ไม่พบคน</p>
                )}
              </div>
            </div>
          )}

          {/* Threshold sliders */}
          <div className="p-4 bg-gray-50 dark:bg-[#111d35] rounded-2xl space-y-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Safety Thresholds</p>

            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-orange-500 w-20 shrink-0">เตือน (L1)</span>
              <input
                type="range" min="100" max="2000" step="50" value={threshWarn}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setThreshWarn(v);
                  sendThresholds(v, threshStop);
                }}
                className="flex-1 h-2 cursor-pointer accent-orange-500"
              />
              <span className="text-sm font-black text-orange-500 w-16 text-right tabular-nums">{threshWarn} mm</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-red-500 w-20 shrink-0">หยุด (L2)</span>
              <input
                type="range" min="50" max="1000" step="25" value={threshStop}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setThreshStop(v);
                  sendThresholds(threshWarn, v);
                }}
                className="flex-1 h-2 cursor-pointer accent-red-500"
              />
              <span className="text-sm font-black text-red-500 w-16 text-right tabular-nums">{threshStop} mm</span>
            </div>

            <div className="flex gap-3 text-[10px] text-gray-400 mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ≥{threshWarn}mm = ปกติ</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> {threshStop}–{threshWarn}mm = เตือน</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> &lt;{threshStop}mm = หยุด</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
