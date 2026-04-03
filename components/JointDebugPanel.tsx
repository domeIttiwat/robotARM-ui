"use client";
import { useState, useEffect } from "react";
import { useRos } from "@/context/RosContext";
import { Activity } from "lucide-react";

export default function JointDebugPanel() {
  const [open, setOpen] = useState(false);
  const {
    isConnected,
    jointStates,
    railPos,
    gripperPos,
    effectorPose,
    jointMsgCount,
    jointLastMsg,
  } = useRos();

  const [nodeStatus, setNodeStatus] = useState<Record<string, boolean> | null>(null);
  const [msAgo, setMsAgo] = useState<number | null>(null);

  // Listen for 3D node discovery events dispatched by RobotScene
  useEffect(() => {
    const handler = (e: Event) => {
      setNodeStatus((e as CustomEvent<Record<string, boolean>>).detail);
    };
    window.addEventListener("robotNodesDiscovered", handler);
    return () => window.removeEventListener("robotNodesDiscovered", handler);
  }, []);

  // Tick "ms ago" counter while panel is open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setMsAgo(jointLastMsg !== null ? Date.now() - jointLastMsg : null);
    }, 100);
    return () => clearInterval(id);
  }, [open, jointLastMsg]);

  const statusDot = isConnected ? "text-green-400" : "text-red-400";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-black/40 hover:bg-black/60 text-white/60 hover:text-white backdrop-blur-sm border border-white/10 transition-all"
        title="Open joint debug panel"
      >
        <Activity size={12} className={statusDot} />
        DEBUG
      </button>
    );
  }

  const formatMs = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms}ms ago`;
    return `${(ms / 1000).toFixed(1)}s ago`;
  };

  return (
    <div className="fixed top-3 left-3 z-50 w-72 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 text-xs text-white shadow-2xl overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1.5 font-bold tracking-wide">
          <Activity size={12} className={statusDot} />
          JOINT STATES
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-white/30 hover:text-white transition-colors leading-none px-1"
        >
          ✕
        </button>
      </div>

      {/* Connection + message stats */}
      <div className="px-3 py-2 border-b border-white/10 space-y-0.5">
        <div className="flex justify-between">
          <span>
            ROS:{" "}
            <span className={statusDot}>
              {isConnected ? "● Connected" : "● Offline"}
            </span>
          </span>
          <span className="text-white/40">Msgs: {jointMsgCount.toLocaleString()}</span>
        </div>
        <div className="text-white/35">Last: {formatMs(msAgo)}</div>
      </div>

      {/* J1–J6 bars */}
      <div className="px-3 py-2 space-y-1 border-b border-white/10">
        {jointStates.map((deg, i) => {
          const pct = Math.max(0, Math.min(100, ((deg + 180) / 360) * 100));
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-white/40 font-mono">J{i + 1}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full"
                  style={{ width: `${pct}%`, transition: "width 80ms linear" }}
                />
              </div>
              <span className="w-14 text-right text-white/80 font-mono tabular-nums">
                {deg.toFixed(1)}°
              </span>
            </div>
          );
        })}
      </div>

      {/* Rail / Gripper / End-effector */}
      <div className="px-3 py-2 space-y-0.5 border-b border-white/10">
        <div className="flex justify-between">
          <span className="text-white/40">Rail</span>
          <span className="font-mono">{railPos.toFixed(1)} mm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Gripper</span>
          <span className="font-mono">{gripperPos.toFixed(0)}%</span>
        </div>
        <div className="text-white/35 pt-0.5 font-mono">
          EE x={effectorPose.x.toFixed(0)} y={effectorPose.y.toFixed(0)} z={effectorPose.z.toFixed(0)}
        </div>
        <div className="text-white/35 font-mono">
          r={effectorPose.roll.toFixed(1)}° p={effectorPose.pitch.toFixed(1)}° y={effectorPose.yaw.toFixed(1)}°
        </div>
      </div>

      {/* 3D Node status */}
      <div className="px-3 py-2">
        <div className="text-white/35 mb-1">3D Nodes</div>
        {nodeStatus === null ? (
          <span className="text-white/25 italic">No 3D viewer active</span>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {["J1", "J2", "J3", "J4", "J5", "J6"].map((name) => (
              <span
                key={name}
                className={`font-mono ${nodeStatus[name] ? "text-green-400" : "text-red-400"}`}
              >
                {name}{nodeStatus[name] ? "✓" : "✗"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
