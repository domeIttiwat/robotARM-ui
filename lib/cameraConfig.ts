export interface CameraConfig {
  safetyLeft:    number;
  safetyRight:   number;
  wrist:         number;
  safetyEnabled: boolean;
  wristEnabled:  boolean;
}

const KEY = "cameraConfig";
const DEFAULTS: CameraConfig = { safetyLeft: -1, safetyRight: -1, wrist: -1, safetyEnabled: false, wristEnabled: false };

export function loadCameraConfig(): CameraConfig {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCameraConfig(cfg: CameraConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
