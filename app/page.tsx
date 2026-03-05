"use client";
import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRos } from "@/context/RosContext";
import { useViewerFlips } from "@/hooks/useViewerFlips";
import JobDetailView from "@/components/JobDetailView";
import JobEditor from "@/components/JobEditor";
import RosStatusBadge from "@/components/RosStatusBadge";
import { Activity, LayoutGrid, List, Home, SlidersHorizontal, Pencil, Gamepad2, Settings2 } from "lucide-react";
import CalibrationModal from "@/components/CalibrationModal";
import JogControlPanel from "@/components/JogControlPanel";

const RobotViewer3D    = dynamic(() => import("@/components/RobotViewer3D"),    { ssr: false });
const SplashRobotViewer = dynamic(() => import("@/components/SplashRobotViewer"), { ssr: false });

interface Task {
  id: number;
  sequence: number;
  label?: string;
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  j5: number;
  j6: number;
  rail: number;
  speed?: number;
  delay?: number;
  gripper?: number;
  controlMode?: string;
  x?: number | null;
  y?: number | null;
  z?: number | null;
  roll?: number | null;
  pitch?: number | null;
  yaw?: number | null;
}

interface Job {
  id: number;
  name: string;
  description?: string;
  tasks?: Task[];
  createdAt?: string;
}

const Dashboard = ({
  onNew,
  onSelectJob,
  onEditJob,
  autoHome,
  onToggleAutoHome,
}: {
  onNew: () => void;
  onSelectJob: (job: Job) => void;
  onEditJob: (job: Job) => void;
  autoHome: boolean;
  onToggleAutoHome: () => void;
}) => {
  const { jointStates, railPos, gripperPos, effectorPose, isConnected, sendGotoPosition } = useRos();
  const { flips } = useViewerFlips();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [viewMode, setViewMode] = useState<"card" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("jobsViewMode") as "card" | "list") ?? "card";
    }
    return "card";
  });
  const [loading, setLoading] = useState(true);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showJog, setShowJog] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error("Error loading jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMode = (mode: "card" | "list") => {
    setViewMode(mode);
    localStorage.setItem("jobsViewMode", mode);
  };

  return (
    <div className="h-screen p-10 flex flex-col gap-10 bg-[#F5F5F7]">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-6xl font-black tracking-tight">
            FIBO ROBOT CAFE <span className="text-blue-600">STUDIO</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <RosStatusBadge />
          <a
            href="/config"
            className="flex items-center gap-2 px-5 py-4 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-2xl transition-colors font-black text-gray-700"
            title="ตั้งค่าโมเดล 3D"
          >
            <Settings2 size={22} />
          </a>
          <button
            onClick={() => sendGotoPosition({ sequence: 0, label: "Home", j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0, rail: 0, speed: 20, gripper: 0 })}
            className="flex items-center gap-3 px-8 py-5 bg-black hover:bg-gray-800 active:bg-gray-900 text-white rounded-2xl transition-colors font-black text-lg shadow-lg"
            title="ส่งหุ่นยนต์กลับตำแหน่ง Home"
          >
            <Home size={26} /> Home
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-10 overflow-hidden">
        {/* 3D Digital Twin */}
        <section className="col-span-4 tesla-card overflow-hidden">
          <RobotViewer3D joints={jointStates} flips={flips} />
        </section>

        <section className="col-span-4 tesla-card p-8 flex flex-col overflow-hidden">
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Project Library</h2>
              {!loading && (
                <span className="text-xs text-gray-400 font-bold">
                  {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => handleViewMode("card")}
                  className={`px-3 py-1.5 rounded-full transition-all ${
                    viewMode === "card"
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-400 hover:text-black"
                  }`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => handleViewMode("list")}
                  className={`px-3 py-1.5 rounded-full transition-all ${
                    viewMode === "list"
                      ? "bg-white text-black shadow-sm"
                      : "text-gray-400 hover:text-black"
                  }`}
                >
                  <List size={16} />
                </button>
              </div>
              <button
                onClick={onNew}
                className="flex-1 py-3 rounded-2xl bg-black text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg whitespace-nowrap"
              >
                + สร้างงานใหม่
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <p className="text-gray-400 text-lg">Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex items-center justify-center flex-1">
              <p className="text-gray-400 text-lg">No jobs yet. Create one!</p>
            </div>
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-2 gap-5 overflow-y-auto pr-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className="relative p-6 bg-gray-50 rounded-4xl border-2 border-transparent hover:border-blue-400 cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-5">
                    <Activity size={24} />
                  </div>
                  <h3 className="text-xl font-black mb-2 leading-tight">{job.name}</h3>
                  <p className="text-gray-400 text-xs mb-2 line-clamp-2">
                    {job.description || "No description"}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">
                    {job.tasks?.length || 0} tasks
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                    className="absolute bottom-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-gray-300 hover:text-gray-600 shadow-sm transition-all"
                    title="Edit job"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => onSelectJob(job)}
                  className="flex items-center gap-6 p-6 bg-gray-50 rounded-[28px] border-2 border-transparent hover:border-blue-400 cursor-pointer transition-all"
                >
                  <div className="w-14 h-14 bg-white rounded-[20px] shadow-sm flex items-center justify-center flex-shrink-0">
                    <Activity size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-2xl font-black">{job.name}</h3>
                    <p className="text-gray-400 text-sm font-medium">
                      {job.tasks?.length || 0} tasks
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                    className="p-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-300 hover:text-gray-600 shrink-0 transition-all"
                    title="Edit job"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="col-span-4 flex flex-col gap-6">
          {/* Auto-Home Toggle */}
          <button
            onClick={onToggleAutoHome}
            className={`tesla-card p-6 flex items-center gap-4 text-left transition-all active:scale-[0.98] ${
              autoHome ? "border-2 border-blue-500 bg-blue-50/60" : "border-2 border-transparent"
            }`}
          >
            {/* Toggle switch */}
            <div className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${autoHome ? "bg-blue-500" : "bg-gray-200"}`}>
              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-200 ${autoHome ? "left-7" : "left-1"}`} />
            </div>
            <div className="min-w-0">
              <p className={`font-black text-base leading-tight ${autoHome ? "text-blue-700" : "text-gray-700"}`}>
                กลับ Home อัตโนมัติ
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {autoHome ? "เมื่อเสร็จงาน หุ่นจะกลับ Home ก่อน" : "ปิดอยู่ — หุ่นหยุดตรงจุดสุดท้าย"}
              </p>
            </div>
            <Home size={22} className={`shrink-0 ml-auto ${autoHome ? "text-blue-500" : "text-gray-300"}`} />
          </button>

          {/* Jog Button */}
          <button
            onClick={() => setShowJog(true)}
            className="tesla-card p-6 flex items-center gap-4 text-left transition-all active:scale-[0.98] border-2 border-transparent hover:border-gray-200"
          >
            <div className="w-10 h-10 rounded-[16px] bg-gray-100 flex items-center justify-center shrink-0">
              <Gamepad2 size={18} className="text-gray-600" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-base leading-tight text-gray-700">Jog</p>
              <p className="text-xs text-gray-400 mt-0.5">ควบคุมด้วยมือ</p>
            </div>
          </button>

          {showCalibration && <CalibrationModal onClose={() => setShowCalibration(false)} />}
          {showJog && <JogControlPanel onClose={() => setShowJog(false)} />}

          <div className="tesla-card p-10 flex-1 flex flex-col">
            <h3 className="text-xs font-black text-gray-400 uppercase mb-10 flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-blue-500 animate-ping" : "bg-gray-300"}`} />
              Real-time Data
              <button
                onClick={() => setShowCalibration(true)}
                className="ml-auto w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                title="Calibrate"
              >
                <SlidersHorizontal size={14} className="text-gray-500" />
              </button>
            </h3>
            {isConnected ? (
              <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
                {/* Joints — compact 3-column */}
                <div className="grid grid-cols-3 gap-2">
                  {jointStates.map((v, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-[20px] text-center border border-gray-100/50">
                      <span className="text-[9px] font-black text-gray-400 block uppercase">J{i + 1}</span>
                      <span className="text-sm font-mono font-black">{v.toFixed(1)}°</span>
                    </div>
                  ))}
                </div>

                {/* End-Effector Pose */}
                <div className="p-4 bg-purple-50 rounded-3xl border border-purple-100">
                  <span className="text-[9px] font-black text-purple-400 block uppercase mb-2">End-Effector</span>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs font-mono text-purple-600">
                    <div><span className="opacity-50">X </span>{effectorPose.x.toFixed(1)}</div>
                    <div><span className="opacity-50">Y </span>{effectorPose.y.toFixed(1)}</div>
                    <div><span className="opacity-50">Z </span>{effectorPose.z.toFixed(1)}</div>
                    <div><span className="opacity-50">R </span>{effectorPose.roll.toFixed(1)}°</div>
                    <div><span className="opacity-50">P </span>{effectorPose.pitch.toFixed(1)}°</div>
                    <div><span className="opacity-50">Yw </span>{effectorPose.yaw.toFixed(1)}°</div>
                  </div>
                </div>

                {/* Rail */}
                <div className="p-5 bg-blue-600 rounded-[28px] text-white shadow-xl">
                  <span className="text-[9px] font-black opacity-60 block mb-1.5 uppercase">Linear Rail</span>
                  <span className="text-3xl font-mono font-black">
                    {railPos.toFixed(1)}<span className="text-base font-light opacity-50 ml-1">mm</span>
                  </span>
                </div>

                {/* Gripper */}
                <div className="p-5 bg-orange-500 rounded-[28px] text-white shadow-xl">
                  <span className="text-[9px] font-black opacity-60 block mb-1.5 uppercase">Gripper</span>
                  <span className="text-3xl font-mono font-black">
                    {gripperPos.toFixed(0)}<span className="text-base font-light opacity-50 ml-1">%</span>
                  </span>
                  <div className="mt-2 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${gripperPos}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                  <Activity size={28} className="text-gray-300" />
                </div>
                <p className="text-gray-400 text-sm font-bold">ยังไม่ได้เชื่อมต่อ</p>
                <p className="text-gray-300 text-xs">กำลังรอ ROS Bridge<br/>{process.env.NEXT_PUBLIC_ROS_URL ?? "ws://localhost:9090"}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default function App() {
  const [load, setLoad] = useState(true);
  const [view, setView] = useState<"dash" | "create" | "edit" | "detail">("dash");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [dashKey, setDashKey] = useState(0);
  const [autoHome, setAutoHome] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("autoHome") === "true";
    }
    return false;
  });

  const toggleAutoHome = () => {
    setAutoHome((prev) => {
      const next = !prev;
      localStorage.setItem("autoHome", String(next));
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoad(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectJob = async (job: Job) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedJob(data.job);
      }
    } catch {
      setSelectedJob(job);
    }
    setView("detail");
  };

  const handleBackToDash = () => {
    setView("dash");
    setSelectedJob(null);
    setDashKey((k) => k + 1);
  };

  const handleEditJob = async (job: Job) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`);
      const data = await res.json();
      setSelectedJob(data.success ? data.job : job);
    } catch {
      setSelectedJob(job);
    }
    setView("edit");
  };

  const handleJobSave = () => {
    handleBackToDash();
  };

  return (
    <div className="antialiased min-h-screen bg-[#F5F5F7]">
      {load ? (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[300]">
          {/* 3D rotating model as background */}
          <SplashRobotViewer />
          {/* Gradient vignette so text stays readable */}
          <div className="absolute inset-0 bg-radial-[ellipse_60%_60%_at_50%_50%] from-transparent to-black/80 pointer-events-none" />
          {/* Logo overlay */}
          <div className="relative z-10 flex flex-col items-center animate-splash">
            <h1 className="text-white text-7xl font-light tracking-[0.3em] uppercase text-center drop-shadow-2xl">
              FIBO ROBOT <span className="font-black text-[#0071E3]">CAFE</span>
            </h1>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#0071E3] to-transparent mt-12 w-96 animate-line" />
            <p className="text-gray-500 mt-12 font-mono text-xs tracking-widest">
              SYSTEM INITIALIZING...
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full h-full animate-splash">
          {view === "dash" ? (
            <Dashboard key={dashKey} onNew={() => setView("create")} onSelectJob={handleSelectJob} onEditJob={handleEditJob} autoHome={autoHome} onToggleAutoHome={toggleAutoHome} />
          ) : view === "edit" && selectedJob ? (
            <JobEditor mode="edit" job={selectedJob} onSave={handleJobSave} onCancel={handleBackToDash} />
          ) : view === "detail" && selectedJob ? (
            <JobDetailView
              job={selectedJob}
              onBack={handleBackToDash}
              onUpdate={handleBackToDash}
              autoStart={true}
              autoHomeOnComplete={autoHome}
            />
          ) : (
            <JobEditor mode="create" onSave={handleJobSave} onCancel={handleBackToDash} />
          )}
        </div>
      )}
    </div>
  );
}
