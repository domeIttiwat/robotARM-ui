/**
 * Wrist Camera Service Process Manager
 * Start / stop / restart the Python wrist-cam service from the browser.
 * Module-level state persists for the life of the Next.js server process.
 */

import { NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { venvBin, systemPython } from "@/lib/venvPath";

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

export async function GET() {
  const venvPython = venvBin(path.join(process.cwd(), "wrist-cam", ".venv"), "python");
  return NextResponse.json({
    running:      isRunning(),
    pid:          proc?.pid ?? null,
    setupRunning: isSetupRunning(),
    venvReady:    fs.existsSync(venvPython),
    logs:         logBuf.slice(-60),
  });
}

export async function POST(req: Request) {
  const { action, camIndex } = await req.json();

  // ── stop ─────────────────────────────────────────────────────────────────
  if (action === "stop") {
    if (!isRunning()) return NextResponse.json({ ok: false, error: "Not running" });
    proc!.kill("SIGTERM");
    proc = null;
    pushLog("⏹ Stopped by user");
    return NextResponse.json({ ok: true });
  }

  // ── start / restart ───────────────────────────────────────────────────────
  if (action === "start" || action === "restart") {
    if (isRunning()) {
      if (action === "start") return NextResponse.json({ ok: false, error: "Already running" });
      proc!.kill("SIGTERM");
      proc = null;
      await new Promise((r) => setTimeout(r, 600));
    }

    const wristDir   = path.join(process.cwd(), "wrist-cam");
    const venvPython = venvBin(path.join(wristDir, ".venv"), "python");
    const pythonExe  = fs.existsSync(venvPython) ? venvPython : systemPython;
    const scriptPath = path.join(wristDir, "main.py");

    if (!fs.existsSync(scriptPath))
      return NextResponse.json({ ok: false, error: "wrist-cam/main.py not found" });

    pushLog(`▶ Starting wrist-cam (${pythonExe.includes(".venv") ? ".venv python" : "system python3"})`);
    const args = ["main.py"];
    if (camIndex != null) args.push("--cam-index", String(camIndex));
    proc = spawn(pythonExe, args, { cwd: wristDir });

    proc.stdout?.on("data", (d: Buffer) =>
      String(d).split("\n").forEach((l) => l.trim() && pushLog(l))
    );
    proc.stderr?.on("data", (d: Buffer) =>
      String(d).split("\n").forEach((l) => l.trim() && pushLog(l))
    );
    proc.on("exit", (code) => {
      pushLog(`⏹ Process exited (code ${code ?? "?"})`);
      proc = null;
    });

    return NextResponse.json({ ok: true, pid: proc.pid });
  }

  // ── setup: create venv + pip install ─────────────────────────────────────
  if (action === "setup") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });

    const wristDir = path.join(process.cwd(), "wrist-cam");
    const venvDir  = path.join(wristDir, ".venv");
    const venvPip  = venvBin(venvDir, "pip");
    const reqPath  = path.join(wristDir, "requirements.txt");

    if (!fs.existsSync(reqPath))
      return NextResponse.json({ ok: false, error: "wrist-cam/requirements.txt not found" });

    pushLog("⚙ Setting up Python environment...");

    const steps: Array<() => ChildProcess> = [];
    if (!fs.existsSync(venvDir)) {
      pushLog("⚙ Creating .venv ...");
      steps.push(() => spawn(systemPython, ["-m", "venv", ".venv"], { cwd: wristDir }));
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
        const pip = spawn(venvPip, ["install", "-r", "requirements.txt"], { cwd: wristDir });
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

  // ── reinstall: pip install --upgrade (venv must exist) ───────────────────
  if (action === "reinstall") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });
    const wristDir = path.join(process.cwd(), "wrist-cam");
    const venvPip  = venvBin(path.join(wristDir, ".venv"), "pip");
    if (!fs.existsSync(venvPip)) {
      return NextResponse.json({ ok: false, error: "venv not found — run Setup first" });
    }
    pushLog("⚙ Reinstalling packages...");
    const pip = spawn(venvPip, ["install", "-r", "requirements.txt", "--upgrade"], { cwd: wristDir });
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
