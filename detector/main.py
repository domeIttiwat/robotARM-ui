"""
Fast ZMQ-to-WebSocket Camera Bridge
====================================
รับภาพที่ถูกบีบอัดแล้วจาก Jetson (ZMQ: 5555) 
แล้วแปลงเป็น Base64 โยนขึ้นหน้าเว็บ (WebSocket: 8765) ทันที
โดยไม่มีการผ่าน AI หรือ OpenCV ใดๆ ทั้งสิ้น (กิน CPU 0%)
"""

import argparse
import asyncio
import base64
import json
import logging
import sys
import threading
import time
import websockets
import zmq

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fast-bridge")

# ─────────────────────────────────────────────────────────────────────────────

class FastCameraBridge:
    def __init__(self, args):
        self.args = args
        self._lock = threading.Lock()
        self._latest_payload = None
        self._clients = set()

    def run(self):
        log.info(f"Connecting to Jetson Camera Stream at tcp://{self.args.jetson_ip}:5555 ...")
        
        zmq_context = zmq.Context()
        zmq_socket = zmq_context.socket(zmq.SUB)
        zmq_socket.connect(f"tcp://{self.args.jetson_ip}:5555")
        zmq_socket.setsockopt_string(zmq.SUBSCRIBE, "")

        log.info("✅ Fast Bridge Started! (No AI Processing)")

        while True:
            try:
                # 1. รับภาพ JPEG ดิบบางๆ ที่บีบอัดมาจาก Jetson
                data = zmq_socket.recv_pyobj(flags=zmq.NOBLOCK)
                
                # 2. แปลงเป็น Base64 ทันที (ไม่ต้องใช้ cv2.imdecode หรือ cv2.imencode เลย ประหยัดเวลามาก)
                b64_l = base64.b64encode(data["cam_left"]).decode("ascii")
                b64_r = base64.b64encode(data["cam_right"]).decode("ascii")

                # 3. สร้าง Payload ส่งให้หน้าเว็บ (ใส่ค่าหลอกๆ ให้เว็บไม่ Error)
                payload = {
                    "cam_left": b64_l,
                    "cam_right": b64_r,
                    "safety_level": 0,       # บังคับเป็นสถานะ "ปกติ"
                    "distance_mm": None,     # ไม่แสดงระยะ
                    "tcp": {"x": 0, "y": 0, "z": 0},
                    "person": None,
                    "rail_pos": 0,
                }

                with self._lock:
                    self._latest_payload = payload

                # พักนิดนึงไม่ให้ลูปกิน CPU เกินไป (รับภาพได้สูงสุด ~50 FPS)
                time.sleep(0.02)

            except zmq.Again:
                # ถ้ายังไม่มีภาพมา ให้สร้างภาพจอดำรอไว้
                time.sleep(0.01)
                continue
            except Exception as e:
                log.warning(f"Error in bridge: {e}")
                time.sleep(0.1)

    # ── WebSocket server ──────────────────────────────────────────────────────

    async def ws_handler(self, websocket):
        log.info(f"WS client connected: {websocket.remote_address}")
        self._clients.add(websocket)
        try:
            async for _ in websocket:
                pass # ไม่ได้รับคำสั่งอะไรจากเว็บ แค่ส่งอย่างเดียว
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(websocket)
            log.info(f"WS client disconnected: {websocket.remote_address}")

    async def ws_broadcast(self):
        """กระจายภาพให้ทุก Browser ที่เปิดหน้าเว็บอยู่"""
        while True:
            await asyncio.sleep(0.033)  # สตรีมออกเว็บที่ ~30 FPS
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
            log.info(f"WebSocket server listening on ws://0.0.0.0:{self.args.ws_port}")
            await self.ws_broadcast()

# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fast ZMQ to WebSocket Bridge")
    parser.add_argument("--jetson-ip",  type=str,   default="127.0.0.1", help="IP of Jetson running v1.py")  #default="192.168.137.38"
    parser.add_argument("--ws-port",    type=int,   default=8765,             help="WebSocket server port")  #default=8765
    args = parser.parse_args()

    # แก้ปัญหา Asyncio บน Windows
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    bridge = FastCameraBridge(args)

    # รันตัวรับภาพ ZMQ ไว้เบื้องหลัง
    t = threading.Thread(target=bridge.run, daemon=True)
    t.start()

    # รันเซิร์ฟเวอร์ WebSocket
    try:
        asyncio.run(bridge.run_ws_server())
    except KeyboardInterrupt:
        log.info("Shutting down...")
        sys.exit(0)

if __name__ == "__main__":
    main()