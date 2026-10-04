import { requirePlatformOwner } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AbyvoraLogo } from "@/components/brand/abyvora-logo";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 2 checkpoint page.
 *
 * This intentionally does NOT attempt to be the full "Super Admin HMPG"
 * dashboard yet — building that against fabricated data would violate the
 * "no fake dashboard" requirement. What it proves instead: the auth
 * boundary is real end-to-end (role check + MFA enforcement), and the one
 * number shown is a genuine live COUNT query against the new Organization
 * table, not a placeholder.
 */
export default async function AdminHomePage() {
  const session = await requirePlatformOwner();
  const organizationCount = await prisma.organization.count();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <AbyvoraLogo variant="mark" height={40} className="mb-6" />
      <Badge tone="success" className="mb-4">Platform Owner boundary — online</Badge>
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Signed in as {session.user.name}
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--text-secondary)" }}>
        Role: {session.user.role} · MFA verified this session · organizationId: {session.user.organizationId ?? "null (platform-wide)"}
      </p>
      <div className="panel p-5 max-w-sm">
        <div className="field-label">Organizations (live count)</div>
        <div className="text-[28px] font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
          {organizationCount}
        </div>
      </div>
      <p className="text-[12px] mt-8 max-w-md" style={{ color: "var(--text-muted)" }}>
        This is the Phase 2 authorization-boundary checkpoint, not the final dashboard.
        Organizations management, the full KPI/analytics dashboard, and the sidebar from the
        reference screenshot are built in the next phase on top of this boundary.
      </p>
    </div>
  );
}
