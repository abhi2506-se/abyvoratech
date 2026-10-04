"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AbyvoraMark } from "@/components/brand/abyvora-logo";
import { NAV_ITEMS } from "./sidebar";

export function MobileNav({ role, roleLabel }: { role: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="w-9 h-9 inline-flex items-center justify-center rounded-full"
        style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex abv-fade-in">
          <div className="absolute inset-0" style={{ background: "rgba(9,10,12,0.5)" }} onClick={() => setOpen(false)} />
          <div
            className="relative w-72 max-w-[80vw] h-full flex flex-col app-sidebar"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="brand px-5 py-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AbyvoraMark size={28} />
                <div className="leading-tight">
                  <div className="text-white font-semibold text-[13px]">ABYVORA</div>
                  <div className="text-[10px]" style={{ color: "var(--sidebar-text)" }}>{roleLabel}</div>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" style={{ color: "var(--sidebar-text)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="app-nav py-3 flex-1 overflow-y-auto">
              {groups.map((group) => (
                <div key={group} className="mb-2">
                  <div className="px-5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                    {group}
                  </div>
                  {items
                    .filter((i) => i.group === group)
                    .map((item) => {
                      const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                      return (
                        <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
