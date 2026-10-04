import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "PAY", "REVERSE"]),
  reason: z.string().max(2000).optional(),
});

// Every transition here is Admin-only. Agents can view their own commissions
// (see /api/commissions) but can never approve, reject, pay, or reverse them.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("ADMIN");
    const body = await req.json();
    const data = updateSchema.parse(body);

    const commission = await prisma.commission.findUnique({ where: { id } });
    if (!commission) throw new AuthzError("Not found", 404);

    if (["REJECT", "REVERSE"].includes(data.action) && !data.reason) {
      return NextResponse.json({ error: "A reason is required to reject or reverse a commission" }, { status: 400 });
    }

    const nextStatus =
      data.action === "APPROVE"
        ? "APPROVED"
        : data.action === "REJECT"
        ? "REJECTED"
        : data.action === "PAY"
        ? "PAID"
        : "REVERSED";

    const updated = await prisma.commission.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(data.action === "APPROVE" ? { approvedAt: new Date() } : {}),
        ...(data.action === "PAY" ? { paidAt: new Date() } : {}),
        ...(data.action === "REVERSE" ? { reversalReason: data.reason } : {}),
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: `commission.${data.action.toLowerCase()}`,
      entityType: "Commission",
      entityId: commission.id,
      description: `${session.user.name} ${data.action.toLowerCase()}d commission ${commission.id}${
        data.reason ? `: ${data.reason}` : ""
      }`,
      previousValue: { status: commission.status },
      newValue: { status: updated.status },
      metadata: data.reason ? { reason: data.reason } : undefined,
    });

    return NextResponse.json({ commission: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
