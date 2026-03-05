"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Gamepad2 } from "lucide-react";
import { useRos } from "@/context/RosContext";

type Tab = "joint" | "effector";

const JOINT_STEP   = 1;   // degrees
const RAIL_STEP    = 5;   // mm
const GRIPPER_STEP = 5;   // %
const XYZ_STEP     = 5;   // mm
const RPY_STEP     = 1;   // degrees
const JOG_INTERVAL_MS = 100;

const JOINT_AXES = [
  { key: "j1",      label: "J1",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "j2",      label: "J2",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "j3",      label: "J3",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "j4",      label: "J4",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "j5",      label: "J5",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "j6",      label: "J6",      unit: "°",  step: JOINT_STEP,   color: "bg-gray-100 text-gray-700"     },
  { key: "rail",    label: "Rail",    unit: "mm", step: RAIL_STEP,    color: "bg-blue-100 text-blue-700"     },
  { key: "gripper", label: "Gripper", unit: "%",  step: GRIPPER_STEP, color: "bg-orange-100 text-orange-700" },
] as const;

type JointKey = typeof JOINT_AXES[number]["key"];

const XYZ_AXES = [
  { key: "x", label: "X", unit: "mm", step: XYZ_STEP, color: "bg-red-100 text-red-700"    },
  { key: "y", label: "Y", unit: "mm", step: XYZ_STEP, color: "bg-green-100 text-green-700" },
  { key: "z", label: "Z", unit: "mm", step: XYZ_STEP, color: "bg-blue-100 text-blue-700"  },
] as const;

const RPY_AXES = [
  { key: "roll",  label: "Roll",  unit: "°", step: RPY_STEP, color: "bg-purple-100 text-purple-700" },
  { key: "pitch", label: "Pitch", unit: "°", step: RPY_STEP, color: "bg-purple-100 text-purple-700" },
  { key: "yaw",   label: "Yaw",   unit: "°", step: RPY_STEP, color: "bg-purple-100 text-purple-700" },
] as const;

// ── Sub-component ──────────────────────────────────────────────────────────────
interface AxisControlProps {
  label: string;
  unit: string;
  color: string;
  currentValue: number;
  onPlus: () => void;
  onMinus: () => void;
  onStop: () => void;
}

function AxisControl({ label, unit, color, currentValue, onPlus, onMinus, onStop }: AxisControlProps) {
  const btnCls =
    "w-14 h-14 rounded-2xl bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 text-2xl font-black flex items-center justify-center transition-colors select-none touch-none";

  const holdProps = (action: () => void) => ({
    onMouseDown:   action,
    onMouseUp:     onStop,
    onMouseLeave:  onStop,
    onTouchStart:  (e: React.TouchEvent) => { e.preventDefault(); action(); },
    onTouchEnd:    onStop,
    onTouchCancel: onStop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl select-none">
      <span className={`inline-flex items-center justify-center w-16 h-9 rounded-full text-xs font-black shrink-0 ${color}`}>
        {label}
      </span>
      <span className="flex-1 font-mono font-black text-sm tabular-nums text-gray-600">
        {currentValue.toFixed(1)}{unit}
      </span>
      <button {...holdProps(onMinus)} className={btnCls}>−</button>
      <button {...holdProps(onPlus)}  className={btnCls}>+</button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function JogControlPanel({ onClose }: { onClose: () => void }) {
  const { jointStates, railPos, gripperPos, effectorPose, sendGotoPosition } = useRos();

  const [tab, setTab]     = useState<Tab>("joint");
  const [speed, setSpeed] = useState(30);

  // Refs for always-fresh values in interval callbacks (avoids stale closure)
  const jointStatesRef  = useRef(jointStates);
  const railPosRef      = useRef(railPos);
  const gripperPosRef   = useRef(gripperPos);
  const effectorPoseRef = useRef(effectorPose);
  const speedRef        = useRef(speed);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { jointStatesRef.current  = jointStates;  }, [jointStates]);
  useEffect(() => { railPosRef.current      = railPos;      }, [railPos]);
  useEffect(() => { gripperPosRef.current   = gripperPos;   }, [gripperPos]);
  useEffect(() => { effectorPoseRef.current = effectorPose; }, [effectorPose]);
  useEffect(() => { speedRef.current        = speed;        }, [speed]);

  // Cleanup on unmount
  useEffect(() => () => stopJog(), []);

  const stopJog = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Joint jog ──────────────────────────────────────────────────────────
  const sendJointJog = useCallback((key: JointKey, direction: 1 | -1) => {
    const j = jointStatesRef.current;
    const step = JOINT_AXES.find(a => a.key === key)!.step * direction;
    const base = {
      controlMode: "joint",
      j1: j[0], j2: j[1], j3: j[2], j4: j[3], j5: j[4], j6: j[5],
      rail: railPosRef.current,
      gripper: gripperPosRef.current,
      speed: speedRef.current,
      sequence: 0, label: "jog",
    };

    if (key === "rail") {
      sendGotoPosition({ ...base, rail: base.rail + step });
    } else if (key === "gripper") {
      sendGotoPosition({ ...base, gripper: Math.max(0, Math.min(100, base.gripper + step)) });
    } else {
      const idx = parseInt(key[1]) - 1;
      const joints = [j[0], j[1], j[2], j[3], j[4], j[5]];
      joints[idx] += step;
      sendGotoPosition({ ...base, j1: joints[0], j2: joints[1], j3: joints[2], j4: joints[3], j5: joints[4], j6: joints[5] });
    }
  }, [sendGotoPosition]);

  // ── Effector jog ───────────────────────────────────────────────────────
  const sendEffectorJog = useCallback((key: string, direction: 1 | -1) => {
    const j = jointStatesRef.current;
    const p = effectorPoseRef.current;
    const allAxes = [...XYZ_AXES, ...RPY_AXES];
    const step = allAxes.find(a => a.key === key)!.step * direction;
    sendGotoPosition({
      controlMode: "effector",
      j1: j[0], j2: j[1], j3: j[2], j4: j[3], j5: j[4], j6: j[5],
      rail: railPosRef.current,
      gripper: gripperPosRef.current,
      speed: speedRef.current,
      sequence: 0, label: "jog",
      x:     key === "x"     ? p.x     + step : p.x,
      y:     key === "y"     ? p.y     + step : p.y,
      z:     key === "z"     ? p.z     + step : p.z,
      roll:  key === "roll"  ? p.roll  + step : p.roll,
      pitch: key === "pitch" ? p.pitch + step : p.pitch,
      yaw:   key === "yaw"   ? p.yaw   + step : p.yaw,
    });
  }, [sendGotoPosition]);

  // ── Hold-to-move ──────────────────────────────────────────────────────
  const startJog = useCallback((key: string, direction: 1 | -1, mode: Tab) => {
    stopJog();
    const fire = () => mode === "joint"
      ? sendJointJog(key as JointKey, direction)
      : sendEffectorJog(key, direction);
    fire(); // immediate on press
    intervalRef.current = setInterval(fire, JOG_INTERVAL_MS);
  }, [stopJog, sendJointJog, sendEffectorJog]);

  // ── Helpers for AxisControl ───────────────────────────────────────────
  const make = (key: string, mode: Tab) => ({
    onPlus:  () => startJog(key,  1, mode),
    onMinus: () => startJog(key, -1, mode),
    onStop:  stopJog,
  });

  const jointValue = (key: JointKey): number => {
    if (key === "rail")    return railPos;
    if (key === "gripper") return gripperPos;
    return jointStates[parseInt(key[1]) - 1] ?? 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="tesla-card w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-black/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[16px] bg-gray-100 flex items-center justify-center">
              <Gamepad2 size={20} className="text-gray-600" />
            </div>
            <div>
              <h2 className="text-2xl font-black leading-tight">Jog</h2>
              <p className="text-xs text-gray-400 font-bold mt-0.5">ควบคุมด้วยมือ</p>
            </div>
          </div>
          <button
            onClick={() => { stopJog(); onClose(); }}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-8 pt-5 pb-3">
          {(["joint", "effector"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { stopJog(); setTab(t); }}
              className={`px-6 py-2.5 rounded-full text-sm font-black transition-colors ${
                tab === t
                  ? t === "joint"
                    ? "bg-gray-900 text-white"
                    : "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                  label={axis.label}
                  unit={axis.unit}
                  color={axis.color}
                  currentValue={jointValue(axis.key)}
                  {...make(axis.key, "joint")}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Position (mm)</p>
                {XYZ_AXES.map((axis) => (
                  <AxisControl
                    key={axis.key}
                    label={axis.label}
                    unit={axis.unit}
                    color={axis.color}
                    currentValue={effectorPose[axis.key as "x" | "y" | "z"]}
                    {...make(axis.key, "effector")}
                  />
                ))}
              </div>
              <div className="space-y-2.5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Orientation (°)</p>
                {RPY_AXES.map((axis) => (
                  <AxisControl
                    key={axis.key}
                    label={axis.label}
                    unit={axis.unit}
                    color={axis.color}
                    currentValue={effectorPose[axis.key as "roll" | "pitch" | "yaw"]}
                    {...make(axis.key, "effector")}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Speed slider */}
        <div className="px-8 pt-4 pb-7 border-t border-black/5">
          <div className="flex items-center gap-4">
            <span className="text-xs font-black text-gray-400 uppercase w-14 shrink-0">Speed</span>
            <input
              type="range" min="1" max="100" step="1" value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 h-2 cursor-pointer accent-blue-500"
            />
            <span className="text-sm font-black text-blue-600 w-12 text-right tabular-nums">{speed}%</span>
          </div>
        </div>

      </div>
    </div>
  );
}
