"""
Quick test: camera + YOLOv8 only (no WebSocket, no ROS)
กด q เพื่อออก
"""
import sys
import cv2
from ultralytics import YOLO

CAM_INDEX = int(sys.argv[1]) if len(sys.argv) > 1 else 0

print(f"[TEST] Loading YOLOv8 nano...")
model = YOLO("yolov8n.pt")

print(f"[TEST] Opening camera {CAM_INDEX}...")
cap = cv2.VideoCapture(CAM_INDEX)
if not cap.isOpened():
    print(f"[ERROR] Cannot open camera {CAM_INDEX}")
    print("  ลองเปลี่ยน index: python test_camera.py 1")
    sys.exit(1)

print(f"[TEST] Camera OK — กด q เพื่อออก")

while True:
    ret, frame = cap.read()
    if not ret:
        print("[WARN] Frame read failed")
        continue

    results = model(frame, classes=[0], verbose=False)[0]
    annotated = results.plot()

    n = len(results.boxes) if results.boxes else 0
    cv2.putText(annotated, f"Persons: {n}", (10, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 100), 2)

    cv2.imshow(f"YOLO Test — CAM {CAM_INDEX}  (q=quit)", annotated)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
print("[TEST] Done")
