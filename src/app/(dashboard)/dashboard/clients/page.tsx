"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type ClientRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  country: string | null;
  assignedAgent: { user: { name: string } } | null;
  projects: { id: string; name: string; status: string }[];
  createdAt: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(query = "") {
    setLoading(true);
    const res = await fetch(`/api/clients${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const data = await res.json();
    setClients(data.clients ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Clients</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${clients.length} total`}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            placeholder="Search by name, email, company…"
            className="w-full sm:w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(q)}
          />
          <Button variant="secondary" onClick={() => load(q)}>Search</Button>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Company</th>
              <th>Country</th>
              <th>Agent</th>
              <th>Projects</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><Skeleton className="h-4 w-full max-w-[140px]" /></td>
                  ))}
                </tr>
              ))}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No clients yet"
                    description="Clients will appear here once leads convert or accounts are created."
                    icon={
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 20v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M7 20v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                      </svg>
                    }
                  />
                </td>
              </tr>
            )}
            {!loading &&
              clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-2.5 group">
                      <Avatar name={c.name} size={30} />
                      <span>
                        <span className="font-medium group-hover:underline block" style={{ color: "var(--text-primary)" }}>
                          {c.name}
                        </span>
                        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{c.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{c.company || "—"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{c.country || "—"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{c.assignedAgent?.user?.name || "Unassigned"}</td>
                  <td>
                    <Badge tone={c.projects.length > 0 ? "accent" : "neutral"}>{c.projects.length}</Badge>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
