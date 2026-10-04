"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AbyvoraMark } from "@/components/brand/abyvora-logo";

export type NavItem = {
  href: string;
  label: string;
  roles: string[];
  group: string;
  icon: keyof typeof ICONS;
};

const ICONS = {
  dashboard: (
    <path d="M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z" />
  ),
  clients: (
    <path d="M17 20v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M7 20v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
  ),
  projects: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  tasks: (
    <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  ),
  proposals: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h6M9 9h1" />
  ),
  payments: (
    <path d="M2 9h20M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Zm4 9h4" />
  ),
  invoices: (
    <path d="M4 2h12l4 4v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm4 8h8M8 14h8M8 18h5" />
  ),
  email: (
    <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm0 0 8 9 8-9" />
  ),
  support: (
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  ),
  notifications: (
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  ),
  ai: (
    <path d="m12 3 1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3ZM19 15l.9 2.4L22 18l-2.1.9-.9 2.1-.9-2.1L16 18l2.1-.6.9-2.4ZM4 15l.9 2.4L7 18l-2.1.9L4 21l-.9-2.1L1 18l2.1-.6L4 15Z" />
  ),
  audit: (
    <path d="M9 12h6M9 16h6M9 8h6M5 21h14a2 2 0 0 0 2-2V7l-5-5H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2Z" />
  ),
  settings: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 1-.1 1.2l2.1 1.6-2 3.5-2.5-1a7.6 7.6 0 0 1-2 1.2l-.4 2.6h-4l-.4-2.6a7.6 7.6 0 0 1-2-1.2l-2.5 1-2-3.5 2.1-1.6a7.4 7.4 0 0 1 0-2.4L2.7 9.6l2-3.5 2.5 1a7.6 7.6 0 0 1 2-1.2L9.6 3h4l.4 2.6a7.6 7.6 0 0 1 2 1.2l2.5-1 2 3.5-2.1 1.6c.1.4.1.8.1 1.1Z" />
  ),
  agents: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 4 2 2 4-4" />
  ),
  commissions: (
    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  ),
  analytics: (
    <path d="M3 3v18h18M7 15l4-5 3 3 5-7" />
  ),
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "AGENT", "CLIENT"], group: "Overview", icon: "dashboard" },

  { href: "/dashboard/leads", label: "Leads", roles: ["ADMIN", "AGENT"], group: "Workspace", icon: "clients" },
  { href: "/dashboard/clients", label: "Clients", roles: ["ADMIN", "AGENT"], group: "Workspace", icon: "clients" },
  { href: "/dashboard/projects", label: "Projects", roles: ["ADMIN", "AGENT", "CLIENT"], group: "Workspace", icon: "projects" },
  { href: "/dashboard/tasks", label: "Follow-ups", roles: ["ADMIN", "AGENT"], group: "Workspace", icon: "tasks" },
  { href: "/dashboard/proposals", label: "Proposals", roles: ["ADMIN", "AGENT", "CLIENT"], group: "Workspace", icon: "proposals" },
  { href: "/dashboard/payments", label: "Payments", roles: ["ADMIN", "CLIENT"], group: "Workspace", icon: "payments" },
  { href: "/dashboard/refunds", label: "Refunds", roles: ["ADMIN", "CLIENT"], group: "Workspace", icon: "payments" },
  { href: "/dashboard/invoices", label: "Invoices", roles: ["ADMIN", "CLIENT"], group: "Workspace", icon: "invoices" },

  { href: "/dashboard/emails", label: "Email Activity", roles: ["ADMIN", "AGENT"], group: "Communication", icon: "email" },
  { href: "/dashboard/emails/compose", label: "Compose Email", roles: ["AGENT"], group: "Communication", icon: "email" },
  { href: "/dashboard/support", label: "Support", roles: ["ADMIN", "AGENT", "CLIENT"], group: "Communication", icon: "support" },
  { href: "/dashboard/support/personnel", label: "IT Support Personnel", roles: ["ADMIN"], group: "Communication", icon: "support" },

  { href: "/dashboard/website-audit", label: "Website Audit", roles: ["ADMIN", "AGENT", "CLIENT"], group: "Intelligence", icon: "ai" },

  { href: "/dashboard/commissions", label: "Commissions", roles: ["ADMIN", "AGENT"], group: "Administration", icon: "commissions" },
  { href: "/dashboard/commission-rules", label: "Commission Rules", roles: ["ADMIN"], group: "Administration", icon: "commissions" },
  { href: "/dashboard/agents", label: "Agents", roles: ["ADMIN"], group: "Administration", icon: "agents" },
  { href: "/dashboard/audit-logs", label: "Audit Logs", roles: ["ADMIN"], group: "Administration", icon: "audit" },
  { href: "/dashboard/settings/email", label: "Email Settings", roles: ["ADMIN"], group: "Administration", icon: "settings" },
  { href: "/dashboard/settings/ai", label: "AI Settings", roles: ["ADMIN"], group: "Administration", icon: "settings" },
  { href: "/dashboard/profile", label: "Profile & Settings", roles: ["CLIENT"], group: "Administration", icon: "settings" },
];

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      {ICONS[name]}
    </svg>
  );
}

export function Sidebar({ role, roleLabel }: { role: string; roleLabel: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("abyvora-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem("abyvora-sidebar-collapsed", !prev ? "1" : "0");
      return !prev;
    });
  }

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <aside
      className="app-sidebar hidden md:flex flex-col shrink-0 transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 264 }}
    >
      <div className="brand px-5 py-5 flex items-center gap-3" style={{ minHeight: 68 }}>
        {collapsed ? (
          <AbyvoraMark size={28} />
        ) : (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <AbyvoraMark size={30} />
            <div className="leading-tight">
              <div className="text-white font-semibold text-[13.5px] tracking-wide">ABYVORA</div>
              <div className="text-[10px]" style={{ color: "var(--sidebar-text)" }}>{roleLabel}</div>
            </div>
          </div>
        )}
      </div>

      <nav className="app-nav py-3 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group} className="mb-2">
            {!collapsed && (
              <div
                className="px-5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)", opacity: 0.7 }}
              >
                {group}
              </div>
            )}
            {items
              .filter((i) => i.group === group)
              .map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "active" : ""}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon name={item.icon} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        className="mx-3 mb-3 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-medium transition-colors"
        style={{ color: "var(--sidebar-text)", background: "rgba(255,255,255,0.04)" }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: collapsed ? "rotate(180deg)" : "none" }}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
