import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";
import { CANCELLABLE_STATUSES } from "@/lib/project-lifecycle";
import { createSystemRefundRequestIfEligible } from "@/lib/refund-trigger";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);
    if (session.user.role !== "ADMIN") throw new AuthzError("Only Admin can cancel a project", 403);

    const { reason } = schema.parse(await req.json());

    if (!CANCELLABLE_STATUSES.includes(project.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a project from status ${project.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: project.id },
        data: { status: "CANCELLED" },
      });
      await tx.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: "CANCELLED",
          changedById: session.user.id,
          note: reason,
        },
      });
      return p;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "project.cancelled",
      entityType: "Project",
      entityId: project.id,
      previousValue: { status: project.status },
      newValue: { status: "CANCELLED" },
      metadata: { reason },
    });

    // If the project had received payment, ensure there's a real refund
    // request path back to the client — not just a status flip.
    await createSystemRefundRequestIfEligible({
      projectId: project.id,
      triggerReason: `Project cancelled: ${reason}`,
      actorId: session.user.id,
    });

    await notifyProjectParticipants(project.id, {
      type: "PROJECT_CANCELLED",
      title: `${project.name} was cancelled`,
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
