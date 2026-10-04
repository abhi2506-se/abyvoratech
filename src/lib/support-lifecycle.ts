import type { SupportTicketStatus } from "@prisma/client";

/** Server-side transition graph — the frontend must never be trusted to enforce this. */
export const TICKET_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  SUBMITTED: ["ADMIN_REVIEW", "NEEDS_INFORMATION", "CANCELLED"],
  ADMIN_REVIEW: ["ADMIN_ASSIGNED", "ASSIGNED_TO_AGENT", "FORWARDED_TO_IT", "NEEDS_INFORMATION", "CANCELLED"],
  NEEDS_INFORMATION: ["ADMIN_REVIEW", "CANCELLED"],
  ADMIN_ASSIGNED: ["FORWARDED_TO_IT"],
  ASSIGNED_TO_AGENT: ["AGENT_IN_PROGRESS", "ESCALATED_TO_ADMIN"],
  AGENT_IN_PROGRESS: ["RESOLVED", "ESCALATED_TO_ADMIN"],
  ESCALATED_TO_ADMIN: ["ESCALATION_REJECTED", "FORWARDED_TO_IT"],
  ESCALATION_REJECTED: ["ASSIGNED_TO_AGENT", "AGENT_IN_PROGRESS"],
  FORWARDED_TO_IT: ["IT_ASSIGNED", "IT_IN_PROGRESS"],
  IT_ASSIGNED: ["IT_IN_PROGRESS"],
  IT_IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED"],
  WAITING_FOR_USER: ["IT_IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ADMIN_REVIEW", "IT_IN_PROGRESS"],
  CANCELLED: [],
};

export async function generateTicketNumber(): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const year = new Date().getFullYear();
  const count = await prisma.supportTicket.count();
  const seq = (count + 1).toString().padStart(5, "0");
  const candidate = `TCK-${year}-${seq}`;

  // Extremely unlikely collision (concurrent creates), but guard anyway.
  const exists = await prisma.supportTicket.findUnique({ where: { ticketNumber: candidate } });
  if (!exists) return candidate;
  return `TCK-${year}-${seq}-${Date.now().toString().slice(-4)}`;
}
