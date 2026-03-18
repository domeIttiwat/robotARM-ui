"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRos } from "@/context/RosContext";

interface Props {
  onCalibrate?: () => void;
}

export default function RealtimeOverlay({ onCalibrate }: Props) {
  const { isConnected, jointStates, effectorPose, railPos, gripperPos } = useRos();

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/55 dark:bg-black/70 backdrop-blur-md px-4 py-3.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-blue-400 animate-pulse" : "bg-gray-600"}`} />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Real-time Data</span>
        </div>
        {onCalibrate && (
          <button
            onClick={onCalibrate}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            title="Calibrate"
          >
            <SlidersHorizontal size={12} className="text-white/50" />
          </button>
        )}
      </div>

      {isConnected ? (
        <>
          {/* Joints — 6 cells */}
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {jointStates.map((v, i) => (
              <div key={i} className="bg-white/8 rounded-xl py-1.5 text-center">
                <span className="text-[8px] font-black text-white/35 block leading-none mb-0.5">J{i + 1}</span>
                <span className="text-[11px] font-mono font-black text-white leading-none">
                  {v.toFixed(1)}°
                </span>
              </div>
            ))}
          </div>

          {/* End-Effector + Rail + Gripper */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="col-span-2 bg-purple-500/20 rounded-xl px-2.5 py-2">
              <span className="text-[8px] font-black text-purple-300/60 uppercase block mb-1">End-Effector</span>
              <div className="flex gap-3 text-[11px] font-mono text-purple-200">
                <span><span className="opacity-40">X </span>{effectorPose.x.toFixed(0)}</span>
                <span><span className="opacity-40">Y </span>{effectorPose.y.toFixed(0)}</span>
                <span><span className="opacity-40">Z </span>{effectorPose.z.toFixed(0)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="bg-blue-500/25 rounded-xl px-2 py-1.5 flex-1">
                <span className="text-[8px] font-black text-blue-300/60 uppercase block leading-none mb-0.5">Rail</span>
                <span className="text-[11px] font-mono font-black text-blue-200 leading-none">
                  {railPos.toFixed(0)}<span className="text-[8px] opacity-50 ml-0.5">mm</span>
                </span>
              </div>
              <div className="bg-orange-500/25 rounded-xl px-2 py-1.5 flex-1">
                <span className="text-[8px] font-black text-orange-300/60 uppercase block leading-none mb-0.5">Grip</span>
                <span className="text-[11px] font-mono font-black text-orange-200 leading-none">
                  {gripperPos.toFixed(0)}<span className="text-[8px] opacity-50 ml-0.5">%</span>
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-2 text-white/25 text-[11px] font-bold">
          ยังไม่ได้เชื่อมต่อ
        </div>
      )}
    </div>
  );
}
