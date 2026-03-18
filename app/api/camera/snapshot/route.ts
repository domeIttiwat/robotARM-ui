import { NextRequest, NextResponse } from "next/server";
import { spawnSync } from "child_process";

const SNAPSHOT_SCRIPT = `
import cv2, base64, sys
idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
cap = cv2.VideoCapture(idx)
ok, frame = cap.read()
cap.release()
if ok:
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    print(base64.b64encode(buf).decode())
else:
    raise SystemExit(1)
`;

export async function GET(req: NextRequest) {
  const index = req.nextUrl.searchParams.get("index") ?? "0";

  const result = spawnSync("python3", ["-c", SNAPSHOT_SCRIPT, index], {
    timeout: 10000,
    encoding: "utf8",
  });

  if (result.error) {
    return NextResponse.json({ error: `python3 not found: ${result.error.message}` }, { status: 500 });
  }
  if (result.status !== 0) {
    return NextResponse.json(
      { error: result.stderr?.trim() || `Failed to capture from camera ${index}` },
      { status: 500 },
    );
  }

  const frame = result.stdout.trim();
  if (!frame) {
    return NextResponse.json({ error: "Empty frame" }, { status: 500 });
  }

  return NextResponse.json({ frame });
}
