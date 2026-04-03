import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { label, sequence, joint_1, joint_2, joint_3, joint_4, joint_5, joint_6, slider_joint, speed, delay, gripper, controlMode, x, y, z, roll, pitch, yaw, taskType, planningMode } = await req.json();

    const task = await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: {
        ...(label !== undefined && { label: label ?? null }),
        ...(sequence !== undefined && { sequence }),
        ...(joint_1 !== undefined && { joint_1 }),
        ...(joint_2 !== undefined && { joint_2 }),
        ...(joint_3 !== undefined && { joint_3 }),
        ...(joint_4 !== undefined && { joint_4 }),
        ...(joint_5 !== undefined && { joint_5 }),
        ...(joint_6 !== undefined && { joint_6 }),
        ...(slider_joint !== undefined && { slider_joint }),
        ...(speed !== undefined && { speed }),
        ...(delay !== undefined && { delay }),
        ...(gripper !== undefined && { gripper }),
        ...(controlMode !== undefined && { controlMode }),
        ...(taskType !== undefined && { taskType }),
        ...(planningMode !== undefined && { planningMode: planningMode ?? null }),
        ...(x !== undefined && { x: x ?? null }),
        ...(y !== undefined && { y: y ?? null }),
        ...(z !== undefined && { z: z ?? null }),
        ...(roll !== undefined && { roll: roll ?? null }),
        ...(pitch !== undefined && { pitch: pitch ?? null }),
        ...(yaw !== undefined && { yaw: yaw ?? null }),
      },
    });

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const parsedTaskId = parseInt(taskId);
    await prisma.task.delete({
      where: { id: parsedTaskId },
    });

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
