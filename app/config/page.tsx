"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlipHorizontal2 } from "lucide-react";
import { useViewerFlips } from "@/hooks/useViewerFlips";
import { useRos } from "@/context/RosContext";

const RobotViewer3D = dynamic(() => import("@/components/RobotViewer3D"), { ssr: false });

const JOINTS = ["J1", "J2", "J3", "J4", "J5", "J6"] as const;

export default function ConfigPage() {
  const router = useRouter();
  const { jointStates } = useRos();
  const { flips, toggleFlip } = useViewerFlips();

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7]">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-5 flex items-center gap-5 shrink-0">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-5 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-2xl transition-colors font-bold text-gray-700"
        >
          <ArrowLeft size={20} />
          กลับ
        </button>
        <div>
          <h1 className="text-2xl font-black leading-tight">Viewer Config</h1>
          <p className="text-xs text-gray-400 mt-0.5">ตั้งค่าทิศทางแกนหมุนโมเดล 3D</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden gap-0">

        {/* Left: flip controls */}
        <div className="w-80 bg-white border-r border-gray-100 p-8 flex flex-col gap-6 overflow-y-auto shrink-0">

          <div>
            <h2 className="text-lg font-black mb-1">Joint Axis Flip</h2>
            <p className="text-xs text-gray-400">กดปุ่มเพื่อกลับทิศทางหมุนของแต่ละข้อต่อในโมเดล 3D<br />ไม่มีผลต่อการสั่งงานหุ่นจริง</p>
          </div>

          <div className="space-y-3">
            {JOINTS.map((name, i) => {
              const flipped = flips[i] === -1;
              return (
                <div key={name} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-8 flex items-center justify-center bg-gray-200 text-gray-700 text-xs font-black rounded-full">
                      {name}
                    </span>
                    <span className="text-sm text-gray-500 font-mono">
                      {flipped ? "−1× (Flipped)" : "+1× (Normal)"}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleFlip(i)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black transition-colors ${
                      flipped
                        ? "bg-orange-500 text-white"
                        : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                    }`}
                  >
                    <FlipHorizontal2 size={14} />
                    {flipped ? "Flipped" : "Normal"}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-blue-50 rounded-2xl text-xs text-blue-600 leading-relaxed">
            <p className="font-black mb-1">วิธีใช้</p>
            <p>เคลื่อนหุ่นจริงไปยังตำแหน่งต่างๆ แล้วดูว่าโมเดล 3D หมุนตรงทิศทางหรือไม่<br />
            ถ้าหมุนสวนทิศ กด Flip ของข้อต่อนั้น</p>
          </div>
        </div>

        {/* Right: live 3D preview */}
        <div className="flex-1 overflow-hidden">
          <RobotViewer3D joints={jointStates} flips={flips} />
        </div>
      </div>
    </div>
  );
}
