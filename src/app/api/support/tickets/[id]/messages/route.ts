import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { notifyTicketParticipants } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  message: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);
    const body = schema.parse(await req.json());

    const canPostInternal = session.user.role === "ADMIN" || session.user.role === "IT_SUPPORT";
    if (body.isInternal && !canPostInternal) {
      throw new AuthzError("Only Admin/IT Support can post internal notes", 403);
    }

    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: session.user.id,
        senderRole: session.user.role,
        message: body.message,
        isInternal: !!body.isInternal,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: body.isInternal ? "support_ticket.internal_note_added" : "support_ticket.message_added",
      entityType: "SupportTicket",
      entityId: ticket.id,
    });

    if (!body.isInternal) {
      await notifyTicketParticipants(ticket.id, {
        type: "SUPPORT_TICKET_MESSAGE_RECEIVED",
        title: `New reply on ${ticket.ticketNumber}`,
        body: body.message.slice(0, 200),
        excludeUserId: session.user.id,
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
