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
    return NextResponse.json({ success: true, position }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
