"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRos } from "@/context/RosContext";
import KioskBoard from "kioskboard";
import {
  Play,
  Plus,
  ShieldCheck,
  Activity,
  Trash2,
  ArrowLeft,
  X,
  Info,
  LayoutGrid,
  List,
} from "lucide-react";

const TrainingView = ({ onBack }: { onBack: () => void }) => {
  const { jointStates, railPos, setTeachMode } = useRos();
  const [jobName, setJobName] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [keyboardLang, setKeyboardLang] = useState<"en" | "th">("en");
  const jobNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTeachMode(true);
    return () => {
      setTeachMode(false);
    };
  }, [setTeachMode]);

  // Initialize KioskBoard with Thai and English support
  useEffect(() => {
    if (jobNameInputRef.current) {
      // Set unique ID for targeting
      jobNameInputRef.current.id = "jobNameInput";

      const keysArrays = keyboardLang === "th"
        ? [
            ["ฟ", "ห", "ก", "ด", "เ", "า", "้", "่", "ป", "ย", "{bksp}"],
            ["า", "ส", "ี", "ึ", "ุ", "ฺ", "์", "ํ", "ค", "ต"],
            ["ี", "ร", "น", "ง", "จ", "ข", "ค", "ม", "ว", "{shift}"],
            ["{accept}", " ", "{space}", "{enter}"]
          ]
        : [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "{bksp}"],
            ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            ["a", "s", "d", "f", "g", "h", "j", "k", "l", "{shift}"],
            ["{accept}", " ", "{space}", "{enter}"]
          ];

      // Initialize KioskBoard
      (KioskBoard as any).init({
        keysArrays: keysArrays,
        language: keyboardLang,
        theme: "light",
        display: "bottom",
        allowMobileKeyboard: true,
      });

      // Attach keyboard to the input element
      const inputElement = jobNameInputRef.current;
      inputElement.setAttribute("data-kioskboard", "true");
      inputElement.setAttribute("data-kioskboard-type", "text");

      // Show keyboard on focus
      const handleFocus = () => {
        (KioskBoard as any).show(inputElement);
      };

      inputElement.addEventListener("focus", handleFocus);

      return () => {
        inputElement.removeEventListener("focus", handleFocus);
      };
    }
  }, [keyboardLang]);

  const addPoint = () => {
    setTasks([
      ...tasks,
      {
        label: `Task ${tasks.length + 1}`,
        j: [...jointStates],
        r: railPos,
      },
    ]);
  };

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7]">
      <div className="p-6 bg-white border-b flex justify-between items-center sticky top-0 z-50">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 font-bold hover:text-black transition-colors"
        >
          <ArrowLeft size={24} /> Back
        </button>
        <div className="flex gap-4">
          <button className="px-8 py-3 rounded-[24px] border border-gray-300 font-bold">
            Dry Run
          </button>
          <button className="px-10 py-3 rounded-full bg-black text-white font-bold">
            Save Job
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 p-8 border-r bg-white space-y-8 overflow-y-auto">
          <h2 className="text-3xl font-black tracking-tight">New Job</h2>

          {/* Keyboard Language Toggle */}
          <div className="flex gap-2 bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setKeyboardLang("en")}
              className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
                keyboardLang === "en"
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              English
            </button>
            <button
              onClick={() => setKeyboardLang("th")}
              className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-all ${
                keyboardLang === "th"
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ไทย
            </button>
          </div>

          {/* Job Name Input */}
          <input
            ref={jobNameInputRef}
            type="text"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            placeholder="Name..."
            className="w-full p-5 bg-gray-50 border-2 border-transparent rounded-[28px] text-xl font-bold placeholder-gray-300 focus:outline-none focus:border-blue-400 transition-colors"
            data-kioskboard="true"
          />
          <div className="p-6 bg-blue-50 text-blue-700 rounded-[30px] text-sm font-medium border border-blue-100">
            <div className="flex items-center gap-2 mb-2 font-bold">
              <Info size={18} /> Teaching Active
            </div>
            ลากปลายหุ่นไปยังจุดที่ต้องการ แล้วกดปุ่ม "Capture Position"
          </div>
        </div>
        <div className="flex-1 p-10 overflow-y-auto bg-gray-50/50">
          <div className="flex justify-between items-end mb-10">
            <h2 className="text-4xl font-black tracking-tight">Timeline</h2>
            <button
              onClick={addPoint}
              className="apple-btn bg-blue-600 text-white flex items-center gap-3 shadow-lg"
            >
              <Plus size={24} /> Capture Position
            </button>
          </div>
          <div className="space-y-4">
            {tasks.map((t, idx) => (
              <div key={idx} className="tesla-card p-6 flex items-center gap-6">
                <div className="w-12 h-12 bg-gray-100 rounded-[18px] flex items-center justify-center font-black text-gray-400">
                  {idx + 1}
                </div>
                <div className="flex-1 font-bold text-2xl text-[#1D1D1F]">
                  {t.label}
                </div>
                <div className="text-xs font-mono font-bold text-gray-400 uppercase">
                  J: {t.j.map((v: any) => v.toFixed(0)).join(", ")} | R:{" "}
                  {t.r.toFixed(0)}mm
                </div>
                <button className="p-3 text-gray-300 hover:text-red-500">
                  <Trash2 size={24} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ onNew }: { onNew: () => void }) => {
  const { isConnected, safetyStatus, jointStates, railPos } = useRos();
  const [selected, setSelected] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  const status =
    safetyStatus === 1
      ? { label: "เตือน: ลดความเร็ว", color: "bg-orange-500" }
      : safetyStatus === 2
        ? { label: "หยุดฉุกเฉิน!", color: "bg-red-500 animate-pulse" }
        : { label: "สถานะ: ปกติ", color: "bg-emerald-500" };

  return (
    <div className="h-screen p-10 flex flex-col gap-10 bg-[#F5F5F7]">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-6xl font-black tracking-tight">
            FIBO ROBOT CAFE <span className="text-blue-600">STUDIO</span>
          </h1>
          <div className="flex items-center gap-3 mt-4">
            <div
              className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
            />
            <span className="text-sm font-bold text-gray-400 uppercase">
              {isConnected ? "System Ready" : "Connecting..."}
            </span>
          </div>
        </div>
        <div
          className={`px-10 py-6 rounded-full text-white font-black text-xl flex items-center gap-5 shadow-2xl ${status.color}`}
        >
          <ShieldCheck size={36} /> {status.label}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-10 overflow-hidden">
        <section className="col-span-8 tesla-card p-12 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-4xl font-bold">Project Library</h2>
            <div className="flex items-center gap-4">
              <div className="flex gap-2 bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => setViewMode("card")}
                  className={`px-4 py-2 rounded-full transition-all ${
                    viewMode === "card"
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-400 hover:text-black"
                  }`}
                >
                  <LayoutGrid size={20} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-4 py-2 rounded-full transition-all ${
                    viewMode === "list"
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-400 hover:text-black"
                  }`}
                >
                  <List size={20} />
                </button>
              </div>
              <button
                onClick={onNew}
                className="px-10 py-4 rounded-[24px] bg-black text-white font-black text-xl flex items-center gap-3 shadow-2xl"
              >
                + สร้างงานใหม่
              </button>
            </div>
          </div>
          {viewMode === "card" ? (
            <div className="grid grid-cols-2 gap-8 overflow-y-auto pr-4">
              {[1, 2].map((id) => (
                <div
                  key={id}
                  onClick={() =>
                    setSelected({
                      id,
                      name: "Job " + id,
                      description: "Description here",
                    })
                  }
                  className="p-10 bg-gray-50 rounded-[48px] border-2 border-transparent hover:border-blue-400 cursor-pointer transition-all"
                >
                  <div className="w-16 h-16 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-8">
                    <Activity size={32} />
                  </div>
                  <h3 className="text-3xl font-black mb-3">Job {id}</h3>
                  <p className="text-gray-400 text-xl font-medium">
                    คลิกเพื่อดูรายละเอียด
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-4">
              {[1, 2].map((id) => (
                <div
                  key={id}
                  onClick={() =>
                    setSelected({
                      id,
                      name: "Job " + id,
                      description: "Description here",
                    })
                  }
                  className="flex items-center gap-6 p-6 bg-gray-50 rounded-[28px] border-2 border-transparent hover:border-blue-400 cursor-pointer transition-all"
                >
                  <div className="w-14 h-14 bg-white rounded-[20px] shadow-sm flex items-center justify-center flex-shrink-0">
                    <Activity size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-2xl font-black">Job {id}</h3>
                    <p className="text-gray-400 text-sm font-medium">
                      คลิกเพื่อดูรายละเอียด
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 font-mono flex-shrink-0">
                    Created • 2 hours ago
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="col-span-4 flex flex-col gap-10">
          <div className="tesla-card p-10 flex-1 flex flex-col">
            <h3 className="text-xs font-black text-gray-400 uppercase mb-10 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />{" "}
              Real-time Data
            </h3>
            <div className="grid grid-cols-2 gap-6 flex-1">
              {jointStates.map((v, i) => (
                <div
                  key={i}
                  className="p-6 bg-gray-50 rounded-[28px] border border-gray-100/50"
                >
                  <span className="text-[10px] font-black text-gray-400 block mb-2 uppercase">
                    Axis {i + 1}
                  </span>
                  <span className="text-2xl font-mono font-black">
                    {v.toFixed(1)}°
                  </span>
                </div>
              ))}
              <div className="col-span-2 p-10 bg-blue-600 rounded-[40px] text-white shadow-xl">
                <span className="text-[10px] font-black opacity-60 block mb-3 uppercase">
                  Linear Rail
                </span>
                <span className="text-6xl font-mono font-black">
                  {railPos.toFixed(1)}{" "}
                  <span className="text-2xl font-light opacity-50">mm</span>
                </span>
              </div>
            </div>
          </div>
          <button className="h-40 bg-[#0071E3] rounded-full text-white flex items-center justify-center gap-8 shadow-2xl active:scale-95 transition-all">
            <Play size={44} fill="white" />
            <span className="text-5xl font-black uppercase">เริ่มทำงาน</span>
          </button>
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-2xl flex items-center justify-center z-[200] p-12">
          <div className="bg-white p-20 rounded-[60px] max-w-3xl w-full relative shadow-2xl animate-splash">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-16 right-16 p-4 hover:bg-gray-100 rounded-full"
            >
              <X size={40} />
            </button>
            <h2 className="text-6xl font-black mb-10">{selected.name}</h2>
            <p className="text-gray-400 text-2xl font-medium mb-16">
              ยืนยันการเริ่มทำงานหุ่นยนต์ตามลำดับ Task
            </p>
            <button
              onClick={() => setSelected(null)}
              className="w-full h-28 bg-[#0071E3] text-white rounded-full text-4xl font-black shadow-2xl"
            >
              Confirm & Run
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [load, setLoad] = useState(true);
  const [view, setView] = useState<"dash" | "train">("dash");

  useEffect(() => {
    const timer = setTimeout(() => setLoad(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="antialiased min-h-screen bg-[#F5F5F7]">
      {load ? (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[300]">
          <div className="flex flex-col items-center animate-splash">
            <h1 className="text-white text-7xl font-light tracking-[0.3em] uppercase text-center">
              FIBO ROBOT <span className="font-black text-[#0071E3]">CAFE</span>
            </h1>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#0071E3] to-transparent mt-12 w-96 animate-line" />
            <p className="text-gray-600 mt-12 font-mono text-xs">
              SYSTEM INITIALIZING...
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full h-full animate-splash">
          {view === "dash" ? (
            <Dashboard onNew={() => setView("train")} />
          ) : (
            <TrainingView onBack={() => setView("dash")} />
          )}
        </div>
      )}
    </div>
  );
}
