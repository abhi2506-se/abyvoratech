"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type AgentRow = {
  id: string;
  designation: string | null;
  user: { id: string; name: string; email: string; phone: string | null; status: string };
  _count: { leads: number; clients: number; projects: number };
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", designation: "" });
  const [error, setError] = useState<string | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/agents");
    if (res.ok) {
      const data = await res.json();
      setAgents(data.agents ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create agent");
      return;
    }
    setNewCredentials({ email: form.email, password: data.tempPassword });
    setForm({ name: "", email: "", phone: "", designation: "" });
    setShowForm(false);
    load();
  }

  async function toggleStatus(agent: AgentRow) {
    setBusyId(agent.id);
    const nextStatus = agent.user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Agents</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${agents.length} total`}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
          {showForm ? "Cancel" : "+ New agent"}
        </Button>
      </div>

      {newCredentials && (
        <div className="panel p-4 mb-5" style={{ borderColor: "var(--accent)" }}>
          <p className="text-[13.5px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            Agent created — share these credentials securely (shown once):
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Email: <strong>{newCredentials.email}</strong> · Temporary password: <strong className="font-mono">{newCredentials.password}</strong>
          </p>
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => setNewCredentials(null)}>Dismiss</Button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {error && (
            <p className="sm:col-span-2 text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>
          )}
          <div>
            <Label>Name *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Designation</Label>
            <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Create agent</Button>
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th><th>Designation</th><th>Leads</th><th>Clients</th><th>Projects</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && agents.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No agents yet" /></td></tr>
            )}
            {!loading && agents.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={a.user.name} size={30} />
                    <span>
                      <span className="font-medium block" style={{ color: "var(--text-primary)" }}>{a.user.name}</span>
                      <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{a.user.email}</span>
                    </span>
                  </div>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{a.designation || "—"}</td>
                <td style={{ color: "var(--text-secondary)" }}>{a._count.leads}</td>
                <td style={{ color: "var(--text-secondary)" }}>{a._count.clients}</td>
                <td style={{ color: "var(--text-secondary)" }}>{a._count.projects}</td>
                <td><Badge tone={a.user.status === "ACTIVE" ? "success" : "danger"}>{a.user.status}</Badge></td>
                <td>
                  <Button size="sm" variant="secondary" disabled={busyId === a.id} onClick={() => toggleStatus(a)}>
                    {busyId === a.id ? "…" : a.user.status === "ACTIVE" ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
