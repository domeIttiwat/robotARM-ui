import path from "path";

const isWin = process.platform === "win32";

/** Absolute path to a binary inside a .venv directory (handles bin/ vs Scripts/ and .exe suffix). */
export function venvBin(venvDir: string, name: string): string {
  return path.join(venvDir, isWin ? "Scripts" : "bin", isWin ? `${name}.exe` : name);
}

/** System Python executable name (python3 on Unix, python on Windows). */
export const systemPython = isWin ? "python" : "python3";
