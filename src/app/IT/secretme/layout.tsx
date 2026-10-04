import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotificationBell } from "../../(dashboard)/notification-bell";

export default async function ITLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Belt-and-braces: middleware already gates this, but a server component
  // guard means this layout is safe even if it's ever reached another way.
  if (!session || session.user.role !== "IT_SUPPORT") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--slate-bg)" }}>
      <aside className="w-56 shrink-0 p-4 flex flex-col" style={{ background: "var(--navy-deep)", color: "white" }}>
        <div className="text-sm font-semibold mb-1">IT Support</div>
        <div className="text-xs mb-6 opacity-70">{session.user.name}</div>
        <nav className="flex-1 space-y-1 text-sm">
          <Link href="/IT/secretme" className="block px-2 py-1.5 rounded hover:bg-white/10">Dashboard</Link>
          <Link href="/IT/secretme?status=FORWARDED_TO_IT" className="block px-2 py-1.5 rounded hover:bg-white/10">New Complaints</Link>
          <Link href="/IT/secretme?status=IT_IN_PROGRESS" className="block px-2 py-1.5 rounded hover:bg-white/10">In Progress</Link>
          <Link href="/IT/secretme?priority=HIGH" className="block px-2 py-1.5 rounded hover:bg-white/10">High Priority</Link>
          <Link href="/IT/secretme?status=RESOLVED" className="block px-2 py-1.5 rounded hover:bg-white/10">Resolved</Link>
          <Link href="/IT/secretme?status=CLOSED" className="block px-2 py-1.5 rounded hover:bg-white/10">Closed</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-white/10">
            Sign out
          </button>
        </form>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-end px-6 py-3" style={{ borderBottom: "1px solid var(--line)", background: "white" }}>
          <NotificationBell />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
