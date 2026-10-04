import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  AGENT: "Agent workspace",
  CLIENT: "Client portal",
  IT_SUPPORT: "IT support",
};

export function AppShell({
  role,
  userName,
  onSignOut,
  banner,
  children,
}: {
  role: string;
  userName: string;
  onSignOut: () => Promise<void>;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar role={role} roleLabel={roleLabel} />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar userName={userName} role={role} roleLabel={roleLabel} onSignOut={onSignOut} />
        <main className="flex-1 p-4 md:p-7 max-w-[1600px] w-full mx-auto">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
