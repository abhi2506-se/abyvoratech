import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyITSupport } from "@/lib/notifications";

const schema = z.object({ reason: z.string().max(2000).optional() });

const FORWARDABLE = new Set(["SUBMITTED", "ADMIN_REVIEW", "ADMIN_ASSIGNED", "ESCALATED_TO_ADMIN", "NEEDS_INFORMATION"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const { reason } = schema.parse(await req.json());

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new AuthzError("Ticket not found", 404);
    if (!FORWARDABLE.has(ticket.status)) {
      return NextResponse.json({ error: `Cannot forward to IT from status ${ticket.status}` }, { status: 409 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "FORWARDED_TO_IT" },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.forwarded_to_it", previousStatus: ticket.status, newStatus: "FORWARDED_TO_IT", note: reason,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.forwarded_to_it",
      entityType: "SupportTicket", entityId: ticket.id, metadata: { reason },
    });
    await notifyITSupport({
      type: "SUPPORT_TICKET_FORWARDED",
      title: `Ticket ${ticket.ticketNumber} forwarded to IT Support`,
      body: reason,
      entityType: "SupportTicket",
      entityId: ticket.id,
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
