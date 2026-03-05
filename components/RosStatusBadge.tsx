"use client";

import { useRos } from "@/context/RosContext";
import { ShieldCheck, Bot } from "lucide-react";

function getRobotState(robotStatus: number, machineState: number) {
  if (machineState === 3)
    return { label: "Singularity", bg: "bg-red-100 text-red-700", dot: "bg-red-500 animate-pulse" };
  if (robotStatus === 2)
    return { label: "หยุดชั่วคราว", bg: "bg-orange-100 text-orange-700", dot: "bg-orange-500" };
  if (robotStatus === 1)
    return { label: "เคลื่อนที่", bg: "bg-blue-100 text-blue-700", dot: "bg-blue-500 animate-pulse" };
  if (machineState === 2)
    return { label: "ถึงแล้ว", bg: "bg-teal-100 text-teal-700", dot: "bg-teal-500" };
  return { label: "ว่าง", bg: "bg-gray-100 text-gray-500", dot: "bg-gray-400" };
}

export default function RosStatusBadge() {
  const { isConnected, safetyStatus, isTestMode, setTestMode, robotStatus, machineState } = useRos();

  const safety =
    safetyStatus === 2
      ? { label: "ฉุกเฉิน!", bg: "bg-red-500 animate-pulse", text: "text-white" }
      : safetyStatus === 1
        ? { label: "เตือน", bg: "bg-orange-500", text: "text-white" }
        : { label: "ปกติ", bg: "bg-emerald-500", text: "text-white" };

  const robotState = getRobotState(robotStatus, machineState);

  return (
    <div className="flex items-center gap-2">
      {/* ROS connection */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
          isConnected
            ? "bg-green-50 text-green-700"
            : "bg-red-50 text-red-600"
        }`}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"
          }`}
        />
        {isConnected ? "ROS" : "ROS Offline"}
      </div>

      {/* SIM mode toggle */}
      <button
        onClick={() => setTestMode(!isTestMode)}
        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
          isTestMode
            ? "bg-orange-500 text-white"
            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
        }`}
        title={isTestMode ? "กำลังใช้ Simulation Mode — กดเพื่อปิด" : "กดเพื่อเปิด Simulation Mode"}
      >
        SIM
      </button>

      {/* Robot state */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${robotState.bg}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${robotState.dot}`} />
        <Bot size={12} />
        {robotState.label}
      </div>

      {/* Safety status — big pill */}
      <div
        className={`flex items-center gap-2 px-5 py-2 rounded-full font-black text-sm ${safety.bg} ${safety.text}`}
      >
        <ShieldCheck size={15} />
        {safety.label}
      </div>
    </div>
  );
}
