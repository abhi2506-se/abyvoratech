import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins } from "@/lib/notifications";

const schema = z.object({
  escalationReason: z.string().min(10).max(2000),
  technicalDetails: z.string().min(1).max(4000),
  stepsAlreadyTaken: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);
    if (session.user.role !== "AGENT") {
      throw new AuthzError("Only the assigned Agent can escalate a ticket", 403);
    }
    if (ticket.assignedAgentId !== session.user.agentId) {
      throw new AuthzError("You can only escalate tickets assigned to you", 403);
    }
    if (!["ASSIGNED_TO_AGENT", "AGENT_IN_PROGRESS"].includes(ticket.status)) {
      return NextResponse.json({ error: `Cannot escalate from status ${ticket.status}` }, { status: 409 });
    }

    const body = schema.parse(await req.json());
    const combinedReason = `${body.escalationReason}\n\nTechnical details: ${body.technicalDetails}\n\nSteps already taken: ${body.stepsAlreadyTaken}`;

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "ESCALATED_TO_ADMIN", escalationReason: combinedReason },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.escalated_to_admin", previousStatus: ticket.status, newStatus: "ESCALATED_TO_ADMIN",
        note: combinedReason,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.escalated",
      entityType: "SupportTicket", entityId: ticket.id,
    });
    await notifyAdmins({
      type: "SUPPORT_TICKET_ESCALATED",
      title: `Ticket ${ticket.ticketNumber} escalated for review`,
      body: body.escalationReason,
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
