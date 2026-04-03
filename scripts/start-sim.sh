#!/bin/bash
# Activate Python venv and start the robot simulator
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$SCRIPT_DIR/../RobotArm_Project/venv"
MAIN="$SCRIPT_DIR/../RobotArm_Project/main.py"

if [ -d "$VENV" ]; then
  source "$VENV/bin/activate"
else
  echo "venv not found — run: bun run sim:setup"
  exit 1
fi

echo "Starting robot simulator..."
python "$MAIN"
