import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);
    if (session.user.role !== "ADMIN") throw new AuthzError("Only Admin can resume a project", 403);

    if (project.status !== "ON_HOLD" || !project.onHoldFromStatus) {
      return NextResponse.json({ error: "Project is not currently on hold" }, { status: 409 });
    }

    const resumeTo = project.onHoldFromStatus;

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: project.id },
        data: { status: resumeTo, onHoldFromStatus: null },
      });
      await tx.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: "ON_HOLD",
          toStatus: resumeTo,
          changedById: session.user.id,
          note: "Resumed from hold",
        },
      });
      return p;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "project.resumed",
      entityType: "Project",
      entityId: project.id,
      previousValue: { status: "ON_HOLD" },
      newValue: { status: resumeTo },
    });

    await notifyProjectParticipants(project.id, {
      type: "PROJECT_STATUS_CHANGED",
      title: `${project.name} has resumed`,
      body: `Work has resumed — status is now ${resumeTo.replace(/_/g, " ")}.`,
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ project: updated });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
