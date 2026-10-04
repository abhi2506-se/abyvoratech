import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTask, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(3000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, task } = await assertCanAccessTask(id);
    const body = await req.json();
    const data = updateSchema.parse(body);

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.priority ? { priority: data.priority } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt ? new Date(data.dueAt) : null } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });

    if (data.status && data.status !== task.status) {
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: data.status === "COMPLETED" ? "task.completed" : "task.status_changed",
        entityType: "Task",
        entityId: task.id,
        description: `${session.user.name} marked follow-up "${task.title}" as ${data.status}`,
        previousValue: { status: task.status },
        newValue: { status: updated.status },
      });
    }

    return NextResponse.json({ task: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
