/**
 * Camera Detector Process Manager
 * Start / stop / restart the Python detector service from the browser.
 * Module-level state persists for the life of the Next.js server process.
 */

import { NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

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
  const venvPython = path.join(process.cwd(), "detector", ".venv", "bin", "python");
  return NextResponse.json({
    running:      isRunning(),
    pid:          proc?.pid ?? null,
    setupRunning: isSetupRunning(),
    venvReady:    fs.existsSync(venvPython),
    logs:         logBuf.slice(-60),
  });
}

export async function POST(req: Request) {
  const { action, camLeft, camRight } = await req.json();

  // ── stop ─────────────────────────────────────────────────────────────────
  if (action === "stop") {
    if (!isRunning()) {
      return NextResponse.json({ ok: false, error: "Not running" });
    }
    proc!.kill("SIGTERM");
    proc = null;
    pushLog("⏹ Stopped by user");
    return NextResponse.json({ ok: true });
  }

  // ── start / restart ───────────────────────────────────────────────────────
  if (action === "start" || action === "restart") {
    if (isRunning()) {
      if (action === "start") {
        return NextResponse.json({ ok: false, error: "Already running" });
      }
      proc!.kill("SIGTERM");
      proc = null;
      // give process a moment to die before re-spawning
      await new Promise((r) => setTimeout(r, 600));
    }

    const detectorDir = path.join(process.cwd(), "detector");
    const venvPython  = path.join(detectorDir, ".venv", "bin", "python");
    const pythonExe   = fs.existsSync(venvPython) ? venvPython : "python3";
    const scriptPath  = path.join(detectorDir, "main.py");

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({ ok: false, error: "detector/main.py not found" });
    }

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
    proc.on("exit", (code) => {
      pushLog(`⏹ Process exited (code ${code ?? "?"})`);
      proc = null;
    });

    return NextResponse.json({ ok: true, pid: proc.pid });
  }

  // ── setup: create venv + pip install ─────────────────────────────────────
  if (action === "setup") {
    if (isSetupRunning()) {
      return NextResponse.json({ ok: false, error: "Setup already running" });
    }

    const detectorDir = path.join(process.cwd(), "detector");
    const venvDir     = path.join(detectorDir, ".venv");
    const venvPip     = path.join(venvDir, "bin", "pip");
    const reqPath     = path.join(detectorDir, "requirements.txt");

    if (!fs.existsSync(reqPath)) {
      return NextResponse.json({ ok: false, error: "detector/requirements.txt not found" });
    }

    pushLog("⚙ Setting up Python environment...");

    // Step 1: create venv if missing, then pip install
    const steps: Array<() => ChildProcess> = [];

    if (!fs.existsSync(venvDir)) {
      pushLog("⚙ Creating .venv ...");
      steps.push(() => spawn("python3", ["-m", "venv", ".venv"], { cwd: detectorDir }));
    }

    const runSteps = (idx: number) => {
      if (idx < steps.length) {
        const p = steps[idx]();
        setupProc = p;
        p.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        p.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        p.on("exit", (code) => {
          if (code !== 0) {
            pushLog(`✗ Step failed (code ${code})`);
            setupProc = null;
          } else {
            runSteps(idx + 1);
          }
        });
      } else {
        // All steps done — run pip install
        pushLog("⚙ Installing packages (this may take a few minutes)...");
        const pip = spawn(venvPip, ["install", "-r", "requirements.txt"], { cwd: detectorDir });
        setupProc = pip;
        pip.stdout?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        pip.stderr?.on("data", (d: Buffer) => String(d).split("\n").forEach((l) => l.trim() && pushLog(l)));
        pip.on("exit", (code) => {
          setupProc = null;
          if (code === 0) {
            pushLog("✓ Setup complete — ready to Start");
          } else {
            pushLog(`✗ pip install failed (code ${code})`);
          }
        });
      }
    };

    runSteps(0);
    return NextResponse.json({ ok: true });
  }

  // ── reinstall: pip install --upgrade (venv must exist) ───────────────────
  if (action === "reinstall") {
    if (isSetupRunning()) {
      return NextResponse.json({ ok: false, error: "Setup already running" });
    }
    const detectorDir = path.join(process.cwd(), "detector");
    const venvPip     = path.join(detectorDir, ".venv", "bin", "pip");
    if (!fs.existsSync(venvPip)) {
      return NextResponse.json({ ok: false, error: "venv not found — run Setup first" });
    }
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
