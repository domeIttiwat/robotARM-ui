"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, FlipHorizontal2, RotateCcw, Play, Square } from "lucide-react";
import { useViewerFlips } from "@/hooks/useViewerFlips";
import { useViewerSettings, DEFAULT_SETTINGS, ViewerSettings } from "@/hooks/useViewerSettings";
import { useRos } from "@/context/RosContext";

const RobotViewer3D = dynamic(() => import("@/components/RobotViewer3D"), { ssr: false });

const JOINTS = ["J1", "J2", "J3", "J4", "J5", "J6"] as const;

// ── Reusable slider ───────────────────────────────────────────────────────────
function Slider({
  label, value, min, max, step, unit, decimals = 2, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step: number; unit?: string; decimals?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-700 dark:text-[#b0c4e0]">{label}</span>
        <span className="text-xs font-mono text-gray-500 dark:text-[#8090b8] bg-gray-100 dark:bg-[#1a2540] px-2 py-0.5 rounded-lg">
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-200 dark:bg-[#1a2540] rounded-full appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-[#6878a8] font-mono">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── Reusable section wrapper ──────────────────────────────────────────────────
function Section({ title, hqOnly, children }: { title: string; hqOnly?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xs font-black text-gray-400 dark:text-[#8090b8] uppercase tracking-widest">{title}</h2>
        {hqOnly && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-600 dark:text-yellow-300 uppercase tracking-wider">HQ</span>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function ConfigPage() {
  const router = useRouter();
  const { jointStates } = useRos();
  const { flips, toggleFlip } = useViewerFlips();
  const { settings, update, reset } = useViewerSettings();

  // ── Simulator state ────────────────────────────────────────────────────
  const [simRunning, setSimRunning] = useState(false);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    fetch("/api/sim").then(r => r.json()).then(d => setSimRunning(d.running)).catch(() => {});
  }, []);

  const toggleSim = useCallback(async () => {
    setSimLoading(true);
    try {
      if (simRunning) {
        await fetch("/api/sim", { method: "DELETE" });
        setSimRunning(false);
      } else {
        const res = await fetch("/api/sim", { method: "POST" });
        const d = await res.json();
        setSimRunning(d.ok || d.error === "already running");
        window.open("http://localhost:52002/?53002", "_blank", "noopener");
      }
    } catch {
      // ignore
    } finally {
      setSimLoading(false);
    }
  }, [simRunning]);

  // ── Material discovery (populated by RobotViewer3D once model loads) ──
  const [discoveredMats, setDiscoveredMats] = useState<string[]>([]);

  const handleMaterialsDiscovered = useCallback((names: string[]) => {
    setDiscoveredMats(names);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────
  const mc = settings.matColors ?? {};

  const setMatColor = (name: string, hex: string) => {
    update({ matColors: { ...mc, [name]: hex } });
  };

  const resetMatColor = (name: string) => {
    const next = { ...mc };
    delete next[name];
    update({ matColors: next });
  };

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7] dark:bg-[#070d1b]">

      {/* Header */}
      <div className="bg-white dark:bg-[#0a1428] border-b border-gray-100 dark:border-white/6 px-8 py-5 flex items-center gap-5 shrink-0">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-5 py-3 bg-gray-100 dark:bg-[#1a2540] hover:bg-gray-200 dark:hover:bg-[#243050] rounded-2xl transition-colors font-bold text-gray-700 dark:text-[#b0c4e0]"
        >
          <ArrowLeft size={20} /> กลับ
        </button>
        <div>
          <h1 className="text-2xl font-black leading-tight">3D Display Settings</h1>
          <p className="text-xs text-gray-400 dark:text-[#8090b8] mt-0.5">ตั้งค่าการแสดงผลโมเดล 3D</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={toggleSim}
            disabled={simLoading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-colors disabled:opacity-60 ${
              simRunning
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-green-500 hover:bg-green-600 text-white"
            }`}
          >
            {simRunning ? <><Square size={13} /> หยุด Simulation</> : <><Play size={13} /> เริ่ม Simulation</>}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400 rounded-2xl text-xs font-black transition-colors"
          >
            <RotateCcw size={14} /> Reset ค่าเริ่มต้น
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: settings panel */}
        <div className="w-96 bg-white dark:bg-[#0a1428] border-r border-gray-100 dark:border-white/6 p-8 flex flex-col gap-8 overflow-y-auto shrink-0">

          {/* ── Background ─────────────────────────────────────────────── */}
          <Section title="Background">
            <div className="flex gap-2">
              {(["dark", "hdr", "color"] as ViewerSettings["bgMode"][]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => update({ bgMode: mode })}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                    settings.bgMode === mode
                      ? "bg-gray-900 dark:bg-[#e2eaff] text-white dark:text-[#070d1b] shadow-md"
                      : "bg-gray-100 dark:bg-[#1a2540] text-gray-500 dark:text-[#8090b8] hover:bg-gray-200 dark:hover:bg-[#243050]"
                  }`}
                >
                  {mode === "dark" ? "Dark" : mode === "hdr" ? "HDR Sky" : "Color"}
                </button>
              ))}
            </div>
            {settings.bgMode === "color" && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#111d35] rounded-2xl">
                <input
                  type="color" value={settings.bgColor}
                  onChange={(e) => update({ bgColor: e.target.value })}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                />
                <span className="text-sm font-mono text-gray-500 dark:text-[#8090b8]">{settings.bgColor}</span>
                <button
                  onClick={() => update({ bgColor: DEFAULT_SETTINGS.bgColor })}
                  className="ml-auto text-xs text-gray-400 dark:text-[#8090b8] hover:text-gray-600 dark:hover:text-[#b0c4e0]"
                >Reset</button>
              </div>
            )}
            {settings.bgMode === "hdr" && (
              <p className="text-xs text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 rounded-xl leading-relaxed">
                แสดง HDR environment เป็น skybox — เห็นผลเฉพาะตอน HQ เปิดอยู่
              </p>
            )}
          </Section>

          {/* ── Model Materials ────────────────────────────────────────── */}
          <Section title="Model Materials">
            {discoveredMats.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-[#8090b8] italic">
                กำลังโหลดโมเดล…
              </p>
            ) : (
              <div className="space-y-2">
                {discoveredMats.map((name) => {
                  const color = mc[name] ?? null;
                  return (
                    <div key={name} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#111d35] rounded-2xl">
                      {/* Colour preview swatch */}
                      <div
                        className="w-6 h-6 rounded-lg border border-black/10 dark:border-white/10 shrink-0"
                        style={color
                          ? { backgroundColor: color }
                          : { backgroundImage: "repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%)", backgroundSize: "8px 8px" }}
                      />
                      <span className="flex-1 text-xs font-mono font-black text-gray-700 dark:text-[#b0c4e0] truncate" title={name}>
                        {name}
                      </span>
                      <input
                        type="color"
                        value={color ?? "#888888"}
                        onChange={(e) => setMatColor(name, e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent shrink-0"
                        title={`Color for "${name}"`}
                      />
                      {color && (
                        <button
                          onClick={() => resetMatColor(name)}
                          className="text-[10px] text-gray-400 dark:text-[#6878a8] hover:text-gray-600 dark:hover:text-[#8090b8] shrink-0"
                        >reset</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Surface Properties ─────────────────────────────────────── */}
          <Section title="Surface Properties">
            <p className="text-xs text-gray-400 dark:text-[#8090b8] -mt-3">ใช้ร่วมกันทุก Material — ผลดีที่สุดในโหมด HQ</p>
            <Slider
              label="Metallic"
              value={settings.metallic ?? DEFAULT_SETTINGS.metallic} min={0} max={1} step={0.01}
              onChange={(v) => update({ metallic: v })}
            />
            <Slider
              label="Roughness"
              value={settings.minRoughness} min={0} max={1} step={0.01}
              onChange={(v) => update({ minRoughness: v })}
            />
          </Section>

          {/* ── Lighting ───────────────────────────────────────────────── */}
          <Section title="Lighting" hqOnly>
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

          {/* ── HDR Reflection ─────────────────────────────────────────── */}
          <Section title="HDR Reflection" hqOnly>
            <Slider
              label="Env Map Intensity"
              value={settings.envMapIntensity} min={0} max={1} step={0.01}
              onChange={(v) => update({ envMapIntensity: v })}
            />
            <p className="text-xs text-gray-400 dark:text-[#8090b8] bg-gray-50 dark:bg-[#111d35] px-3 py-2 rounded-xl">
              0 = ไม่สะท้อน HDR, 1 = สะท้อนเต็ม
            </p>
          </Section>

          {/* ── Floor Shadow ───────────────────────────────────────────── */}
          <Section title="Floor Shadow" hqOnly>
            <Slider
              label="Opacity"
              value={settings.shadowOpacity ?? DEFAULT_SETTINGS.shadowOpacity} min={0} max={1} step={0.01}
              onChange={(v) => update({ shadowOpacity: v })}
            />
            <Slider
              label="Blur"
              value={settings.shadowBlur ?? DEFAULT_SETTINGS.shadowBlur} min={0.1} max={10} step={0.1}
              onChange={(v) => update({ shadowBlur: v })}
            />
          </Section>

          {/* ── Joint Axis Flip ────────────────────────────────────────── */}
          <Section title="Joint Axis Flip">
            <p className="text-xs text-gray-400 dark:text-[#8090b8] -mt-3">ไม่มีผลต่อการสั่งงานหุ่นจริง</p>
            <div className="space-y-2">
              {JOINTS.map((name, i) => {
                const flipped = flips[i] === -1;
                return (
                  <div key={name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#111d35] rounded-2xl">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-7 flex items-center justify-center bg-gray-200 dark:bg-[#1a2540] text-gray-700 dark:text-[#b0c4e0] text-xs font-black rounded-full">
                        {name}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-[#8090b8] font-mono">
                        {flipped ? "−1×" : "+1×"}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleFlip(i)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black transition-colors ${
                        flipped
                          ? "bg-orange-500 text-white"
                          : "bg-gray-200 dark:bg-[#1a2540] text-gray-500 dark:text-[#8090b8] hover:bg-gray-300 dark:hover:bg-[#243050]"
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

          {/* ── Joint Display Offset ───────────────────────────────────── */}
          <Section title="Joint Display Offset (°)">
            <p className="text-xs text-gray-400 dark:text-[#8090b8] -mt-3">ปรับ offset การแสดงโมเดล — ไม่มีผลต่อการสั่งงานหุ่นจริง</p>
            <div className="space-y-4">
              {JOINTS.map((name, i) => {
                const offset = settings.jOffsets?.[i] ?? 0;
                return (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="w-10 h-7 flex items-center justify-center bg-gray-200 dark:bg-[#1a2540] text-gray-700 dark:text-[#b0c4e0] text-xs font-black rounded-full">
                        {name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500 dark:text-[#8090b8] bg-gray-100 dark:bg-[#1a2540] px-2 py-0.5 rounded-lg">
                          {offset > 0 ? "+" : ""}{offset.toFixed(0)}°
                        </span>
                        {offset !== 0 && (
                          <button
                            onClick={() => {
                              const next = [...(settings.jOffsets ?? DEFAULT_SETTINGS.jOffsets)];
                              next[i] = 0;
                              update({ jOffsets: next });
                            }}
                            className="text-[10px] text-gray-400 dark:text-[#6878a8] hover:text-gray-600 dark:hover:text-[#8090b8] font-mono"
                          >reset</button>
                        )}
                      </div>
                    </div>
                    <input
                      type="range" min={-180} max={180} step={1} value={offset}
                      onChange={(e) => {
                        const next = [...(settings.jOffsets ?? DEFAULT_SETTINGS.jOffsets)];
                        next[i] = parseFloat(e.target.value);
                        update({ jOffsets: next });
                      }}
                      className="w-full h-1.5 bg-gray-200 dark:bg-[#1a2540] rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                );
              })}
            </div>
          </Section>

        </div>

        {/* Right: live 3D preview */}
        <div className="flex-1 overflow-hidden">
          <RobotViewer3D
            joints={jointStates}
            flips={flips}
            settingsOverride={settings}
            onMaterialsDiscovered={handleMaterialsDiscovered}
          />
        </div>

      </div>
    </div>
  );
}
