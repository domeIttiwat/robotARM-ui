"""
Mock Camera Safety Detector
============================
Simulates the camera safety detection system without real cameras or YOLO.
Oscillates a fake "person" distance via sine wave to exercise all safety levels.

Usage:
  source .venv/bin/activate
  python mock_detector.py [options]

Options:
  --ws-port     WebSocket server port (default 8765)
  --period      Oscillation period in seconds (default 10)
  --min-dist    Minimum distance mm (default 150)
  --max-dist    Maximum distance mm (default 1000)
  --thresh-warn Distance (mm) level 0→1 (default 600)
  --thresh-stop Distance (mm) level 1→2 (default 300)
"""

import argparse
import asyncio
import base64
import json
import logging
import math
import threading
import time

import cv2
import numpy as np
import websockets

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("mock-detector")

# ── FK constants (must match main.py) ─────────────────────────────────────────
FK_BASE  = 250.0
FK_L1    = 250.0
FK_L2EFF = 220.0 + 160.0  # 380mm


def compute_fk(joints: list[float]) -> np.ndarray:
    """Simplified 3D FK → TCP position (mm, robot frame)."""
    j1r  = math.radians(joints[0])
    j2r  = math.radians(joints[1])
    j3r  = math.radians(joints[2])
    j23r = j2r + j3r
    reach = FK_L1 * math.cos(j2r) + FK_L2EFF * math.cos(j23r)
    x = reach * math.cos(j1r)
    y = reach * math.sin(j1r)
    z = FK_BASE + FK_L1 * math.sin(j2r) + FK_L2EFF * math.sin(j23r)
    return np.array([x, y, z])


def make_frame(
    cam_id: int,
    distance_mm: float,
    level: int,
    thresh_warn: float,
    thresh_stop: float,
    max_dist: float,
) -> np.ndarray:
    """
    Generate a 640×360 fake camera frame:
    - Black background
    - Colored banner at top (green/orange/red)
    - Fake bounding box (size proportional to proximity)
    - Labels: cam ID, distance, thresholds
    """
    W, H = 640, 360
    frame = np.zeros((H, W, 3), dtype=np.uint8)

    # ── Safety banner ──────────────────────────────────────────────────────────
    banner_color = (
        (0, 0, 180) if level == 2 else
        (0, 110, 230) if level == 1 else
        (0, 140, 0)
    )
    banner_text = [
        "NORMAL",
        "SLOW — person near",
        "STOP — person too close",
    ][level]

    cv2.rectangle(frame, (0, 0), (W, 52), banner_color, -1)
    cv2.putText(frame, banner_text, (12, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2)

    # ── Fake bounding box ─────────────────────────────────────────────────────
    # Closer → larger box near bottom; farther → smaller box higher up
    ratio = max(0.0, 1.0 - distance_mm / max_dist)  # 0 (far) → 1 (close)
    box_h = int(60 + ratio * 220)
    box_w = int(box_h * 0.55)
    cx = W // 2
    # box bottom moves from middle to bottom as ratio→1
    bot_y = int(200 + ratio * (H - 200))
    top_y = max(bot_y - box_h, 56)
    x1 = cx - box_w // 2
    x2 = cx + box_w // 2

    box_color = (
        (0, 0, 220) if level == 2 else
        (0, 140, 255) if level == 1 else
        (0, 220, 80)
    )
    cv2.rectangle(frame, (x1, top_y), (x2, bot_y), box_color, 2)
    cv2.putText(frame, "person", (x1, max(top_y - 8, 60)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)

    dist_str = f"{distance_mm:.0f} mm"
    cv2.putText(frame, dist_str, (x1, max(top_y - 28, 62)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75,
                (0, 80, 255) if level == 2 else
                (0, 165, 255) if level == 1 else (0, 220, 80), 2)

    # ── Bottom labels ──────────────────────────────────────────────────────────
    cv2.putText(frame, f"MOCK CAM {cam_id}", (10, H - 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (160, 160, 160), 1)
    cv2.putText(
        frame,
        f"WARN={thresh_warn:.0f}mm  STOP={thresh_stop:.0f}mm",
        (10, H - 18),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (120, 120, 120), 1,
    )

    return frame


def frame_to_b64(frame: np.ndarray, quality: int = 65) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode("ascii")


# ─────────────────────────────────────────────────────────────────────────────


class MockDetector:
    def __init__(self, args):
        self.args       = args
        self.thresh_warn = args.thresh_warn
        self.thresh_stop = args.thresh_stop

        self._lock            = threading.Lock()
        self._latest_payload  = None
        self._clients: set    = set()

    # ── Mock detection loop ───────────────────────────────────────────────────

    def run(self):
        """
        Background thread: oscillate distance via sine wave, build payload ~15 fps.
        """
        log.info(
            "Mock loop started  period=%.1fs  dist=%.0f→%.0fmm",
            self.args.period, self.args.max_dist, self.args.min_dist,
        )
        t_start = time.perf_counter()

        # Slowly rotate j1 for a moving TCP
        joint_angle = 0.0

        while True:
            t0 = time.perf_counter()
            elapsed = t0 - t_start

            # ── Oscillate distance (sine, 0→1→0) ──────────────────────────────
            phase = (elapsed % self.args.period) / self.args.period  # 0..1
            # sin goes 0→1→0 over one period; map to max_dist→min_dist
            sin_val  = (math.sin(2 * math.pi * phase - math.pi / 2) + 1) / 2  # 0..1
            distance = self.args.max_dist - sin_val * (self.args.max_dist - self.args.min_dist)

            # ── Safety level ──────────────────────────────────────────────────
            with self._lock:
                warn = self.thresh_warn
                stop = self.thresh_stop

            level = (
                2 if distance < stop else
                1 if distance < warn else
                0
            )

            # ── Fake TCP via FK (slowly rotating j1) ──────────────────────────
            joint_angle = (joint_angle + 0.3) % 360.0  # 0.3° per frame @ 15fps ≈ slow pan
            joints = [joint_angle, 30.0, -10.0, 0.0, 0.0, 0.0]
            tcp_xyz = compute_fk(joints)

            # ── Fake person position (TCP + offset proportional to distance) ──
            person_xyz = np.array([
                tcp_xyz[0] + distance * 0.7,
                tcp_xyz[1] + distance * 0.1,
                200.0,  # ~waist height
            ])

            # ── Frames ────────────────────────────────────────────────────────
            frame_l = make_frame(1, distance, level, warn, stop, self.args.max_dist)
            frame_r = make_frame(2, distance, level, warn, stop, self.args.max_dist)

            payload = {
                "cam_left":     frame_to_b64(frame_l),
                "cam_right":    frame_to_b64(frame_r),
                "safety_level": level,
                "distance_mm":  round(distance, 1),
                "tcp":          {
                    "x": round(float(tcp_xyz[0]), 1),
                    "y": round(float(tcp_xyz[1]), 1),
                    "z": round(float(tcp_xyz[2]), 1),
                },
                "person":       {
                    "x": round(float(person_xyz[0]), 1),
                    "y": round(float(person_xyz[1]), 1),
                    "z": round(float(person_xyz[2]), 1),
                },
                "rail_pos": 0.0,
            }

            with self._lock:
                self._latest_payload = payload

            # ~15 fps
            elapsed_loop = time.perf_counter() - t0
            time.sleep(max(0.0, 0.066 - elapsed_loop))

    # ── WebSocket server ──────────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        log.info("WS client connected: %s", websocket.remote_address)
        self._clients.add(websocket)
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                    if "thresh_warn" in msg:
                        with self._lock:
                            self.thresh_warn = float(msg["thresh_warn"])
                        log.info("thresh_warn → %.0f mm", self.thresh_warn)
                    if "thresh_stop" in msg:
                        with self._lock:
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
        while True:
            await asyncio.sleep(0.066)
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
            log.info("WebSocket server → ws://0.0.0.0:%d", self.args.ws_port)
            log.info(
                "Thresholds  warn=%.0fmm  stop=%.0fmm",
                self.thresh_warn, self.thresh_stop,
            )
            await self.ws_broadcast()


# ─────────────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Mock camera safety detector (no cameras/YOLO)")
    parser.add_argument("--ws-port",    type=int,   default=8765,  help="WebSocket server port")
    parser.add_argument("--period",     type=float, default=10.0,  help="Oscillation period (seconds)")
    parser.add_argument("--min-dist",   type=float, default=150.0, help="Minimum simulated distance (mm)")
    parser.add_argument("--max-dist",   type=float, default=1000.0,help="Maximum simulated distance (mm)")
    parser.add_argument("--thresh-warn",type=float, default=600.0, help="Distance (mm) level 0→1")
    parser.add_argument("--thresh-stop",type=float, default=300.0, help="Distance (mm) level 1→2")
    args = parser.parse_args()

    detector = MockDetector(args)

    bg = threading.Thread(target=detector.run, daemon=True)
    bg.start()

    try:
        asyncio.run(detector.run_ws_server())
    except KeyboardInterrupt:
        log.info("Shutting down mock detector.")


if __name__ == "__main__":
    main()
