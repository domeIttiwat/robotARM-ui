"use client";
import React, { useState, useEffect } from "react";
import { useRos } from "@/context/RosContext";
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

const VirtualKeyboard = ({
  onInput,
  onClose,
}: {
  onInput: (key: string) => void;
  onClose: () => void;
}) => {
  const [lang, setLang] = useState<"en" | "th" | "num">("en");
  const [shift, setShift] = useState(false);

  const englishRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  const numberRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["@", "#", "$", "%", "&", "*", "(", ")", "-", "+"],
    ["=", "/", ":", ";", "'", "\"", "!", "?", "."],
    [",", ".", "...", "-"],
  ];

  // Thai Kedmanee - ตามมาตรฐานอย่างแท้จริง
  const thaiRowsNormal = [
    ["ฟ", "ห", "ก", "ด", "เ", "า", "้", "่", "ป", "ย"],
    ["า", "ส", "ี", "ึ", "ุ", "ฺ", "์", "ํ", "ค", "ต"],
    ["ี", "ร", "น", "ง", "จ", "ข", "ค", "ม", "ว"],
    ["ศ", "ษ", "ส"],
  ];

  const thaiRowsShift = [
    ["เ", "แ", "โ", "ใ", "ไ", "ๅ", "ๆ", "ั", "ิ", "ี"],
    ["ึ", "ื", "ุ", "ฺ", "๏", "๎", "๏", "๏", "ฒ", "ณ"],
    ["ด", "ต", "ถ", "ท", "ธ", "ฏ", "ฐ", "ฟ", "ฤ"],
    ["ล", "ฦ", "ฉ"],
  ];

  const rows =
    lang === "num" ? numberRows :
    lang === "en" ? englishRows :
    (shift ? thaiRowsShift : thaiRowsNormal);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-b from-gray-200 to-gray-300 p-3 z-[1000] shadow-2xl">
      <div className="max-w-full mx-auto px-2">
        {/* Header */}
        <div className="flex justify-between items-center mb-3 px-2">
          <div className="flex gap-1">
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                lang === "en"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              ABC
            </button>
            <button
              onClick={() => setLang("th")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                lang === "th"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              ไทย
            </button>
            <button
              onClick={() => setLang("num")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                lang === "num"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              123
            </button>
          </div>
          <span className="text-[10px] font-semibold text-gray-500">
            {lang === "th" && shift ? "shift" : ""}
          </span>
          <button
            onClick={onClose}
            className="px-2 py-1 hover:bg-gray-400 rounded"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Keyboard */}
        <div className="space-y-1.5">
          {/* Row 1 */}
          <div className="flex gap-1.5 justify-center">
            {rows[0].map((k, idx) => (
              <button
                key={`0-${idx}`}
                onClick={() => onInput(k)}
                className="h-10 w-9 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-sm flex items-center justify-center hover:bg-gray-50"
              >
                {k}
              </button>
            ))}
          </div>

          {/* Row 2 */}
          <div className="flex gap-1.5 justify-center">
            <div className="w-2" /> {/* Spacer for alignment */}
            {rows[1].map((k, idx) => (
              <button
                key={`1-${idx}`}
                onClick={() => onInput(k)}
                className="h-10 w-9 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-sm flex items-center justify-center hover:bg-gray-50"
              >
                {k}
              </button>
            ))}
            <div className="w-2" /> {/* Spacer for alignment */}
          </div>

          {/* Row 3 - with Shift button */}
          <div className="flex gap-1.5 justify-center">
            <button
              onClick={() => setShift(!shift)}
              className={`h-10 px-3 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-xs flex items-center justify-center ${
                shift
                  ? "bg-blue-500 text-white border border-blue-600"
                  : "bg-white border border-gray-400 text-gray-700 hover:bg-gray-50"
              }`}
            >
              ⇧
            </button>
            {rows[2].map((k, idx) => (
              <button
                key={`2-${idx}`}
                onClick={() => onInput(k)}
                className="h-10 w-9 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-sm flex items-center justify-center hover:bg-gray-50"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => onInput("Del")}
              className="h-10 px-2 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-xs flex items-center justify-center hover:bg-gray-50"
            >
              ⌫
            </button>
          </div>

          {/* Row 4 - Numbers/More with Space and Enter */}
          <div className="flex gap-1.5 justify-center">
            <button
              onClick={() => setLang(lang === "num" ? "en" : "num")}
              className="h-10 px-2 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-xs flex items-center justify-center hover:bg-gray-50"
            >
              {lang === "num" ? "ABC" : "123"}
            </button>
            {rows[3] && rows[3].map((k, idx) => (
              <button
                key={`3-${idx}`}
                onClick={() => onInput(k)}
                className="h-10 w-9 bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-sm flex items-center justify-center hover:bg-gray-50"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => onInput("Space")}
              className="h-10 flex-1 max-w-xs bg-white border border-gray-400 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-xs flex items-center justify-center hover:bg-gray-50"
            >
              space
            </button>
            <button
              onClick={() => onInput("\n")}
              className="h-10 px-3 bg-blue-500 text-white border border-blue-600 rounded-md shadow-sm active:scale-95 transition-all font-semibold text-xs flex items-center justify-center hover:bg-blue-600"
            >
              return
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TrainingView = ({ onBack }: { onBack: () => void }) => {
  const { jointStates, railPos, setTeachMode } = useRos();
  const [jobName, setJobName] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [kb, setKb] = useState(false);

  useEffect(() => {
    setTeachMode(true);
    return () => {
      setTeachMode(false);
    };
  }, [setTeachMode]);

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
          <div
            onClick={() => setKb(true)}
            className="p-5 bg-gray-50 border-2 border-transparent rounded-[28px] cursor-text min-h-[64px] flex items-center"
          >
            <span
              className={`text-xl font-bold ${!jobName ? "text-gray-300" : "text-black"}`}
            >
              {jobName || "Name..."}
            </span>
          </div>
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
      {kb && (
        <VirtualKeyboard
          onInput={(k) =>
            k === "Del"
              ? setJobName((p) => p.slice(0, -1))
              : k === "Space"
                ? setJobName((p) => p + " ")
                : setJobName((p) => p + k)
          }
          onClose={() => setKb(false)}
        />
      )}
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
