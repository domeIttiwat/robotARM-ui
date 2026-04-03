import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const positions = await prisma.position.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, positions });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const position = await prisma.position.create({
      data: {
        name: body.name,
        j1: body.j1 ?? 0,
        j2: body.j2 ?? 0,
        j3: body.j3 ?? 0,
        j4: body.j4 ?? 0,
        j5: body.j5 ?? 0,
        j6: body.j6 ?? 0,
        rail: body.rail ?? 0,
        gripper: body.gripper ?? 0,
        controlMode: body.controlMode ?? "joint",
        x: body.x ?? null,
        y: body.y ?? null,
        z: body.z ?? null,
        roll: body.roll ?? null,
        pitch: body.pitch ?? null,
        yaw: body.yaw ?? null,
      },
    });
    return NextResponse.json({ success: true, position }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
