import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants } from "@/lib/notifications";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const { reason } = schema.parse(await req.json());

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new AuthzError("Ticket not found", 404);
    if (ticket.status !== "ESCALATED_TO_ADMIN") {
      return NextResponse.json({ error: `Ticket is not awaiting escalation review (status: ${ticket.status})` }, { status: 409 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ESCALATION_REJECTED", adminDecisionReason: reason },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "escalation.rejected", previousStatus: "ESCALATED_TO_ADMIN", newStatus: "ESCALATION_REJECTED",
        note: reason,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.escalation_rejected",
      entityType: "SupportTicket", entityId: ticket.id, metadata: { reason },
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_ESCALATION_REJECTED",
      title: `Escalation for ${ticket.ticketNumber} was declined`,
      body: reason,
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
