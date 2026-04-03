/**
 * Safety Camera Detector Process Manager
 *
 * Forwards start/stop/restart/status/logs commands to the Camera Agent
 * running on Board A (safety board) via HTTP fetch().
 *
 * Falls back to local spawn() when the board IP resolves to "localhost"
 * so development / single-machine setups continue to work without a
 * running camera_agent.py.
 */

import { NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { venvBin, systemPython } from "@/lib/venvPath";
import { loadBoardsConfig } from "@/app/api/camera/boards/route";

// ─── Local fallback state (used when boardIp === "localhost") ─────────────────
let proc: ChildProcess | null = null;
let setupProc: ChildProcess | null = null;
const logBuf: string[] = [];

function pushLog(line: string) {
  const ts = new Date().toLocaleTimeString("th-TH", { hour12: false });
  logBuf.push(`[${ts}] ${line.trimEnd()}`);
  if (logBuf.length > 300) logBuf.splice(0, logBuf.length - 300);
}

function isRunning() {
  return proc !== null && proc.exitCode === null && !proc.killed;
}
function isSetupRunning() {
  return setupProc !== null && setupProc.exitCode === null && !setupProc.killed;
}

// ─── Remote agent helpers ─────────────────────────────────────────────────────
function agentUrl(): string {
  const cfg = loadBoardsConfig();
  return `http://${cfg.safetyIp}:${cfg.agentPort}`;
}

function isRemote(): boolean {
  const cfg = loadBoardsConfig();
  const ip = cfg.safetyIp.trim().toLowerCase();
  return ip !== "localhost" && ip !== "127.0.0.1" && ip !== "";
}

async function agentFetch(endpoint: string, body?: object): Promise<object> {
  const url = `${agentUrl()}/${endpoint}`;
  const res = await fetch(url, {
    method: body !== undefined ? "POST" : "GET",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  return res.json();
}

// ─── GET — status ─────────────────────────────────────────────────────────────
export async function GET() {
  if (isRemote()) {
    try {
      const [statusData, logsData] = await Promise.all([
        agentFetch("status") as Promise<{ running: boolean; pid: number | null }>,
        agentFetch("logs")   as Promise<{ logs: string[] }>,
      ]);
      return NextResponse.json({
        running:      statusData.running,
        pid:          statusData.pid ?? null,
        setupRunning: false,
        venvReady:    true,
        logs:         logsData.logs?.slice(-60) ?? [],
        remote:       true,
        agentUrl:     agentUrl(),
      });
    } catch (err) {
      return NextResponse.json({
        running: false, pid: null, setupRunning: false, venvReady: false,
        logs: [`[ERR] Cannot reach agent at ${agentUrl()}: ${err}`],
        remote: true, agentUrl: agentUrl(),
      });
    }
  }

  // local fallback
  const venvPython = venvBin(path.join(process.cwd(), "detector", ".venv"), "python");
  return NextResponse.json({
    running:      isRunning(),
    pid:          proc?.pid ?? null,
    setupRunning: isSetupRunning(),
    venvReady:    fs.existsSync(venvPython),
    logs:         logBuf.slice(-60),
    remote:       false,
  });
}

// ─── POST — actions ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: { action?: string; camLeft?: unknown; camRight?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, camLeft, camRight } = body;

  // ── Remote: forward to agent ───────────────────────────────────────────────
  if (isRemote()) {
    if (action === "status") {
      try {
        return NextResponse.json({ ...(await agentFetch("status")), remote: true });
      } catch (err) {
        return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
      }
    }
    if (action === "stop") {
      try {
        return NextResponse.json({ ...(await agentFetch("stop", {})), remote: true });
      } catch (err) {
        return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
      }
    }
    if (action === "start" || action === "restart") {
      const args: Record<string, unknown> = {};
      if (camLeft  != null) args.cam_left  = camLeft;
      if (camRight != null) args.cam_right = camRight;
      try {
        const result = await agentFetch(action, { script: "main.py", args });
        return NextResponse.json({ ...result, remote: true });
      } catch (err) {
        return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: false, error: "Unknown action (remote mode)" });
  }

  // ── Local fallback: spawn() ────────────────────────────────────────────────
  if (action === "stop") {
    if (!isRunning()) return NextResponse.json({ ok: false, error: "Not running" });
    proc!.kill("SIGTERM");
    proc = null;
    pushLog("⏹ Stopped by user");
    return NextResponse.json({ ok: true });
  }

  if (action === "start" || action === "restart") {
    if (isRunning()) {
      if (action === "start") return NextResponse.json({ ok: false, error: "Already running" });
      proc!.kill("SIGTERM");
      proc = null;
      await new Promise((r) => setTimeout(r, 600));
    }

    const detectorDir = path.join(process.cwd(), "detector");
    const venvPython  = venvBin(path.join(detectorDir, ".venv"), "python");
    const pythonExe   = fs.existsSync(venvPython) ? venvPython : systemPython;
    const scriptPath  = path.join(detectorDir, "main.py");

    if (!fs.existsSync(scriptPath))
      return NextResponse.json({ ok: false, error: "detector/main.py not found" });

    pushLog(`▶ Starting detector (${pythonExe.includes(".venv") ? ".venv python" : "system python3"})`);
    const args = ["main.py"];
    if (camLeft  != null) args.push("--cam-left",  String(camLeft));
    if (camRight != null) args.push("--cam-right", String(camRight));
    proc = spawn(pythonExe, args, { cwd: detectorDir });

    proc.stdout?.on("data", (d: Buffer) =>
      String(d).split("\n").forEach((l) => l.trim() && pushLog(l))
    );
    proc.stderr?.on("data", (d: Buffer) =>
      String(d).split("\n").forEach((l) => l.trim() && pushLog(l))
    );
    proc.on("exit", (code) => { pushLog(`⏹ Process exited (code ${code ?? "?"})`); proc = null; });

    return NextResponse.json({ ok: true, pid: proc.pid });
  }

  if (action === "setup") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });

    const detectorDir = path.join(process.cwd(), "detector");
    const venvDir     = path.join(detectorDir, ".venv");
    const venvPip     = venvBin(venvDir, "pip");
    const reqPath     = path.join(detectorDir, "requirements.txt");

    if (!fs.existsSync(reqPath))
      return NextResponse.json({ ok: false, error: "detector/requirements.txt not found" });

    pushLog("⚙ Setting up Python environment...");
    const steps: Array<() => ChildProcess> = [];
    if (!fs.existsSync(venvDir)) {
      pushLog("⚙ Creating .venv ...");
      steps.push(() => spawn(systemPython, ["-m", "venv", ".venv"], { cwd: detectorDir }));
    }

    const runSteps = (idx: number) => {
      if (idx < steps.length) {
        const p = steps[idx]();
        setupProc = p;
        p.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        p.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        p.on("exit", (code) => {
          if (code !== 0) { pushLog(`✗ Step failed (code ${code})`); setupProc = null; }
          else runSteps(idx + 1);
        });
      } else {
        pushLog("⚙ Installing packages (this may take a few minutes)...");
        const pip = spawn(venvPip, ["install", "-r", "requirements.txt"], { cwd: detectorDir });
        setupProc = pip;
        pip.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        pip.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        pip.on("exit", (code) => {
          setupProc = null;
          pushLog(code === 0 ? "✓ Setup complete — ready to Start" : `✗ pip install failed (code ${code})`);
        });
      }
    };

    runSteps(0);
    return NextResponse.json({ ok: true });
  }

  if (action === "reinstall") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });
    const detectorDir = path.join(process.cwd(), "detector");
    const venvPip     = venvBin(path.join(detectorDir, ".venv"), "pip");
    if (!fs.existsSync(venvPip))
      return NextResponse.json({ ok: false, error: "venv not found — run Setup first" });
    pushLog("⚙ Reinstalling packages...");
    const pip = spawn(venvPip, ["install", "-r", "requirements.txt", "--upgrade"], { cwd: detectorDir });
    setupProc = pip;
    pip.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
    pip.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
    pip.on("exit", (code) => {
      setupProc = null;
      pushLog(code === 0 ? "✓ Reinstall complete" : `✗ pip failed (code ${code})`);
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" });
}
