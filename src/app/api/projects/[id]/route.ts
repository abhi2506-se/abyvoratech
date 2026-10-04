import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";
import { createSystemRefundRequestIfEligible } from "@/lib/refund-trigger";
import type { ProjectStatus } from "@prisma/client";

// Only these forward transitions are legal — prevents e.g. jumping straight
// from SUBMITTED to COMPLETED, or resurrecting a REJECTED project.
// ON_HOLD is reachable from any active delivery stage and resumes back to
// wherever it was paused (see /hold and /resume routes), so it isn't listed
// as a normal forward edge here.
const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  SUBMITTED: ["PAYMENT_PENDING", "NEEDS_INFORMATION", "REJECTED"],
  NEEDS_INFORMATION: ["SUBMITTED", "REJECTED"],
  PAYMENT_PENDING: ["PAYMENT_RECEIVED", "REJECTED"],
  PAYMENT_RECEIVED: ["WAITING_FOR_REVIEW"],
  WAITING_FOR_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PLANNING"],
  REJECTED: [],
  PLANNING: ["UI_UX"],
  UI_UX: ["DEVELOPMENT"],
  DEVELOPMENT: ["TESTING"],
  TESTING: ["CLIENT_REVIEW"],
  CLIENT_REVIEW: ["DEVELOPMENT", "FINAL_DELIVERY"],
  ON_HOLD: [], // resuming uses the dedicated /resume action, not a plain status PATCH
  FINAL_DELIVERY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const transitionSchema = z.object({
  status: z.enum([
    "NEEDS_INFORMATION",
    "PAYMENT_PENDING",
    "PAYMENT_RECEIVED",
    "WAITING_FOR_REVIEW",
    "ACCEPTED",
    "REJECTED",
    "PLANNING",
    "UI_UX",
    "DEVELOPMENT",
    "TESTING",
    "CLIENT_REVIEW",
    "FINAL_DELIVERY",
    "COMPLETED",
  ]),
  note: z.string().max(2000).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { project } = await assertCanAccessProject(id);
    const full = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        client: true,
        assignedAgent: { include: { user: true } },
        milestones: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    return NextResponse.json({ project: full });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);

    // Status transitions (accept/reject/move stage) are Admin-only.
    if (session.user.role !== "ADMIN") {
      throw new AuthzError("Only Admin can change project status", 403);
    }

    const { status: newStatus, note } = transitionSchema.parse(await req.json());
    const allowed = ALLOWED_TRANSITIONS[project.status];

    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Cannot move from ${project.status} to ${newStatus}` },
        { status: 409 }
      );
    }

    if ((newStatus === "REJECTED" || newStatus === "NEEDS_INFORMATION") && !note?.trim()) {
      return NextResponse.json(
        { error: `A reason is required when moving to ${newStatus.replace(/_/g, " ")}.` },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: project.id },
        data: {
          status: newStatus,
          rejectionReason: newStatus === "REJECTED" ? note : undefined,
        },
      });
      await tx.projectStatusHistory.create({
        data: {
          projectId: project.id,
          fromStatus: project.status,
          toStatus: newStatus,
          changedById: session.user.id,
          note,
        },
      });
      return p;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "project.status_changed",
      entityType: "Project",
      entityId: project.id,
      previousValue: { status: project.status },
      newValue: { status: newStatus },
      metadata: { note },
    });

    const notifyBody = note ? note : `Project status changed to ${newStatus.replace(/_/g, " ")}.`;
    await notifyProjectParticipants(project.id, {
      type:
        newStatus === "REJECTED"
          ? "PROJECT_REJECTED"
          : newStatus === "NEEDS_INFORMATION"
            ? "PROJECT_NEEDS_INFORMATION"
            : "PROJECT_STATUS_CHANGED",
      title: `${project.name}: ${newStatus.replace(/_/g, " ")}`,
      body: notifyBody,
      excludeUserId: session.user.id,
    });

    if (newStatus === "REJECTED") {
      // A rejected project may have already collected a payment (e.g.
      // rejected during WAITING_FOR_REVIEW after PAYMENT_RECEIVED) — ensure
      // there's a real refund request path, not just a status flip.
      await createSystemRefundRequestIfEligible({
        projectId: project.id,
        triggerReason: `Project rejected: ${note}`,
        actorId: session.user.id,
      });
    }

    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
