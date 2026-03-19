"""
Mock Wrist Camera
=================
จำลอง wrist camera สำหรับทดสอบ UI โดยไม่ต้องมีกล้องจริง

รัน:
  source .venv/bin/activate
  python mock_wrist.py [--ws-port 8766]

จะเห็น:
  - ภาพ RGB: แสดงถ้วยกาแฟ mock วิ่งไปมา + bounding box
  - ภาพ Depth: colormap (TURBO) simulate depth จาก object ตรงกลาง
  - detected object "cup" ที่ confidence 0.94
  - สลับ RGB / Depth ได้จาก UI
"""

import argparse
import asyncio
import base64
import json
import logging
import math
import sys
import threading
import time

import cv2
import numpy as np
import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("mock-wrist")

W, H = 640, 480


def make_rgb_frame(t: float) -> np.ndarray:
    frame = np.full((H, W, 3), (18, 16, 14), dtype=np.uint8)

    # Object centre oscillates slowly
    cx = W // 2 + int(50 * math.sin(t * 0.4))
    cy = H // 2 + int(25 * math.cos(t * 0.3))

    # Cup body (rectangle)
    cv2.rectangle(frame, (cx - 38, cy - 45), (cx + 38, cy + 55), (170, 120, 70), -1)
    cv2.rectangle(frame, (cx - 38, cy - 45), (cx + 38, cy + 55), (220, 170, 110), 2)

    # Cup rim (ellipse top)
    cv2.ellipse(frame, (cx, cy - 45), (38, 14), 0, 0, 360, (230, 185, 125), 2)

    # Cup bottom (ellipse)
    cv2.ellipse(frame, (cx, cy + 55), (38, 12), 0, 0, 180, (150, 100, 50), 2)

    # Handle
    pts = np.array([[cx + 38, cy - 10], [cx + 62, cy - 5], [cx + 62, cy + 25], [cx + 38, cy + 20]], np.int32)
    cv2.polylines(frame, [pts], False, (200, 155, 95), 3)

    # Bounding box
    x1, y1, x2, y2 = cx - 50, cy - 58, cx + 65, cy + 62
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 255), 2)
    cv2.putText(frame, "cup  0.94", (x1, y1 - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 2)

    # Bottom labels
    cv2.putText(frame, "MOCK WRIST CAM", (10, H - 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (90, 90, 90), 1)
    cv2.putText(frame, f"t = {t:.1f}s", (10, H - 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (65, 65, 65), 1)

    return frame


def make_depth_frame(t: float) -> np.ndarray:
    cx = W // 2 + int(50 * math.sin(t * 0.4))
    cy = H // 2 + int(25 * math.cos(t * 0.3))

    Y, X = np.ogrid[:H, :W]
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2).astype(np.float32)
    depth_norm = np.clip(dist / 220.0 * 255, 0, 255).astype(np.uint8)
    depth_color = cv2.applyColorMap(depth_norm, cv2.COLORMAP_TURBO)

    # Overlay labels
    cv2.putText(depth_color, "DEPTH MAP", (10, H - 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    cv2.putText(depth_color, "MOCK WRIST CAM", (10, H - 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)

    return depth_color


def frame_to_b64(frame: np.ndarray, quality: int = 70) -> str:
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf).decode("ascii")


class MockWristService:
    def __init__(self, args):
        self.args         = args
        self.display_mode = "rgb"
        self._lock        = threading.Lock()
        self._payload     = None
        self._clients: set = set()

    def run(self):
        log.info("Mock wrist loop started — port %d", self.args.ws_port)
        t_start = time.perf_counter()

        while True:
            t0 = time.perf_counter()
            t  = t0 - t_start

            rgb   = make_rgb_frame(t)
            depth = make_depth_frame(t)

            cx = W // 2 + int(50 * math.sin(t * 0.4))
            cy = H // 2 + int(25 * math.cos(t * 0.3))

            payload = {
                "frame_rgb":   frame_to_b64(rgb),
                "frame_depth": frame_to_b64(depth),
                "mode":        self.display_mode,
                "objects": [
                    {
                        "label":      "cup",
                        "confidence": 0.94,
                        "bbox":       [cx - 50, cy - 58, cx + 65, cy + 62],
                        "xyz":        [150.0, 20.0, 350.0],
                    }
                ],
                "fps":       15.0,
                "has_depth": True,
            }

            with self._lock:
                self._payload = payload

            elapsed = time.perf_counter() - t0
            time.sleep(max(0.0, 1 / 15 - elapsed))

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


def main():
    parser = argparse.ArgumentParser(description="Mock wrist camera (no hardware needed)")
    parser.add_argument("--ws-port", type=int, default=8766, help="WebSocket port")
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    svc = MockWristService(args)
    bg  = threading.Thread(target=svc.run, daemon=True)
    bg.start()

    try:
        asyncio.run(svc.run_ws())
    except KeyboardInterrupt:
        log.info("Shutting down.")


if __name__ == "__main__":
    main()
