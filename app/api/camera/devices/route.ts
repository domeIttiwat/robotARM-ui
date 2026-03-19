import { NextResponse } from "next/server";
import { spawnSync } from "child_process";

const PROBE_SCRIPT = `
import json, os, sys, platform, subprocess

devices = []

if platform.system() == 'Darwin':
    try:
        raw = subprocess.check_output(['system_profiler', 'SPCameraDataType', '-json'], timeout=5)
        import json as js
        data = js.loads(raw)
        cams = data.get('SPCameraDataType', [])
        for i, c in enumerate(cams):
            devices.append({'index': i, 'name': c.get('_name', f'Camera {i}'), 'device': str(i)})
    except Exception:
        pass
    if not devices:
        try:
            import cv2
            for i in range(5):
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    devices.append({'index': i, 'name': f'Camera {i}', 'device': str(i)})
                    cap.release()
        except Exception:
            pass
elif platform.system() == 'Windows':
    try:
        import cv2
        for i in range(10):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                devices.append({'index': i, 'name': f'Camera {i}', 'device': str(i)})
                cap.release()
    except Exception:
        pass
else:
    for i in range(10):
        dev = f'/dev/video{i}'
        if os.path.exists(dev):
            name = f'Camera {i}'
            try:
                with open(f'/sys/class/video4linux/video{i}/name') as f:
                    name = f.read().strip()
            except Exception:
                pass
            devices.append({'index': i, 'name': name, 'device': dev})

print(json.dumps(devices))
`;

export async function GET() {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(pythonCmd, ["-c", PROBE_SCRIPT], {
    timeout: 15000,
    encoding: "utf8",
  });

  if (result.error) {
    return NextResponse.json(
      { devices: [], error: `${pythonCmd} not found: ${result.error.message}` },
    );
  }
  if (result.status !== 0) {
    return NextResponse.json(
      { devices: [], error: result.stderr?.trim() || "Probe failed" },
    );
  }

  try {
    const devices = JSON.parse(result.stdout.trim() || "[]");
    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json(
      { devices: [], error: "Failed to parse probe output" },
    );
  }
}
