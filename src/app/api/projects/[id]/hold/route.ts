import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";
import { HOLDABLE_STATUSES } from "@/lib/project-lifecycle";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);
    if (session.user.role !== "ADMIN") throw new AuthzError("Only Admin can pause a project", 403);

    const { reason } = schema.parse(await req.json());

    if (!HOLDABLE_STATUSES.includes(project.status)) {
      return NextResponse.json(
        { error: `Cannot put a project on hold from status ${project.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: project.id },
        // Remember where we paused from so /resume can put it back.
        data: { status: "ON_HOLD", onHoldFromStatus: project.status },
      });
      await tx.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: "ON_HOLD",
          changedById: session.user.id,
          note: reason,
        },
      });
      return p;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "project.on_hold",
      entityType: "Project",
      entityId: project.id,
      previousValue: { status: project.status },
      newValue: { status: "ON_HOLD" },
      metadata: { reason },
    });

    await notifyProjectParticipants(project.id, {
      type: "PROJECT_ON_HOLD",
      title: `${project.name} is on hold`,
      body: reason,
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
