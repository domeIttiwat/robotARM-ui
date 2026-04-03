/**
 * Camera board config — server-side persistence for per-board IPs.
 *
 * Browser localStorage holds the client-side copy (for WebSocket URLs).
 * This API persists the same values to /tmp/camera-boards.json so that
 * server-side API routes (process, wrist-process, skeleton-process) can
 * read the board IPs without access to localStorage.
 *
 * GET  /api/camera/boards  → { safetyIp, wristIp, skeletonIp, agentPort }
 * POST /api/camera/boards  → save and return the same
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join("/tmp", "camera-boards.json");

export interface BoardsConfig {
  safetyIp:   string;
  wristIp:    string;
  skeletonIp: string;
  agentPort:  number;
}

function readConfig(): BoardsConfig {
  const defaults: BoardsConfig = {
    safetyIp:   process.env.CAMERA_SAFETY_IP   ?? process.env.NEXT_PUBLIC_SAFETY_IP   ?? "localhost",
    wristIp:    process.env.CAMERA_WRIST_IP    ?? process.env.NEXT_PUBLIC_WRIST_IP    ?? "localhost",
    skeletonIp: process.env.CAMERA_SKELETON_IP ?? process.env.NEXT_PUBLIC_SKELETON_IP ?? "localhost",
    agentPort:  Number(process.env.CAMERA_AGENT_PORT ?? process.env.NEXT_PUBLIC_AGENT_PORT) || 5050,
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
    }
  } catch { /* ignore */ }
  return defaults;
}

function writeConfig(cfg: BoardsConfig): void {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch { /* ignore */ }
}

export function loadBoardsConfig(): BoardsConfig {
  return readConfig();
}

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function POST(req: Request) {
  let body: Partial<BoardsConfig>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const current = readConfig();
  const updated: BoardsConfig = {
    safetyIp:   (body.safetyIp   ?? current.safetyIp).toString().trim()   || current.safetyIp,
    wristIp:    (body.wristIp    ?? current.wristIp).toString().trim()    || current.wristIp,
    skeletonIp: (body.skeletonIp ?? current.skeletonIp).toString().trim() || current.skeletonIp,
    agentPort:  Number(body.agentPort) || current.agentPort,
  };
  writeConfig(updated);
  return NextResponse.json({ ok: true, ...updated });
}
