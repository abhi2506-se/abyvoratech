import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import type { AuditActorRole, AuditStatus, Role } from "@prisma/client";

export type AuditEventInput = {
  /** Null for system/webhook/background-job events with no human actor. */
  actorId: string | null;
  // Prisma generates `Role` and `AuditActorRole` as distinct nominal enum
  // types even though their members are identical strings (ADMIN/AGENT/
  // CLIENT/IT_SUPPORT), plus "SYSTEM" for webhook/background events with no
  // human actor. Accepting the union here — instead of AuditActorRole alone —
  // means every call site can just pass `session.user.role` (typed `Role`)
  // directly, which is what ~60 routes across the app already do.
  actorRole: Role | AuditActorRole | "SYSTEM";
  /** Human-readable action key, e.g. "lead.status_changed", "email.sent" */
  action: string;
  entityType: string;
  entityId?: string;
  /** One-line human-readable summary, e.g. "Prashant Rajput changed Lead status" */
  description?: string;
  previousValue?: unknown;
  newValue?: unknown;
  status?: AuditStatus;
  errorDetail?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Best-effort capture of request IP/User-Agent from the current request's
 * headers. Safe to call from Server Actions and Route Handlers alike; returns
 * nulls if headers() isn't available in the current context (e.g. background jobs).
 */
export async function captureRequestContext() {
  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : h.get("x-real-ip");
    const userAgent = h.get("user-agent");
    return { ipAddress: ipAddress ?? null, userAgent: userAgent ?? null };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Centralized audit event writer. Every meaningful action in the platform
 * (agent or admin) should route through this instead of ad-hoc log tables,
 * so the Admin Audit Logs page has one consistent, queryable source.
 *
 * Denormalizes actor name/email onto the row at write time so historical
 * entries remain readable even if the User record changes later.
 */
export async function writeAuditLog(event: AuditEventInput) {
  const actor = event.actorId
    ? await prisma.user.findUnique({
        where: { id: event.actorId },
        select: { name: true, email: true },
      })
    : null;

  let ctx: { ipAddress: string | null; userAgent: string | null } = {
    ipAddress: null,
    userAgent: null,
  };
  if (event.ipAddress === undefined && event.userAgent === undefined) {
    ctx = await captureRequestContext();
  }

  return prisma.auditLog.create({
    data: {
      actorId: event.actorId,
      // Safe cast: AuditActorRole's members (ADMIN/AGENT/CLIENT/IT_SUPPORT/
      // SYSTEM) are a strict superset of Role's, so every possible value of
      // the union above maps to a real AuditActorRole member.
      actorRole: event.actorRole as AuditActorRole,
      actorName: actor?.name ?? (event.actorId ? null : "System"),
      actorEmail: actor?.email ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      description: event.description ?? null,
      previousValue: (event.previousValue as any) ?? undefined,
      newValue: (event.newValue as any) ?? undefined,
      status: event.status ?? "SUCCESS",
      errorDetail: event.errorDetail ?? null,
      metadata: (event.metadata as any) ?? undefined,
      ipAddress: event.ipAddress ?? ctx.ipAddress,
      userAgent: event.userAgent ?? ctx.userAgent,
    },
  });
}

/** Convenience wrapper for recording a failed/blocked action, e.g. an IDOR attempt. */
export async function writeAuditFailure(
  event: Omit<AuditEventInput, "status"> & { errorDetail: string }
) {
  return writeAuditLog({ ...event, status: "FAILED" });
}
