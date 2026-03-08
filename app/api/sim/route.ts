import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";

let simProc:     ChildProcess | null = null;
let mockRosProc: ChildProcess | null = null;

function isRunning() {
  return !!(simProc && !simProc.killed);
}

function isMockRosRunning() {
  return !!(mockRosProc && !mockRosProc.killed);
}

/** Check if port 9090 already has something listening (real rosbridge or mock-ros) */
function isPort9090Open(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port: 9090 });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error",   () => resolve(false));
    setTimeout(() => { sock.destroy(); resolve(false); }, 500);
  });
}

export async function GET() {
  return Response.json({ running: isRunning(), pid: simProc?.pid ?? null });
}

export async function POST() {
  if (isRunning()) {
    return Response.json({ ok: false, error: "already running", pid: simProc!.pid });
  }

  const cwd = process.cwd();

  // Start mock-ros if port 9090 is not already open
  const port9090Open = await isPort9090Open();
  if (!port9090Open && !isMockRosRunning()) {
    const mockScript = path.join(cwd, "scripts/mock-ros.ts");
    mockRosProc = spawn("npx", ["tsx", mockScript], { cwd, detached: false, stdio: "ignore" });
    mockRosProc.on("exit",  () => { mockRosProc = null; });
    mockRosProc.on("error", () => { mockRosProc = null; });
    // Give mock-ros 600ms to boot before starting the Python sim
    await new Promise(r => setTimeout(r, 600));
  }

  // Start Python sim
  const venvPy = path.join(cwd, "RobotArm_Project/venv/bin/python");
  const pyBin  = fs.existsSync(venvPy) ? venvPy : "python3";
  const script = path.join(cwd, "RobotArm_Project/main.py");

  simProc = spawn(pyBin, [script], { cwd, detached: false, stdio: "ignore" });
  simProc.on("exit",  () => { simProc = null; });
  simProc.on("error", () => { simProc = null; });

  return Response.json({ ok: true, pid: simProc.pid });
}

export async function DELETE() {
  if (!isRunning()) {
    return Response.json({ ok: false, error: "not running" });
  }
  simProc!.kill("SIGTERM");
  simProc = null;

  // Also stop mock-ros if we started it
  if (isMockRosRunning()) {
    mockRosProc!.kill("SIGTERM");
    mockRosProc = null;
  }

  return Response.json({ ok: true });
}
