import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/** Throws if there's no authenticated, active session. Returns the session otherwise. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new AuthzError("Not authenticated", 401);
  if (session.user.status === "DISABLED") throw new AuthzError("Account disabled", 403);
  return session;
}

/** Throws unless the current user has one of the given roles. */
export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    throw new AuthzError("Insufficient permissions", 403);
  }
  return session;
}

/**
 * Core IDOR guard for a lead: Admin sees everything, an Agent only sees leads
 * assigned to them. This check happens against the database, not a client-supplied
 * flag, so a manually edited URL/id can never leak another agent's record.
 */
export async function assertCanAccessLead(leadId: string) {
  const session = await requireSession();
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN") return { session, lead };
  if (session.user.role === "AGENT" && lead.agentId === session.user.agentId) {
    return { session, lead };
  }
  throw new AuthzError("You do not have access to this lead", 403);
}

export async function assertCanAccessClient(clientId: string) {
  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN") return { session, client };
  if (session.user.role === "AGENT" && client.assignedAgentId === session.user.agentId) {
    return { session, client };
  }
  if (session.user.role === "CLIENT" && client.id === session.user.clientId) {
    return { session, client };
  }
  throw new AuthzError("You do not have access to this client", 403);
}

export async function assertCanAccessProject(projectId: string) {
  const session = await requireSession();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN") return { session, project };
  if (session.user.role === "AGENT" && project.assignedAgentId === session.user.agentId) {
    return { session, project };
  }
  if (session.user.role === "CLIENT" && project.clientId === session.user.clientId) {
    return { session, project };
  }
  throw new AuthzError("You do not have access to this project", 403);
}

/** Scopes a Prisma `where` clause for list endpoints so an agent only ever queries their own rows. */
export function leadScope(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "AGENT") return { agentId: session.user.agentId ?? undefined };
  throw new AuthzError("Clients cannot list leads", 403);
}

export function clientScope(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "AGENT") return { assignedAgentId: session.user.agentId ?? undefined };
  if (session.user.role === "CLIENT") return { id: session.user.clientId ?? undefined };
  return {};
}

export function projectScope(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "AGENT") return { assignedAgentId: session.user.agentId ?? undefined };
  if (session.user.role === "CLIENT") return { clientId: session.user.clientId ?? undefined };
  return {};
}

/** Scopes Proposals, SalesActivities, Tasks and Commissions — all owned by `agentId`. */
export function agentOwnedScope(session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.user.role === "ADMIN") return {};
  if (session.user.role === "AGENT") return { agentId: session.user.agentId ?? undefined };
  throw new AuthzError("Not permitted", 403);
}

export async function assertCanAccessProposal(proposalId: string) {
  const session = await requireSession();
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN") return { session, proposal };
  if (session.user.role === "AGENT" && proposal.agentId === session.user.agentId) {
    return { session, proposal };
  }
  if (session.user.role === "CLIENT" && proposal.clientId === session.user.clientId) {
    return { session, proposal };
  }
  throw new AuthzError("You do not have access to this proposal", 403);
}

export async function assertCanAccessTask(taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN") return { session, task };
  if (session.user.role === "AGENT" && task.agentId === session.user.agentId) {
    return { session, task };
  }
  throw new AuthzError("You do not have access to this task", 403);
}

/**
 * IT Support ticket access:
 *  - ADMIN: sees everything.
 *  - IT_SUPPORT: sees everything (the whole point of the panel), but never
 *    other Admin/Agent/Client modules — enforced by simply not exposing them.
 *  - AGENT: only tickets they raised or are assigned to.
 *  - CLIENT: only tickets they raised.
 */
export async function assertCanAccessTicket(ticketId: string) {
  const session = await requireSession();
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AuthzError("Not found", 404);

  if (session.user.role === "ADMIN" || session.user.role === "IT_SUPPORT") return { session, ticket };
  if (
    session.user.role === "AGENT" &&
    (ticket.raisedById === session.user.id || ticket.assignedAgentId === session.user.agentId)
  ) {
    return { session, ticket };
  }
  if (session.user.role === "CLIENT" && ticket.raisedById === session.user.id) {
    return { session, ticket };
  }
  throw new AuthzError("You do not have access to this support ticket", 403);
}

export function toApiError(err: unknown) {
  if (err instanceof AuthzError) return { status: err.status, message: err.message };
  console.error(err);
  return { status: 500, message: "Internal server error" };
}

// ============================================================================
// Platform Owner / multi-tenant authorization
//
// These are the ONLY functions in the codebase that are allowed to grant
// cross-tenant access. Every other authz helper above (assertCanAccess*)
// continues to scope strictly to the caller's own agentId/clientId/org.
// ============================================================================

/**
 * Throws unless the session is PLATFORM_OWNER, has MFA verified for *this*
 * session (not just mfaEnabled=true on the account), and is active. This is
 * the hard server-side gate referenced throughout the admin console spec —
 * middleware.ts performs the same check at the edge for defense in depth,
 * but this is the one that actually matters since middleware can be
 * bypassed by calling an API route directly.
 */
export async function requirePlatformOwner() {
  const session = await requireSession();
  if (session.user.role !== "PLATFORM_OWNER") {
    throw new AuthzError("Platform Owner access required", 403);
  }
  // Every Platform Owner must have MFA enrolled AND verified this session —
  // there is no "MFA optional" path for this role. An account that somehow
  // reaches here with mfaEnabled=false is mid-enrollment at best; treat it
  // the same as unverified rather than special-casing it as "allowed".
  if (!session.user.mfaEnabled || !session.user.mfaVerified) {
    throw new AuthzError("MFA verification required", 401);
  }
  return session;
}

// tenantScope() lives in lib/tenant.ts (zero next-auth/Prisma dependency,
// so it's unit-testable in isolation) and is re-exported here so every
// existing call site can keep writing `import { tenantScope } from
// "@/lib/authz"` alongside the other authz helpers.
export { tenantScope } from "@/lib/tenant";

/**
 * Asserts a specific Organization row is one the caller is allowed to act
 * on: PLATFORM_OWNER can access any organization; everyone else must belong
 * to it. Always re-derives the caller's organizationId from the session
 * (server-verified), never from a request body/query param.
 */
export async function assertCanAccessOrganization(organizationId: string) {
  const session = await requireSession();
  if (session.user.role === "PLATFORM_OWNER") {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new AuthzError("Not found", 404);
    return { session, organization };
  }
  if (session.user.organizationId !== organizationId) {
    throw new AuthzError("You do not have access to this organization", 403);
  }
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new AuthzError("Not found", 404);
  return { session, organization };
}
