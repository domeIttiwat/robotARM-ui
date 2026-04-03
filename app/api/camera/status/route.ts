import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const calDir = path.join(process.cwd(), "detector", "calibration");
  const exists = (name: string) => {
    try { return fs.existsSync(path.join(calDir, name)); } catch { return false; }
  };
  return NextResponse.json({
    leftIntrinsic:  exists("cam_left_intrinsic.npz"),
    rightIntrinsic: exists("cam_right_intrinsic.npz"),
    leftExtrinsic:  exists("cam_left_extrinsic.npz"),
    rightExtrinsic: exists("cam_right_extrinsic.npz"),
  });
}
