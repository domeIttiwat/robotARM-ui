"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Gamepad2, Home } from "lucide-react";
import { useRos } from "@/context/RosContext";

type Tab = "joint" | "effector";
const JOG_INTERVAL_MS = 100;

const JOINT_AXES = [
  { key: "j1",      label: "J1",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "j2",      label: "J2",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "j3",      label: "J3",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "j4",      label: "J4",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "j5",      label: "J5",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "j6",      label: "J6",      unit: "°",  step: 1,  min: -180, max: 180,  color: "bg-gray-100 text-gray-700",     maxRate: 90  },
  { key: "rail",    label: "Rail",    unit: "mm", step: 5,  min: 0,    max: 1000, color: "bg-blue-100 text-blue-700",     maxRate: 300 },
  { key: "gripper", label: "Gripper", unit: "%",  step: 5,  min: 0,    max: 100,  color: "bg-orange-100 text-orange-700", maxRate: 100 },
] as const;

type JointKey = typeof JOINT_AXES[number]["key"];

const XYZ_AXES = [
  { key: "x", label: "Tip X", unit: "mm", step: 5, min: -700, max: 700, color: "bg-red-100 text-red-700",    maxRate: 300 },
  { key: "y", label: "Tip Y", unit: "mm", step: 5, min: -700, max: 700, color: "bg-green-100 text-green-700", maxRate: 300 },
  { key: "z", label: "Tip Z", unit: "mm", step: 5, min: 0,    max: 800, color: "bg-blue-100 text-blue-700",  maxRate: 300 },
] as const;

const RPY_AXES = [
  { key: "roll",  label: "Tip Rx", unit: "°", step: 1, min: -180, max: 180, color: "bg-purple-100 text-purple-700", maxRate: 90 },
  { key: "pitch", label: "Tip Ry", unit: "°", step: 1, min: -180, max: 180, color: "bg-purple-100 text-purple-700", maxRate: 90 },
  { key: "yaw",   label: "Tip Rz", unit: "°", step: 1, min: -180, max: 180, color: "bg-purple-100 text-purple-700", maxRate: 90 },
] as const;

// ── AxisControl ────────────────────────────────────────────────────────────────
// ± buttons only — accumulate target in local ref (not robot feedback).
interface AxisControlProps {
  label: string; unit: string; color: string;
  currentValue: number; min: number; max: number; step: number;
  maxRate: number;
  speedRef: React.MutableRefObject<number>;
  onSet: (value: number) => void;
}

function AxisControl({ label, unit, color, currentValue, min, max, step, maxRate, speedRef, onSet }: AxisControlProps) {
  const targetRef   = useRef(currentValue);
  const isHolding   = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSetRef    = useRef(onSet);
  useEffect(() => { onSetRef.current = onSet; }, [onSet]);

  // Sync local target with robot only when idle
  useEffect(() => {
    if (!isHolding.current) targetRef.current = Math.max(min, Math.min(max, currentValue));
  }, [currentValue, min, max]);

  useEffect(() => () => stopHold(), []);

  const stopHold = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    isHolding.current = false;
  };

  const startHold = (direction: 1 | -1) => {
    isHolding.current = true;
    const fire = () => {
      const dynStep = Math.max(step, (speedRef.current / 100) * maxRate * (JOG_INTERVAL_MS / 1000));
      const next = Math.max(min, Math.min(max, targetRef.current + dynStep * direction));
      targetRef.current = next;
      onSetRef.current(next);
    };
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

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JogControlPanel({ onClose }: { onClose: () => void }) {
  const { jointStates, railPos, gripperPos, effectorPose, sendGotoPosition } = useRos();
  const [tab, setTab] = useState<Tab>("joint");
  const [speed, setSpeed] = useState(30);

  const jointStatesRef   = useRef(jointStates);
  const railPosRef       = useRef(railPos);
  const gripperPosRef    = useRef(gripperPos);
  const speedRef         = useRef(speed);
  // Tracks last-commanded effector pose so non-jogged axes don't drift from feedback
  const localEffectorRef = useRef({ ...effectorPose });
  const isJoggingRef     = useRef(false);
  const jogTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { jointStatesRef.current = jointStates; }, [jointStates]);
  useEffect(() => { railPosRef.current     = railPos;     }, [railPos]);
  useEffect(() => { gripperPosRef.current  = gripperPos;  }, [gripperPos]);
  useEffect(() => { speedRef.current       = speed;       }, [speed]);

  // Sync local target with robot feedback only when idle
  useEffect(() => {
    if (!isJoggingRef.current) localEffectorRef.current = { ...effectorPose };
  }, [effectorPose]);

  // ── Absolute-set commands ──────────────────────────────────────────────
  const sendJointSet = useCallback((key: JointKey, value: number) => {
    const j = jointStatesRef.current;
    const base = {
      controlMode: "joint",
      j1: j[0], j2: j[1], j3: j[2], j4: j[3], j5: j[4], j6: j[5],
      rail:    railPosRef.current,
      gripper: gripperPosRef.current,
      speed:   speedRef.current,
      sequence: 0, label: "jog",
    };
    if (key === "rail") {
      sendGotoPosition({ ...base, rail: value });
    } else if (key === "gripper") {
      sendGotoPosition({ ...base, gripper: Math.max(0, Math.min(100, value)) });
    } else {
      const idx    = parseInt(key[1]) - 1;
      const joints = [j[0], j[1], j[2], j[3], j[4], j[5]];
      joints[idx]  = value;
      sendGotoPosition({ ...base, j1: joints[0], j2: joints[1], j3: joints[2], j4: joints[3], j5: joints[4], j6: joints[5] });
    }
  }, [sendGotoPosition]);

  const sendEffectorSet = useCallback((key: string, value: number) => {
    // Mark jogging; reset to idle after 500 ms of no commands
    isJoggingRef.current = true;
    if (jogTimeoutRef.current) clearTimeout(jogTimeoutRef.current);
    jogTimeoutRef.current = setTimeout(() => { isJoggingRef.current = false; }, 500);

    // Update only the commanded axis in local target — other axes keep last commanded value
    (localEffectorRef.current as any)[key] = value;
    const loc = localEffectorRef.current;
    const j   = jointStatesRef.current;
    sendGotoPosition({
      controlMode: "effector",
      j1: j[0], j2: j[1], j3: j[2], j4: j[3], j5: j[4], j6: j[5],
      rail:    railPosRef.current,
      gripper: gripperPosRef.current,
      speed:   speedRef.current,
      sequence: 0, label: "jog",
      x: loc.x, y: loc.y, z: loc.z,
      roll: loc.roll, pitch: loc.pitch, yaw: loc.yaw,
    });
  }, [sendGotoPosition]);

  const sendHome = useCallback(() => {
    sendGotoPosition({
      controlMode: "joint",
      j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0,
      rail: 0, gripper: 0,
      speed: speedRef.current,
      sequence: 0, label: "home",
    });
  }, [sendGotoPosition]);

  const jointValue = (key: JointKey): number => {
    if (key === "rail")    return railPos;
    if (key === "gripper") return gripperPos;
    return jointStates[parseInt(key[1]) - 1] ?? 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="tesla-card w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-black/5 dark:border-white/7">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[16px] bg-gray-100 dark:bg-[#1a2540] flex items-center justify-center">
              <Gamepad2 size={20} className="text-gray-600 dark:text-[#90a8c8]" />
            </div>
            <div>
              <h2 className="text-2xl font-black leading-tight">Jog</h2>
              <p className="text-xs text-gray-400 dark:text-[#9aa8c8] font-bold mt-0.5">ควบคุมด้วยมือ</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-8 pt-5 pb-3">
          {(["joint", "effector"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-2.5 rounded-full text-sm font-black transition-colors ${
                tab === t
                  ? t === "joint"
                    ? "bg-gray-900 dark:bg-[#e2eaff] text-white dark:text-[#070d1b]"
                    : "bg-purple-600 dark:bg-purple-500 text-white"
                  : "bg-gray-100 dark:bg-[#1a2540] text-gray-500 dark:text-[#8090b8] hover:bg-gray-200 dark:hover:bg-[#243050]"
              }`}
            >
              {t === "joint" ? "Joint Mode" : "Effector Mode"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-8 py-3">
          {tab === "joint" ? (
            <div className="grid grid-cols-2 gap-2.5">
              {JOINT_AXES.map((axis) => (
                <AxisControl
                  key={axis.key}
                  label={axis.label} unit={axis.unit} color={axis.color}
                  currentValue={jointValue(axis.key)}
                  min={axis.min} max={axis.max} step={axis.step}
                  maxRate={axis.maxRate} speedRef={speedRef}
                  onSet={(v) => sendJointSet(axis.key as JointKey, v)}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <p className="text-[10px] font-black text-gray-400 dark:text-[#9aa8c8] uppercase tracking-wider">Position (mm)</p>
                {XYZ_AXES.map((axis) => (
                  <AxisControl
                    key={axis.key}
                    label={axis.label} unit={axis.unit} color={axis.color}
                    currentValue={effectorPose[axis.key as "x" | "y" | "z"]}
                    min={axis.min} max={axis.max} step={axis.step}
                    maxRate={axis.maxRate} speedRef={speedRef}
                    onSet={(v) => sendEffectorSet(axis.key, v)}
                  />
                ))}
              </div>
              <div className="space-y-2.5">
                <p className="text-[10px] font-black text-gray-400 dark:text-[#9aa8c8] uppercase tracking-wider">Orientation (°)</p>
                {RPY_AXES.map((axis) => (
                  <AxisControl
                    key={axis.key}
                    label={axis.label} unit={axis.unit} color={axis.color}
                    currentValue={effectorPose[axis.key as "roll" | "pitch" | "yaw"]}
                    min={axis.min} max={axis.max} step={axis.step}
                    maxRate={axis.maxRate} speedRef={speedRef}
                    onSet={(v) => sendEffectorSet(axis.key, v)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Speed + Home */}
        <div className="px-8 pt-4 pb-7 border-t border-black/5 dark:border-white/7 space-y-3">
          <div className="flex items-center gap-4">
            <span className="text-xs font-black text-gray-400 dark:text-[#9aa8c8] uppercase w-14 shrink-0">Speed</span>
            <input
              type="range" min="1" max="100" step="1" value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 h-2 cursor-pointer accent-blue-500"
            />
            <span className="text-sm font-black text-blue-600 w-12 text-right tabular-nums">{speed}%</span>
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
    </div>
  );
}
