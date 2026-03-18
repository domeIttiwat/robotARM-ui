"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
  ArrowLeft, Camera, Wifi, WifiOff,
  CheckCircle2, Circle, Copy, Check,
  AlertTriangle, ShieldCheck, ShieldAlert, RefreshCw,
  Play, Square, RotateCcw, Terminal,
  Eye, Layers, ChevronDown, Box, Crosshair,
  Server, Settings,
} from "lucide-react";
import Link from "next/link";
import {
  loadJetsonConfig, saveJetsonConfig, makeWsUrl, type JetsonConfig,
} from "@/lib/jetsonConfig";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SafetyFrame {
  cam_left:     string;
  cam_right:    string;
  safety_level: 0 | 1 | 2;
  distance_mm:  number | null;
  tcp:          { x: number; y: number; z: number };
  person:       { x: number; y: number; z: number } | null;
  rail_pos:     number;
}

interface WristFrame {
  frame_rgb:   string;
  frame_depth: string;
  mode:        "rgb" | "depth";
  objects:     Array<{ label: string; confidence: number; bbox: number[]; xyz?: number[] }>;
  fps:         number;
  has_depth:   boolean;
}

interface CalStatus {
  leftIntrinsic:  boolean;
  rightIntrinsic: boolean;
  leftExtrinsic:  boolean;
  rightExtrinsic: boolean;
}

interface ProcStatus {
  running:      boolean;
  pid:          number | null;
  setupRunning: boolean;
  venvReady:    boolean;
  logs:         string[];
}

const SAFETY_LEVELS = [
  { text: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-900/20",   label: "ปกติ",        Icon: ShieldCheck  },
  { text: "text-orange-500",                      bg: "bg-orange-50 dark:bg-orange-900/20", label: "เตือน — ช้า", Icon: AlertTriangle },
  { text: "text-red-600",                         bg: "bg-red-50 dark:bg-red-900/20",       label: "หยุดฉุกเฉิน", Icon: ShieldAlert  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper components
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title, icon, children, collapsible = false, defaultOpen = true,
}: {
  title: string; icon: ReactNode; children: ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-50 dark:bg-[#111d35] rounded-2xl overflow-hidden">
      <button
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${collapsible ? "hover:bg-gray-100 dark:hover:bg-[#1a2a44] cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-gray-400">{icon}</span>
        <span className="text-[11px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-wide flex-1">{title}</span>
        {collapsible && (
          <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {(!collapsible || open) && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CmdLine({ cmd, copied, onCopy }: { cmd: string; copied: string | null; onCopy: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 bg-gray-900 dark:bg-black/50 rounded-xl px-3 py-2">
      <code className="flex-1 text-green-400 font-mono text-[11px] select-all leading-relaxed">{cmd}</code>
      <button onClick={() => onCopy(cmd)} className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0">
        {copied === cmd
          ? <Check size={12} className="text-green-400" />
          : <Copy size={12} className="text-gray-500" />}
      </button>
    </div>
  );
}

function WsBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black transition-colors ${
      connected
        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
        : "bg-gray-100 dark:bg-[#1a2540] text-gray-500"
    }`}>
      {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Config Bar
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionBar({
  config,
  onApply,
}: {
  config: JetsonConfig;
  onApply: (c: JetsonConfig) => void;
}) {
  const [ip,         setIp]         = useState(config.ip);
  const [rosPort,    setRosPort]    = useState(config.rosPort);
  const [safetyPort, setSafetyPort] = useState(config.safetyPort);
  const [wristPort,  setWristPort]  = useState(config.wristPort);
  const [applied,    setApplied]    = useState(false);
  const [showPorts,  setShowPorts]  = useState(false);

  // Sync inputs when config changes externally
  useEffect(() => {
    setIp(config.ip);
    setRosPort(config.rosPort);
    setSafetyPort(config.safetyPort);
    setWristPort(config.wristPort);
  }, [config]);

  const apply = () => {
    const c: JetsonConfig = {
      ip:         ip.trim() || "localhost",
      rosPort:    rosPort    || 9090,
      safetyPort: safetyPort || 8765,
      wristPort:  wristPort  || 8766,
    };
    onApply(c);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const inputCls = "bg-white dark:bg-[#0a1628] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500";

  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5 bg-blue-50/60 dark:bg-blue-950/20">
      {/* Main row */}
      <div className="flex items-center gap-3 px-6 py-2.5">
        <Server size={13} className="text-blue-500 shrink-0" />
        <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 shrink-0">Jetson / ROS Host</span>

        <input
          type="text"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="localhost หรือ 192.168.x.x"
          className={`${inputCls} w-48`}
        />

        {/* Port toggle */}
        <button
          onClick={() => setShowPorts((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${
            showPorts
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-[#1a2540] text-gray-500 hover:text-gray-700"
          }`}
        >
          <Settings size={10} />
          Ports
          <ChevronDown size={9} className={`transition-transform ${showPorts ? "rotate-180" : ""}`} />
        </button>

        {showPorts && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">ROS</span>
            <input type="number" value={rosPort}    onChange={(e) => setRosPort(+e.target.value)}    className={`${inputCls} w-16`} />
            <span className="text-[10px] text-gray-400">Safety</span>
            <input type="number" value={safetyPort} onChange={(e) => setSafetyPort(+e.target.value)} className={`${inputCls} w-16`} />
            <span className="text-[10px] text-gray-400">Wrist</span>
            <input type="number" value={wristPort}  onChange={(e) => setWristPort(+e.target.value)}  className={`${inputCls} w-16`} />
          </div>
        )}

        <button
          onClick={apply}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all shrink-0 ${
            applied
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          {applied ? <><Check size={11} /> บันทึกแล้ว</> : "Apply & Reconnect"}
        </button>

        {/* Live URL preview */}
        <div className="ml-auto hidden xl:flex items-center gap-2 text-[10px] font-mono text-gray-400 dark:text-gray-600">
          <span>ws://{ip}:{rosPort}</span>
          <span className="opacity-40">·</span>
          <span>:{safetyPort}</span>
          <span className="opacity-40">·</span>
          <span>:{wristPort}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety calibration files & steps
// ─────────────────────────────────────────────────────────────────────────────

const CAL_FILES = [
  { key: "leftIntrinsic",  label: "CAM 1 Intrinsic",  file: "cam_left_intrinsic.npz"  },
  { key: "rightIntrinsic", label: "CAM 2 Intrinsic",  file: "cam_right_intrinsic.npz" },
  { key: "leftExtrinsic",  label: "CAM 1 Extrinsic",  file: "cam_left_extrinsic.npz"  },
  { key: "rightExtrinsic", label: "CAM 2 Extrinsic",  file: "cam_right_extrinsic.npz" },
] as const;

const SAFETY_CAL_STEPS = [
  {
    title:    "1. สร้าง Python Environment",
    cmds:     ["cd detector", "python -m venv .venv", "source .venv/bin/activate", "pip install -r requirements.txt"],
    fileKeys: [] as string[],
  },
  {
    title:    "2. Intrinsic — CAM 1 (Left 45°)",
    cmds:     ["python calibrate_intrinsic.py --camera 0"],
    fileKeys: ["leftIntrinsic"],
  },
  {
    title:    "3. Intrinsic — CAM 2 (Right 45°)",
    cmds:     ["python calibrate_intrinsic.py --camera 1"],
    fileKeys: ["rightIntrinsic"],
  },
  {
    title:    "4. Extrinsic (ทั้ง 2 กล้อง)",
    cmds:     ["python calibrate_extrinsic.py"],
    fileKeys: ["leftExtrinsic", "rightExtrinsic"],
  },
];

function CalStep({
  step, calStatus, copied, onCopy,
}: {
  step: typeof SAFETY_CAL_STEPS[number];
  calStatus: CalStatus | null;
  copied: string | null;
  onCopy: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = step.fileKeys.length > 0
    ? step.fileKeys.every((k) => calStatus?.[k as keyof CalStatus])
    : undefined;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      done === true
        ? "border-green-200 dark:border-green-700/40 bg-green-50/50 dark:bg-green-900/10"
        : "border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f1e38]"
    }`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {done === true  && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
        {done === false && <Circle       size={14} className="text-gray-300 shrink-0" />}
        {done === undefined && <div className="w-3.5 h-3.5 rounded-full bg-blue-100 dark:bg-blue-900/50 shrink-0" />}
        <span className="text-[11px] font-black text-gray-800 dark:text-gray-200 flex-1">{step.title}</span>
        <ChevronDown size={12} className={`text-gray-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-white/5 pt-2 space-y-1.5">
          {step.cmds.map((cmd) => <CmdLine key={cmd} cmd={cmd} copied={copied} onCopy={onCopy} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrist cam setup steps
// ─────────────────────────────────────────────────────────────────────────────

const WRIST_SETUP_STEPS = [
  {
    title: "1. สร้าง Python Environment",
    note:  undefined as string | undefined,
    cmds:  [
      "cd wrist-cam",
      "python -m venv .venv",
      "source .venv/bin/activate",
      "pip install -r requirements.txt",
    ],
  },
  {
    title: "2. ทดสอบโดยไม่ต้องมีกล้อง (Mock)",
    note:  undefined,
    cmds:  ["python mock_wrist.py"],
  },
  {
    title: "3. กล้องจริง — USB / OpenCV",
    note:  "เปลี่ยน --cam-index ให้ตรงกับ device index ของกล้อง",
    cmds:  ["python main.py --cam-index 2"],
  },
  {
    title: "4. Intel RealSense (RGB + Depth)",
    note:  "uncomment RealSenseCamera ใน main.py แล้วรัน",
    cmds:  [
      "pip install pyrealsense2",
      "# แก้ไข main.py: driver = RealSenseCamera()",
      "python main.py",
    ],
  },
  {
    title: "5. Stereolabs ZED (RGB + Depth)",
    note:  "ต้องติดตั้ง ZED SDK installer ก่อน (https://www.stereolabs.com/developers)",
    cmds:  [
      "pip install pyzed",
      "# แก้ไข main.py: driver = ZEDCamera()",
      "python main.py",
    ],
  },
];

function WristSetupStep({ step, copied, onCopy }: {
  step: typeof WRIST_SETUP_STEPS[number];
  copied: string | null;
  onCopy: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f1e38] overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <div className="w-3.5 h-3.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 shrink-0" />
        <span className="text-[11px] font-black text-gray-800 dark:text-gray-200 flex-1">{step.title}</span>
        <ChevronDown size={12} className={`text-gray-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-white/5 pt-2 space-y-1.5">
          {step.cmds.map((cmd) => <CmdLine key={cmd} cmd={cmd} copied={copied} onCopy={onCopy} />)}
          {step.note && <p className="text-[10px] text-indigo-500 dark:text-indigo-400 italic mt-1">{step.note}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT: Safety Camera Panel
// ─────────────────────────────────────────────────────────────────────────────

function SafetyPanel({ wsUrl }: { wsUrl: string }) {
  const [connected, setConnected]     = useState(false);
  const [frame, setFrame]             = useState<SafetyFrame | null>(null);
  const [threshWarn, setThreshWarn]   = useState(600);
  const [threshStop, setThreshStop]   = useState(300);
  const [calStatus, setCalStatus]     = useState<CalStatus | null>(null);
  const [calLoading, setCalLoading]   = useState(false);
  const [proc, setProc]               = useState<ProcStatus>({
    running: false, pid: null, setupRunning: false, venvReady: false, logs: [],
  });
  const [procLoading, setProcLoading] = useState(false);
  const [copied, setCopied]           = useState<string | null>(null);
  const wsRef  = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const wsConnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => { setConnected(false); wsRef.current = null; };
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => { try { setFrame(JSON.parse(e.data)); } catch { /* ignore */ } };
  }, [wsUrl]);

  useEffect(() => { wsConnect(); return () => wsRef.current?.close(); }, [wsConnect]);
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => { if (!wsRef.current) wsConnect(); }, 3000);
    return () => clearInterval(t);
  }, [connected, wsConnect]);

  const sendThresholds = (warn: number, stop: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ thresh_warn: warn, thresh_stop: stop }));
  };

  const refreshProc = useCallback(() => {
    fetch("/api/camera/process").then((r) => r.json()).then(setProc).catch(() => {});
  }, []);
  useEffect(() => { refreshProc(); const t = setInterval(refreshProc, 2000); return () => clearInterval(t); }, [refreshProc]);

  const procAction = async (action: "start" | "stop" | "restart" | "setup") => {
    setProcLoading(true);
    await fetch("/api/camera/process", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    refreshProc();
    setProcLoading(false);
  };

  const refreshCal = useCallback(() => {
    setCalLoading(true);
    fetch("/api/camera/status")
      .then((r) => r.json())
      .then((d: CalStatus) => { setCalStatus(d); setCalLoading(false); })
      .catch(() => setCalLoading(false));
  }, []);
  useEffect(() => { refreshCal(); }, [refreshCal]);

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(cmd); setTimeout(() => setCopied(null), 2000); });
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [proc.logs]);

  const level = frame?.safety_level ?? 0;
  const sfCfg = SAFETY_LEVELS[level];
  const { Icon: SafetyIcon } = sfCfg;

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-gray-100 dark:border-white/5">
      {/* ── Column header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 shrink-0 bg-white/95 dark:bg-[#0a1428]/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[14px] bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Camera size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 dark:text-white leading-none">Safety System</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate font-mono">{wsUrl}</p>
          </div>
          <WsBadge connected={connected} label={connected ? "Live" : "Offline"} />
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a1428] px-5 py-4 space-y-4">

        {/* Connection & Process */}
        <SectionCard title="Connection" icon={<Terminal size={13} />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  proc.running ? "bg-green-500 animate-pulse"
                  : proc.setupRunning ? "bg-blue-500 animate-pulse"
                  : "bg-gray-300"
                }`} />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  {proc.running
                    ? `Python running (PID ${proc.pid})`
                    : proc.setupRunning ? "กำลัง setup…"
                    : "Python หยุดอยู่"}
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!proc.venvReady && !proc.setupRunning && (
                  <button
                    onClick={() => procAction("setup")}
                    disabled={procLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] font-black disabled:opacity-50"
                  >
                    Setup
                  </button>
                )}
                {proc.venvReady && !proc.setupRunning && (
                  <button
                    onClick={() => procAction("reinstall")}
                    disabled={procLoading || proc.running}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black disabled:opacity-50"
                  >
                    <RefreshCw size={10} /> Reinstall
                  </button>
                )}
                {!proc.running ? (
                  <button
                    onClick={() => procAction("start")}
                    disabled={procLoading || proc.setupRunning}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[11px] font-black disabled:opacity-50"
                  >
                    <Play size={10} /> Start
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => procAction("restart")}
                      disabled={procLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 text-[11px] font-black disabled:opacity-50"
                    >
                      <RotateCcw size={10} /> Restart
                    </button>
                    <button
                      onClick={() => procAction("stop")}
                      disabled={procLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-black disabled:opacity-50"
                    >
                      <Square size={10} /> Stop
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-gray-400 uppercase">หรือรันด้วยตัวเอง:</p>
              <CmdLine cmd="python detector/main.py" copied={copied} onCopy={copyCmd} />
              <CmdLine cmd="python detector/mock_detector.py" copied={copied} onCopy={copyCmd} />
            </div>

            {proc.logs.length > 0 && (
              <div ref={logRef} className="h-20 overflow-y-auto bg-gray-900 dark:bg-black/50 rounded-xl px-3 py-2 space-y-0.5">
                {proc.logs.slice(-40).map((line, i) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes("ERROR") ? "text-red-400"
                    : line.includes("WARN")  ? "text-yellow-400"
                    : "text-gray-500"
                  }`}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Safety Thresholds */}
        <SectionCard title="Safety Thresholds" icon={<AlertTriangle size={13} />}>
          <div className="space-y-3">
            <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${sfCfg.bg} ${level === 2 ? "animate-pulse" : ""}`}>
              <SafetyIcon size={14} className={sfCfg.text} />
              <span className={`text-xs font-black ${sfCfg.text}`}>{sfCfg.label}</span>
              {frame?.distance_mm != null && (
                <span className={`ml-auto text-sm font-mono font-black tabular-nums ${sfCfg.text}`}>
                  {frame.distance_mm.toFixed(0)}<span className="text-[10px] opacity-60 ml-0.5">mm</span>
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-black text-orange-500 w-14 shrink-0">เตือน (L1)</span>
                <input type="range" min="100" max="2000" step="50" value={threshWarn}
                  onChange={(e) => { const v = +e.target.value; setThreshWarn(v); sendThresholds(v, threshStop); }}
                  className="flex-1 h-1.5 cursor-pointer accent-orange-500" />
                <span className="text-xs font-black text-orange-500 w-16 text-right tabular-nums">{threshWarn} mm</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-black text-red-500 w-14 shrink-0">หยุด (L2)</span>
                <input type="range" min="50" max="1000" step="25" value={threshStop}
                  onChange={(e) => { const v = +e.target.value; setThreshStop(v); sendThresholds(threshWarn, v); }}
                  className="flex-1 h-1.5 cursor-pointer accent-red-500" />
                <span className="text-xs font-black text-red-500 w-16 text-right tabular-nums">{threshStop} mm</span>
              </div>
            </div>

            <div className="flex gap-3 text-[10px] text-gray-400 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> ≥{threshWarn} mm = ปกติ</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" /> {threshStop}–{threshWarn} mm = เตือน</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 shrink-0" /> &lt;{threshStop} mm = หยุด</span>
            </div>
          </div>
        </SectionCard>

        {/* Live Feed */}
        <SectionCard title="Live Feed" icon={<Camera size={13} />}>
          <div className="grid grid-cols-2 gap-3">
            {(["cam_left", "cam_right"] as const).map((key, i) => (
              <div key={key} className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                <div className="absolute top-1.5 left-1.5 z-10 text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                  CAM {i + 1} · {i === 0 ? "Left 45°" : "Right 45°"}
                </div>
                {frame?.[key] ? (
                  <img src={`data:image/jpeg;base64,${frame[key]}`} alt={key} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {connected
                      ? <Camera size={20} className="text-gray-700 animate-pulse" />
                      : <WifiOff size={20} className="text-gray-700" />}
                  </div>
                )}
              </div>
            ))}
          </div>

          {frame && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-gray-50 dark:bg-[#111d35] rounded-xl px-3 py-2">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">ระยะห่าง</p>
                <p className="text-sm font-mono font-black text-gray-700 dark:text-gray-200">
                  {frame.distance_mm != null ? `${frame.distance_mm.toFixed(0)} mm` : "—"}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black text-purple-400 uppercase mb-1">TCP</p>
                <p className="text-[10px] font-mono text-purple-600 dark:text-purple-300">
                  {frame.tcp.x.toFixed(0)}, {frame.tcp.y.toFixed(0)}, {frame.tcp.z.toFixed(0)}
                </p>
              </div>
              <div className="bg-blue-600 rounded-xl px-3 py-2">
                <p className="text-[9px] font-black text-white/60 uppercase mb-1">Rail</p>
                <p className="text-sm font-mono font-black text-white">
                  {frame.rail_pos.toFixed(1)}<span className="text-[9px] opacity-50 ml-0.5">mm</span>
                </p>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Calibration */}
        <SectionCard title="Calibration — Safety Cameras" icon={<Crosshair size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-400">
                บันทึกที่ <code className="font-mono">detector/calibration/</code>
              </p>
              <button
                onClick={refreshCal}
                disabled={calLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-[#1a2540] text-[10px] font-black text-gray-500 disabled:opacity-50"
              >
                <RefreshCw size={10} className={calLoading ? "animate-spin" : ""} /> รีเฟรช
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CAL_FILES.map(({ key, label, file }) => {
                const ok = calStatus?.[key as keyof CalStatus] ?? false;
                return (
                  <div key={key} className={`rounded-xl p-3 border transition-all ${
                    ok
                      ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/40"
                      : "bg-white dark:bg-[#0f1e38] border-gray-100 dark:border-transparent"
                  }`}>
                    {ok ? <CheckCircle2 size={14} className="text-green-600 mb-1" /> : <Circle size={14} className="text-gray-300 mb-1" />}
                    <p className="text-[11px] font-black text-gray-700 dark:text-gray-200 leading-tight">{label}</p>
                    <p className="text-[9px] font-mono text-gray-400 mt-0.5 break-all">{file}</p>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              {SAFETY_CAL_STEPS.map((step) => (
                <CalStep key={step.title} step={step} calStatus={calStatus} copied={copied} onCopy={copyCmd} />
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT: Wrist Camera Panel
// ─────────────────────────────────────────────────────────────────────────────

function WristPanel({ wsUrl }: { wsUrl: string }) {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame]         = useState<WristFrame | null>(null);
  const [viewMode, setViewMode]   = useState<"rgb" | "depth">("rgb");
  const [copied, setCopied]       = useState<string | null>(null);
  const [proc, setProc]           = useState<ProcStatus>({
    running: false, pid: null, setupRunning: false, venvReady: false, logs: [],
  });
  const [procLoading, setProcLoading] = useState(false);
  const wsRef  = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const wsConnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => { setConnected(false); wsRef.current = null; };
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => { try { setFrame(JSON.parse(e.data)); } catch { /* ignore */ } };
  }, [wsUrl]);

  useEffect(() => { wsConnect(); return () => wsRef.current?.close(); }, [wsConnect]);
  useEffect(() => {
    if (connected) return;
    const t = setInterval(() => { if (!wsRef.current) wsConnect(); }, 3000);
    return () => clearInterval(t);
  }, [connected, wsConnect]);

  // Process management
  const refreshProc = useCallback(() => {
    fetch("/api/camera/wrist-process").then((r) => r.json()).then(setProc).catch(() => {});
  }, []);
  useEffect(() => { refreshProc(); const t = setInterval(refreshProc, 2000); return () => clearInterval(t); }, [refreshProc]);

  const procAction = async (action: "start" | "stop" | "restart" | "setup") => {
    setProcLoading(true);
    await fetch("/api/camera/wrist-process", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    refreshProc();
    setProcLoading(false);
  };

  const switchMode = (mode: "rgb" | "depth") => {
    setViewMode(mode);
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ display_mode: mode }));
  };

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(cmd); setTimeout(() => setCopied(null), 2000); });
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [proc.logs]);

  const displayFrame = viewMode === "depth" ? frame?.frame_depth : frame?.frame_rgb;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Column header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 shrink-0 bg-white/95 dark:bg-[#0a1428]/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[14px] bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Box size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900 dark:text-white leading-none">Wrist Camera</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate font-mono">{wsUrl}</p>
          </div>
          <WsBadge
            connected={connected}
            label={connected && frame ? `${frame.fps.toFixed(0)} fps` : connected ? "…" : "Offline"}
          />
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a1428] px-5 py-4 space-y-4">

        {/* Connection & Process */}
        <SectionCard title="Connection" icon={<Terminal size={13} />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  proc.running     ? "bg-indigo-500 animate-pulse"
                  : proc.setupRunning ? "bg-blue-500 animate-pulse"
                  : "bg-gray-300"
                }`} />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                  {proc.running
                    ? `Python running (PID ${proc.pid})`
                    : proc.setupRunning ? "กำลัง setup…"
                    : "Python หยุดอยู่"}
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!proc.venvReady && !proc.setupRunning && (
                  <button
                    onClick={() => procAction("setup")}
                    disabled={procLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] font-black disabled:opacity-50"
                  >
                    Setup
                  </button>
                )}
                {proc.venvReady && !proc.setupRunning && (
                  <button
                    onClick={() => procAction("reinstall")}
                    disabled={procLoading || proc.running}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black disabled:opacity-50"
                  >
                    <RefreshCw size={10} /> Reinstall
                  </button>
                )}
                {!proc.running ? (
                  <button
                    onClick={() => procAction("start")}
                    disabled={procLoading || proc.setupRunning}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black disabled:opacity-50"
                  >
                    <Play size={10} /> Start
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => procAction("restart")}
                      disabled={procLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 text-[11px] font-black disabled:opacity-50"
                    >
                      <RotateCcw size={10} /> Restart
                    </button>
                    <button
                      onClick={() => procAction("stop")}
                      disabled={procLoading}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[11px] font-black disabled:opacity-50"
                    >
                      <Square size={10} /> Stop
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-gray-400 uppercase">หรือรันด้วยตัวเอง:</p>
              <CmdLine cmd="cd wrist-cam && python main.py" copied={copied} onCopy={copyCmd} />
              <CmdLine cmd="cd wrist-cam && python mock_wrist.py" copied={copied} onCopy={copyCmd} />
            </div>

            {proc.logs.length > 0 && (
              <div ref={logRef} className="h-20 overflow-y-auto bg-gray-900 dark:bg-black/50 rounded-xl px-3 py-2 space-y-0.5">
                {proc.logs.slice(-40).map((line, i) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes("ERROR") ? "text-red-400"
                    : line.includes("WARN")  ? "text-yellow-400"
                    : "text-gray-500"
                  }`}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Live Feed + Display Mode */}
        <SectionCard title="Live Feed" icon={<Camera size={13} />}>
          {/* Mode toggle */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-black text-gray-400 shrink-0">โหมดแสดงผล:</span>
            <div className="flex gap-0.5 bg-gray-100 dark:bg-[#111d35] rounded-full p-0.5">
              {(["rgb", "depth"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`px-3 py-1 rounded-full text-[11px] font-black transition-all flex items-center gap-1.5 ${
                    viewMode === m
                      ? "bg-white dark:bg-[#1a2540] text-black dark:text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {m === "rgb" ? <><Eye size={10} /> RGB</> : <><Layers size={10} /> Depth</>}
                </button>
              ))}
            </div>
            {frame && !frame.has_depth && viewMode === "depth" && (
              <span className="text-[10px] text-orange-500 font-bold">กล้องไม่รองรับ depth จริง</span>
            )}
          </div>

          {/* Camera feed */}
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-indigo-400 animate-pulse" : "bg-gray-600"}`} />
              <span className="text-[9px] font-black text-white/85">WRIST CAM</span>
            </div>
            {viewMode === "depth" && (
              <div className="absolute top-2 right-2 z-10 bg-indigo-600/80 text-white text-[9px] font-black px-2 py-0.5 rounded-full">DEPTH</div>
            )}
            {displayFrame ? (
              <img src={`data:image/jpeg;base64,${displayFrame}`} alt="wrist" className="absolute inset-0 w-full h-full object-cover" />
            ) : connected ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera size={28} className="text-gray-700 animate-pulse" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <WifiOff size={28} className="text-gray-700" />
                <p className="text-gray-600 text-xs">Wrist cam ออฟไลน์</p>
              </div>
            )}
            {frame?.objects && frame.objects.length > 0 && (
              <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1">
                {frame.objects.slice(0, 4).map((obj, i) => (
                  <span key={i} className="bg-yellow-400/90 text-black text-[9px] font-black px-2 py-0.5 rounded-full">
                    {obj.label} {(obj.confidence * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Detected objects list */}
          {frame?.objects && frame.objects.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-black text-gray-400 uppercase">Detected Objects</p>
              {frame.objects.map((obj, i) => (
                <div key={i} className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl px-3 py-2">
                  <span className="text-xs font-black text-gray-800 dark:text-gray-200">{obj.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{(obj.confidence * 100).toFixed(0)}%</span>
                  {obj.xyz && (
                    <span className="ml-auto text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                      X{obj.xyz[0].toFixed(0)} Y{obj.xyz[1].toFixed(0)} Z{obj.xyz[2].toFixed(0)} mm
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Setup & Calibration */}
        <SectionCard title="Setup & Camera Type" icon={<Crosshair size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-1.5">
            {WRIST_SETUP_STEPS.map((step) => (
              <WristSetupStep key={step.title} step={step} copied={copied} onCopy={copyCmd} />
            ))}
          </div>
        </SectionCard>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraSetupPage() {
  const [config, setConfig] = useState<JetsonConfig>(() => loadJetsonConfig());

  // Load from localStorage after hydration
  useEffect(() => {
    setConfig(loadJetsonConfig());
  }, []);

  const handleApplyConfig = (cfg: JetsonConfig) => {
    saveJetsonConfig(cfg);
    setConfig(cfg);
  };

  const wsSafetyUrl = makeWsUrl(config.ip, config.safetyPort);
  const wsWristUrl  = makeWsUrl(config.ip, config.wristPort);

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#070d1b]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-8 py-4 border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-[#0a1628]/80 backdrop-blur-md shrink-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#1a2540] hover:bg-gray-200 dark:hover:bg-[#1e2d4a] text-gray-600 dark:text-gray-300 font-bold text-sm transition-colors"
        >
          <ArrowLeft size={14} /> กลับ
        </Link>

        <div className="w-px h-6 bg-gray-200 dark:bg-white/10" />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Camera size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-black dark:text-white leading-none">Camera Setup</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Safety System · Wrist Camera · Process Manager
            </p>
          </div>
        </div>
      </header>

      {/* ── Connection Config Bar ────────────────────────────────────────── */}
      <ConnectionBar config={config} onApply={handleApplyConfig} />

      {/* ── Body: 2 equal columns ────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        <SafetyPanel wsUrl={wsSafetyUrl} />
        <WristPanel  wsUrl={wsWristUrl}  />
      </div>

    </div>
  );
}
