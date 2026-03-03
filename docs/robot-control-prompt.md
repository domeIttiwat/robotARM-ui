# AI Prompt: Robot Controller Node (ROS2 Python)

Copy the prompt below and give it to an AI (Claude, GPT, etc.) to generate the robot-side ROS2 node.

---

## Prompt

```
Write a ROS2 Python node called `robot_controller` for a 6-axis robot arm with a linear rail.

## System Overview
This node connects to a web UI (FIBO Robot Cafe Studio) via rosbridge v2 WebSocket.
The UI sends motion commands via ROS topics. The node must execute them and report status back.

## Hardware
- 6-axis robot arm: joints J1–J6 (degrees)
- Linear rail: position in mm (0–600 mm)
- Gripper: position percentage (0–100%)
- All axes move simultaneously

## Topics to SUBSCRIBE (receive from UI)

### `/goto_position` — std_msgs/String (JSON)
Execute a single task. Parse msg.data as JSON:

```json
{
  "sequence": 1,
  "label": "Pick cup",
  "j1": 45.0,
  "j2": -30.0,
  "j3": 90.0,
  "j4": 0.0,
  "j5": 45.0,
  "j6": 0.0,
  "rail": 200.0,
  "speed": 70,
  "gripper": 80,
  "controlMode": "joint"
}
```

**controlMode logic:**
- `"joint"` → Use joint-space interpolation. Move J1–J6 and rail directly to target angles. Fast, predictable path.
- `"effector"` → Compute FK from j1–j6 to get the target Cartesian pose (x, y, z, roll, pitch, yaw), then plan a Cartesian path using MoveIt! (compute_cartesian_path or move_group.set_pose_target). End-effector follows a straight line in Cartesian space.

**speed field:** 1–100% of maximum joint velocity. Apply uniformly to all joints.

**Required behavior after receiving:**
1. Publish `/robot_status = 1` (executing)
2. Execute motion based on controlMode
3. Set gripper to target position
4. Publish `/robot_status = 0` (idle) when complete

### `/execute_trajectory` — std_msgs/String (JSON)
Full job sent at job start (for simulators). Schema:
```json
{
  "id": 3,
  "name": "Coffee Routine",
  "tasks": [
    { "sequence": 1, "label": "Home", "j1": 0, "j2": 0, "j3": 0, "j4": 0, "j5": 0, "j6": 0, "rail": 0, "speed": 50, "gripper": 0, "controlMode": "joint" },
    { "sequence": 2, "label": "Pick", "j1": 45, "j2": -30, "j3": 90, "j4": 0, "j5": 45, "j6": 0, "rail": 200, "speed": 70, "gripper": 80, "controlMode": "effector" }
  ]
}
```
The UI executes tasks one at a time via /goto_position. This topic provides the full sequence upfront (optional use).

### `/pause_execution` — std_msgs/Bool
- `true` → pause current motion as safely as possible → publish `/robot_status = 2`
- `false` → resume motion → publish `/robot_status = 1` → publish `0` when done

### `/stop_execution` — std_msgs/Bool
- `true` → emergency stop. Decelerate immediately. Publish `/robot_status = 0`.

### `/teach_mode` — std_msgs/Bool
- `true` → enable free-drive (release joint brakes / reduce impedance)
- `false` → return to position hold

## Topics to PUBLISH (send to UI)

### `/joint_states` — sensor_msgs/JointState
Publish at 10 Hz. Report current positions for all axes:
```json
{
  "name": ["j1", "j2", "j3", "j4", "j5", "j6", "rail", "gripper"],
  "position": [j1_deg, j2_deg, j3_deg, j4_deg, j5_deg, j6_deg, rail_mm, gripper_pct],
  "velocity": [v1, v2, v3, v4, v5, v6]
}
```
- position[0–5]: joint angles in degrees
- position[6]: rail in mm
- position[7]: gripper in %
- velocity[0–5]: joint velocities in degrees/sec

### `/robot_status` — std_msgs/Int8
Publish on every state change (not periodic):
- `0` = Idle (ready)
- `1` = Executing (moving)
- `2` = Paused (holding position)

### `/safety_status` — std_msgs/Int8
Publish when safety state changes:
- `0` = Normal
- `1` = Reduced speed / warning
- `2` = Emergency stop triggered

## Implementation Requirements

1. **ROS2 Humble or Jazzy** (Python rclpy)
2. **MoveIt2** for motion planning (use MoveGroupInterface)
3. Handle `controlMode` in a separate method:
   - `execute_joint_mode(task)` — JointConstraints or set_joint_value_target
   - `execute_effector_mode(task)` — compute FK → set_pose_target or compute_cartesian_path
4. Implement proper state machine for `/robot_status`:
   - IDLE → EXECUTING → IDLE (normal)
   - EXECUTING → PAUSED → EXECUTING (pause/resume)
   - any → IDLE (stop)
5. Thread-safe: motion execution in a background thread, subscribers on main thread
6. Publish `/joint_states` in a timer callback (10Hz)

## Code Structure

Provide:
1. `robot_controller.py` — main ROS2 node
   - class `RobotController(Node)`
   - methods: `goto_position_cb`, `execute_joint_mode`, `execute_effector_mode`, `pause_cb`, `stop_cb`, `teach_mode_cb`, `joint_states_timer_cb`
2. Brief setup instructions for launching with MoveIt2

Make the code clean, well-commented in English, and production-ready for ROS2.
```

---

## Key Design Points

| Topic | Direction | Type | Purpose |
|-------|-----------|------|---------|
| `/goto_position` | UI → Robot | String/JSON | Execute one task (joint or effector mode) |
| `/execute_trajectory` | UI → Robot | String/JSON | Full job upfront (optional) |
| `/pause_execution` | UI → Robot | Bool | Pause (true) / Resume (false) |
| `/stop_execution` | UI → Robot | Bool | Emergency stop |
| `/teach_mode` | UI → Robot | Bool | Free-drive on/off |
| `/joint_states` | Robot → UI | JointState | Live position feedback (10Hz) |
| `/robot_status` | Robot → UI | Int8 | 0=idle, 1=executing, 2=paused |
| `/safety_status` | Robot → UI | Int8 | 0=normal, 1=warning, 2=emergency |

## controlMode Decision Flow

```
Receive /goto_position
        │
        ▼
controlMode == "joint" ?
   Yes ──► set_joint_value_target(j1..j6, rail)
            joint-space interpolation → move
   No  ──► FK(j1..j6) → get Cartesian pose (x,y,z,rx,ry,rz)
            compute_cartesian_path OR set_pose_target
            Cartesian motion planning → move
        │
        ▼
Set gripper position
        │
        ▼
Publish /robot_status = 0
```
