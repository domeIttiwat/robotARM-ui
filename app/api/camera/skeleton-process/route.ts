/**
 * Skeleton Pose Service Process Manager
 * Start / stop / restart detector/skeleton_service.py from the browser.
 * Uses the shared detector/.venv (same environment as main.py).
 * Module-level state persists for the life of the Next.js server process.
 */

import { NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
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

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    sock.on("connect", () => { sock.destroy(); resolve(false); });
    sock.on("error",   () => resolve(true));
    setTimeout(() => { sock.destroy(); resolve(true); }, 300);
  });
}

function isSetupRunning() {
  return setupProc !== null && setupProc.exitCode === null && !setupProc.killed;
}

export async function GET() {
  const detectorDir = path.join(process.cwd(), "detector");
  const venvPython  = venvBin(path.join(detectorDir, ".venv"), "python");
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

    const portFree = await isPortFree(8767);
    if (!portFree && !isRunning()) {
      pushLog("⚠ Port 8767 ถูกใช้งานโดย process อื่นอยู่แล้ว");
      pushLog("  → หยุด process นั้นก่อน แล้วกด Start อีกครั้ง");
      return NextResponse.json({ ok: false, error: "port_conflict", port: 8767 });
    }

    const detectorDir = path.join(process.cwd(), "detector");
    const venvPython  = venvBin(path.join(detectorDir, ".venv"), "python");
    const pythonExe   = fs.existsSync(venvPython) ? venvPython : systemPython;
    const scriptPath  = path.join(detectorDir, "skeleton_service.py");

    if (!fs.existsSync(scriptPath))
      return NextResponse.json({ ok: false, error: "detector/skeleton_service.py not found" });

    pushLog(`▶ Starting skeleton service (${pythonExe.includes(".venv") ? ".venv python" : "system python3"})`);

    const args = ["skeleton_service.py"];
    if (camIndex != null) args.push("--cam", String(camIndex));

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

  // ── setup: pip install mediapipe into detector/.venv ─────────────────────
  if (action === "setup") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });

    const detectorDir = path.join(process.cwd(), "detector");
    const venvDir     = path.join(detectorDir, ".venv");
    const venvPip     = venvBin(venvDir, "pip");
    const reqPath     = path.join(detectorDir, "requirements.txt");

    if (!fs.existsSync(reqPath))
      return NextResponse.json({ ok: false, error: "detector/requirements.txt not found" });

    pushLog("⚙ Setting up Python environment (detector/.venv)...");

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

  // ── reinstall: pip install --upgrade ─────────────────────────────────────
  if (action === "reinstall") {
    if (isSetupRunning()) return NextResponse.json({ ok: false, error: "Setup already running" });
    const detectorDir = path.join(process.cwd(), "detector");
    const venvPip     = venvBin(path.join(detectorDir, ".venv"), "pip");
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
