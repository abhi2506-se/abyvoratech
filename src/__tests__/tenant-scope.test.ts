import { describe, it, expect } from "vitest";
import { tenantScope } from "@/lib/tenant";

/**
 * tenantScope() is a pure function over a session-shaped object (no DB
 * access), so it's safe to unit test directly with fake sessions rather
 * than needing a Prisma/auth() mock. This is the function every tenant-
 * scoped list/aggregate query is supposed to spread into its `where`
 * clause, so its correctness directly protects cross-tenant isolation.
 */
function fakeSession(role: string, organizationId: string | null) {
  return { user: { role, organizationId } } as any;
}

describe("tenantScope", () => {
  it("scopes an Organization-tenant user to their own organizationId", () => {
    const session = fakeSession("ORG_ADMIN", "org_123");
    expect(tenantScope(session)).toEqual({ organizationId: "org_123" });
  });

  it("scopes a legacy/ABYVORA-internal user (organizationId null) to null, not to everything", () => {
    const session = fakeSession("ADMIN", null);
    expect(tenantScope(session)).toEqual({ organizationId: null });
  });

  it("PLATFORM_OWNER is still scoped to their own organizationId (null) by default", () => {
    const session = fakeSession("PLATFORM_OWNER", null);
    expect(tenantScope(session)).toEqual({ organizationId: null });
  });

  it("PLATFORM_OWNER only gets an unscoped (platform-wide) query when explicitly opted in", () => {
    const session = fakeSession("PLATFORM_OWNER", null);
    expect(tenantScope(session, { allowPlatformWide: true })).toEqual({});
  });

  it("a non-PLATFORM_OWNER role passing allowPlatformWide:true is still scoped (opt-in is role-gated, not caller-controlled)", () => {
    const session = fakeSession("ORG_OWNER", "org_456");
    expect(tenantScope(session, { allowPlatformWide: true })).toEqual({ organizationId: "org_456" });
  });
});
