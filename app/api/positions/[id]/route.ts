import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const position = await prisma.position.update({
      where: { id: Number(id) },
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
    return NextResponse.json({ success: true, position });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.position.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
