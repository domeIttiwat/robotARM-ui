#!/usr/bin/env node
// Cross-platform equivalent of: cd RobotArm_Project && python -m venv venv && venv/bin/pip install -r requirements.txt
const { join } = require("path");
const { execFileSync, spawnSync } = require("child_process");

const root = join(__dirname, "..");
const robotDir = join(root, "RobotArm_Project");
const isWin = process.platform === "win32";
const pythonCmd = isWin ? "python" : "python3";
const binDir = isWin ? "Scripts" : "bin";
const pipExe = join(robotDir, "venv", binDir, isWin ? "pip.exe" : "pip");

console.log("Creating Python venv...");
const venvResult = spawnSync(pythonCmd, ["-m", "venv", "venv"], { cwd: robotDir, stdio: "inherit" });
if (venvResult.status !== 0) { process.exit(venvResult.status ?? 1); }

console.log("Installing dependencies...");
execFileSync(pipExe, ["install", "-r", "requirements.txt"], { cwd: robotDir, stdio: "inherit" });
console.log("Setup complete.");
