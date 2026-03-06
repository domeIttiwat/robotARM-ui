import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

let simProc: ChildProcess | null = null;

function isRunning() {
  return !!(simProc && !simProc.killed);
}

export async function GET() {
  return Response.json({ running: isRunning(), pid: simProc?.pid ?? null });
}

export async function POST() {
  if (isRunning()) {
    return Response.json({ ok: false, error: "already running", pid: simProc!.pid });
  }
  const cwd = process.cwd();
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
  return Response.json({ ok: true });
}
