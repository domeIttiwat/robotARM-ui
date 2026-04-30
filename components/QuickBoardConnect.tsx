"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff, Shield, Box, Activity } from "lucide-react";
import { makeWsUrl, getBoardIp, saveJetsonConfig, type JetsonConfig } from "@/lib/jetsonConfig";

// ── Board definitions ─────────────────────────────────────────────────────────

const BOARDS = [
  {
    service: "safety"   as const,
    label:   "Safety Cam",
    port:    8765,
    textCls: "text-blue-500",
    bgCls:   "bg-blue-100 dark:bg-blue-900/30",
    Icon:    Shield,
  },
  {
    service: "wrist"    as const,
    label:   "Wrist Cam",
    port:    8766,
    textCls: "text-indigo-500",
    bgCls:   "bg-indigo-100 dark:bg-indigo-900/30",
    Icon:    Box,
  },
  {
    service: "skeleton" as const,
    label:   "Skeleton",
    port:    8767,
    textCls: "text-purple-500",
    bgCls:   "bg-purple-100 dark:bg-purple-900/30",
    Icon:    Activity,
  },
] as const;

// ── Probe hook ────────────────────────────────────────────────────────────────

type ProbeStatus = "offline" | "connecting" | "connected";

function useProbeStatus(wsUrl: string): ProbeStatus {
  const [status, setStatus] = useState<ProbeStatus>("offline");

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket | null = null;

    function connect() {
      if (!active) return;
      setStatus("connecting");
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen  = () => { if (active) setStatus("connected"); };
        ws.onclose = () => {
          ws = null;
          if (active) {
            setStatus("offline");
            retryTimer = setTimeout(connect, 5000);
          }
        };
        ws.onerror = () => ws?.close();
      } catch {
        setStatus("offline");
        if (active) retryTimer = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [wsUrl]);

  return status;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProbeStatus }) {
  if (status === "connected") return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shrink-0">
      <Wifi size={9} /> Connected
    </span>
  );
  if (status === "connecting") return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
      Connecting…
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 dark:bg-[#1a2540] text-gray-500 shrink-0">
      <WifiOff size={9} /> Offline
    </span>
  );
}

// ── Board row ─────────────────────────────────────────────────────────────────

function BoardRow({
  board,
  defaultIp,
  onApply,
}: {
  board:     (typeof BOARDS)[number];
  defaultIp: string;
  onApply:   (ip: string) => void;
}) {
  const [draft,   setDraft]   = useState(defaultIp);
  const [savedIp, setSavedIp] = useState(defaultIp);

  // Sync when parent config changes from outside (page load, external update)
  useEffect(() => {
    setDraft(defaultIp);
    setSavedIp(defaultIp);
  }, [defaultIp]);

  const probeUrl = makeWsUrl(savedIp || "localhost", board.port);
  const status   = useProbeStatus(probeUrl);

  const apply = () => {
    const ip = draft.trim();
    setSavedIp(ip);
    onApply(ip);
  };

  const inputCls =
    "bg-white dark:bg-[#0a1628] border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 w-36";

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {/* Icon */}
      <div className={`w-6 h-6 rounded-lg ${board.bgCls} flex items-center justify-center shrink-0`}>
        <board.Icon size={12} className={board.textCls} />
      </div>

      {/* Label */}
      <span className={`text-[11px] font-black ${board.textCls} w-20 shrink-0`}>{board.label}</span>

      {/* IP input */}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="192.168.x.x"
        className={inputCls}
      />

      {/* Port label */}
      <span className="text-[10px] text-gray-400 font-mono shrink-0">:{board.port}</span>

      {/* Status badge */}
      <StatusBadge status={status} />

      {/* Connect button */}
      <button
        onClick={apply}
        className="ml-auto px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black transition-colors shrink-0"
      >
        Connect
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function QuickBoardConnect({
  config,
  onApply,
}: {
  config:  JetsonConfig;
  onApply: (cfg: JetsonConfig) => void;
}) {
  const getIp = (svc: "safety" | "wrist" | "skeleton") => getBoardIp(config, svc);

  const handleBoardApply = (svc: "safety" | "wrist" | "skeleton", ip: string) => {
    const key =
      svc === "safety"   ? "safetyIp"   :
      svc === "wrist"    ? "wristIp"    : "skeletonIp";
    const updated: JetsonConfig = { ...config, [key]: ip || undefined };
    saveJetsonConfig(updated);
    // Persist board IPs server-side for process control
    fetch("/api/camera/boards", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        safetyIp:   updated.safetyIp   || updated.ip,
        wristIp:    updated.wristIp    || updated.ip,
        skeletonIp: updated.skeletonIp || updated.ip,
        agentPort:  updated.agentPort,
      }),
    }).catch(() => {});
    onApply(updated);
  };

  return (
    <div className="shrink-0 border-b border-black/5 dark:border-white/5 bg-white/50 dark:bg-[#071020]/50 divide-y divide-gray-100 dark:divide-white/5">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50/80 dark:bg-[#0d1d38]/60">
        <Wifi size={11} className="text-blue-500" />
        <span className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Quick Connect
        </span>
        <span className="text-[10px] text-gray-400 ml-1">— ใส่ IP → Enter หรือ Connect</span>
      </div>

      {/* Board rows */}
      {BOARDS.map((b) => (
        <BoardRow
          key={b.service}
          board={b}
          defaultIp={getIp(b.service)}
          onApply={(ip) => handleBoardApply(b.service, ip)}
        />
      ))}
    </div>
  );
}
