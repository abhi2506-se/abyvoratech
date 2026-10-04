import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants } from "@/lib/notifications";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);

    const canClose =
      session.user.role === "ADMIN" ||
      (ticket.raisedById === session.user.id && ticket.status === "RESOLVED");
    if (!canClose) {
      throw new AuthzError("Only the ticket raiser (once resolved) or Admin can close this ticket", 403);
    }
    if (ticket.status !== "RESOLVED") {
      return NextResponse.json({ error: `Ticket must be RESOLVED before it can be closed (current: ${ticket.status})` }, { status: 409 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.closed", previousStatus: "RESOLVED", newStatus: "CLOSED",
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.closed",
      entityType: "SupportTicket", entityId: ticket.id,
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_TICKET_CLOSED",
      title: `${ticket.ticketNumber} closed`,
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
