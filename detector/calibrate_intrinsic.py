"""
Intrinsic Camera Calibration (Step 1)
======================================
ถ่ายภาพ checkerboard จากกล้อง USB แล้วคำนวณ:
  K  = camera matrix (3×3)
  D  = distortion coefficients (1×5)

Usage:
  python calibrate_intrinsic.py --camera 0   # CAM-L (index 0)
  python calibrate_intrinsic.py --camera 1   # CAM-R (index 1)

Controls:
  SPACE  = บันทึกภาพที่พบ corners (ต้องการ >= 20 ภาพ ต่างมุม)
  c      = เริ่ม calibrate (จะทำโดยอัตโนมัติเมื่อครบ target)
  q      = ออก

Output:
  calibration/cam_left_intrinsic.npz   (camera 0)
  calibration/cam_right_intrinsic.npz  (camera 1)
"""

import argparse
import os
import sys

import cv2
import numpy as np

# ── Checkerboard config (ปรับตาม board จริง) ────────────────────────────────
BOARD_COLS  = 9    # จำนวนมุมภายใน (inner corners) แนวนอน
BOARD_ROWS  = 6    # จำนวนมุมภายใน แนวตั้ง
SQUARE_SIZE = 25.0 # mm ต่อช่อง

TARGET_IMAGES = 20  # จำนวนภาพที่ต้องการก่อน calibrate

# ── Prepare world-space object points ────────────────────────────────────────
objp = np.zeros((BOARD_ROWS * BOARD_COLS, 3), dtype=np.float32)
objp[:, :2] = np.mgrid[0:BOARD_COLS, 0:BOARD_ROWS].T.reshape(-1, 2) * SQUARE_SIZE

CRITERIA = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)

def main():
    parser = argparse.ArgumentParser(description="Intrinsic camera calibration")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index (0=left, 1=right)")
    parser.add_argument("--width",  type=int, default=1280, help="Capture width")
    parser.add_argument("--height", type=int, default=720,  help="Capture height")
    args = parser.parse_args()

    cam_name = "left" if args.camera == 0 else "right"
    out_path  = os.path.join(os.path.dirname(__file__), "calibration", f"cam_{cam_name}_intrinsic.npz")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open camera {args.camera}")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    obj_points  = []   # 3D points in world space
    img_points  = []   # 2D points in image space
    img_size    = None
    captured    = 0

    print(f"\n[CAM {args.camera} — {cam_name.upper()}] Intrinsic Calibration")
    print(f"  Board: {BOARD_COLS}×{BOARD_ROWS} inner corners, {SQUARE_SIZE}mm squares")
    print(f"  Target: {TARGET_IMAGES} images")
    print("  SPACE = capture | c = calibrate now | q = quit\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[WARN] Frame read failed — retrying...")
            continue

        gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        found, corners = cv2.findChessboardCorners(gray, (BOARD_COLS, BOARD_ROWS), None)
        display = frame.copy()

        if found:
            corners_refined = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), CRITERIA)
            cv2.drawChessboardCorners(display, (BOARD_COLS, BOARD_ROWS), corners_refined, found)
            status_color = (0, 255, 0)
            status_text  = f"FOUND  ({captured}/{TARGET_IMAGES} captured)"
        else:
            status_color = (0, 0, 255)
            status_text  = f"Not found  ({captured}/{TARGET_IMAGES} captured)"

        cv2.putText(display, status_text, (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, status_color, 2)
        cv2.imshow(f"Intrinsic CAM-{cam_name.upper()}", display)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            print("[INFO] Quit without saving.")
            break

        elif key == ord(" ") and found:
            obj_points.append(objp)
            img_points.append(corners_refined)
            img_size = gray.shape[::-1]   # (w, h)
            captured += 1
            print(f"[SNAP] {captured}/{TARGET_IMAGES}")
            if captured >= TARGET_IMAGES:
                print("[INFO] Reached target — calibrating automatically...")
                _run_calibration(obj_points, img_points, img_size, out_path)
                break

        elif key == ord("c") and captured >= 5:
            print("[INFO] Manual calibrate trigger...")
            _run_calibration(obj_points, img_points, img_size, out_path)
            break

    cap.release()
    cv2.destroyAllWindows()


def _run_calibration(obj_pts, img_pts, img_size, out_path):
    print("[CAL] Running cv2.calibrateCamera ...")
    rms, K, D, rvecs, tvecs = cv2.calibrateCamera(obj_pts, img_pts, img_size, None, None)
    print(f"[CAL] RMS reprojection error: {rms:.4f} px")
    print(f"[CAL] K =\n{K}")
    print(f"[CAL] D = {D.ravel()}")
    np.savez(out_path, K=K, D=D, rms=rms)
    print(f"[CAL] Saved → {out_path}")


if __name__ == "__main__":
    main()
