import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins, notifyTicketParticipants } from "@/lib/notifications";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);

    const canReopen = session.user.role === "ADMIN" || ticket.raisedById === session.user.id;
    if (!canReopen) throw new AuthzError("Only the ticket raiser or Admin can reopen this ticket", 403);
    if (!["RESOLVED", "CLOSED"].includes(ticket.status)) {
      return NextResponse.json({ error: `Only RESOLVED or CLOSED tickets can be reopened (current: ${ticket.status})` }, { status: 409 });
    }

    const { reason } = schema.parse(await req.json());

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "REOPENED", closedAt: null },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.reopened", previousStatus: ticket.status, newStatus: "REOPENED", note: reason,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.reopened",
      entityType: "SupportTicket", entityId: ticket.id, metadata: { reason },
    });
    await notifyAdmins({
      type: "SUPPORT_TICKET_REOPENED",
      title: `${ticket.ticketNumber} was reopened`,
      body: reason,
      entityType: "SupportTicket",
      entityId: ticket.id,
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_TICKET_REOPENED",
      title: `${ticket.ticketNumber} was reopened`,
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
