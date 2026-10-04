import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants } from "@/lib/notifications";

const schema = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);
    if (session.user.role !== "ADMIN" && session.user.role !== "IT_SUPPORT") {
      throw new AuthzError("Only Admin or IT Support can change ticket priority", 403);
    }

    const { priority } = schema.parse(await req.json());
    if (priority === ticket.priority) {
      return NextResponse.json({ ticket });
    }

    const updated = await prisma.supportTicket.update({ where: { id: ticket.id }, data: { priority } });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.priority_changed", previousPriority: ticket.priority, newPriority: priority,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.priority_changed",
      entityType: "SupportTicket", entityId: ticket.id,
      previousValue: { priority: ticket.priority }, newValue: { priority },
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_TICKET_PRIORITY_CHANGED",
      title: `${ticket.ticketNumber} priority changed to ${priority}`,
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
