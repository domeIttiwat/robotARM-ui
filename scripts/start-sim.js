#!/usr/bin/env node
// Cross-platform equivalent of scripts/start-sim.sh
const { join } = require("path");
const { existsSync } = require("fs");
const { spawnSync: spawn } = require("child_process");

const root = join(__dirname, "..");
const isWin = process.platform === "win32";
const binDir = isWin ? "Scripts" : "bin";
const pyName = isWin ? "python.exe" : "python";
const venvDir = join(root, "RobotArm_Project", "venv");
const venvPy = join(venvDir, binDir, pyName);
const script = join(root, "RobotArm_Project", "main.py");

if (!existsSync(venvDir)) {
  console.error("venv not found — run: npm run sim:setup");
  process.exit(1);
}

const pythonExe = existsSync(venvPy) ? venvPy : (isWin ? "python" : "python3");
console.log("Starting robot simulator...");
const result = spawn(pythonExe, [script], { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
