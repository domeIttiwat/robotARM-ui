#!/bin/bash
# Double-click this file in Finder to launch the robot simulator
cd "$(dirname "$0")"
source venv/bin/activate
python robot_simulator.py
