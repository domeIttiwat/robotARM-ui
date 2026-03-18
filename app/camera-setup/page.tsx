"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
  ArrowLeft, Camera, Wifi, WifiOff,
  CheckCircle2, Circle, Copy, Check,
  AlertTriangle, ShieldCheck, ShieldAlert, RefreshCw,
  Play, Square, RotateCcw, Terminal,
  Eye, Layers, ChevronDown, Box, Crosshair,
  Server, Settings, Scan,
} from "lucide-react";
import Link from "next/link";
import {
  loadJetsonConfig, saveJetsonConfig, makeWsUrl, type JetsonConfig,
} from "@/lib/jetsonConfig";
import {
  loadCameraConfig, saveCameraConfig, type CameraConfig,
} from "@/lib/cameraConfig";

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
        {copied === cmd ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-gray-500" />}
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

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative shrink-0 rounded-full transition-colors duration-200 ${
        enabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
      }`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white shadow-sm transition-all duration-200"
        style={{ width: 16, height: 16, left: enabled ? 18 : 2 }}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Config Bar
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionBar({ config, onApply }: { config: JetsonConfig; onApply: (c: JetsonConfig) => void }) {
  const [ip,         setIp]         = useState(config.ip);
  const [rosPort,    setRosPort]    = useState(config.rosPort);
  const [safetyPort, setSafetyPort] = useState(config.safetyPort);
  const [wristPort,  setWristPort]  = useState(config.wristPort);
  const [applied,    setApplied]    = useState(false);
  const [showPorts,  setShowPorts]  = useState(false);

  useEffect(() => {
    setIp(config.ip); setRosPort(config.rosPort);
    setSafetyPort(config.safetyPort); setWristPort(config.wristPort);
  }, [config]);

  const apply = () => {
    const c: JetsonConfig = {
      ip: ip.trim() || "localhost",
      rosPort: rosPort || 9090,
      safetyPort: safetyPort || 8765,
      wristPort: wristPort || 8766,
    };
    onApply(c);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const inputCls = "bg-white dark:bg-[#0a1628] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500";

  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5 bg-blue-50/60 dark:bg-blue-950/20">
      <div className="flex items-center gap-3 px-6 py-2.5">
        <Server size={13} className="text-blue-500 shrink-0" />
        <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 shrink-0">Jetson / ROS Host</span>
        <input
          type="text" value={ip} onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="localhost หรือ 192.168.x.x"
          className={`${inputCls} w-48`}
        />
        <button
          onClick={() => setShowPorts((o) => !o)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${
            showPorts ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-[#1a2540] text-gray-500 hover:text-gray-700"
          }`}
        >
          <Settings size={10} /> Ports
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
            applied ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          {applied ? <><Check size={11} /> บันทึกแล้ว</> : "Apply & Reconnect"}
        </button>
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
// Safety calibration
// ─────────────────────────────────────────────────────────────────────────────

const CAL_FILES = [
  { key: "leftIntrinsic",  label: "CAM 1 Intrinsic",  file: "cam_left_intrinsic.npz"  },
  { key: "rightIntrinsic", label: "CAM 2 Intrinsic",  file: "cam_right_intrinsic.npz" },
  { key: "leftExtrinsic",  label: "CAM 1 Extrinsic",  file: "cam_left_extrinsic.npz"  },
  { key: "rightExtrinsic", label: "CAM 2 Extrinsic",  file: "cam_right_extrinsic.npz" },
] as const;

const SAFETY_CAL_STEPS = [
  { title: "1. สร้าง Python Environment", cmds: ["cd detector", "python -m venv .venv", "source .venv/bin/activate", "pip install -r requirements.txt"], fileKeys: [] as string[] },
  { title: "2. Intrinsic — CAM 1 (Left 45°)",  cmds: ["python calibrate_intrinsic.py --camera 0"], fileKeys: ["leftIntrinsic"]  },
  { title: "3. Intrinsic — CAM 2 (Right 45°)", cmds: ["python calibrate_intrinsic.py --camera 1"], fileKeys: ["rightIntrinsic"] },
  { title: "4. Extrinsic (ทั้ง 2 กล้อง)",       cmds: ["python calibrate_extrinsic.py"],             fileKeys: ["leftExtrinsic", "rightExtrinsic"] },
];

function CalStep({ step, calStatus, copied, onCopy }: {
  step: typeof SAFETY_CAL_STEPS[number];
  calStatus: CalStatus | null; copied: string | null; onCopy: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = step.fileKeys.length > 0
    ? step.fileKeys.every((k) => calStatus?.[k as keyof CalStatus])
    : undefined;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      done === true ? "border-green-200 dark:border-green-700/40 bg-green-50/50 dark:bg-green-900/10"
                    : "border-gray-100 dark:border-white/5 bg-white dark:bg-[#0f1e38]"
    }`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        {done === true    && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
        {done === false   && <Circle       size={14} className="text-gray-300 shrink-0" />}
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
  { title: "1. สร้าง Python Environment",         note: undefined as string | undefined, cmds: ["cd wrist-cam", "python -m venv .venv", "source .venv/bin/activate", "pip install -r requirements.txt"] },
  { title: "2. ทดสอบโดยไม่ต้องมีกล้อง (Mock)",    note: undefined, cmds: ["python mock_wrist.py"] },
  { title: "3. กล้องจริง — USB / OpenCV",          note: "เปลี่ยน --cam-index ให้ตรงกับ device index ของกล้อง", cmds: ["python main.py --cam-index 2"] },
  { title: "4. Intel RealSense (RGB + Depth)",    note: "uncomment RealSenseCamera ใน main.py แล้วรัน", cmds: ["pip install pyrealsense2", "# แก้ไข main.py: driver = RealSenseCamera()", "python main.py"] },
  { title: "5. Stereolabs ZED (RGB + Depth)",     note: "ต้องติดตั้ง ZED SDK installer ก่อน (https://www.stereolabs.com/developers)", cmds: ["pip install pyzed", "# แก้ไข main.py: driver = ZEDCamera()", "python main.py"] },
];

function WristSetupStep({ step, copied, onCopy }: { step: typeof WRIST_SETUP_STEPS[number]; copied: string | null; onCopy: (c: string) => void }) {
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
// Process control buttons (shared pattern)
// ─────────────────────────────────────────────────────────────────────────────

function ProcButtons({
  proc, onAction, loading, runColor,
}: {
  proc: ProcStatus;
  onAction: (a: "start" | "stop" | "restart" | "setup") => void;
  loading: boolean;
  runColor: "blue" | "indigo";
}) {
  const startCls = runColor === "blue"
    ? "bg-blue-500 hover:bg-blue-600 text-white"
    : "bg-indigo-500 hover:bg-indigo-600 text-white";

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Status dot */}
      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
        proc.running ? "bg-green-500 animate-pulse"
        : proc.setupRunning ? "bg-blue-500 animate-pulse"
        : "bg-gray-300 dark:bg-gray-600"
      }`} />

      {/* Setup button (only if venv not ready) */}
      {!proc.venvReady && !proc.setupRunning && (
        <button
          onClick={() => onAction("setup")} disabled={loading}
          className="h-9 px-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 text-blue-700 dark:text-blue-400 text-xs font-black disabled:opacity-50 transition-colors"
        >
          Setup
        </button>
      )}

      {/* Setup running indicator */}
      {proc.setupRunning && (
        <span className="text-xs text-blue-500 font-bold animate-pulse">กำลัง setup…</span>
      )}

      {/* Start / Restart + Stop */}
      {!proc.running ? (
        <button
          onClick={() => onAction("start")} disabled={loading || proc.setupRunning}
          className={`h-9 px-4 rounded-xl ${startCls} text-sm font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors`}
        >
          <Play size={13} /> Start
        </button>
      ) : (
        <>
          <button
            onClick={() => onAction("restart")} disabled={loading}
            className="h-9 px-3 rounded-xl bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 text-orange-700 dark:text-orange-400 text-xs font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={12} /> Restart
          </button>
          <button
            onClick={() => onAction("stop")} disabled={loading}
            className="h-9 px-3 rounded-xl bg-red-100 dark:bg-red-900/30 hover:bg-red-200 text-red-700 dark:text-red-400 text-xs font-black disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <Square size={12} /> Stop
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT: Safety Camera Panel
// ─────────────────────────────────────────────────────────────────────────────

function SafetyPanel({ wsUrl, camLeft, camRight, restartTrigger, enabled, onToggle }: {
  wsUrl: string; camLeft: number; camRight: number; restartTrigger: number;
  enabled: boolean; onToggle: (v: boolean) => void;
}) {
  const [connected, setConnected]   = useState(false);
  const [frame, setFrame]           = useState<SafetyFrame | null>(null);
  const [threshWarn, setThreshWarn] = useState(600);
  const [threshStop, setThreshStop] = useState(300);
  const [calStatus, setCalStatus]   = useState<CalStatus | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [proc, setProc]             = useState<ProcStatus>({ running: false, pid: null, setupRunning: false, venvReady: false, logs: [] });
  const [procLoading, setProcLoading] = useState(false);
  const [copied, setCopied]         = useState<string | null>(null);
  const [fps, setFps]               = useState<number | null>(null);
  const wsRef       = useRef<WebSocket | null>(null);
  const logRef      = useRef<HTMLDivElement>(null);
  const frameCount  = useRef(0);

  // FPS counter — tick every second
  useEffect(() => {
    const t = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const wsConnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => setConnected(true);
    ws.onclose   = () => { setConnected(false); wsRef.current = null; };
    ws.onerror   = () => setConnected(false);
    ws.onmessage = (e) => { try { setFrame(JSON.parse(e.data)); frameCount.current++; } catch { /* ignore */ } };
  }, [wsUrl]);

  useEffect(() => {
    if (!enabled) { wsRef.current?.close(); wsRef.current = null; return; }
    wsConnect();
    return () => wsRef.current?.close();
  }, [wsConnect, enabled]);
  useEffect(() => {
    if (!enabled || connected) return;
    const t = setInterval(() => { if (!wsRef.current) wsConnect(); }, 3000);
    return () => clearInterval(t);
  }, [connected, wsConnect, enabled]);

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
    const body: Record<string, unknown> = { action };
    if (action === "start" || action === "restart") {
      if (camLeft  >= 0) body.camLeft  = camLeft;
      if (camRight >= 0) body.camRight = camRight;
    }
    await fetch("/api/camera/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    refreshProc();
    setProcLoading(false);
  };

  const handleToggle = async (newVal: boolean) => {
    onToggle(newVal);
    if (newVal) await procAction("start");
    else await procAction("stop");
  };

  useEffect(() => {
    if (restartTrigger > 0) {
      if (camLeft < 0 && camRight < 0) procAction("stop");
      else procAction("restart");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartTrigger]);

  const refreshCal = useCallback(() => {
    setCalLoading(true);
    fetch("/api/camera/status").then((r) => r.json()).then((d: CalStatus) => { setCalStatus(d); setCalLoading(false); }).catch(() => setCalLoading(false));
  }, []);
  useEffect(() => { refreshCal(); }, [refreshCal]);

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => { setCopied(cmd); setTimeout(() => setCopied(null), 2000); });
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [proc.logs]);

  // Clear stale frame when both cameras are unassigned
  useEffect(() => { if (camLeft < 0 && camRight < 0) setFrame(null); }, [camLeft, camRight]);

  const level  = frame?.safety_level ?? 0;
  const sfCfg  = SAFETY_LEVELS[level];
  const { Icon: SafetyIcon } = sfCfg;

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-gray-100 dark:border-white/5">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 shrink-0 bg-white/95 dark:bg-[#0a1428]/95 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[14px] bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <Camera size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-gray-900 dark:text-white text-sm leading-none">Safety System</h2>
              {enabled && <WsBadge connected={connected} label={connected && fps != null ? `${fps} fps` : connected ? "…" : "Offline"} />}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate font-mono">{wsUrl}</p>
          </div>
          <ToggleSwitch enabled={enabled} onChange={handleToggle} />
          <span className={`text-xs font-black shrink-0 ${enabled ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
            {enabled ? "ON" : "OFF"}
          </span>
          {enabled && <ProcButtons proc={proc} onAction={procAction} loading={procLoading} runColor="blue" />}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a1428] px-4 py-3 space-y-3">

        {/* Safety Level banner */}
        {enabled ? (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${sfCfg.bg} ${level === 2 ? "animate-pulse" : ""}`}>
            <SafetyIcon size={20} className={sfCfg.text} />
            <span className={`text-base font-black ${sfCfg.text}`}>{sfCfg.label}</span>
            {frame?.distance_mm != null && (
              <span className={`ml-auto text-xl font-mono font-black tabular-nums ${sfCfg.text}`}>
                {frame.distance_mm.toFixed(0)}<span className="text-xs opacity-60 ml-1">mm</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800/40">
            <Camera size={20} className="text-gray-400" />
            <span className="text-base font-black text-gray-400">Camera Off</span>
          </div>
        )}

        {/* Live Feed — main content */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "cam_left"  as const, label: "CAM 1 · Left 45°",  assigned: camLeft  >= 0 },
              { key: "cam_right" as const, label: "CAM 2 · Right 45°", assigned: camRight >= 0 },
            ]).map(({ key, label, assigned }) => (
              <div key={key} className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/10" }}>
                <div className="absolute top-2 left-2 z-10 text-[9px] font-black text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  {label}
                </div>
                {!enabled ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gray-900/80">
                    <Camera size={22} className="text-gray-600 opacity-40" />
                    <span className="text-[10px] text-gray-500">Camera Off</span>
                  </div>
                ) : !assigned ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    <Camera size={22} className="text-gray-700 opacity-30" />
                    <span className="text-[10px] text-gray-600">ไม่ได้ assign</span>
                  </div>
                ) : frame?.[key] ? (
                  <img src={`data:image/jpeg;base64,${frame[key]}`} alt={key} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                    {connected
                      ? <Camera size={22} className="text-gray-600 animate-pulse" />
                      : <WifiOff size={22} className="text-gray-600" />}
                    <span className="text-[10px] text-gray-600">{connected ? "รอ frame…" : "Offline"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Stats row */}
          {enabled && frame && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 dark:bg-[#111d35] rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">ระยะห่าง</p>
                <p className="text-sm font-mono font-black text-gray-700 dark:text-gray-200">
                  {frame.distance_mm != null ? `${frame.distance_mm.toFixed(0)} mm` : "—"}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-black text-purple-400 uppercase mb-1">TCP</p>
                <p className="text-[10px] font-mono text-purple-600 dark:text-purple-300">
                  {frame.tcp ? `${frame.tcp.x.toFixed(0)}, ${frame.tcp.y.toFixed(0)}, ${frame.tcp.z.toFixed(0)}` : "—"}
                </p>
              </div>
              <div className="bg-blue-600 rounded-xl px-3 py-2.5">
                <p className="text-[9px] font-black text-white/60 uppercase mb-1">Rail</p>
                <p className="text-sm font-mono font-black text-white">
                  {frame.rail_pos != null ? frame.rail_pos.toFixed(1) : "—"}<span className="text-[9px] opacity-50 ml-0.5">mm</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Threshold Sliders */}
        <div className="bg-gray-50 dark:bg-[#111d35] rounded-2xl px-4 py-3 space-y-4">
          <p className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle size={12} /> Safety Thresholds
          </p>

          {[
            { label: "เตือน (L1)", color: "orange" as const, value: threshWarn, min: 100, max: 2000, step: 50, set: (v: number) => { setThreshWarn(v); sendThresholds(v, threshStop); } },
            { label: "หยุด (L2)",  color: "red"    as const, value: threshStop, min: 50,  max: 1000, step: 25, set: (v: number) => { setThreshStop(v); sendThresholds(threshWarn, v); } },
          ].map(({ label, color, value, min, max, step, set }) => (
            <div key={label}>
              <div className={`flex items-center justify-between mb-2 text-${color}-500`}>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${color}-500`} />
                  <span className="text-sm font-black">{label}</span>
                </div>
                <span className="text-lg font-black font-mono tabular-nums">{value} <span className="text-xs opacity-60">mm</span></span>
              </div>
              <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => set(+e.target.value)}
                className={`w-full h-3 cursor-pointer accent-${color}-500 rounded-full`}
              />
            </div>
          ))}

          <div className="flex gap-3 text-[10px] text-gray-400 flex-wrap pt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> ≥{threshWarn} mm = ปกติ</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" /> {threshStop}–{threshWarn} mm = เตือน</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 shrink-0" /> &lt;{threshStop} mm = หยุด</span>
          </div>
        </div>

        {/* Calibration (collapsible) */}
        <SectionCard title="Calibration — Safety Cameras" icon={<Crosshair size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-400">บันทึกที่ <code className="font-mono">detector/calibration/</code></p>
              <button onClick={refreshCal} disabled={calLoading} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-[#1a2540] text-[10px] font-black text-gray-500 disabled:opacity-50">
                <RefreshCw size={10} className={calLoading ? "animate-spin" : ""} /> รีเฟรช
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CAL_FILES.map(({ key, label, file }) => {
                const ok = calStatus?.[key as keyof CalStatus] ?? false;
                return (
                  <div key={key} className={`rounded-xl p-3 border transition-all ${ok ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/40" : "bg-white dark:bg-[#0f1e38] border-gray-100 dark:border-transparent"}`}>
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

        {/* Logs (collapsible) */}
        <SectionCard title="Logs & Commands" icon={<Terminal size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-2">
            {proc.logs.length > 0 && (
              <div ref={logRef} className="h-32 overflow-y-auto bg-gray-900 dark:bg-black/60 rounded-xl px-3 py-2 space-y-0.5">
                {proc.logs.slice(-60).map((line, i) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes("ERROR") ? "text-red-400" : line.includes("WARN") ? "text-yellow-400" : "text-gray-500"
                  }`}>{line}</p>
                ))}
              </div>
            )}
            <p className="text-[10px] font-black text-gray-400 uppercase mt-1">รันด้วยตัวเอง</p>
            <CmdLine cmd="python detector/main.py"      copied={copied} onCopy={copyCmd} />
            <CmdLine cmd="python detector/mock_detector.py" copied={copied} onCopy={copyCmd} />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT: Wrist Camera Panel
// ─────────────────────────────────────────────────────────────────────────────

function WristPanel({ wsUrl, camIndex, restartTrigger, enabled, onToggle }: {
  wsUrl: string; camIndex: number; restartTrigger: number;
  enabled: boolean; onToggle: (v: boolean) => void;
}) {
  const [connected, setConnected]     = useState(false);
  const [frame, setFrame]             = useState<WristFrame | null>(null);
  const [viewMode, setViewMode]       = useState<"rgb" | "depth">("rgb");
  const [copied, setCopied]           = useState<string | null>(null);
  const [proc, setProc]               = useState<ProcStatus>({ running: false, pid: null, setupRunning: false, venvReady: false, logs: [] });
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

  useEffect(() => {
    if (!enabled) { wsRef.current?.close(); wsRef.current = null; return; }
    wsConnect();
    return () => wsRef.current?.close();
  }, [wsConnect, enabled]);
  useEffect(() => {
    if (!enabled || connected) return;
    const t = setInterval(() => { if (!wsRef.current) wsConnect(); }, 3000);
    return () => clearInterval(t);
  }, [connected, wsConnect, enabled]);

  const refreshProc = useCallback(() => {
    fetch("/api/camera/wrist-process").then((r) => r.json()).then(setProc).catch(() => {});
  }, []);
  useEffect(() => { refreshProc(); const t = setInterval(refreshProc, 2000); return () => clearInterval(t); }, [refreshProc]);

  const procAction = async (action: "start" | "stop" | "restart" | "setup") => {
    setProcLoading(true);
    const body: Record<string, unknown> = { action };
    if (action === "start" || action === "restart") {
      if (camIndex >= 0) body.camIndex = camIndex;
    }
    await fetch("/api/camera/wrist-process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    refreshProc();
    setProcLoading(false);
  };

  const handleToggle = async (newVal: boolean) => {
    onToggle(newVal);
    if (newVal) await procAction("start");
    else await procAction("stop");
  };

  useEffect(() => {
    if (restartTrigger > 0) {
      if (camIndex < 0) procAction("stop");
      else procAction("restart");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartTrigger]);

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

  // Derive display frame — ignore stale frame if camera is not assigned
  const displayFrame = camIndex >= 0
    ? (viewMode === "depth" ? frame?.frame_depth : frame?.frame_rgb)
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 shrink-0 bg-white/95 dark:bg-[#0a1428]/95 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[14px] bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Box size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-gray-900 dark:text-white text-sm leading-none">Wrist Camera</h2>
              {enabled && (
                <WsBadge
                  connected={connected}
                  label={connected && frame ? `${frame.fps != null ? frame.fps.toFixed(0) : "?"} fps` : connected ? "…" : "Offline"}
                />
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 truncate font-mono">{wsUrl}</p>
          </div>

          {/* RGB / Depth toggle — only when enabled */}
          {enabled && (
            <div className="flex gap-0.5 bg-gray-100 dark:bg-[#111d35] rounded-full p-0.5 shrink-0">
              {(["rgb", "depth"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`px-3 h-8 rounded-full text-[11px] font-black transition-all flex items-center gap-1.5 ${
                    viewMode === m
                      ? "bg-white dark:bg-[#1a2540] text-black dark:text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {m === "rgb" ? <><Eye size={11} /> RGB</> : <><Layers size={11} /> Depth</>}
                </button>
              ))}
            </div>
          )}

          <ToggleSwitch enabled={enabled} onChange={handleToggle} />
          <span className={`text-xs font-black shrink-0 ${enabled ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
            {enabled ? "ON" : "OFF"}
          </span>
          {enabled && <ProcButtons proc={proc} onAction={procAction} loading={procLoading} runColor="indigo" />}
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a1428] px-4 py-3 space-y-3">

        {/* Depth warning */}
        {frame && !frame.has_depth && viewMode === "depth" && (
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-orange-600 text-xs font-bold">
            <AlertTriangle size={13} /> กล้องไม่รองรับ depth จริง
          </div>
        )}

        {/* Live Feed — main content */}
        <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/10" }}>
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full">
            <div className={`w-1.5 h-1.5 rounded-full ${enabled && connected ? "bg-indigo-400 animate-pulse" : "bg-gray-600"}`} />
            <span className="text-[9px] font-black text-white/85">WRIST CAM</span>
          </div>
          {enabled && viewMode === "depth" && (
            <div className="absolute top-2 right-2 z-10 bg-indigo-600/80 text-white text-[9px] font-black px-2 py-0.5 rounded-full">DEPTH</div>
          )}
          {enabled && frame?.objects && frame.objects.length > 0 && (
            <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1">
              {frame.objects.slice(0, 4).map((obj, i) => (
                <span key={i} className="bg-yellow-400/90 text-black text-[9px] font-black px-2 py-0.5 rounded-full">
                  {obj.label} {(obj.confidence * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          )}
          {!enabled ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gray-900/80">
              <Camera size={28} className="text-gray-600 opacity-40" />
              <span className="text-[10px] text-gray-500">Camera Off</span>
            </div>
          ) : camIndex < 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <Camera size={28} className="text-gray-700 opacity-30" />
              <span className="text-[10px] text-gray-600">ไม่ได้ assign</span>
            </div>
          ) : displayFrame ? (
            <img src={`data:image/jpeg;base64,${displayFrame}`} alt="wrist" className="absolute inset-0 w-full h-full object-cover" />
          ) : connected ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <Camera size={28} className="text-gray-700 animate-pulse" />
              <span className="text-[10px] text-gray-600">รอ frame…</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <WifiOff size={28} className="text-gray-700" />
              <p className="text-gray-600 text-xs">Wrist cam ออฟไลน์</p>
            </div>
          )}
        </div>

        {/* Detected objects list */}
        {frame?.objects && frame.objects.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-gray-400 uppercase">Detected Objects</p>
            {frame.objects.map((obj, i) => (
              <div key={i} className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl px-3 py-2.5">
                <span className="text-sm font-black text-gray-800 dark:text-gray-200">{obj.label}</span>
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

        {/* Setup Guide (collapsible) */}
        <SectionCard title="Setup & Camera Type" icon={<Crosshair size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-1.5">
            {WRIST_SETUP_STEPS.map((step) => (
              <WristSetupStep key={step.title} step={step} copied={copied} onCopy={copyCmd} />
            ))}
          </div>
        </SectionCard>

        {/* Logs (collapsible) */}
        <SectionCard title="Logs & Commands" icon={<Terminal size={13} />} collapsible defaultOpen={false}>
          <div className="space-y-2">
            {proc.logs.length > 0 && (
              <div ref={logRef} className="h-32 overflow-y-auto bg-gray-900 dark:bg-black/60 rounded-xl px-3 py-2 space-y-0.5">
                {proc.logs.slice(-60).map((line, i) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes("ERROR") ? "text-red-400" : line.includes("WARN") ? "text-yellow-400" : "text-gray-500"
                  }`}>{line}</p>
                ))}
              </div>
            )}
            <p className="text-[10px] font-black text-gray-400 uppercase mt-1">รันด้วยตัวเอง</p>
            <CmdLine cmd="cd wrist-cam && python main.py"       copied={copied} onCopy={copyCmd} />
            <CmdLine cmd="cd wrist-cam && python mock_wrist.py" copied={copied} onCopy={copyCmd} />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera Assignment Bar
// ─────────────────────────────────────────────────────────────────────────────

interface CameraDevice { index: number; name: string; device: string }

type TestState = "idle" | "testing" | "ok" | "fail";

function CameraAssignBar({
  camCfg, onChange, onApplyAndRestart,
}: {
  camCfg: CameraConfig;
  onChange: (cfg: CameraConfig) => void;
  onApplyAndRestart: () => void;
}) {
  const [devices,  setDevices]  = useState<CameraDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [tests,    setTests]    = useState<{ safetyLeft: TestState; safetyRight: TestState; wrist: TestState }>(
    { safetyLeft: "idle", safetyRight: "idle", wrist: "idle" }
  );

  // Auto-scan on mount
  useEffect(() => { scan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = async () => {
    setScanning(true); setError(null);
    try {
      const res  = await fetch("/api/camera/devices");
      const data = await res.json();
      if (data.error && !data.devices?.length) setError(data.error);
      setDevices(data.devices ?? []);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  };

  // Test snapshot for a single index; returns ok/fail
  const testCamera = async (idx: number): Promise<"ok" | "fail"> => {
    if (idx < 0) return "fail";
    try {
      const r = await fetch(`/api/camera/snapshot?index=${idx}`);
      const d = await r.json();
      return d.frame ? "ok" : "fail";
    } catch {
      return "fail";
    }
  };

  const applyAndTest = async () => {
    saveCameraConfig(camCfg);
    onApplyAndRestart();

    // Reset all to testing
    setTests({ safetyLeft: "testing", safetyRight: "testing", wrist: "testing" });

    // Test sequentially to avoid camera lock conflicts
    const slots = [
      { key: "safetyLeft"  as const, idx: camCfg.safetyLeft  },
      { key: "safetyRight" as const, idx: camCfg.safetyRight },
      { key: "wrist"       as const, idx: camCfg.wrist       },
    ];
    for (const { key, idx } of slots) {
      if (idx < 0) { setTests((t) => ({ ...t, [key]: "idle" })); continue; }
      const result = await testCamera(idx);
      setTests((t) => ({ ...t, [key]: result }));
    }
  };

  const SLOTS = [
    { key: "safetyLeft"  as const, label: "Safety Left",  accent: "text-blue-500",   onChange: (i: number) => onChange({ ...camCfg, safetyLeft:  i }) },
    { key: "safetyRight" as const, label: "Safety Right", accent: "text-blue-500",   onChange: (i: number) => onChange({ ...camCfg, safetyRight: i }) },
    { key: "wrist"       as const, label: "Wrist",        accent: "text-indigo-500", onChange: (i: number) => onChange({ ...camCfg, wrist:       i }) },
  ] as const;

  const selectCls = "h-10 bg-white dark:bg-[#0a1628] border border-gray-200 dark:border-white/10 rounded-xl px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-700 dark:text-gray-200";

  const values: Record<string, number> = {
    safetyLeft: camCfg.safetyLeft, safetyRight: camCfg.safetyRight, wrist: camCfg.wrist,
  };

  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5 bg-violet-50/60 dark:bg-violet-950/20">
      <div className="flex items-center gap-4 px-6 py-3 flex-wrap">

        <div className="flex items-center gap-2 shrink-0">
          <Camera size={13} className="text-violet-500" />
          <span className="text-[11px] font-black text-violet-600 dark:text-violet-400">Camera Assignment</span>
        </div>

        {/* 3 dropdowns inline */}
        {SLOTS.map(({ key, label, accent, onChange: onSlotChange }) => (
          <div key={key} className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-black shrink-0 ${accent}`}>{label}</span>
            <select
              value={values[key]}
              onChange={(e) => {
                onSlotChange(Number(e.target.value));
                setTests((t) => ({ ...t, [key]: "idle" }));
              }}
              className={selectCls}
            >
              <option value={-1}>— ไม่ใช้ —</option>
              {devices.map((d) => (
                <option key={d.index} value={d.index}>#{d.index} {d.name}</option>
              ))}
            </select>
            {/* Test result indicator */}
            {tests[key] === "testing" && <RefreshCw size={14} className="text-gray-400 animate-spin shrink-0" />}
            {tests[key] === "ok"      && <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
            {tests[key] === "fail"    && <span className="text-xs font-bold text-red-500 shrink-0">✗</span>}
          </div>
        ))}

        {error && <span className="text-[10px] text-red-500">{error}</span>}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={scan} disabled={scanning}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 dark:bg-[#1a2540] hover:bg-gray-200 dark:hover:bg-[#1e2d4a] text-xs font-black text-gray-600 dark:text-gray-300 disabled:opacity-50 transition-colors"
          >
            <Scan size={11} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan"}
          </button>
          <button
            onClick={applyAndTest}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-black transition-colors"
          >
            <Check size={13} /> Apply
          </button>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraSetupPage() {
  // Use safe SSR defaults first, then load localStorage after hydration
  const [config, setConfig]              = useState<JetsonConfig>({ ip: "localhost", rosPort: 9090, safetyPort: 8765, wristPort: 8766 });
  const [camCfg, setCamCfg]              = useState<CameraConfig>({ safetyLeft: -1, safetyRight: -1, wrist: -1, safetyEnabled: false, wristEnabled: false });
  const [safetyRestart, setSafetyRestart] = useState(0);
  const [wristRestart,  setWristRestart]  = useState(0);

  useEffect(() => {
    const cfg = loadCameraConfig();
    setConfig(loadJetsonConfig());
    setCamCfg(cfg);
    // No auto-start — user controls camera on/off via toggle
  }, []);

  const handleApplyConfig = (cfg: JetsonConfig) => {
    saveJetsonConfig(cfg);
    setConfig(cfg);
  };

  const handleSafetyToggle = (v: boolean) => {
    const newCfg = { ...camCfg, safetyEnabled: v };
    setCamCfg(newCfg);
    saveCameraConfig(newCfg);
  };

  const handleWristToggle = (v: boolean) => {
    const newCfg = { ...camCfg, wristEnabled: v };
    setCamCfg(newCfg);
    saveCameraConfig(newCfg);
  };

  const wsSafetyUrl = makeWsUrl(config.ip, config.safetyPort);
  const wsWristUrl  = makeWsUrl(config.ip, config.wristPort);

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#070d1b]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
            <p className="text-[11px] text-gray-400 mt-0.5">Safety System · Wrist Camera · Process Manager</p>
          </div>
        </div>
      </header>

      {/* ── Connection Config Bar ────────────────────────────────────────────── */}
      <ConnectionBar config={config} onApply={handleApplyConfig} />

      {/* ── Camera Assignment Bar ────────────────────────────────────────────── */}
      <CameraAssignBar
        camCfg={camCfg}
        onChange={setCamCfg}
        onApplyAndRestart={() => {
          if (camCfg.safetyEnabled) setSafetyRestart((n) => n + 1);
          if (camCfg.wristEnabled)  setWristRestart((n) => n + 1);
        }}
      />

      {/* ── Body: 2 equal columns ────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        <SafetyPanel
          wsUrl={wsSafetyUrl} camLeft={camCfg.safetyLeft} camRight={camCfg.safetyRight}
          restartTrigger={safetyRestart} enabled={camCfg.safetyEnabled} onToggle={handleSafetyToggle}
        />
        <WristPanel
          wsUrl={wsWristUrl} camIndex={camCfg.wrist}
          restartTrigger={wristRestart} enabled={camCfg.wristEnabled} onToggle={handleWristToggle}
        />
      </div>

    </div>
  );
}
