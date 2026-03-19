"""
Wrist Camera Service
====================
กล้อง 3D ที่ปลายแขนสำหรับตรวจจับวัตถุ (เช่น หยิบแก้วกาแฟ)
Stream ภาพ RGB + Depth มาที่ WebSocket :8766 → Next.js UI

Usage:
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  python main.py [--cam-index 2] [--ws-port 8766] [--mode rgb]

Payload ที่ส่งออก:
  {
    "frame_rgb":   "<base64 JPEG>",         ภาพ RGB
    "frame_depth": "<base64 JPEG>",         Depth colormap
    "mode":        "rgb" | "depth",         โหมดที่ browser เลือก
    "objects":     [                         detected objects (TODO: ใส่ YOLO)
                    { "label": "cup", "confidence": 0.95,
                      "bbox": [x1,y1,x2,y2], "xyz": [x,y,z] }
                   ],
    "fps":         15.0,
    "has_depth":   false                     true เมื่อกล้องรองรับ depth จริง
  }

รับจาก browser:
  { "display_mode": "rgb" | "depth" }      สลับโหมดแสดงผล

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
เพิ่ม hardware driver ใหม่:
  1. สร้าง subclass ของ CameraInterface
  2. override open() / read() / close()
  3. เปลี่ยน driver = OpenCVCamera(...)  →  driver = RealSenseCamera(...)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import argparse
import asyncio
import base64
import json
import logging
import threading
import time
from abc import ABC, abstractmethod
from typing import Optional

import cv2
import numpy as np
import websockets

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("wrist-cam")


# ─────────────────────────────────────────────────────────────────────────────
# Abstract camera interface — swap hardware by changing the driver class
# ─────────────────────────────────────────────────────────────────────────────

class CameraInterface(ABC):
    """Base class for wrist camera drivers."""

    @abstractmethod
    def open(self) -> bool:
        """Initialize camera. Returns True on success."""
        ...

    @abstractmethod
    def read(self) -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        Capture one frame.
        Returns: (rgb_bgr_frame, depth_colorized_frame)
        depth may be None if the camera has no depth sensor.
        """
        ...

    @abstractmethod
    def close(self) -> None:
        """Release camera resources."""
        ...

    @property
    def has_depth(self) -> bool:
        """True if this driver produces real depth data."""
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Driver 1: Standard USB / webcam via OpenCV (RGB only, no depth)
# ─────────────────────────────────────────────────────────────────────────────

class OpenCVCamera(CameraInterface):
    """Standard RGB camera — no depth. Use as a starting point."""

    def __init__(self, index: int = 2):
        self._index = index
        self._cap: Optional[cv2.VideoCapture] = None

    def open(self) -> bool:
        # Windows: force DirectShow backend — avoids MSMF slow/silent-fail issues
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        self._cap = cv2.VideoCapture(self._index, backend)
        if not self._cap.isOpened():
            log.warning("Camera %d not available — use mock_wrist.py for testing", self._index)
            return False
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        log.info("OpenCV camera %d opened (RGB only)", self._index)
        return True

    def read(self) -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        if self._cap is None or not self._cap.isOpened():
            return None, None
        ok, frame = self._cap.read()
        return (frame if ok else None), None

    def close(self) -> None:
        if self._cap:
            self._cap.release()


# ─────────────────────────────────────────────────────────────────────────────
# Driver 2: Intel RealSense D4xx — RGB + Depth
# ─────────────────────────────────────────────────────────────────────────────
# Uncomment when pyrealsense2 is installed:
#   pip install pyrealsense2

# class RealSenseCamera(CameraInterface):
#     """Intel RealSense D435 / D455 — RGB + Depth."""
#
#     def __init__(self, width: int = 640, height: int = 480, fps: int = 30):
#         import pyrealsense2 as rs
#         self._rs = rs
#         self._pipeline = rs.pipeline()
#         cfg = rs.config()
#         cfg.enable_stream(rs.stream.color, width, height, rs.format.bgr8, fps)
#         cfg.enable_stream(rs.stream.depth, width, height, rs.format.z16,  fps)
#         self._cfg       = cfg
#         self._colorizer = rs.colorizer()
#
#     @property
#     def has_depth(self) -> bool:
#         return True
#
#     def open(self) -> bool:
#         self._pipeline.start(self._cfg)
#         log.info("RealSense pipeline started")
#         return True
#
#     def read(self) -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
#         frames   = self._pipeline.wait_for_frames(timeout_ms=5000)
#         color_f  = frames.get_color_frame()
#         depth_f  = frames.get_depth_frame()
#         rgb      = np.asanyarray(color_f.get_data())  if color_f  else None
#         depth_c  = np.asanyarray(self._colorizer.colorize(depth_f).get_data()) if depth_f else None
#         return rgb, depth_c
#
#     def close(self) -> None:
#         self._pipeline.stop()


# ─────────────────────────────────────────────────────────────────────────────
# Driver 3: Stereolabs ZED — RGB + Depth
# ─────────────────────────────────────────────────────────────────────────────
# Requires ZED SDK installer first: https://www.stereolabs.com/developers/release/
# Then: pip install pyzed

# class ZEDCamera(CameraInterface):
#     """Stereolabs ZED 2 / ZED Mini — RGB + Depth."""
#
#     def __init__(self, resolution="HD720"):
#         import pyzed.sl as sl
#         self._sl    = sl
#         self._zed   = sl.Camera()
#         params      = sl.InitParameters()
#         params.camera_resolution = getattr(sl.RESOLUTION, resolution)
#         params.depth_mode        = sl.DEPTH_MODE.PERFORMANCE
#         self._params = params
#         self._mat_rgb   = sl.Mat()
#         self._mat_depth = sl.Mat()
#
#     @property
#     def has_depth(self) -> bool:
#         return True
#
#     def open(self) -> bool:
#         err = self._zed.open(self._params)
#         ok  = err == self._sl.ERROR_CODE.SUCCESS
#         if ok:
#             log.info("ZED camera opened")
#         else:
#             log.error("ZED open failed: %s", repr(err))
#         return ok
#
#     def read(self) -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
#         sl = self._sl
#         if self._zed.grab() != sl.ERROR_CODE.SUCCESS:
#             return None, None
#         self._zed.retrieve_image(self._mat_rgb,   sl.VIEW.LEFT)
#         self._zed.retrieve_image(self._mat_depth, sl.VIEW.DEPTH)
#         rgb   = self._mat_rgb.get_data()[:, :, :3]    # BGRA → BGR
#         depth = self._mat_depth.get_data()[:, :, :3]
#         return rgb, depth
#
#     def close(self) -> None:
#         self._zed.close()


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

def frame_to_b64(frame: np.ndarray, quality: int = 70) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode("ascii")


def make_depth_fallback(rgb: np.ndarray) -> np.ndarray:
    """Fake depth from brightness when no real depth sensor is available."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_BGR2GRAY)
    return cv2.applyColorMap(gray, cv2.COLORMAP_JET)


# ─────────────────────────────────────────────────────────────────────────────
# Service
# ─────────────────────────────────────────────────────────────────────────────

class WristCamService:
    def __init__(self, args):
        self.args         = args
        self.display_mode = args.mode
        self._lock        = threading.Lock()
        self._payload     = None
        self._clients: set = set()

    # ── Capture loop ──────────────────────────────────────────────────────────

    def run(self):
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # TODO: swap driver here when hardware ready
        driver: CameraInterface = OpenCVCamera(self.args.cam_index)
        # driver = RealSenseCamera()
        # driver = ZEDCamera()
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        driver.open()

        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(blank, "No camera signal",
                    (160, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (60, 60, 60), 2)

        log.info("Capture loop started — port %d", self.args.ws_port)

        while True:
            t0 = time.perf_counter()

            rgb, depth = driver.read()
            if rgb is None:
                rgb = blank.copy()
            if depth is None:
                depth = make_depth_fallback(rgb)

            with self._lock:
                mode = self.display_mode

            # TODO: run YOLO object detection on `rgb` here
            # model = YOLO("yolov8n.pt")
            # results = model(rgb, verbose=False)[0]
            objects: list = []

            payload = {
                "frame_rgb":   frame_to_b64(rgb),
                "frame_depth": frame_to_b64(depth),
                "mode":        mode,
                "objects":     objects,
                "fps":         round(1.0 / max(time.perf_counter() - t0, 0.001), 1),
                "has_depth":   driver.has_depth,
            }

            with self._lock:
                self._payload = payload

            elapsed = time.perf_counter() - t0
            time.sleep(max(0.0, 1 / 15 - elapsed))

    # ── WebSocket server ──────────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        log.info("Client connected: %s", websocket.remote_address)
        self._clients.add(websocket)
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                    if "display_mode" in msg:
                        with self._lock:
                            self.display_mode = msg["display_mode"]
                        log.info("display_mode → %s", self.display_mode)
                except Exception:
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            log.info("Client disconnected: %s", websocket.remote_address)

    async def broadcast(self):
        while True:
            await asyncio.sleep(1 / 15)
            with self._lock:
                payload = self._payload
            if payload and self._clients:
                data = json.dumps(payload)
                dead = set()
                for ws in list(self._clients):
                    try:
                        await ws.send(data)
                    except Exception:
                        dead.add(ws)
                self._clients -= dead

    async def run_ws(self):
        async with websockets.serve(self.ws_handler, "0.0.0.0", self.args.ws_port):
            log.info("WebSocket server → ws://0.0.0.0:%d", self.args.ws_port)
            await self.broadcast()


# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Wrist camera service (RGB + optional Depth)")
    parser.add_argument("--cam-index", type=int,   default=2,       help="Camera device index (default 2)")
    parser.add_argument("--ws-port",   type=int,   default=8766,    help="WebSocket port (default 8766)")
    parser.add_argument("--mode",      type=str,   default="rgb",   choices=["rgb", "depth"],
                        help="Initial display mode")
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    svc = WristCamService(args)
    bg  = threading.Thread(target=svc.run, daemon=True)
    bg.start()

    try:
        asyncio.run(svc.run_ws())
    except KeyboardInterrupt:
        log.info("Shutting down wrist-cam service.")


if __name__ == "__main__":
    main()
