import { ThemeToggle } from "@/components/theme/theme-toggle";
import { MobileNav } from "./mobile-nav";
import { NotificationBell } from "@/app/(dashboard)/notification-bell";

export function Topbar({
  userName,
  role,
  roleLabel,
  onSignOut,
}: {
  userName: string;
  role: string;
  roleLabel: string;
  onSignOut: () => Promise<void>;
}) {
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="app-topbar sticky top-0 z-40 px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <MobileNav role={role} roleLabel={roleLabel} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            ABYVORA
          </div>
          <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
            {roleLabel}
          </div>
        </div>
      </div>

      <div className="hidden lg:flex items-center flex-1 max-w-sm">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3.5 py-2 rounded-full text-[12.5px] transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--surface)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span>Search…</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2">
        <a
          href="/dashboard/website-audit"
          title="AI Assistant"
          aria-label="AI Assistant"
          className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--accent)", background: "var(--surface)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3 1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3ZM19 15l.9 2.4L22 18l-2.1.9-.9 2.1-.9-2.1L16 18l2.1-.6.9-2.4Z" />
          </svg>
        </a>

        <NotificationBell />
        <ThemeToggle />

        <div className="w-px h-6 hidden sm:block" style={{ background: "var(--border)" }} />

        <div className="flex items-center gap-2 pl-0.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initials || "U"}
          </div>
          <div className="hidden md:block leading-tight">
            <div className="text-[12.5px] font-medium truncate max-w-[110px]" style={{ color: "var(--text-primary)" }}>
              {userName}
            </div>
            <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>{role}</div>
          </div>
        </div>

        <form action={onSignOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </form>
      </div>
    </header>
  );
}
