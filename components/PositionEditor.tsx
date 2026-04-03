"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRos } from "@/context/RosContext";
import {
  X,
  MapPin,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Crosshair,
} from "lucide-react";

interface SavedPosition {
  id: number;
  name: string;
  j1: number; j2: number; j3: number; j4: number; j5: number; j6: number;
  rail: number;
  gripper: number;
  controlMode: string;
  x?: number | null; y?: number | null; z?: number | null;
  roll?: number | null; pitch?: number | null; yaw?: number | null;
  createdAt: string;
}

interface Props {
  onClose: () => void;
}

export default function PositionEditor({ onClose }: Props) {
  const {
    isConnected,
    jointStates,
    railPos,
    gripperPos,
    effectorPose,
    setTeachMode,
    sendGotoPosition,
  } = useRos();

  const [positions, setPositions] = useState<SavedPosition[]>([]);
  const [posName, setPosName] = useState("");
  const [controlMode, setControlMode] = useState<"joint" | "effector">("joint");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Enable teach mode on open, disable on close
  useEffect(() => {
    setTeachMode(true);
    loadPositions();
    return () => setTeachMode(false);
  }, [setTeachMode]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const loadPositions = async () => {
    try {
      const res = await fetch("/api/positions");
      const data = await res.json();
      if (data.success) setPositions(data.positions);
    } catch {}
  };

  const handleSave = async () => {
    if (!posName.trim()) { showToast("กรุณาตั้งชื่อตำแหน่ง", false); return; }
    setSaving(true);
    try {
      const body: any = {
        name: posName.trim(),
        j1: jointStates[0], j2: jointStates[1], j3: jointStates[2],
        j4: jointStates[3], j5: jointStates[4], j6: jointStates[5],
        rail: railPos,
        gripper: gripperPos,
        controlMode,
        x: effectorPose.x, y: effectorPose.y, z: effectorPose.z,
        roll: effectorPose.roll, pitch: effectorPose.pitch, yaw: effectorPose.yaw,
      };
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setPosName("");
        await loadPositions();
        showToast(`บันทึก "${body.name}" แล้ว`, true);
      } else {
        showToast("บันทึกไม่สำเร็จ", false);
      }
    } catch {
      showToast("เกิดข้อผิดพลาด", false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pos: SavedPosition) => {
    if (!confirm(`ลบ "${pos.name}" ?`)) return;
    try {
      await fetch(`/api/positions/${pos.id}`, { method: "DELETE" });
      await loadPositions();
      showToast(`ลบ "${pos.name}" แล้ว`, true);
    } catch {
      showToast("ลบไม่สำเร็จ", false);
    }
  };

  const handleGoto = useCallback((pos: SavedPosition) => {
    if (!isConnected) { showToast("ROS ไม่ได้เชื่อมต่อ", false); return; }
    setTeachMode(false);
    sendGotoPosition({
      sequence: 0, label: pos.name,
      j1: pos.j1, j2: pos.j2, j3: pos.j3, j4: pos.j4, j5: pos.j5, j6: pos.j6,
      rail: pos.rail, speed: 30, gripper: pos.gripper,
      controlMode: pos.controlMode,
      ...(pos.controlMode === "effector" && pos.x != null && {
        x: pos.x, y: pos.y, z: pos.z,
        roll: pos.roll, pitch: pos.pitch, yaw: pos.yaw,
      }),
    });
    setTimeout(() => setTeachMode(true), 4000);
  }, [isConnected, sendGotoPosition, setTeachMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="bg-white dark:bg-[#0f1829] rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-8 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center">
              <MapPin size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">Position Library</h2>
              <p className="text-xs text-gray-400">บันทึกตำแหน่งพิเศษสำหรับใช้ใน Job</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Teach mode indicator */}
        <div className="mx-8 mb-4 px-4 py-2.5 bg-blue-50 rounded-2xl flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-bold text-blue-600">
            Teach Mode เปิดอยู่ — ขยับแขนด้วยมือไปยังตำแหน่งที่ต้องการ แล้วกดบันทึก
          </span>
        </div>

        {/* Live joint display */}
        <div className="mx-8 mb-4 bg-gray-50 dark:bg-white/5 rounded-2xl p-4 grid grid-cols-3 gap-2 text-xs font-mono text-gray-500">
          {[1,2,3,4,5,6].map((n) => (
            <span key={n}>J{n}: <span className="text-gray-800 dark:text-gray-200 font-bold">{(jointStates[n-1] ?? 0).toFixed(1)}°</span></span>
          ))}
          <span>Rail: <span className="text-gray-800 dark:text-gray-200 font-bold">{railPos.toFixed(1)} mm</span></span>
          <span>Grip: <span className="text-gray-800 dark:text-gray-200 font-bold">{gripperPos}%</span></span>
        </div>

        {/* Effector pose */}
        <div className="mx-8 mb-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-3">
          <p className="text-[10px] font-black text-purple-400 uppercase mb-2">End-Effector Pose</p>
          <div className="grid grid-cols-3 gap-1.5 text-xs font-mono text-purple-600">
            {(["x","y","z"] as const).map((k) => (
              <div key={k}><span className="opacity-50">{k.toUpperCase()} </span>{effectorPose[k].toFixed(1)}</div>
            ))}
            {(["roll","pitch","yaw"] as const).map((k) => (
              <div key={k}><span className="opacity-50">{k[0].toUpperCase()} </span>{effectorPose[k].toFixed(1)}°</div>
            ))}
          </div>
        </div>

        {/* Save form */}
        <div className="mx-8 mb-4 flex gap-3">
          <input
            type="text"
            value={posName}
            onChange={(e) => setPosName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="ชื่อตำแหน่ง..."
            className="flex-1 px-4 py-3 bg-gray-50 dark:bg-white/5 rounded-2xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {/* Control mode toggle */}
          <div className="flex bg-gray-100 dark:bg-white/10 rounded-2xl p-1 gap-1">
            <button
              onClick={() => setControlMode("joint")}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${controlMode === "joint" ? "bg-white dark:bg-white/20 shadow-sm text-black dark:text-white" : "text-gray-400"}`}
            >
              Joint
            </button>
            <button
              onClick={() => setControlMode("effector")}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${controlMode === "effector" ? "bg-white dark:bg-white/20 shadow-sm text-purple-600" : "text-gray-400"}`}
            >
              Effector
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 size={16} />
            บันทึก
          </button>
        </div>

        {/* Saved positions list */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-2">
          {positions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">ยังไม่มีตำแหน่งที่บันทึกไว้</div>
          ) : (
            positions.map((pos) => (
              <div
                key={pos.id}
                className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate">{pos.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono">
                    J: {pos.j1.toFixed(0)}° {pos.j2.toFixed(0)}° {pos.j3.toFixed(0)}° {pos.j4.toFixed(0)}° {pos.j5.toFixed(0)}° {pos.j6.toFixed(0)}°
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${pos.controlMode === "effector" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                  {pos.controlMode === "effector" ? "Effector" : "Joint"}
                </span>
                <button
                  onClick={() => handleGoto(pos)}
                  title="ส่งแขนไปตำแหน่งนี้"
                  className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors"
                >
                  <Crosshair size={14} />
                </button>
                <button
                  onClick={() => handleDelete(pos)}
                  title="ลบตำแหน่งนี้"
                  className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-white font-bold text-sm shadow-xl z-[60] transition-all ${toast.ok ? "bg-green-600" : "bg-red-500"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
