import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id);
    const tasks = await prisma.task.findMany({
      where: { jobId },
      orderBy: { sequence: "asc" },
    });

    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id);
    const { sequence, label, joint_1, joint_2, joint_3, joint_4, joint_5, joint_6, slider_joint, speed, delay, gripper, controlMode, x, y, z, roll, pitch, yaw, taskType, planningMode } =
      await req.json();

    const task = await prisma.task.create({
      data: {
        jobId,
        sequence,
        label: label || null,
        joint_1: joint_1 ?? 0, joint_2: joint_2 ?? 0, joint_3: joint_3 ?? 0,
        joint_4: joint_4 ?? 0, joint_5: joint_5 ?? 0, joint_6: joint_6 ?? 0,
        slider_joint: slider_joint ?? 0,
        speed: speed || 50,
        delay: delay || 0,
        gripper: gripper ?? 0,
        controlMode: controlMode ?? "joint",
        taskType: taskType ?? "move",
        planningMode: planningMode ?? null,
        x: x ?? null, y: y ?? null, z: z ?? null,
        roll: roll ?? null, pitch: pitch ?? null, yaw: yaw ?? null,
      },
    });

    return NextResponse.json(
      { success: true, task },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
