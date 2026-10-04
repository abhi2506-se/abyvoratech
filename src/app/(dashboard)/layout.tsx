import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const banner =
    role === "CLIENT" && !session.user.isEmailVerified ? (
      <div
        className="mb-5 px-4 py-3 text-[13px] flex flex-wrap items-center justify-between gap-2 abv-fade-in"
        style={{
          background: "var(--warning-soft)",
          border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-primary)",
        }}
      >
        <span>Please verify your email address to unlock all Client Portal features.</span>
        <a href="/dashboard/profile" className="font-semibold underline" style={{ color: "var(--warning)" }}>
          Resend verification
        </a>
      </div>
    ) : null;

  return (
    <AppShell role={role} userName={session.user.name} onSignOut={handleSignOut} banner={banner}>
      {children}
    </AppShell>
  );
}
