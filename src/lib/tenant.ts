/**
 * Pure multi-tenant scoping helpers. Deliberately has NO dependency on
 * next-auth or Prisma — it only operates on the plain shape of
 * `session.user` — so it can be unit tested in isolation (see
 * __tests__/tenant-scope.test.ts) without pulling in the whole auth chain,
 * and so there's exactly one place this logic can drift from correct.
 */

export type TenantAwareUser = {
  role: string;
  organizationId?: string | null;
};

export type TenantAwareSession = { user: TenantAwareUser };

/**
 * Returns the caller's tenant scope for use in a Prisma `where` clause.
 * PLATFORM_OWNER gets `{}` (no filter — intentionally platform-wide) ONLY
 * when `allowPlatformWide` is explicitly passed; every other caller,
 * PLATFORM_OWNER included by default, is always scoped to their own
 * organizationId — including when it's null (legacy/ABYVORA-internal
 * rows), which Prisma matches with `organizationId: null` rather than
 * accidentally matching everything.
 *
 * This exists so list/aggregate endpoints can't forget to scope a query —
 * `where: { ...tenantScope(session), status: "ACTIVE" }` is the pattern,
 * never spreading a client-supplied organizationId into a query.
 */
export function tenantScope(
  session: TenantAwareSession,
  opts: { allowPlatformWide?: boolean } = {}
): { organizationId?: string | null } {
  if (session.user.role === "PLATFORM_OWNER" && opts.allowPlatformWide) {
    return {};
  }
  return { organizationId: session.user.organizationId ?? null };
}
