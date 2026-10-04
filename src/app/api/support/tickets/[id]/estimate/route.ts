import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants } from "@/lib/notifications";

const schema = z.object({
  estimateValue: z.string().min(1).max(20),
  estimateUnit: z.enum(["MINUTES", "HOURS", "DAYS"]),
  estimateNote: z.string().max(1000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);
    if (session.user.role !== "IT_SUPPORT") {
      throw new AuthzError("Only IT Support can set the estimated resolution time", 403);
    }

    const body = schema.parse(await req.json());

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        estimateValue: body.estimateValue,
        estimateUnit: body.estimateUnit,
        estimateNote: body.estimateNote,
        estimateSetAt: new Date(),
      },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.estimate_updated",
        note: `${body.estimateValue} ${body.estimateUnit}${body.estimateNote ? ` — ${body.estimateNote}` : ""}`,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.estimate_updated",
      entityType: "SupportTicket", entityId: ticket.id, metadata: body,
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_TICKET_ESTIMATE_UPDATED",
      title: `Estimated resolution updated for ${ticket.ticketNumber}`,
      body: `${body.estimateValue} ${body.estimateUnit.toLowerCase()} — this is an estimate, not a guaranteed deadline.`,
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
