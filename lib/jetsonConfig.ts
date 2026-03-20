/**
 * Jetson connection config — persisted to localStorage.
 * Falls back to NEXT_PUBLIC_* env vars when nothing is saved.
 */

export interface JetsonConfig {
  ip:           string;   // hostname / IP, e.g. "192.168.1.50" or "localhost"
  rosPort:      number;   // rosbridge port  (default 9090)
  safetyPort:   number;   // safety detector (default 8765)
  wristPort:    number;   // wrist camera    (default 8766)
  skeletonPort: number;   // skeleton keypoints (default 8767)
}

const LS_KEY = "jetson_config";

function extractHost(wsUrl: string): string {
  try { return new URL(wsUrl).hostname || "localhost"; } catch { return "localhost"; }
}
function extractPort(wsUrl: string, fallback: number): number {
  try { const p = parseInt(new URL(wsUrl).port); return p || fallback; } catch { return fallback; }
}

function envDefaults(): JetsonConfig {
  const rosUrl      = process.env.NEXT_PUBLIC_ROS_URL          ?? "ws://localhost:9090";
  const safetyUrl   = process.env.NEXT_PUBLIC_SAFETY_WS_URL    ?? "ws://localhost:8765";
  const wristUrl    = process.env.NEXT_PUBLIC_WRIST_WS_URL     ?? "ws://localhost:8766";
  const skeletonUrl = process.env.NEXT_PUBLIC_SKELETON_WS_URL  ?? "ws://localhost:8767";
  return {
    ip:           extractHost(rosUrl),
    rosPort:      extractPort(rosUrl,      9090),
    safetyPort:   extractPort(safetyUrl,   8765),
    wristPort:    extractPort(wristUrl,    8766),
    skeletonPort: extractPort(skeletonUrl, 8767),
  };
}

export function loadJetsonConfig(): JetsonConfig {
  if (typeof window === "undefined") return envDefaults();
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return { ...envDefaults(), ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return envDefaults();
}

export function saveJetsonConfig(cfg: JetsonConfig): void {
  if (typeof window !== "undefined")
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function makeWsUrl(ip: string, port: number): string {
  return `ws://${ip}:${port}`;
}
