"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlipHorizontal2, RotateCcw } from "lucide-react";
import { useViewerFlips } from "@/hooks/useViewerFlips";
import { useViewerSettings, DEFAULT_SETTINGS, ViewerSettings } from "@/hooks/useViewerSettings";
import { useRos } from "@/context/RosContext";

const RobotViewer3D = dynamic(() => import("@/components/RobotViewer3D"), { ssr: false });

const JOINTS = ["J1", "J2", "J3", "J4", "J5", "J6"] as const;

function Slider({
  label, value, min, max, step, unit, decimals = 2, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; decimals?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-[10px] text-gray-300 font-mono">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">{title}</h2>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export default function ConfigPage() {
  const router = useRouter();
  const { jointStates } = useRos();
  const { flips, toggleFlip } = useViewerFlips();
  const { settings, update, reset } = useViewerSettings();

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#070d1b]">

      {/* Header */}
      <div className="bg-white dark:bg-[#0a1428] border-b border-gray-100 px-8 py-5 flex items-center gap-5 shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-5 py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-2xl transition-colors font-bold text-gray-700"
        >
          <ArrowLeft size={20} /> กลับ
        </button>
        <div>
          <h1 className="text-2xl font-black leading-tight">3D Display Settings</h1>
          <p className="text-xs text-gray-400 mt-0.5">ตั้งค่าการแสดงผลโมเดล 3D</p>
        </div>
        <button
          onClick={reset}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-2xl text-xs font-black transition-colors"
        >
          <RotateCcw size={14} /> Reset ค่าเริ่มต้น
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: settings */}
        <div className="w-96 bg-white dark:bg-[#0a1428] border-r border-gray-100 p-8 flex flex-col gap-8 overflow-y-auto shrink-0">

          {/* Background */}
          <Section title="Background">
            <div className="flex gap-2">
              {(["dark", "hdr", "color"] as ViewerSettings["bgMode"][]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => update({ bgMode: mode })}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                    settings.bgMode === mode
                      ? "bg-black text-white shadow-md"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {mode === "dark" ? "Dark" : mode === "hdr" ? "HDR Sky" : "Color"}
                </button>
              ))}
            </div>
            {settings.bgMode === "color" && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                <input
                  type="color"
                  value={settings.bgColor}
                  onChange={(e) => update({ bgColor: e.target.value })}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                />
                <span className="text-sm font-mono text-gray-500">{settings.bgColor}</span>
                <button
                  onClick={() => update({ bgColor: DEFAULT_SETTINGS.bgColor })}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                >Reset</button>
              </div>
            )}
            {settings.bgMode === "hdr" && (
              <p className="text-xs text-blue-500 bg-blue-50 px-3 py-2 rounded-xl leading-relaxed">
                แสดง HDR environment เป็น skybox — เห็นผลเฉพาะตอน HQ เปิดอยู่
              </p>
            )}
          </Section>

          {/* Lighting */}
          <Section title="Lighting (HQ Mode)">
            <Slider
              label="Exposure (EV)"
              value={settings.exposure} min={-2} max={2} step={0.01}
              onChange={(v) => update({ exposure: v })}
            />
            <Slider
              label="Ambient Intensity"
              value={settings.ambientIntensity} min={0} max={2} step={0.01}
              onChange={(v) => update({ ambientIntensity: v })}
            />
            <Slider
              label="Directional Intensity"
              value={settings.directIntensity} min={0} max={3} step={0.01}
              onChange={(v) => update({ directIntensity: v })}
            />
          </Section>

          {/* Reflection */}
          <Section title="Reflection & Material (HQ Mode)">
            <Slider
              label="Env Map Intensity"
              value={settings.envMapIntensity} min={0} max={1} step={0.01}
              onChange={(v) => update({ envMapIntensity: v })}
            />
            <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-xl">
              ยิ่งสูง สะท้อน HDR มากขึ้น (0 = ไม่สะท้อน, 1 = สะท้อนเต็ม)
            </p>
            <Slider
              label="Min Roughness"
              value={settings.minRoughness} min={0} max={1} step={0.01}
              onChange={(v) => update({ minRoughness: v })}
            />
            <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-xl">
              ยิ่งสูง เงาสะท้อนยิ่งเบลอ (0 = คมมาก, 1 = กระจาย)
            </p>
          </Section>

          {/* Joint Flip */}
          <Section title="Joint Axis Flip">
            <p className="text-xs text-gray-400 -mt-3">ไม่มีผลต่อการสั่งงานหุ่นจริง</p>
            <div className="space-y-2">
              {JOINTS.map((name, i) => {
                const flipped = flips[i] === -1;
                return (
                  <div key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-7 flex items-center justify-center bg-gray-200 text-gray-700 text-xs font-black rounded-full">
                        {name}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {flipped ? "−1×" : "+1×"}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleFlip(i)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black transition-colors ${
                        flipped
                          ? "bg-orange-500 text-white"
                          : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                      }`}
                    >
                      <FlipHorizontal2 size={12} />
                      {flipped ? "Flipped" : "Normal"}
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>

        </div>

        {/* Right: live 3D preview */}
        <div className="flex-1 overflow-hidden">
          <RobotViewer3D joints={jointStates} flips={flips} settingsOverride={settings} />
        </div>

      </div>
    </div>
  );
}
