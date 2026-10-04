import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { TICKET_TRANSITIONS } from "@/lib/support-lifecycle";

const schema = z.object({
  assignToType: z.enum(["AGENT", "IT_SUPPORT"]),
  agentId: z.string().optional(),
  itSupportUserId: z.string().optional(),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const body = schema.parse(await req.json());

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new AuthzError("Ticket not found", 404);

    if (body.assignToType === "AGENT") {
      if (!body.agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
      const nextStatus = "ASSIGNED_TO_AGENT" as const;
      if (!TICKET_TRANSITIONS[ticket.status].includes(nextStatus) && ticket.status !== "ADMIN_REVIEW") {
        return NextResponse.json({ error: `Cannot assign to Agent from status ${ticket.status}` }, { status: 409 });
      }
      const agent = await prisma.agent.findUnique({ where: { id: body.agentId }, include: { user: true } });
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { assignedAgentId: agent.id, status: nextStatus },
      });

      await prisma.supportTicketActivity.create({
        data: {
          ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
          action: "ticket.assigned_to_agent", previousStatus: ticket.status, newStatus: nextStatus,
          note: body.reason,
        },
      });
      await writeAuditLog({
        actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.assigned_to_agent",
        entityType: "SupportTicket", entityId: ticket.id, metadata: { agentId: agent.id },
      });
      if (agent.user?.id) {
        await notifyUser({
          userId: agent.user.id, type: "SUPPORT_TICKET_ASSIGNED",
          title: `Ticket ${ticket.ticketNumber} assigned to you`, body: body.reason,
          entityType: "SupportTicket", entityId: ticket.id,
        });
      }
      return NextResponse.json({ ticket: updated });
    }

    // Direct assignment to a specific IT Support person.
    if (!body.itSupportUserId) return NextResponse.json({ error: "itSupportUserId is required" }, { status: 400 });
    const itUser = await prisma.user.findUnique({ where: { id: body.itSupportUserId } });
    if (!itUser || itUser.role !== "IT_SUPPORT") {
      return NextResponse.json({ error: "That user is not an active IT Support account" }, { status: 404 });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { assignedITSupportId: itUser.id, status: "FORWARDED_TO_IT" },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.assigned_to_it", previousStatus: ticket.status, newStatus: "FORWARDED_TO_IT",
        note: body.reason,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.assigned_to_it",
      entityType: "SupportTicket", entityId: ticket.id, metadata: { itSupportUserId: itUser.id },
    });
    await notifyUser({
      userId: itUser.id, type: "SUPPORT_TICKET_ASSIGNED",
      title: `Ticket ${ticket.ticketNumber} assigned to you`, body: body.reason,
      entityType: "SupportTicket", entityId: ticket.id,
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
