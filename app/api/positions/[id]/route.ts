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
        joint_1: body.joint_1 ?? 0,
        joint_2: body.joint_2 ?? 0,
        joint_3: body.joint_3 ?? 0,
        joint_4: body.joint_4 ?? 0,
        joint_5: body.joint_5 ?? 0,
        joint_6: body.joint_6 ?? 0,
        slider_joint: body.slider_joint ?? 0,
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
