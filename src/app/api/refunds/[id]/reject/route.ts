import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const { reason } = schema.parse(await req.json());

    const refund = await prisma.refund.findUnique({ where: { id } });
    if (!refund) throw new AuthzError("Refund not found", 404);
    if (refund.status !== "REQUESTED") {
      return NextResponse.json({ error: `Refund is not in a rejectable state (current: ${refund.status})` }, { status: 409 });
    }

    const updated = await prisma.refund.update({
      where: { id: refund.id },
      data: { status: "REJECTED", rejectionReason: reason, approvedById: session.user.id },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "refund.rejected",
      entityType: "Refund",
      entityId: refund.id,
      metadata: { reason },
    });

    await notifyProjectParticipants(refund.projectId, {
      type: "PROJECT_STATUS_CHANGED",
      title: "Refund request rejected",
      body: reason,
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ refund: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
