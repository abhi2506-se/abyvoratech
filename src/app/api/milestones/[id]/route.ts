import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

// Two independent action verbs instead of a generic "status" field — this is
// the enforcement point for spec section 11's core rule: "Do not mark a
// milestone completed only because an Agent uploads a file. Client approval
// must be a separate action."
const schema = z.object({
  action: z.enum(["START", "SUBMIT_FOR_APPROVAL", "APPROVE", "REQUEST_CHANGES", "ADMIN_OVERRIDE"]),
  note: z.string().max(2000).optional(),
  overrideStatus: z
    .enum(["PENDING", "IN_PROGRESS", "SUBMITTED_FOR_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "COMPLETED"])
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const milestone = await prisma.milestone.findUnique({ where: { id } });
    if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { session, project } = await assertCanAccessProject(milestone.projectId);
    const { action, note, overrideStatus } = schema.parse(await req.json());

    let nextStatus: string;
    if (action === "START") {
      if (session.user.role !== "AGENT" && session.user.role !== "ADMIN") {
        throw new AuthzError("Only the assigned Agent or Admin can start a milestone", 403);
      }
      if (milestone.status !== "PENDING") {
        return NextResponse.json({ error: `Cannot start from ${milestone.status}` }, { status: 409 });
      }
      nextStatus = "IN_PROGRESS";
    } else if (action === "SUBMIT_FOR_APPROVAL") {
      if (session.user.role !== "AGENT" && session.user.role !== "ADMIN") {
        throw new AuthzError("Only the assigned Agent or Admin can submit for approval", 403);
      }
      if (!["IN_PROGRESS", "CHANGES_REQUESTED"].includes(milestone.status)) {
        return NextResponse.json({ error: `Cannot submit for approval from ${milestone.status}` }, { status: 409 });
      }
      nextStatus = "SUBMITTED_FOR_APPROVAL";
    } else if (action === "APPROVE") {
      // The one action a Client is authorized to take — genuinely requires
      // the Client's own role, never inferred from an Agent/Admin action.
      if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
        throw new AuthzError("Only the Client can approve a milestone", 403);
      }
      if (milestone.status !== "SUBMITTED_FOR_APPROVAL") {
        return NextResponse.json({ error: `Cannot approve from ${milestone.status}` }, { status: 409 });
      }
      nextStatus = milestone.requiresClientApproval && session.user.role === "ADMIN" ? "APPROVED" : "APPROVED";
    } else if (action === "REQUEST_CHANGES") {
      if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
        throw new AuthzError("Only the Client can request changes", 403);
      }
      if (milestone.status !== "SUBMITTED_FOR_APPROVAL") {
        return NextResponse.json({ error: `Cannot request changes from ${milestone.status}` }, { status: 409 });
      }
      if (!note) return NextResponse.json({ error: "A note explaining the requested changes is required" }, { status: 400 });
      nextStatus = "CHANGES_REQUESTED";
    } else {
      // ADMIN_OVERRIDE — explicit, reason-required, audited (spec: "Admin can override with reason").
      if (session.user.role !== "ADMIN") throw new AuthzError("Only Admin can override milestone status", 403);
      if (!overrideStatus) return NextResponse.json({ error: "overrideStatus is required" }, { status: 400 });
      if (!note) return NextResponse.json({ error: "A reason is required for an override" }, { status: 400 });
      nextStatus = overrideStatus;
    }

    const updated = await prisma.milestone.update({
      where: { id },
      data: {
        status: nextStatus as any,
        ...(nextStatus === "COMPLETED" ? {} : {}),
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: `milestone.${action.toLowerCase()}`,
      entityType: "Milestone",
      entityId: id,
      description: `${session.user.name} ${action.replaceAll("_", " ").toLowerCase()}d milestone "${milestone.name}" on "${project.name}"`,
      previousValue: { status: milestone.status },
      newValue: { status: nextStatus, note },
    });

    const notifType =
      action === "APPROVE" ? "MILESTONE_APPROVED" : action === "REQUEST_CHANGES" ? "MILESTONE_CHANGES_REQUESTED" : "MILESTONE_SUBMITTED_FOR_APPROVAL";
    await notifyProjectParticipants(project.id, {
      excludeUserId: session.user.id,
      type: notifType,
      title: `Milestone ${nextStatus.replaceAll("_", " ").toLowerCase()}`,
      body: `"${milestone.name}": ${note ?? nextStatus}`,
    }).catch(() => {});

    return NextResponse.json({ milestone: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
