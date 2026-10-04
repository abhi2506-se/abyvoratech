import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants } from "@/lib/notifications";

const schema = z.object({ resolutionSummary: z.string().min(5).max(3000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);

    const canResolve =
      (session.user.role === "IT_SUPPORT" && ["IT_IN_PROGRESS", "WAITING_FOR_USER"].includes(ticket.status)) ||
      (session.user.role === "AGENT" &&
        ticket.assignedAgentId === session.user.agentId &&
        ticket.status === "AGENT_IN_PROGRESS");

    if (!canResolve) {
      throw new AuthzError(`Cannot resolve this ticket from its current status (${ticket.status}) with your role`, 403);
    }

    const { resolutionSummary } = schema.parse(await req.json());

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "RESOLVED", resolutionSummary },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.resolved", previousStatus: ticket.status, newStatus: "RESOLVED", note: resolutionSummary,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.resolved",
      entityType: "SupportTicket", entityId: ticket.id,
    });
    await notifyTicketParticipants(ticket.id, {
      type: "SUPPORT_TICKET_RESOLVED",
      title: `${ticket.ticketNumber} marked resolved`,
      body: resolutionSummary,
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
