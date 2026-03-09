"""
robot_simulator.py
==================
Standalone Python robot arm simulator that connects to a rosbridge v2
WebSocket server (ws://localhost:9090) and communicates with the
FIBO Robot Cafe Studio web UI.

Usage:
    python robot_simulator.py

Dependencies:
    pip install websocket-client numpy
"""

import json
import math
import threading
import time
import random
import websocket  # websocket-client


# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

WS_URL = "ws://localhost:9090"

# Simple FK link lengths (mm)
L1          = 250.0
L2          = 220.0
L3          = 160.0
BASE_HEIGHT = 250.0

# Publish rate for continuous topics
PUBLISH_HZ  = 10          # Hz
PUBLISH_DT  = 1.0 / PUBLISH_HZ

# Robot status codes
STATUS_IDLE      = 0
STATUS_TASK_DONE = 1   # one task finished in a multi-task trajectory
STATUS_EXECUTING = 2   # currently moving / executing

# Machine state codes
MACHINE_IDLE        = 0
MACHINE_REACHED     = 2
MACHINE_SINGULARITY = 3

# Topics this simulator PUBLISHES (must be advertised before first publish)
ADVERTISE_TOPICS = [
    ("/joint_states",      "sensor_msgs/JointState"),
    ("/end_effector_pose", "std_msgs/String"),
    ("/robot_status",      "std_msgs/Int8"),
    ("/machine_state",     "std_msgs/Int8"),
    ("/safety_status",     "std_msgs/Int8"),
]

# Topics this simulator SUBSCRIBES to (receive from UI)
SUBSCRIBE_TOPICS = [
    ("/goto_position",      "std_msgs/String"),
    ("/execute_trajectory", "std_msgs/String"),
    ("/pause_execution",    "std_msgs/Bool"),
    ("/stop_execution",     "std_msgs/Bool"),
    ("/teach_mode",         "std_msgs/Bool"),
    ("/tool_config",        "std_msgs/String"),
    ("/safety_status",      "std_msgs/Int8"),
]


# ─────────────────────────────────────────────────────────────
# RobotSimulator class
# ─────────────────────────────────────────────────────────────

class RobotSimulator:
    """
    Simulates a 6-axis robot arm + rail + gripper.

    State machine:
        IDLE  ──► MOVING ──► REACHED ──► IDLE
                    │
                    ├─► PAUSED ──► MOVING (on resume)
                    └─► IDLE   (on stop)
        MOVING (effector, IK fail) ──► SINGULARITY ──► IDLE
    """

    def __init__(self, url: str = WS_URL):
        self.url = url

        # ── Robot state (degrees, mm, %) ──────────────────────
        self.joints   = [0.0] * 6   # J1–J6 in degrees
        self.rail     = 0.0         # 0–600 mm
        self.gripper  = 0.0         # 0–100 %
        self.velocities = [0.0] * 6 # deg/sec, computed during interpolation

        # ── TCP offset (mm) ───────────────────────────────────
        self.tcp_x = 0.0
        self.tcp_y = 0.0
        self.tcp_z = 0.0

        # ── Teach mode ────────────────────────────────────────
        self.teach_mode = False

        # ── Motion state ──────────────────────────────────────
        # 'idle' | 'moving' | 'paused'
        self._motion_state = 'idle'
        self._motion_lock  = threading.Lock()

        # Interpolation parameters (set by _start_move)
        self._q_start    = [0.0] * 6
        self._q_end      = [0.0] * 6
        self._rail_start = 0.0
        self._rail_end   = 0.0
        self._grip_start = 0.0
        self._grip_end   = 0.0
        self._move_time  = 1.0    # seconds
        self._move_elapsed = 0.0  # virtual elapsed time
        self._move_last_t  = 0.0  # wall-clock time of last step
        self._move_thread  = None

        # Pause event: set = running, clear = paused
        self._pause_event = threading.Event()
        self._pause_event.set()  # start un-paused

        # Stop flag
        self._stop_flag = threading.Event()

        # Move completion event (set by move_loop when it finishes naturally)
        self._move_done_event = threading.Event()

        # Jog direction-based state
        self._jog_target  = None    # latest command dict {axis, direction, speed_pct, mode, ...}
        self._jog_cmd_t   = 0.0     # wall time of last received jog command
        self._jog_active  = False
        self._jog_lock    = threading.Lock()

        # Trajectory state
        self._traj_tasks  = []
        self._traj_thread = None

        # Safety status (0=Normal, 1=Warning, 2=E-Stop)
        self._safety_status = 0

        # ── WebSocket ─────────────────────────────────────────
        self._ws        = None
        self._ws_lock   = threading.Lock()
        self.connected  = False

        # ── Periodic publish thread ───────────────────────────
        self._pub_thread = None

    # =========================================================
    # Public API
    # =========================================================

    def connect(self):
        """Connect to rosbridge WebSocket, advertise and subscribe all topics."""
        self._ws = websocket.WebSocketApp(
            self.url,
            on_open    = self._on_open,
            on_message = self._on_message,
            on_error   = self._on_error,
            on_close   = self._on_close,
        )
        t = threading.Thread(
            target=lambda: self._ws.run_forever(reconnect=5),
            name="ws-thread",
            daemon=True,
        )
        t.start()
        print(f"[WS] Connecting to {self.url} …")

    def run(self):
        """Block forever; connect, start publish timer, handle reconnects."""
        self.connect()

        # Start the 10 Hz continuous publish loop
        self._pub_thread = threading.Thread(
            target=self._publish_loop,
            name="publish-loop",
            daemon=True,
        )
        self._pub_thread.start()

        print("[SIM] Running. Press Ctrl+C to quit.")
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            print("\n[SIM] Shutting down.")

    # =========================================================
    # rosbridge v2 WebSocket internals
    # =========================================================

    def _on_open(self, ws):
        self.connected = True
        print("[WS] Connected to rosbridge v2")

        # ── Advertise all topics we will publish ──
        for topic, typ in ADVERTISE_TOPICS:
            self._send({"op": "advertise", "topic": topic, "type": typ})
            print(f"[WS] Advertised {topic}")

        # ── Subscribe to all topics we receive ──
        for topic, typ in SUBSCRIBE_TOPICS:
            self._send({"op": "subscribe", "topic": topic, "type": typ})
            print(f"[WS] Subscribed {topic}")

        # Publish initial safety status once at startup
        self._publish_raw("/safety_status", {"data": 0})
        print("[WS] Published initial /safety_status = 0")

    def _on_message(self, ws, raw):
        try:
            msg = json.loads(raw)
        except Exception:
            return

        topic = msg.get("topic", "")

        if   topic == "/goto_position":
            self.on_goto_position(msg.get("msg", {}))
        elif topic == "/execute_trajectory":
            self.on_execute_trajectory(msg.get("msg", {}))
        elif topic == "/pause_execution":
            self.on_pause(msg.get("msg", {}))
        elif topic == "/stop_execution":
            self.on_stop(msg.get("msg", {}))
        elif topic == "/teach_mode":
            self.on_teach_mode(msg.get("msg", {}))
        elif topic == "/tool_config":
            self.on_tool_config(msg.get("msg", {}))
        elif topic == "/safety_status":
            self.on_safety_status(msg.get("msg", {}))

    def _on_error(self, ws, err):
        print(f"[WS] Error: {err}")

    def _on_close(self, ws, *_):
        self.connected = False
        print("[WS] Disconnected")

    def _send(self, obj: dict):
        """Thread-safe WebSocket send."""
        with self._ws_lock:
            if self._ws and self.connected:
                try:
                    self._ws.send(json.dumps(obj))
                except Exception as e:
                    print(f"[WS] Send error: {e}")

    def _publish_raw(self, topic: str, msg: dict):
        """Send a rosbridge v2 publish frame."""
        self._send({"op": "publish", "topic": topic, "msg": msg})

    # =========================================================
    # Incoming message handlers
    # =========================================================

    def _parse_task(self, task: dict):
        """
        Parse a task dict, run IK if needed.
        Returns (q_target, rail, gripper, move_time) or None on IK failure.
        """
        mode  = task.get("controlMode", "joint")
        speed = max(float(task.get("speed", 50)), 1.0)
        # Speed-based timing: calculate from actual joint delta (fast for Jog, appropriate for large moves)
        max_dps = (speed / 100.0) * 90.0    # max deg/sec at this speed %

        if mode == "effector":
            x     = float(task.get("x",     0.0))
            y     = float(task.get("y",     0.0))
            z     = float(task.get("z",     0.0))
            roll  = float(task.get("roll",  0.0))
            pitch = float(task.get("pitch", 0.0))
            yaw   = float(task.get("yaw",   0.0))
            seed  = [float(task.get(f"j{i+1}", self.joints[i])) for i in range(6)]
            q_target = self.simple_ik(x, y, z, roll, pitch, yaw, seed=seed)
            if q_target is None:
                return None
        else:
            q_target = [float(task.get(f"j{i+1}", self.joints[i])) for i in range(6)]

        rail_target    = float(task.get("rail",    self.rail))
        gripper_target = float(task.get("gripper", self.gripper))

        # Calculate move_time from the largest joint delta (fast for small Jog steps)
        max_delta = max(abs(q_target[i] - self.joints[i]) for i in range(6))
        # Also account for rail movement (scale 1mm ≈ 0.1 deg equivalent)
        max_delta = max(max_delta, abs(rail_target - self.rail) * 0.1)
        move_time = max(0.05, max_delta / max_dps) if max_dps > 0 else 1.0

        return (q_target, rail_target, gripper_target, move_time)

    def on_goto_position(self, msg: dict):
        """
        Handle /goto_position (std_msgs/String).
        msg["data"] is a JSON string with the task payload.
        label="jog" → latest-wins continuous tracking (no thread restart).
        Other labels → original single-move behavior.
        """
        try:
            task = json.loads(msg.get("data", "{}"))
        except Exception as e:
            print(f"[GOTO] JSON parse error: {e}")
            return

        is_jog = task.get("label") == "jog"

        if is_jog:
            with self._jog_lock:
                self._jog_target = task
                self._jog_cmd_t  = time.time()

            if not self._jog_active:
                self._jog_active   = True
                self._motion_state = 'moving'
                self.publish_robot_status(STATUS_EXECUTING)
                threading.Thread(target=self._jog_loop, daemon=True, name="jog-loop").start()
            return

        # Non-jog: stop jog loop first, then original behavior
        with self._jog_lock:
            self._jog_active = False
            self._jog_target = None

        print(f"[GOTO] Received task: label={task.get('label')}")

        result = self._parse_task(task)
        if result is None:
            print("[IK] Failed — singularity")
            self.publish_machine_state(MACHINE_SINGULARITY)
            time.sleep(0.5)
            self.publish_machine_state(MACHINE_IDLE)
            return

        q_target, rail_target, gripper_target, move_time = result
        self._move_done_event.clear()
        self._start_move(q_target, rail_target, gripper_target, move_time, finalize=True)

    def on_execute_trajectory(self, msg: dict):
        """
        Handle /execute_trajectory (std_msgs/String).
        msg["data"] is a JSON array of task dicts, sorted by sequence.
        """
        try:
            tasks = json.loads(msg.get("data", "[]"))
        except Exception as e:
            print(f"[TRAJ] JSON parse error: {e}")
            return

        tasks.sort(key=lambda t: t.get("sequence", 0))
        print(f"[TRAJ] Received {len(tasks)} tasks")

        # Cancel any current motion
        self._stop_flag.set()
        self._pause_event.set()
        if self._move_thread and self._move_thread.is_alive():
            self._move_thread.join(timeout=0.15)
        self._stop_flag.clear()
        self._pause_event.set()

        self._traj_tasks  = tasks
        self._traj_thread = threading.Thread(
            target=self._run_trajectory,
            name="traj-thread",
            daemon=True,
        )
        self._traj_thread.start()

    def _run_trajectory(self):
        """Execute all queued trajectory tasks sequentially."""
        for task in self._traj_tasks:
            if self._stop_flag.is_set():
                break

            result = self._parse_task(task)
            if result is None:
                print(f"[IK] Failed — singularity on task seq={task.get('sequence', '?')}")
                self.publish_machine_state(MACHINE_SINGULARITY)
                time.sleep(0.5)
                self.publish_machine_state(MACHINE_IDLE)
                self.publish_robot_status(STATUS_IDLE)
                return

            q_target, rail_target, gripper_target, move_time = result
            self._move_done_event.clear()
            self._start_move(q_target, rail_target, gripper_target, move_time, finalize=False)

            # Wait for this move to complete (or stop signal)
            while not self._move_done_event.wait(timeout=0.05):
                if self._stop_flag.is_set():
                    self.publish_robot_status(STATUS_IDLE)
                    self.publish_machine_state(MACHINE_IDLE)
                    return

            if self._stop_flag.is_set():
                self.publish_robot_status(STATUS_IDLE)
                self.publish_machine_state(MACHINE_IDLE)
                return

            # Task done: notify UI then honour inter-task delay
            delay_ms = float(task.get("delay", 0))
            self.publish_robot_status(STATUS_TASK_DONE)   # 1
            if delay_ms > 0:
                time.sleep(delay_ms / 1000.0)

        # All tasks complete (or loop exited cleanly)
        if not self._stop_flag.is_set():
            self._motion_state = 'idle'
            self.publish_robot_status(STATUS_IDLE)       # 0
            self.publish_machine_state(MACHINE_REACHED)  # 2
            time.sleep(0.1)
            self.publish_machine_state(MACHINE_IDLE)     # 0
        else:
            self.publish_robot_status(STATUS_IDLE)
            self.publish_machine_state(MACHINE_IDLE)

    def on_pause(self, msg: dict):
        """Handle /pause_execution (std_msgs/Bool)."""
        pause = bool(msg.get("data", False))
        if pause:
            self._pause_event.clear()   # block the move loop
            print("[CTRL] Paused")
            self.publish_robot_status(STATUS_EXECUTING)   # 2: still in trajectory
        else:
            self._pause_event.set()     # resume
            print("[CTRL] Resumed")
            self.publish_robot_status(STATUS_EXECUTING)   # 2: back to executing

    def on_stop(self, msg: dict):
        """Handle /stop_execution (std_msgs/Bool)."""
        stop = bool(msg.get("data", False))
        if stop:
            with self._jog_lock:
                self._jog_active = False
                self._jog_target = None
                self._jog_cmd_t  = 0.0
            self._stop_flag.set()
            self._pause_event.set()     # unblock so move thread can exit
            print("[CTRL] Stopped")
            self.publish_robot_status(STATUS_IDLE)
            self.publish_machine_state(MACHINE_IDLE)

    def on_teach_mode(self, msg: dict):
        """Handle /teach_mode (std_msgs/Bool)."""
        self.teach_mode = bool(msg.get("data", False))
        state = "ON" if self.teach_mode else "OFF"
        print(f"[TEACH] Teach mode {state}")

    def on_tool_config(self, msg: dict):
        """Handle /tool_config (std_msgs/String). msg["data"] is JSON."""
        try:
            cfg = json.loads(msg.get("data", "{}"))
        except Exception as e:
            print(f"[TCP] JSON parse error: {e}")
            return
        self.tcp_x = float(cfg.get("tcp_x", 0.0))
        self.tcp_y = float(cfg.get("tcp_y", 0.0))
        self.tcp_z = float(cfg.get("tcp_z", 0.0))
        print(f"[TCP] Offset updated: ({self.tcp_x}, {self.tcp_y}, {self.tcp_z}) mm")

    def on_safety_status(self, msg: dict):
        """Handle /safety_status (std_msgs/Int8) from the UI."""
        status = max(0, min(2, int(msg.get("data", 0))))
        self._safety_status = status
        labels = {0: "Normal", 1: "Warning", 2: "Emergency Stop"}
        print(f"[SAFETY] {status} — {labels[status]}")
        if status == 2:
            # Emergency stop: halt all motion immediately
            self._stop_flag.set()
            self._pause_event.set()
            self.publish_robot_status(STATUS_IDLE)
            self.publish_machine_state(MACHINE_IDLE)
        # Echo back to confirm state
        self._publish_raw("/safety_status", {"data": status})

    # =========================================================
    # Kinematics
    # =========================================================

    def compute_fk(self, joints: list) -> tuple:
        """
        Planar 3-link FK.  L3 extends along the forearm direction (same as L2),
        so we treat L2_eff = L2 + L3 as a single effective link.

        Returns (x, y, z, roll, pitch, yaw) in mm and degrees.
        TCP offset (tcp_x/y/z) is added after.
        """
        j1, j2, j3, j4, j5, j6 = joints

        j1r  = math.radians(j1)
        j2r  = math.radians(j2)
        j23r = j2r + math.radians(j3)

        L2_eff = L2 + L3   # L3 continues in the same forearm direction

        reach = L1 * math.cos(j2r) + L2_eff * math.cos(j23r)

        x = reach * math.cos(j1r)
        y = reach * math.sin(j1r)
        z = BASE_HEIGHT + L1 * math.sin(j2r) + L2_eff * math.sin(j23r)

        roll  = j4    # wrist roll
        pitch = j5    # wrist pitch
        yaw   = j1    # base yaw

        # Add TCP offset
        x += self.tcp_x
        y += self.tcp_y
        z += self.tcp_z

        return (x, y, z, roll, pitch, yaw)

    def simple_ik(self, x: float, y: float, z: float,
                  roll: float, pitch: float, yaw: float,
                  seed: list = None) -> list:
        """
        Analytical IK for a 3-link planar arm where L3 extends along the same
        forearm direction as L2 (L2_eff = L2 + L3 treated as single link).

        Returns [j1, j2, j3, j4, j5, j6] in degrees, or None on failure.

        Joint 1  (J1) = atan2(y, x)                       — base rotation
        Joints 2/3    = 2-link IK with L2_eff in the vertical plane
        Joint 4  (J4) = roll  (wrist)
        Joint 5  (J5) = pitch (wrist)
        Joint 6  (J6) = 0     (no independent yaw DOF in this model)
        """
        # Remove TCP offset
        wx = x - self.tcp_x
        wy = y - self.tcp_y
        wz = z - self.tcp_z

        L2_eff = L2 + L3   # effective second link (forearm + TCP)

        # J1: base rotation
        j1 = math.degrees(math.atan2(wy, wx))

        # 2D problem in the arm's vertical plane
        r = math.hypot(wx, wy)      # total horizontal reach (no L3 subtraction)
        h = wz - BASE_HEIGHT

        d = math.hypot(r, h)

        # Reachability check
        if d > L1 + L2_eff or d < abs(L1 - L2_eff):
            return None   # out of reach

        # Law of cosines (2-link: L1 and L2_eff)
        cos_j3 = (d * d - L1 * L1 - L2_eff * L2_eff) / (2.0 * L1 * L2_eff)
        cos_j3 = max(-1.0, min(1.0, cos_j3))

        # Elbow-up solution (negative j3 = elbow up)
        j3_rad = -math.acos(cos_j3)
        j2_rad = math.atan2(h, r) - math.atan2(
            L2_eff * math.sin(j3_rad),
            L1 + L2_eff * math.cos(j3_rad),
        )

        j2 = math.degrees(j2_rad)
        j3 = math.degrees(j3_rad)

        # Wrist joints
        j4 = roll
        j5 = pitch
        j6 = 0.0

        return [j1, j2, j3, j4, j5, j6]

    # =========================================================
    # Motion (interpolation thread)
    # =========================================================

    def _start_move(self, q_end: list, rail_end: float,
                    gripper_end: float, move_time: float, finalize: bool = True):
        """
        Cancel any ongoing move and start a new interpolation thread.
        finalize=True  → move_loop publishes IDLE/REACHED on completion (single move).
        finalize=False → move_loop only sets _move_done_event (trajectory mode).
        """
        # Signal existing move to stop
        self._stop_flag.set()
        self._pause_event.set()   # unblock if paused

        # Wait for old thread to finish (with timeout)
        if self._move_thread and self._move_thread.is_alive():
            self._move_thread.join(timeout=0.15)

        # Reset flags for new move
        self._stop_flag.clear()
        self._pause_event.set()   # new move starts un-paused

        # Snapshot start state
        self._q_start    = list(self.joints)
        self._q_end      = list(q_end)
        self._rail_start = self.rail
        self._rail_end   = rail_end
        self._grip_start = self.gripper
        self._grip_end   = gripper_end
        self._move_time  = move_time

        self._move_thread = threading.Thread(
            target=self.move_loop,
            args=(finalize,),
            name="move-loop",
            daemon=True,
        )
        self._move_thread.start()

    def _jog_loop(self):
        """50 Hz: direction-based continuous jog. Stops 300 ms after last command."""
        MAX_DPS      = 90.0    # deg/sec at 100 % speed
        MAX_MMS      = 300.0   # mm/sec  at 100 % speed (Cartesian)
        TIMEOUT      = 0.3     # seconds of silence before auto-stop

        last_t = time.time()
        while True:
            with self._jog_lock:
                target   = self._jog_target
                cmd_t    = self._jog_cmd_t
                active   = self._jog_active
            if not active:
                break

            now = time.time()

            # Auto-stop when button is released (no command for TIMEOUT seconds)
            if now - cmd_t > TIMEOUT:
                with self._jog_lock:
                    self._jog_active = False
                    self._jog_target = None
                break

            dt     = min(now - last_t, 0.1)
            last_t = now

            if target is not None:
                axis      = target.get("axis", "")
                direction = float(target.get("direction", 0))
                speed_pct = float(target.get("speed", 30))
                mode      = target.get("controlMode", "joint")

                if mode == "joint":
                    if axis in ("j1", "j2", "j3", "j4", "j5", "j6"):
                        idx  = int(axis[1]) - 1
                        step = (speed_pct / 100.0) * MAX_DPS * dt * direction
                        self.joints[idx] = max(-180.0, min(180.0, self.joints[idx] + step))
                    elif axis == "rail":
                        step = (speed_pct / 100.0) * MAX_MMS * dt * direction
                        self.rail = max(0.0, min(1000.0, self.rail + step))
                    elif axis == "gripper":
                        step = speed_pct * dt * direction   # 100 % speed = 100 %/sec
                        self.gripper = max(0.0, min(100.0, self.gripper + step))

                elif mode == "effector":
                    tcp_x = float(target.get("tcp_x", 0))
                    tcp_y = float(target.get("tcp_y", 0))
                    tcp_z = float(target.get("tcp_z", 0))

                    # Get current tip position (with TCP offset)
                    x, y, z, roll, pitch, yaw = self.compute_fk(self.joints)

                    step_mm  = (speed_pct / 100.0) * MAX_MMS  * dt * direction
                    step_deg = (speed_pct / 100.0) * MAX_DPS  * dt * direction

                    if   axis == "x":     x     += step_mm
                    elif axis == "y":     y     += step_mm
                    elif axis == "z":     z     += step_mm
                    elif axis == "roll":  roll  += step_deg
                    elif axis == "pitch": pitch += step_deg
                    elif axis == "yaw":   yaw   += step_deg
                    else:
                        time.sleep(0.02)
                        continue

                    q_new = self.simple_ik(x, y, z, roll, pitch, yaw)
                    if q_new is None:
                        time.sleep(0.02)
                        continue   # singularity — skip silently
                    self.joints = list(q_new)

                self.publish_joint_states()
                self.publish_effector_pose()

            time.sleep(0.02)   # 50 Hz

        self.publish_machine_state(MACHINE_IDLE)
        self._motion_state = 'idle'
        self.publish_robot_status(STATUS_IDLE)

    def move_loop(self, finalize: bool = True):
        """
        Interpolation thread: runs at 10 Hz, updates joint state,
        publishes /joint_states and /end_effector_pose each step.

        finalize=True  → publish IDLE + REACHED + IDLE on completion (single move).
        finalize=False → only set _move_done_event; caller handles state transitions.
        """
        self._motion_state = 'moving'
        self.publish_robot_status(STATUS_EXECUTING)  # 2

        dt = PUBLISH_DT
        elapsed = 0.0
        last_t  = time.time()

        while True:
            # ── Check stop flag ──
            if self._stop_flag.is_set():
                self._motion_state = 'idle'
                return

            # ── Honour pause (block until resumed) ──
            self._pause_event.wait()
            if self._stop_flag.is_set():
                self._motion_state = 'idle'
                return

            # ── Advance elapsed time ──
            now       = time.time()
            wall_dt   = now - last_t
            last_t    = now
            elapsed  += wall_dt

            t = min(elapsed / self._move_time, 1.0)

            # ── Linear interpolation ──
            for i in range(6):
                self.joints[i] = self._q_start[i] + t * (self._q_end[i] - self._q_start[i])
                # Velocity (deg/sec)
                if wall_dt > 0:
                    self.velocities[i] = (self._q_end[i] - self._q_start[i]) / self._move_time
                else:
                    self.velocities[i] = 0.0

            self.rail    = self._rail_start + t * (self._rail_end - self._rail_start)
            self.gripper = self._grip_start + t * (self._grip_end - self._grip_start)

            # ── Publish feedback ──
            self.publish_joint_states()
            self.publish_effector_pose()

            # ── Check if motion complete ──
            if t >= 1.0:
                self.velocities = [0.0] * 6
                self._motion_state = 'idle'
                self._move_done_event.set()
                if finalize:
                    self.publish_robot_status(STATUS_IDLE)       # 0
                    self.publish_machine_state(MACHINE_REACHED)  # 2
                    time.sleep(0.1)
                    self.publish_machine_state(MACHINE_IDLE)     # 0
                return

            # ── Sleep for next tick ──
            time.sleep(dt)

    # =========================================================
    # Teach mode drift (simulate free-drive)
    # =========================================================

    def _teach_drift_step(self):
        """Add small random drift to joints when teach mode is active."""
        if self.teach_mode and self._motion_state == 'idle':
            for i in range(6):
                self.joints[i] += random.uniform(-0.05, 0.05)

    # =========================================================
    # Continuous publish loop (10 Hz)
    # =========================================================

    def _publish_loop(self):
        """
        Runs at 10 Hz. Publishes /joint_states and /end_effector_pose
        continuously so the UI always has fresh data (even when idle).
        Also applies teach mode drift when active.
        """
        while True:
            start = time.time()

            if self.connected:
                self._teach_drift_step()
                self.publish_joint_states()
                self.publish_effector_pose()

            elapsed = time.time() - start
            sleep_t = PUBLISH_DT - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)

    # =========================================================
    # Publish helpers
    # =========================================================

    def publish_joint_states(self):
        """
        Publish /joint_states — sensor_msgs/JointState.
        position[0–5]: degrees, position[6]: rail mm, position[7]: gripper %.
        """
        self._publish_raw("/joint_states", {
            "name": ["j1", "j2", "j3", "j4", "j5", "j6", "rail", "gripper"],
            "position": [
                round(self.joints[0], 4),
                round(self.joints[1], 4),
                round(self.joints[2], 4),
                round(self.joints[3], 4),
                round(self.joints[4], 4),
                round(self.joints[5], 4),
                round(self.rail,      4),
                round(self.gripper,   4),
            ],
            "velocity": [round(v, 4) for v in self.velocities],
        })

    def publish_effector_pose(self):
        """
        Publish /end_effector_pose — std_msgs/String (JSON payload).
        """
        x, y, z, roll, pitch, yaw = self.compute_fk(self.joints)
        self._publish_raw("/end_effector_pose", {
            "data": json.dumps({
                "x":     round(x,     2),
                "y":     round(y,     2),
                "z":     round(z,     2),
                "roll":  round(roll,  3),
                "pitch": round(pitch, 3),
                "yaw":   round(yaw,   3),
            })
        })

    def publish_robot_status(self, val: int):
        """Publish /robot_status — std_msgs/Int8 (on state change only)."""
        self._publish_raw("/robot_status", {"data": val})
        labels = {0: "IDLE", 1: "TASK_DONE", 2: "EXECUTING"}
        print(f"[STATUS] robot_status = {val} ({labels.get(val, '?')})")

    def publish_machine_state(self, val: int):
        """Publish /machine_state — std_msgs/Int8 (on state change only)."""
        self._publish_raw("/machine_state", {"data": val})
        labels = {0: "IDLE", 2: "REACHED", 3: "SINGULARITY"}
        print(f"[STATE]  machine_state = {val} ({labels.get(val, '?')})")


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sim = RobotSimulator(url=WS_URL)
    sim.run()
