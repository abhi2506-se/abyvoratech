import { prisma } from "@/lib/prisma";

export type NotificationType =
  | "PROJECT_SUBMITTED"
  | "PROJECT_STATUS_CHANGED"
  | "PROJECT_NEEDS_INFORMATION"
  | "PROJECT_REJECTED"
  | "PROJECT_ON_HOLD"
  | "PROJECT_CANCELLED"
  | "AGENT_ASSIGNED"
  | "PROPOSAL_SENT"
  | "PROPOSAL_ACCEPTED"
  | "PROPOSAL_REJECTED"
  | "MILESTONE_CREATED"
  | "MILESTONE_SUBMITTED_FOR_APPROVAL"
  | "MILESTONE_APPROVED"
  | "MILESTONE_CHANGES_REQUESTED"
  | "DOCUMENT_UPLOADED"
  | "INVOICE_ISSUED"
  | "CHAT_MESSAGE_RECEIVED"
  | "WEBSITE_AUDIT_COMPLETED"
  | "SUPPORT_TICKET_CREATED"
  | "SUPPORT_TICKET_ASSIGNED"
  | "SUPPORT_TICKET_FORWARDED"
  | "SUPPORT_TICKET_ESCALATED"
  | "SUPPORT_ESCALATION_APPROVED"
  | "SUPPORT_ESCALATION_REJECTED"
  | "SUPPORT_TICKET_STATUS_CHANGED"
  | "SUPPORT_TICKET_PRIORITY_CHANGED"
  | "SUPPORT_TICKET_MESSAGE_RECEIVED"
  | "SUPPORT_TICKET_ESTIMATE_UPDATED"
  | "SUPPORT_TICKET_RESOLVED"
  | "SUPPORT_TICKET_CLOSED"
  | "SUPPORT_TICKET_REOPENED";

export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.entityType ? { entityType: params.entityType, entityId: params.entityId } : undefined,
    },
  });
}

/** Notifies every active Admin — used for events that need admin attention (new requests, escalations). */
export async function notifyAdmins(params: {
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.entityType ? { entityType: params.entityType, entityId: params.entityId } : undefined,
    })),
  });
}

/** Notify every active IT_SUPPORT user — used when a ticket needs IT attention. */
export async function notifyITSupport(params: {
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  const itUsers = await prisma.user.findMany({ where: { role: "IT_SUPPORT", status: "ACTIVE" }, select: { id: true } });
  if (itUsers.length === 0) return;
  await prisma.notification.createMany({
    data: itUsers.map((u) => ({
      userId: u.id,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.entityType ? { entityType: params.entityType, entityId: params.entityId } : undefined,
    })),
  });
}

/** Notify everyone with a legitimate stake in a support ticket: raiser, assigned agent, assigned IT support. */
export async function notifyTicketParticipants(
  ticketId: string,
  params: { type: NotificationType; title: string; body?: string; excludeUserId?: string }
) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { raisedBy: true, assignedAgent: { include: { user: true } }, assignedITSupport: true },
  });
  if (!ticket) return;

  const recipients = [ticket.raisedById, ticket.assignedAgent?.user?.id, ticket.assignedITSupportId].filter(
    (id): id is string => !!id && id !== params.excludeUserId
  );
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: Array.from(new Set(recipients)).map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: { entityType: "SupportTicket", entityId: ticketId },
    })),
  });
}

/** Notify the client's login user (if they have one) and the assigned agent's user, given a Project. */
export async function notifyProjectParticipants(
  projectId: string,
  params: { type: NotificationType; title: string; body?: string; excludeUserId?: string }
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { include: { user: true } }, assignedAgent: { include: { user: true } } },
  });
  if (!project) return;

  const recipients = [project.client.user?.id, project.assignedAgent?.user?.id].filter(
    (id): id is string => !!id && id !== params.excludeUserId
  );
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: { entityType: "Project", entityId: projectId },
    })),
  });
}
