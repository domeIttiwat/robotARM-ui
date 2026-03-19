"""
Camera-Based Proximity Safety Detection Service
================================================
รัน YOLOv8 nano บน 2 กล้อง USB ตรวจจับคน
คำนวณระยะห่าง person ↔ TCP ของหุ่น (mm, robot frame)
Publish /safety_status → ROS bridge
Stream JPEG frames + metadata → WebSocket :8765 → Next.js

Usage:
  source .venv/bin/activate
  python main.py [--cam-left 0] [--cam-right 1] [--ros ws://localhost:9090]

Safety levels (distance mm):
  >= THRESH_WARN  (600mm) → level 0 (normal)
  >= THRESH_STOP  (300mm) → level 1 (slow)
  <  THRESH_STOP  (300mm) → level 2 (emergency stop)
"""

import argparse
import asyncio
import base64
import json
import logging
import math
import os
import sys
import threading
import time
from typing import Optional

import cv2
import numpy as np
import websockets
from ultralytics import YOLO

try:
    import roslibpy
    _ROSLIBPY_OK = True
except ImportError:
    _ROSLIBPY_OK = False

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("detector")

# ── Default thresholds (mm) ───────────────────────────────────────────────────
DEFAULT_THRESH_WARN = 600   # level 0 → 1
DEFAULT_THRESH_STOP = 300   # level 1 → 2

# ── Forward kinematics constants (mm) ────────────────────────────────────────
# Must match mock-ros.ts and RobotViewer3D
FK_BASE  = 250.0
FK_L1    = 250.0
FK_L2EFF = 220.0 + 160.0   # L2 + L3 extending along same direction

CAL_DIR = os.path.join(os.path.dirname(__file__), "calibration")

# Windows: force DirectShow backend — avoids MSMF slow/silent-fail issues
_CV2_BACKEND = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY

# ─────────────────────────────────────────────────────────────────────────────

def compute_fk(joints: list[float]) -> np.ndarray:
    """
    Simplified 3D FK for TCP position (mm, robot frame).
    joints: [j1, j2, j3, j4, j5, j6] degrees
    Returns np.array [x, y, z]
    """
    j1r = math.radians(joints[0])
    j2r = math.radians(joints[1])
    j3r = math.radians(joints[2])
    j23r = j2r + j3r
    reach = FK_L1 * math.cos(j2r) + FK_L2EFF * math.cos(j23r)
    x = reach * math.cos(j1r)
    y = reach * math.sin(j1r)
    z = FK_BASE + FK_L1 * math.sin(j2r) + FK_L2EFF * math.sin(j23r)
    return np.array([x, y, z])


def load_calibration(cam_name: str) -> dict:
    """Load intrinsic + extrinsic for one camera. Returns empty dict if missing."""
    cal = {}
    intr_path = os.path.join(CAL_DIR, f"cam_{cam_name}_intrinsic.npz")
    extr_path = os.path.join(CAL_DIR, f"cam_{cam_name}_extrinsic.npz")

    if os.path.exists(intr_path):
        d = np.load(intr_path)
        cal["K"] = d["K"]
        cal["D"] = d["D"]
        log.info("Loaded intrinsic for cam_%s (RMS=%.3f)", cam_name, float(d.get("rms", 0)))
    else:
        log.warning("No intrinsic calibration for cam_%s — undistortion disabled", cam_name)

    if os.path.exists(extr_path):
        d = np.load(extr_path)
        cal["R"] = d["R"]   # camera→robot rotation (3×3)
        cal["T"] = d["T"]   # camera→robot translation (3×1)
        log.info("Loaded extrinsic for cam_%s", cam_name)
    else:
        log.warning("No extrinsic calibration for cam_%s — 3D localisation disabled", cam_name)

    return cal


def pixel_to_robot_ray(u: float, v: float, cal: dict) -> Optional[np.ndarray]:
    """
    Back-project pixel (u,v) to a unit ray in robot frame.
    Returns None if calibration is incomplete.
    """
    if "K" not in cal or "R" not in cal or "T" not in cal:
        return None

    K, D, R, T = cal["K"], cal["D"], cal["R"], cal["T"]

    # Undistort point
    pt = np.array([[[u, v]]], dtype=np.float32)
    pt_ud = cv2.undistortPoints(pt, K, D, P=K)
    uv_h = np.array([pt_ud[0, 0, 0], pt_ud[0, 0, 1], 1.0])

    # Ray in camera frame: K^-1 * [u, v, 1]
    ray_cam = np.linalg.inv(K) @ uv_h
    ray_cam /= np.linalg.norm(ray_cam)

    # Rotate ray to robot frame: R maps camera→robot
    ray_robot = R @ ray_cam
    return ray_robot / np.linalg.norm(ray_robot)


def triangulate_person(
    cx_l: float, cy_l: float, cal_l: dict,
    cx_r: float, cy_r: float, cal_r: dict,
) -> Optional[np.ndarray]:
    """
    Linear triangulation from two camera pixels.
    Returns 3D point in robot frame (mm), or None.
    """
    ray_l = pixel_to_robot_ray(cx_l, cy_l, cal_l)
    ray_r = pixel_to_robot_ray(cx_r, cy_r, cal_r)
    if ray_l is None or ray_r is None:
        return None

    # Camera centres in robot frame: C = -R^T @ T
    C_l = -cal_l["R"].T @ cal_l["T"].ravel()
    C_r = -cal_r["R"].T @ cal_r["T"].ravel()

    # Solve: C_l + t*ray_l ≈ C_r + s*ray_r
    A = np.column_stack([ray_l, -ray_r])
    b = C_r - C_l
    ts, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    point = (C_l + ts[0] * ray_l + C_r + ts[1] * ray_r) / 2.0
    return point


def project_to_ground(cx: float, cy: float, cal: dict, ground_z: float = 0.0) -> Optional[np.ndarray]:
    """
    Single-camera fallback: assume person feet at ground_z (mm).
    Intersect camera ray with horizontal plane Z = ground_z.
    Returns 3D point in robot frame, or None.
    """
    ray = pixel_to_robot_ray(cx, cy, cal)
    if ray is None:
        return None
    if "R" not in cal or "T" not in cal:
        return None

    C = -cal["R"].T @ cal["T"].ravel()   # camera origin in robot frame
    if abs(ray[2]) < 1e-6:
        return None
    t = (ground_z - C[2]) / ray[2]
    if t < 0:
        return None
    return C + t * ray


def draw_detections(frame: np.ndarray, boxes: list, label: str = "") -> np.ndarray:
    for box in boxes:
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        conf = float(box[4]) if len(box) > 4 else 1.0
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 255), 2)
        cv2.putText(frame, f"{label} {conf:.2f}",
                    (x1, max(y1 - 8, 0)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 2)
    return frame


def frame_to_b64(frame: np.ndarray, quality: int = 65) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode("ascii")


# ─────────────────────────────────────────────────────────────────────────────

class SafetyDetector:
    def __init__(self, args):
        self.args = args
        self.thresh_warn = args.thresh_warn
        self.thresh_stop = args.thresh_stop

        # Latest robot state (updated by ROS callback)
        self._lock = threading.Lock()
        self._joints:  list[float] = [0.0] * 6
        self._rail_pos: float      = 0.0

        # Latest frame payload for WebSocket broadcast
        self._latest_payload: Optional[dict] = None
        self._clients: set = set()

        # Safety level (0/1/2) — only publish when it changes
        self._safety_level  = 0
        self._ros_connected = False

        # WebSocket threshold sync (from browser sliders)
        # Messages like {"thresh_warn": 500, "thresh_stop": 250}

    # ── ROS connection ────────────────────────────────────────────────────────

    def _connect_ros(self):
        if not _ROSLIBPY_OK:
            log.warning("roslibpy not installed — running without ROS. Install: pip install roslibpy")
            self._ros_connected = False
            return
        try:
            client = roslibpy.Ros(host=self.args.ros_host, port=self.args.ros_port)
            client.run_in_thread()   # non-blocking — ไม่บล็อค WebSocket server
            # รอให้เชื่อมต่อสำเร็จ (timeout 3 วิ)
            for _ in range(15):
                if client.is_connected:
                    break
                time.sleep(0.2)
            if not client.is_connected:
                raise ConnectionError("ROS bridge not reachable")

            self._ros_client = client
            self._ros_connected = True
            log.info("Connected to ROS bridge at %s:%d", self.args.ros_host, self.args.ros_port)

            # Subscribe to /joint_states
            joint_topic = roslibpy.Topic(client, "/joint_states", "sensor_msgs/JointState")
            joint_topic.subscribe(self._on_joint_states)

            # Advertise /safety_status
            self._safety_topic = roslibpy.Topic(client, "/safety_status", "std_msgs/Int8")
            self._safety_topic.advertise()

            log.info("Subscribed /joint_states | Advertised /safety_status")
        except Exception as e:
            log.warning("ROS connection failed: %s — running without ROS", e)
            self._ros_connected = False

    def _on_joint_states(self, msg):
        positions = msg.get("position", [])
        with self._lock:
            self._joints   = list(positions[:6]) if len(positions) >= 6 else [0.0] * 6
            self._rail_pos = float(positions[6]) if len(positions) > 6 else 0.0

    def _publish_safety(self, level: int):
        if not self._ros_connected:
            return
        try:
            self._safety_topic.publish(roslibpy.Message({"data": level}))
        except Exception as e:
            log.warning("Failed to publish safety_status: %s", e)

    # ── Main detection loop ───────────────────────────────────────────────────

    def run(self):
        log.info("Loading YOLOv8 nano model...")
        model = YOLO("yolov8n.pt")   # auto-download on first run

        cal_l = load_calibration("left")
        cal_r = load_calibration("right")

        cap_l = cv2.VideoCapture(self.args.cam_left,  _CV2_BACKEND)
        cap_r = cv2.VideoCapture(self.args.cam_right, _CV2_BACKEND)

        for cap, name in [(cap_l, "CAM-L"), (cap_r, "CAM-R")]:
            if not cap.isOpened():
                log.warning("%s not available — frame will be blank", name)

        log.info("Starting detection loop (WS port %d)", self.args.ws_port)

        while True:
            t0 = time.perf_counter()

            # Read frames
            ret_l, frame_l = cap_l.read() if cap_l.isOpened() else (False, None)
            ret_r, frame_r = cap_r.read() if cap_r.isOpened() else (False, None)

            blank = np.zeros((360, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "No camera", (220, 180),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (80, 80, 80), 2)
            if not ret_l or frame_l is None:
                frame_l = blank.copy()
            if not ret_r or frame_r is None:
                frame_r = blank.copy()

            # YOLO inference on both frames (batch for efficiency)
            results_l = model(frame_l, classes=[0], verbose=False)[0]  # class 0 = person
            results_r = model(frame_r, classes=[0], verbose=False)[0]

            boxes_l = results_l.boxes.data.cpu().numpy() if results_l.boxes else []
            boxes_r = results_r.boxes.data.cpu().numpy() if results_r.boxes else []

            # ── 3D person localisation ────────────────────────────────────────
            person_xyz: Optional[np.ndarray] = None

            # Pick largest (most confident) detection in each camera
            def best_box(boxes):
                if len(boxes) == 0:
                    return None
                return max(boxes, key=lambda b: (b[2]-b[0])*(b[3]-b[1]))

            bb_l = best_box(boxes_l)
            bb_r = best_box(boxes_r)

            if bb_l is not None and bb_r is not None:
                # Triangulate using both cameras
                cx_l = (bb_l[0] + bb_l[2]) / 2
                cy_l = (bb_l[1] + bb_l[3]) / 2   # bottom = foot contact
                cx_r = (bb_r[0] + bb_r[2]) / 2
                cy_r = (bb_r[1] + bb_r[3]) / 2
                person_xyz = triangulate_person(cx_l, cy_l, cal_l, cx_r, cy_r, cal_r)

            elif bb_l is not None:
                cx_l = (bb_l[0] + bb_l[2]) / 2
                cy_l = bb_l[3]   # foot estimate: bottom of box
                person_xyz = project_to_ground(cx_l, cy_l, cal_l)

            elif bb_r is not None:
                cx_r = (bb_r[0] + bb_r[2]) / 2
                cy_r = bb_r[3]
                person_xyz = project_to_ground(cx_r, cy_r, cal_r)

            # ── TCP position ─────────────────────────────────────────────────
            with self._lock:
                joints    = list(self._joints)
                rail_pos  = self._rail_pos

            tcp_xyz = compute_fk(joints)
            tcp_xyz[0] += rail_pos  # rail shifts TCP in X direction

            # ── Distance + safety level ───────────────────────────────────────
            if person_xyz is not None:
                distance_mm = float(np.linalg.norm(person_xyz - tcp_xyz))
            else:
                distance_mm = float("inf")

            level = (2 if distance_mm < self.thresh_stop
                     else 1 if distance_mm < self.thresh_warn
                     else 0)

            if level != self._safety_level:
                self._safety_level = level
                self._publish_safety(level)
                log.info("Safety → level %d  dist=%.0fmm  tcp=%s",
                         level, distance_mm, tcp_xyz.round(1))

            # ── Draw bbox on frames ───────────────────────────────────────────
            if bb_l is not None:
                draw_detections(frame_l, [bb_l], "person")
                # Distance text
                cx = int((bb_l[0] + bb_l[2]) / 2)
                cy = int(bb_l[1]) - 30
                dist_txt = f"{distance_mm:.0f}mm" if distance_mm != float("inf") else "?"
                cv2.putText(frame_l, dist_txt, (cx, max(cy, 0)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                            (0, 80, 255) if level == 2 else (0, 165, 255) if level == 1 else (0, 220, 0),
                            2)

            if bb_r is not None:
                draw_detections(frame_r, [bb_r], "person")

            # Safety overlay banner
            banner_color = (0, 0, 200) if level == 2 else (0, 120, 255) if level == 1 else (0, 150, 0)
            banner_text  = ["NORMAL", "SLOW — person near", "STOP — person too close"][level]
            for fr in [frame_l, frame_r]:
                cv2.rectangle(fr, (0, 0), (fr.shape[1], 50), banner_color, -1)
                cv2.putText(fr, banner_text, (10, 36),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)

            # ── Build WebSocket payload ───────────────────────────────────────
            payload = {
                "cam_left":     frame_to_b64(frame_l),
                "cam_right":    frame_to_b64(frame_r),
                "safety_level": level,
                "distance_mm":  round(distance_mm, 1) if distance_mm != float("inf") else None,
                "tcp":          {"x": round(tcp_xyz[0], 1), "y": round(tcp_xyz[1], 1), "z": round(tcp_xyz[2], 1)},
                "person":       ({"x": round(float(person_xyz[0]), 1),
                                  "y": round(float(person_xyz[1]), 1),
                                  "z": round(float(person_xyz[2]), 1)}
                                 if person_xyz is not None else None),
                "rail_pos":     round(rail_pos, 1),
            }

            with self._lock:
                self._latest_payload = payload

            # Target ~15 fps (66ms per loop)
            elapsed = time.perf_counter() - t0
            time.sleep(max(0, 0.066 - elapsed))

    # ── WebSocket server ──────────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        log.info("WS client connected: %s", websocket.remote_address)
        self._clients.add(websocket)
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                    # Threshold update from browser sliders
                    if "thresh_warn" in msg:
                        self.thresh_warn = float(msg["thresh_warn"])
                        log.info("thresh_warn → %.0f mm", self.thresh_warn)
                    if "thresh_stop" in msg:
                        self.thresh_stop = float(msg["thresh_stop"])
                        log.info("thresh_stop → %.0f mm", self.thresh_stop)
                except Exception:
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            log.info("WS client disconnected: %s", websocket.remote_address)

    async def ws_broadcast(self):
        """Continuously broadcast latest payload to all connected WS clients."""
        while True:
            await asyncio.sleep(0.066)  # ~15 fps
            with self._lock:
                payload = self._latest_payload
            if payload and self._clients:
                data = json.dumps(payload)
                dead = set()
                for ws in list(self._clients):
                    try:
                        await ws.send(data)
                    except Exception:
                        dead.add(ws)
                self._clients -= dead

    async def run_ws_server(self):
        async with websockets.serve(self.ws_handler, "0.0.0.0", self.args.ws_port):
            log.info("WebSocket server listening on ws://0.0.0.0:%d", self.args.ws_port)
            await self.ws_broadcast()


# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Camera proximity safety detector")
    parser.add_argument("--cam-left",   type=int,   default=0,               help="Left camera device index")
    parser.add_argument("--cam-right",  type=int,   default=1,               help="Right camera device index")
    parser.add_argument("--ros-host",   type=str,   default="localhost",      help="ROS bridge host")
    parser.add_argument("--ros-port",   type=int,   default=9090,             help="ROS bridge port")
    parser.add_argument("--ws-port",    type=int,   default=8765,             help="WebSocket server port")
    parser.add_argument("--thresh-warn",type=float, default=DEFAULT_THRESH_WARN, help="Distance (mm): level 0→1")
    parser.add_argument("--thresh-stop",type=float, default=DEFAULT_THRESH_STOP, help="Distance (mm): level 1→2")
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    detector = SafetyDetector(args)
    detector._connect_ros()

    # Detection loop runs in background thread (blocking OpenCV loop)
    detect_thread = threading.Thread(target=detector.run, daemon=True)
    detect_thread.start()

    # WebSocket server runs in asyncio event loop (main thread)
    try:
        asyncio.run(detector.run_ws_server())
    except KeyboardInterrupt:
        log.info("Shutting down...")
        sys.exit(0)


if __name__ == "__main__":
    main()
