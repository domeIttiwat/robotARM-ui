"""
Skeleton Pose Service
=====================
รัน MediaPipe Pose บนกล้องซ้าย (หรือกล้องเดียว)
สกัด 11 keypoints ที่ UI ใช้สำหรับ collision detection
Broadcast JSON via WebSocket port 8767 → Next.js useSkeletonData hook

Format ที่ส่ง:
{
  "persons": [
    {
      "id": 0,
      "keypoints": {
        "0":  {"x": 0.5, "y": 1.6, "z": 0.8, "visibility": 0.95},
        "11": {...}, "12": {...}, ...
      }
    }
  ],
  "timestamp": 1234567890000
}

ระบบพิกัด (Three.js / UI frame) — หน่วย เมตร:
  X = ซ้าย/ขวา  (+X = ขวาเมื่อหันหน้าเข้าหาหุ่น)
  Y = บน/ล่าง   (+Y = ขึ้น)
  Z = หน้า/หลัง (+Z = ห่างจากหุ่น เข้าหาคน)

การแปลงพิกัด (robot frame → Three.js):
  robot frame (mm): X=forward/ลึก, Y=ด้านข้าง, Z=ความสูง
  threejs (m):  X=robot.Y/1000, Y=robot.Z/1000, Z=robot.X/1000

MediaPipe world_landmarks (person-centric, meters):
  x = ขวาของคน,  y = ขึ้น,  z = เข้าหากล้อง (+z toward camera)

Usage:
  source detector/.venv/bin/activate
  python detector/skeleton_service.py [--cam 0] [--port 8767]

ติดตั้ง mediapipe:
  pip install mediapipe
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import threading
import time
from typing import Optional

import cv2
import numpy as np

try:
    import websockets
except ImportError:
    print("ERROR: websockets not installed. Run: pip install 'websockets>=12.0'", file=sys.stderr)
    sys.exit(1)

try:
    import mediapipe as mp
    _MP_OK = True
except ImportError:
    _MP_OK = False

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("skeleton")

# ── Config ────────────────────────────────────────────────────────────────────
CAL_DIR = os.path.join(os.path.dirname(__file__), "calibration")

# MediaPipe keypoint indices used by SkeletonOverlay3D.tsx
USED_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 27, 28]

# Assumed hip height above ground when projecting via single camera (mm)
HIP_HEIGHT_MM = 900.0

_CV2_BACKEND = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY


# ── Calibration helpers (same as main.py) ────────────────────────────────────

def load_calibration(cam_name: str) -> dict:
    """Load intrinsic + extrinsic for one camera. Returns empty dict if missing."""
    cal: dict = {}
    intr_path = os.path.join(CAL_DIR, f"cam_{cam_name}_intrinsic.npz")
    extr_path = os.path.join(CAL_DIR, f"cam_{cam_name}_extrinsic.npz")

    if os.path.exists(intr_path):
        d = np.load(intr_path)
        cal["K"] = d["K"]
        cal["D"] = d["D"]
        log.info("Loaded intrinsic for cam_%s", cam_name)
    else:
        log.warning("No intrinsic calibration for cam_%s — undistortion disabled", cam_name)

    if os.path.exists(extr_path):
        d = np.load(extr_path)
        cal["R"] = d["R"]   # camera→robot rotation (3×3)
        cal["T"] = d["T"]   # camera→robot translation (3×1, mm)
        log.info("Loaded extrinsic for cam_%s", cam_name)
    else:
        log.warning("No extrinsic calibration for cam_%s — using fallback positioning", cam_name)

    return cal


def pixel_to_robot_ray(u: float, v: float, cal: dict) -> Optional[np.ndarray]:
    """Back-project pixel (u,v) → unit ray in robot frame."""
    if "K" not in cal or "R" not in cal or "T" not in cal:
        return None
    K, D, R = cal["K"], cal["D"], cal["R"]
    pt = np.array([[[u, v]]], dtype=np.float32)
    pt_ud = cv2.undistortPoints(pt, K, D, P=K)
    uv_h = np.array([pt_ud[0, 0, 0], pt_ud[0, 0, 1], 1.0])
    ray_cam = np.linalg.inv(K) @ uv_h
    ray_cam /= np.linalg.norm(ray_cam)
    ray_robot = R @ ray_cam
    return ray_robot / np.linalg.norm(ray_robot)


def project_to_height(u: float, v: float, height_mm: float, cal: dict) -> Optional[np.ndarray]:
    """
    Single-camera: project pixel to robot frame assuming point is at Z=height_mm.
    Returns (x, y, z) in robot frame mm, or None if calibration unavailable.
    """
    ray = pixel_to_robot_ray(u, v, cal)
    if ray is None:
        return None
    C = -cal["R"].T @ cal["T"].ravel()   # camera origin in robot frame (mm)
    if abs(ray[2]) < 1e-6:
        return None
    t = (height_mm - C[2]) / ray[2]
    if t < 0:
        return None
    return C + t * ray


def robot_to_threejs(p_mm: np.ndarray) -> np.ndarray:
    """
    Robot frame (mm) → Three.js frame (m).

    Robot frame (from main.py FK):
      X = forward/reach direction (cos j1)
      Y = lateral (sin j1)
      Z = height

    Three.js frame (UI):
      X = lateral (+right when facing robot)
      Y = height  (+up)
      Z = depth   (+away from robot, toward person)

    Convention when robot points forward (j1≈0), camera facing person:
      threejs.X = robot.Y / 1000
      threejs.Y = robot.Z / 1000
      threejs.Z = robot.X / 1000
    """
    return np.array([
        p_mm[1] / 1000.0,   # X = lateral (robot Y)
        p_mm[2] / 1000.0,   # Y = height  (robot Z)
        p_mm[0] / 1000.0,   # Z = depth   (robot X)
    ])


# ── Main service ──────────────────────────────────────────────────────────────

class SkeletonService:
    def __init__(self, args):
        self.args = args
        self._lock = threading.Lock()
        self._latest_payload: Optional[dict] = None
        self._clients: set = set()

    # ── Detection loop (background thread) ────────────────────────────────────

    def run(self):
        if not _MP_OK:
            log.error("mediapipe not installed — run: pip install mediapipe")
            log.error("Skeleton service will broadcast empty persons until mediapipe is available.")
            self._broadcast_empty_loop()
            return

        log.info("Initialising MediaPipe Pose (model_complexity=1)...")
        mp_pose = mp.solutions.pose
        pose = mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        cal = load_calibration("left")

        cap = cv2.VideoCapture(self.args.cam, _CV2_BACKEND)
        if not cap.isOpened():
            log.error("Camera %d not available — broadcasting empty persons", self.args.cam)
            self._broadcast_empty_loop()
            return

        log.info("Camera %d opened. Skeleton service running on WS port %d", self.args.cam, self.args.port)

        while True:
            t0 = time.perf_counter()
            ret, frame = cap.read()
            persons = []

            if ret and frame is not None:
                h_px, w_px = frame.shape[:2]
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose.process(rgb)

                if result.pose_landmarks and result.pose_world_landmarks:
                    persons = self._extract_persons(
                        result, mp_pose, w_px, h_px, cal
                    )

            payload = {
                "persons":   persons,
                "timestamp": int(time.time() * 1000),
            }
            with self._lock:
                self._latest_payload = payload

            elapsed = time.perf_counter() - t0
            time.sleep(max(0.0, 0.066 - elapsed))   # target ~15 fps

    def _broadcast_empty_loop(self):
        """Loop that keeps broadcasting empty persons (mediapipe/camera missing)."""
        while True:
            payload = {"persons": [], "timestamp": int(time.time() * 1000)}
            with self._lock:
                self._latest_payload = payload
            time.sleep(0.5)

    def _extract_persons(self, result, mp_pose, w_px, h_px, cal) -> list:
        """
        Convert MediaPipe result → list of persons in Three.js frame (meters).

        Strategy:
          1. Locate hip center in image → project to robot frame via calibration.
          2. Add MediaPipe world_landmark offsets (person-centric meters).
          3. Convert robot frame → Three.js frame.

        Fallback (no calibration):
          Use MediaPipe world_landmarks directly with a default world position.
        """
        lm  = result.pose_landmarks.landmark           # normalised image coords
        wl  = result.pose_world_landmarks.landmark     # person-centric world (m)

        # ── Hip pixel position ───────────────────────────────────────────────
        lhip_lm = lm[mp_pose.PoseLandmark.LEFT_HIP]
        rhip_lm = lm[mp_pose.PoseLandmark.RIGHT_HIP]
        hip_u = ((lhip_lm.x + rhip_lm.x) / 2) * w_px
        hip_v = ((lhip_lm.y + rhip_lm.y) / 2) * h_px

        # ── Hip world position (robot frame, mm) ─────────────────────────────
        hip_robot = project_to_height(hip_u, hip_v, HIP_HEIGHT_MM, cal)

        # ── Hip world position in MediaPipe world space (origin at hips) ─────
        lhip_wl = wl[mp_pose.PoseLandmark.LEFT_HIP]
        rhip_wl = wl[mp_pose.PoseLandmark.RIGHT_HIP]
        mp_hip = np.array([
            (lhip_wl.x + rhip_wl.x) / 2.0,
            (lhip_wl.y + rhip_wl.y) / 2.0,
            (lhip_wl.z + rhip_wl.z) / 2.0,
        ])   # should be ≈ (0, 0, 0) by definition

        keypoints: dict = {}

        if hip_robot is not None:
            # ── Full calibration path ────────────────────────────────────────
            # Convert hip to Three.js frame as root position
            hip_threejs = robot_to_threejs(hip_robot)

            for idx in USED_INDICES:
                lmk = wl[idx]
                # Offset from MediaPipe hip origin (meters, person-centric)
                mp_offset = np.array([lmk.x, lmk.y, lmk.z]) - mp_hip

                # MediaPipe world axes (when person faces camera):
                #   x = person's right (+right)
                #   y = up             (+up)
                #   z = toward camera  (+toward camera = toward robot = -Z_threejs)
                #
                # Three.js offset:
                #   X = -mp.x  (person's right = camera left = Three.js -X when
                #               camera is on robot side; flip to +X if mirrored)
                #   Y =  mp.y  (up = up)
                #   Z = -mp.z  (toward camera = toward robot = Three.js -Z)
                #
                # ⚠️  If the skeleton appears mirrored/flipped, adjust signs here.
                threejs_offset = np.array([
                    -mp_offset[0],   # X: negate — person-right → camera-left
                     mp_offset[1],   # Y: same   — up → up
                    -mp_offset[2],   # Z: negate — toward-cam  → away-from-robot
                ])

                pos = hip_threejs + threejs_offset
                vis = float(lmk.visibility) if hasattr(lmk, "visibility") else 1.0

                keypoints[str(idx)] = {
                    "x": round(float(pos[0]), 4),
                    "y": round(float(pos[1]), 4),
                    "z": round(float(pos[2]), 4),
                    "visibility": round(vis, 3),
                }

        else:
            # ── No-calibration fallback ─────────────────────────────────────
            # Place person at a default world position and use MediaPipe world
            # coordinates directly (reasonable for testing without calibration).
            #
            # Default: person 0.8 m in front (Z), centred (X=0), hips at 0.9 m (Y).
            DEFAULT_X_M =  0.0   # lateral centre
            DEFAULT_Y_M =  0.9   # hip height
            DEFAULT_Z_M =  0.8   # depth from robot

            for idx in USED_INDICES:
                lmk = wl[idx]
                mp_offset = np.array([lmk.x, lmk.y, lmk.z]) - mp_hip
                vis = float(lmk.visibility) if hasattr(lmk, "visibility") else 1.0

                keypoints[str(idx)] = {
                    "x": round(DEFAULT_X_M + (-mp_offset[0]), 4),
                    "y": round(DEFAULT_Y_M +   mp_offset[1],  4),
                    "z": round(DEFAULT_Z_M + (-mp_offset[2]), 4),
                    "visibility": round(vis, 3),
                }

        return [{"id": 0, "keypoints": keypoints}]

    # ── WebSocket server ──────────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        log.info("WS client connected: %s", websocket.remote_address)
        self._clients.add(websocket)
        try:
            async for _ in websocket:
                pass   # no inbound messages expected
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            log.info("WS client disconnected: %s", websocket.remote_address)

    async def ws_broadcast(self):
        """Continuously push latest payload to all connected clients (~15 fps)."""
        while True:
            await asyncio.sleep(0.066)
            with self._lock:
                payload = self._latest_payload
            if payload is not None and self._clients:
                data = json.dumps(payload)
                dead: set = set()
                for ws in list(self._clients):
                    try:
                        await ws.send(data)
                    except Exception:
                        dead.add(ws)
                self._clients -= dead

    async def run_ws_server(self):
        async with websockets.serve(self.ws_handler, "0.0.0.0", self.args.port):
            log.info("Skeleton WebSocket server listening on ws://0.0.0.0:%d", self.args.port)
            await self.ws_broadcast()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="MediaPipe skeleton pose service — broadcasts keypoints on WS port 8767"
    )
    parser.add_argument("--cam",  type=int, default=0,    help="Camera device index (default: 0)")
    parser.add_argument("--port", type=int, default=8767, help="WebSocket server port (default: 8767)")
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    service = SkeletonService(args)

    detect_thread = threading.Thread(target=service.run, daemon=True)
    detect_thread.start()

    try:
        asyncio.run(service.run_ws_server())
    except KeyboardInterrupt:
        log.info("Shutting down skeleton service...")
        sys.exit(0)


if __name__ == "__main__":
    main()
