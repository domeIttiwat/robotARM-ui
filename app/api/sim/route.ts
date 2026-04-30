import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import { venvBin, systemPython } from "@/lib/venvPath";

let simProc:     ChildProcess | null = null;
let mockRosProc: ChildProcess | null = null;
let simViewerUrl: string | null = null;

function isRunning() {
  return !!(simProc && !simProc.killed);
}

function isMockRosRunning() {
  return !!(mockRosProc && !mockRosProc.killed);
}

/** Check if a localhost port already has something listening. */
function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: "127.0.0.1", port });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error",   () => resolve(false));
    setTimeout(() => { sock.destroy(); resolve(false); }, 500);
  });
}

async function firstAvailablePort(start: number, end: number) {
  for (let port = start; port <= end; port += 1) {
    if (!(await isPortOpen(port))) return port;
  }
  throw new Error(`no available port in range ${start}-${end}`);
}

export async function GET() {
  return Response.json({ running: isRunning(), pid: simProc?.pid ?? null, viewerUrl: simViewerUrl });
}

export async function POST() {
  if (isRunning()) {
    return Response.json({ ok: false, error: "already running", pid: simProc!.pid, viewerUrl: simViewerUrl });
  }

  const cwd = process.cwd();

  // Start mock-ros if port 9090 is not already open
  const port9090Open = await isPortOpen(9090);
  if (!port9090Open && !isMockRosRunning()) {
    const mockScript = path.join(cwd, "scripts/mock-ros.ts");
    mockRosProc = spawn("npx", ["tsx", mockScript], { cwd, detached: false, stdio: "ignore" });
    mockRosProc.on("exit",  () => { mockRosProc = null; });
    mockRosProc.on("error", () => { mockRosProc = null; });
    // Give mock-ros 600ms to boot before starting the Python sim
    await new Promise(r => setTimeout(r, 600));
  }

  // swift-sim chooses the first free HTTP/WebSocket ports starting at 52000/53000.
  const httpPort = await firstAvailablePort(52000, 62000);
  const wsPort   = await firstAvailablePort(53000, 62000);
  simViewerUrl = `http://localhost:${httpPort}/?${wsPort}`;

  // Start Python sim
  const venvPy = venvBin(path.join(cwd, "RobotArm_Project", "venv"), "python");
  const pyBin  = fs.existsSync(venvPy) ? venvPy : systemPython;
  const script = path.join(cwd, "RobotArm_Project/main.py");

  simProc = spawn(pyBin, [script], { cwd, detached: false, stdio: "ignore" });
  simProc.on("exit",  () => { simProc = null; simViewerUrl = null; });
  simProc.on("error", () => { simProc = null; simViewerUrl = null; });

  return Response.json({ ok: true, pid: simProc.pid, viewerUrl: simViewerUrl });
}

export async function DELETE() {
  if (!isRunning()) {
    return Response.json({ ok: false, error: "not running" });
  }
  simProc!.kill("SIGTERM");
  simProc = null;
  simViewerUrl = null;

  // Also stop mock-ros if we started it
  if (isMockRosRunning()) {
    mockRosProc!.kill("SIGTERM");
    mockRosProc = null;
  }

  return Response.json({ ok: true });
}
