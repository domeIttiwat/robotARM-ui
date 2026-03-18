"""
Extrinsic Camera Calibration (Step 2)
=======================================
วาง checkerboard บนพื้นหน้าหุ่นที่ตำแหน่งรู้จัก
แล้วคำนวณ transform: camera frame → robot base frame

Usage:
  python calibrate_extrinsic.py

Prerequisites:
  - calibration/cam_left_intrinsic.npz   (จาก calibrate_intrinsic.py --camera 0)
  - calibration/cam_right_intrinsic.npz  (จาก calibrate_intrinsic.py --camera 1)

Process:
  1. วาง checkerboard board ที่ตำแหน่งรู้จักในระบบพิกัดของหุ่น (robot frame)
  2. กรอก origin ของ board (มุมซ้ายบน) ใน robot frame เป็น X, Y, Z (mm)
  3. กรอก rail position ขณะนั้น (mm) — TCP origin ของหุ่นจะถูกคิดรวม
  4. โปรแกรม solvePnP → R, T (rotation + translation ของกล้องใน robot frame)
  5. บันทึก → calibration/cam_X_extrinsic.npz

Output:
  calibration/cam_left_extrinsic.npz   → R (3×3), T (3×1)
  calibration/cam_right_extrinsic.npz  → R (3×3), T (3×1)

Coordinate convention (robot frame):
  X = forward (along rail direction)
  Y = left
  Z = up
"""

import os
import sys

import cv2
import numpy as np

# ── Checkerboard config (ต้องตรงกับ calibrate_intrinsic.py) ─────────────────
BOARD_COLS  = 9
BOARD_ROWS  = 6
SQUARE_SIZE = 25.0   # mm

CRITERIA = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)

CAL_DIR = os.path.join(os.path.dirname(__file__), "calibration")


def load_intrinsic(cam_name: str):
    path = os.path.join(CAL_DIR, f"cam_{cam_name}_intrinsic.npz")
    if not os.path.exists(path):
        print(f"[ERROR] Intrinsic file not found: {path}")
        print("  Run: python calibrate_intrinsic.py --camera 0  (and --camera 1)")
        sys.exit(1)
    data = np.load(path)
    return data["K"], data["D"]


def capture_frame(cap) -> np.ndarray:
    """Grab a frame, retry up to 5 times on failure."""
    for _ in range(5):
        ret, frame = cap.read()
        if ret:
            return frame
    raise RuntimeError("Failed to capture frame from camera")


def calibrate_one_camera(cam_index: int, cam_name: str, origin_robot: np.ndarray):
    """
    Compute extrinsic (R, T) for one camera.

    origin_robot : np.ndarray shape (3,)
        3D position of the checkerboard's top-left corner in robot frame (mm)
    """
    K, D = load_intrinsic(cam_name)

    # Build object points in robot frame: board lies flat (Z = constant)
    # Top-left corner = origin_robot; X→right, Y→down (board local axes)
    # Adjust sign convention to match robot frame if needed.
    objp_robot = np.zeros((BOARD_ROWS * BOARD_COLS, 3), dtype=np.float64)
    for r in range(BOARD_ROWS):
        for c in range(BOARD_COLS):
            # board X = robot Y axis direction, board Y = robot X axis direction
            # (checkerboard lies on XY plane, corners go right then down)
            objp_robot[r * BOARD_COLS + c] = [
                origin_robot[0] + r * SQUARE_SIZE,   # robot X (along rows)
                origin_robot[1] + c * SQUARE_SIZE,   # robot Y (along cols)
                origin_robot[2],                      # robot Z = flat on table
            ]

    cap = cv2.VideoCapture(cam_index)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open camera {cam_index}")
        return None, None

    print(f"\n  [CAM-{cam_name.upper()}] Searching for checkerboard ...")
    print("  Press SPACE to capture, q to skip this camera.\n")

    best_frame = None
    best_corners = None
    gray_size = None

    while True:
        frame = capture_frame(cap)
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        found, corners = cv2.findChessboardCorners(gray, (BOARD_COLS, BOARD_ROWS), None)
        display = frame.copy()

        if found:
            corners_ref = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), CRITERIA)
            cv2.drawChessboardCorners(display, (BOARD_COLS, BOARD_ROWS), corners_ref, True)
            cv2.putText(display, "FOUND — SPACE to capture",
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
        else:
            cv2.putText(display, "Searching...",
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)

        cv2.imshow(f"Extrinsic CAM-{cam_name.upper()}", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord(" ") and found:
            best_frame   = frame
            best_corners = corners_ref
            gray_size    = gray.shape
            print(f"  [SNAP] Captured frame for CAM-{cam_name.upper()}")
            break
        elif key == ord("q"):
            print(f"  [SKIP] Skipping CAM-{cam_name.upper()}")
            cap.release()
            cv2.destroyAllWindows()
            return None, None

    cap.release()
    cv2.destroyAllWindows()

    if best_corners is None:
        return None, None

    # solvePnP: estimate camera pose relative to world (robot) frame
    success, rvec, tvec = cv2.solvePnP(
        objp_robot.astype(np.float32),
        best_corners.astype(np.float32),
        K.astype(np.float32),
        D.astype(np.float32),
    )

    if not success:
        print(f"  [ERROR] solvePnP failed for CAM-{cam_name.upper()}")
        return None, None

    R, _ = cv2.Rodrigues(rvec)
    print(f"  [CAL] CAM-{cam_name.upper()} R =\n{R}")
    print(f"  [CAL] CAM-{cam_name.upper()} T = {tvec.ravel()}")

    # Verify reprojection
    proj, _ = cv2.projectPoints(objp_robot.astype(np.float32), rvec, tvec,
                                 K.astype(np.float32), D.astype(np.float32))
    proj = proj.reshape(-1, 2)
    obs  = best_corners.reshape(-1, 2)
    rms  = np.sqrt(np.mean(np.sum((proj - obs) ** 2, axis=1)))
    print(f"  [CAL] Reprojection RMS: {rms:.3f} px")

    return R, tvec


def main():
    print("\n=== Extrinsic Calibration ===")
    print("Place checkerboard at a KNOWN position in front of the robot.\n")

    # ── User input: board origin in robot frame ───────────────────────────────
    print("Enter the position of the checkerboard's TOP-LEFT corner in ROBOT frame (mm):")
    try:
        board_x = float(input("  Board origin X (forward, mm): ").strip())
        board_y = float(input("  Board origin Y (left,    mm): ").strip())
        board_z = float(input("  Board origin Z (up,      mm): ").strip())
    except ValueError:
        print("[ERROR] Invalid input")
        sys.exit(1)

    origin = np.array([board_x, board_y, board_z])
    print(f"\n  Board origin: {origin} mm (robot frame)")
    print("  Starting calibration for both cameras...\n")

    os.makedirs(CAL_DIR, exist_ok=True)

    for cam_index, cam_name in [(0, "left"), (1, "right")]:
        R, T = calibrate_one_camera(cam_index, cam_name, origin)

        if R is None:
            print(f"  [WARN] Extrinsic for cam_{cam_name} NOT saved (failed or skipped)")
            continue

        out_path = os.path.join(CAL_DIR, f"cam_{cam_name}_extrinsic.npz")
        np.savez(out_path, R=R, T=T)
        print(f"  [OK] Saved → {out_path}\n")

    print("\n=== Extrinsic calibration complete ===")
    print("Run: python main.py")


if __name__ == "__main__":
    main()
