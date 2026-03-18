"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Gamepad2, Home, Terminal } from "lucide-react";
import { useRos } from "@/context/RosContext";

type Tab = "joint" | "effector";
const JOG_INTERVAL_MS = 100;

const JOINT_AXES = [
  { key: "j1",      label: "J1",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "j2",      label: "J2",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "j3",      label: "J3",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "j4",      label: "J4",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "j5",      label: "J5",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "j6",      label: "J6",      unit: "°",  color: "bg-gray-100 text-gray-700"     },
  { key: "rail",    label: "Rail",    unit: "mm", color: "bg-blue-100 text-blue-700"     },
  { key: "gripper", label: "Gripper", unit: "%",  color: "bg-orange-100 text-orange-700" },
] as const;

type JointKey = typeof JOINT_AXES[number]["key"];

const XYZ_AXES = [
  { key: "x", label: "Tip X", unit: "mm", color: "bg-red-100 text-red-700"    },
  { key: "y", label: "Tip Y", unit: "mm", color: "bg-green-100 text-green-700" },
  { key: "z", label: "Tip Z", unit: "mm", color: "bg-blue-100 text-blue-700"  },
] as const;

const RPY_AXES = [
  { key: "roll",  label: "Tip Rx", unit: "°", color: "bg-purple-100 text-purple-700" },
  { key: "pitch", label: "Tip Ry", unit: "°", color: "bg-purple-100 text-purple-700" },
  { key: "yaw",   label: "Tip Rz", unit: "°", color: "bg-purple-100 text-purple-700" },
] as const;

// ── AxisControl ────────────────────────────────────────────────────────────────
interface AxisControlProps {
  label: string; unit: string; color: string;
  currentValue: number;
  onJog: (direction: 1 | -1) => void;
}

function AxisControl({ label, unit, color, currentValue, onJog }: AxisControlProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onJogRef    = useRef(onJog);
  useEffect(() => { onJogRef.current = onJog; }, [onJog]);
  useEffect(() => () => stopHold(), []);

  const stopHold = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const startHold = (direction: 1 | -1) => {
    const fire = () => onJogRef.current(direction);
    fire();
    intervalRef.current = setInterval(fire, JOG_INTERVAL_MS);
  };

  const btnCls =
    "w-10 h-10 rounded-xl bg-white dark:bg-[#1a2540] hover:bg-gray-100 dark:hover:bg-[#243050] active:bg-gray-200 dark:active:bg-[#2d3e60] border border-gray-200 dark:border-white/8 text-xl font-black flex items-center justify-center transition-colors select-none touch-none";

  const holdProps = (dir: 1 | -1) => ({
    onMouseDown:   () => startHold(dir),
    onMouseUp:     stopHold,
    onMouseLeave:  stopHold,
    onTouchStart:  (e: React.TouchEvent) => { e.preventDefault(); startHold(dir); },
    onTouchEnd:    stopHold,
    onTouchCancel: stopHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="px-3 py-2.5 bg-gray-50 dark:bg-[#111d35] rounded-2xl flex items-center gap-2 select-none">
      <span className={`inline-flex items-center justify-center w-14 h-8 rounded-full text-[11px] font-black shrink-0 ${color}`}>
        {label}
      </span>
      <span className="flex-1 font-mono font-black text-sm tabular-nums text-gray-600 dark:text-[#b0c4e0]">
        {currentValue.toFixed(1)}{unit}
      </span>
      <button {...holdProps(-1)} className={btnCls}>−</button>
      <button {...holdProps(+1)} className={btnCls}>+</button>
    </div>
  );
}

// ── Log entry type ─────────────────────────────────────────────────────────────
interface JogLogEntry {
  ts: string;
  cmd: Record<string, unknown>;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JogControlPanel({ onClose, mode = "modal" }: { onClose: () => void; mode?: "modal" | "panel" }) {
  const { jointStates, railPos, gripperPos, effectorPose, sendGotoPosition, sendJogCommand, calibration } = useRos();
  const [tab, setTab]       = useState<Tab>("joint");
  const [speed, setSpeed]   = useState(30);
  const [jogLog, setJogLog] = useState<JogLogEntry[]>([]);

  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const pushLog = useCallback((cmd: Record<string, unknown>) => {
    const now = new Date();
    const ts  = now.toLocaleTimeString("en-US", {
      hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) + "." + String(now.getMilliseconds()).padStart(3, "0").slice(0, 1);
    setJogLog((prev) => [{ ts, cmd }, ...prev].slice(0, 12));
  }, []);

  // Joint-mode jog: send only axis + direction + speed
  const sendJogAxis = useCallback((key: JointKey, direction: 1 | -1) => {
    const cmd = {
      label:       "jog",
      controlMode: "joint",
      axis:        key,
      direction,
      speed:       speedRef.current,
    };
    sendJogCommand(cmd);
    pushLog(cmd);
  }, [sendJogCommand, pushLog]);

  // Effector-mode jog: send axis + direction + speed + TCP offset for IK
  const sendJogEffector = useCallback((axis: string, direction: 1 | -1) => {
    const { tcpOffset } = calibration;
    const cmd = {
      label:       "jog",
      controlMode: "effector",
      axis,
      direction,
      speed:       speedRef.current,
      tcp_x:       tcpOffset.x,
      tcp_y:       tcpOffset.y,
      tcp_z:       tcpOffset.z,
    };
    sendJogCommand(cmd);
    pushLog(cmd);
  }, [sendJogCommand, pushLog, calibration]);

  // Home: use sendGotoPosition so calibration inverse transforms are applied
  const sendHome = useCallback(() => {
    const cmd = {
      controlMode: "joint",
      j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0,
      rail: 0, gripper: 0,
      speed: speedRef.current,
      sequence: 0, label: "home",
    };
    sendGotoPosition(cmd);
    pushLog({ label: "home", speed: speedRef.current });
  }, [sendGotoPosition, pushLog]);

  const jointValue = (key: JointKey): number => {
    if (key === "rail")    return railPos;
    if (key === "gripper") return gripperPos;
    return jointStates[parseInt(key[1]) - 1] ?? 0;
  };

  const panelContent = (
    <div className={
      mode === "panel"
        ? "flex flex-col h-full bg-white dark:bg-[#0a1428] overflow-hidden"
        : "tesla-card w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden"
    }>

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/5 dark:border-white/7 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[14px] bg-gray-100 dark:bg-[#1a2540] flex items-center justify-center">
            <Gamepad2 size={18} className="text-gray-600 dark:text-[#90a8c8]" />
          </div>
          <div>
            <h2 className="text-xl font-black leading-tight">Jog</h2>
            <p className="text-xs text-gray-400 dark:text-[#9aa8c8] font-bold mt-0.5">ควบคุมด้วยมือ</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-6 pt-4 pb-3 shrink-0">
        {(["joint", "effector"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-full text-xs font-black transition-colors ${
              tab === t
                ? t === "joint"
                  ? "bg-gray-900 dark:bg-[#e2eaff] text-white dark:text-[#070d1b]"
                  : "bg-purple-600 dark:bg-purple-500 text-white"
                : "bg-gray-100 dark:bg-[#1a2540] text-gray-500 dark:text-[#8090b8] hover:bg-gray-200 dark:hover:bg-[#243050]"
            }`}
          >
            {t === "joint" ? "Joint" : "Effector"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 px-6 py-2">
        {tab === "joint" ? (
          <div className="space-y-2">
            {JOINT_AXES.map((axis) => (
              <AxisControl
                key={axis.key}
                label={axis.label} unit={axis.unit} color={axis.color}
                currentValue={jointValue(axis.key as JointKey)}
                onJog={(dir) => sendJogAxis(axis.key as JointKey, dir)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black text-gray-400 dark:text-[#9aa8c8] uppercase tracking-wider">Position (mm)</p>
              {XYZ_AXES.map((axis) => (
                <AxisControl
                  key={axis.key}
                  label={axis.label} unit={axis.unit} color={axis.color}
                  currentValue={effectorPose[axis.key as "x" | "y" | "z"]}
                  onJog={(dir) => sendJogEffector(axis.key, dir)}
                />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black text-gray-400 dark:text-[#9aa8c8] uppercase tracking-wider">Orientation (°)</p>
              {RPY_AXES.map((axis) => (
                <AxisControl
                  key={axis.key}
                  label={axis.label} unit={axis.unit} color={axis.color}
                  currentValue={effectorPose[axis.key as "roll" | "pitch" | "yaw"]}
                  onJog={(dir) => sendJogEffector(axis.key, dir)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Command Log */}
      <div className="mx-6 mb-3 rounded-2xl bg-gray-950 dark:bg-black/60 overflow-hidden border border-white/5 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Terminal size={11} className="text-green-400" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Command Log</span>
          {jogLog.length === 0 && (
            <span className="text-[10px] text-gray-600 ml-1">— กดปุ่มเพื่อดู</span>
          )}
        </div>
        <div className="h-16 overflow-y-auto px-3 py-2 space-y-0.5 font-mono text-[10px]">
          {jogLog.length === 0 ? (
            <p className="text-gray-700 italic">ยังไม่มีคำสั่ง</p>
          ) : (
            jogLog.map((entry, i) => (
              <div key={i} className="flex items-baseline gap-2 leading-relaxed">
                <span className="text-gray-600 shrink-0 w-16">{entry.ts}</span>
                {entry.cmd.label === "home" ? (
                  <span className="text-yellow-400">HOME  spd:{entry.cmd.speed as number}%</span>
                ) : (
                  <>
                    <span className={`shrink-0 w-14 ${entry.cmd.controlMode === "effector" ? "text-purple-400" : "text-cyan-400"}`}>
                      [{entry.cmd.controlMode as string}]
                    </span>
                    <span className="text-yellow-300 shrink-0 w-10">{String(entry.cmd.axis)}</span>
                    <span className={(entry.cmd.direction as number) > 0 ? "text-green-400 shrink-0" : "text-red-400 shrink-0"}>
                      {(entry.cmd.direction as number) > 0 ? "  +" : "  −"}
                    </span>
                    <span className="text-gray-500 shrink-0">spd:{entry.cmd.speed as number}%</span>
                    {entry.cmd.tcp_x != null && (
                      <span className="text-purple-500">
                        tcp:({entry.cmd.tcp_x as number},{entry.cmd.tcp_y as number},{entry.cmd.tcp_z as number})mm
                      </span>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer: Speed + Home */}
      <div className="px-6 pt-3 pb-6 border-t border-black/5 dark:border-white/7 space-y-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-gray-400 dark:text-[#9aa8c8] uppercase w-12 shrink-0">Speed</span>
          <input
            type="range" min="1" max="100" step="1" value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="flex-1 h-2 cursor-pointer accent-blue-500"
          />
          <span className="text-sm font-black text-blue-600 w-10 text-right tabular-nums">{speed}%</span>
        </div>
        <button
          onClick={sendHome}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 dark:bg-[#1a2540] hover:bg-gray-200 dark:hover:bg-[#243050] active:bg-gray-300 dark:active:bg-[#2d3e60] transition-colors font-black text-sm text-gray-700 dark:text-[#b0c4e0]"
        >
          <Home size={16} />
          Home
        </button>
      </div>

    </div>
  );

  if (mode === "panel") return panelContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {panelContent}
    </div>
  );
}
