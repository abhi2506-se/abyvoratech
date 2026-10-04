import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessTicket, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyTicketParticipants, notifyAdmins } from "@/lib/notifications";
import { TICKET_TRANSITIONS } from "@/lib/support-lifecycle";
import type { SupportTicketStatus } from "@prisma/client";

const schema = z.object({
  status: z.enum([
    "ADMIN_REVIEW", "NEEDS_INFORMATION", "AGENT_IN_PROGRESS", "IT_IN_PROGRESS", "WAITING_FOR_USER", "CANCELLED",
  ]),
  note: z.string().max(2000).optional(),
});

// Who may drive each of these particular transitions. (Other transitions —
// assign/forward/escalate/approve-escalation/resolve/close/reopen — have
// their own dedicated, more specific endpoints.)
const ROLE_FOR_STATUS: Record<string, Array<"ADMIN" | "AGENT" | "IT_SUPPORT" | "CLIENT">> = {
  ADMIN_REVIEW: ["ADMIN"],
  NEEDS_INFORMATION: ["ADMIN"],
  AGENT_IN_PROGRESS: ["AGENT"],
  IT_IN_PROGRESS: ["IT_SUPPORT"],
  WAITING_FOR_USER: ["IT_SUPPORT", "AGENT"],
  CANCELLED: ["ADMIN", "CLIENT"],
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);
    const { status: newStatus, note } = schema.parse(await req.json());

    const allowedRoles = ROLE_FOR_STATUS[newStatus] ?? [];
    if (!allowedRoles.includes(session.user.role as any)) {
      throw new AuthzError(`Your role cannot set status to ${newStatus}`, 403);
    }
    if (session.user.role === "CLIENT" && ticket.raisedById !== session.user.id) {
      throw new AuthzError("You can only cancel your own tickets", 403);
    }
    if (session.user.role === "AGENT" && ticket.assignedAgentId !== session.user.agentId) {
      throw new AuthzError("You can only update tickets assigned to you", 403);
    }
    if (session.user.role === "IT_SUPPORT" && ticket.assignedITSupportId && ticket.assignedITSupportId !== session.user.id) {
      throw new AuthzError("This ticket is assigned to a different IT Support member", 403);
    }

    const allowedFrom = TICKET_TRANSITIONS[ticket.status as SupportTicketStatus] ?? [];
    if (!allowedFrom.includes(newStatus as SupportTicketStatus)) {
      return NextResponse.json({ error: `Cannot move from ${ticket.status} to ${newStatus}` }, { status: 409 });
    }
    if (newStatus === "NEEDS_INFORMATION" && !note?.trim()) {
      return NextResponse.json({ error: "A note is required when requesting more information." }, { status: 400 });
    }

    // IT_SUPPORT picking up a forwarded ticket also claims it if unclaimed.
    const extraData: any = {};
    if (newStatus === "IT_IN_PROGRESS" && !ticket.assignedITSupportId) {
      extraData.assignedITSupportId = session.user.id;
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: newStatus, ...extraData },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id, actorId: session.user.id, actorRole: session.user.role,
        action: "ticket.status_changed", previousStatus: ticket.status, newStatus, note,
      },
    });
    await writeAuditLog({
      actorId: session.user.id, actorRole: session.user.role, action: "support_ticket.status_changed",
      entityType: "SupportTicket", entityId: ticket.id,
      previousValue: { status: ticket.status }, newValue: { status: newStatus }, metadata: { note },
    });

    if (newStatus === "ADMIN_REVIEW") {
      // no-op notification needed — admin already knows, they moved it
    } else {
      await notifyTicketParticipants(ticket.id, {
        type: "SUPPORT_TICKET_STATUS_CHANGED",
        title: `${ticket.ticketNumber}: ${newStatus.replace(/_/g, " ")}`,
        body: note,
        excludeUserId: session.user.id,
      });
    }
    if (newStatus === "NEEDS_INFORMATION") {
      await notifyAdmins({
        type: "SUPPORT_TICKET_STATUS_CHANGED",
        title: `Awaiting more info on ${ticket.ticketNumber}`,
        entityType: "SupportTicket",
        entityId: ticket.id,
      });
    }

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
