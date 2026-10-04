import { requirePlatformOwner } from "@/lib/authz";
import { redirect } from "next/navigation";
import { AuthzError } from "@/lib/authz";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  // Hard server-side gate — this is the check that actually matters.
  // middleware.ts does the same check at the edge purely so a
  // not-yet-authorized user gets redirected before a page even starts
  // rendering, but this call is what a direct API/RSC request can't bypass.
  try {
    await requirePlatformOwner();
  } catch (err) {
    if (err instanceof AuthzError && err.status === 401) {
      redirect("/admin/mfa");
    }
    redirect("/dashboard");
  }

  return <div style={{ background: "var(--bg)", minHeight: "100vh" }}>{children}</div>;
}
