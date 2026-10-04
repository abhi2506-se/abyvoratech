import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyITSupport, notifyTicketParticipants } from "@/lib/notifications";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new AuthzError("Ticket not found", 404);
    if (ticket.status !== "ESCALATED_TO_ADMIN") {
      return NextResponse.json({ error: `Ticket is not awaiting escalation review (status: ${ticket.status})` }, { status: 409 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "FORWARDED_TO_IT" },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "escalation.approved", previousStatus: "ESCALATED_TO_ADMIN", newStatus: "FORWARDED_TO_IT",
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.escalation_approved",
      entityType: "SupportTicket", entityId: ticket.id,
    });
    await notifyITSupport({
      type: "SUPPORT_ESCALATION_APPROVED",
      title: `Escalated ticket forwarded: ${ticket.ticketNumber}`,
      entityType: "SupportTicket",
      entityId: ticket.id,
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_ESCALATION_APPROVED",
      title: `Your escalation for ${ticket.ticketNumber} was approved`,
      body: "The ticket has been forwarded to IT Support.",
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
