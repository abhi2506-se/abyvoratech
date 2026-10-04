"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone, formatStatus } from "@/lib/status-tone";

type Lead = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  score: number;
  createdAt: string;
  agent: { user: { name: string } } | null;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", country: "", source: "" });
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create lead");
      return;
    }
    setForm({ name: "", email: "", phone: "", company: "", country: "", source: "" });
    setShowForm(false);
    load();
  }

  async function handleConvert(id: string) {
    setConverting(id);
    const res = await fetch(`/api/leads/${id}/convert`, { method: "POST" });
    setConverting(null);
    if (res.ok) load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Leads</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${leads.length} total`}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
          {showForm ? "Cancel" : "+ New lead"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {error && (
            <p className="sm:col-span-3 text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>
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
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div>
            <Label>Source</Label>
            <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit">Save lead</Button>
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Lead</th><th>Company</th><th>Agent</th><th>Status</th><th>Score</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No leads yet" description="Create your first one to get started." /></td></tr>
            )}
            {!loading && leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={lead.name} size={28} />
                    <span>
                      <span className="font-medium block" style={{ color: "var(--text-primary)" }}>{lead.name}</span>
                      <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{lead.email}</span>
                    </span>
                  </div>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{lead.company || "—"}</td>
                <td style={{ color: "var(--text-secondary)" }}>{lead.agent?.user?.name || "Unassigned"}</td>
                <td><Badge tone={statusTone(lead.status)}>{formatStatus(lead.status)}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{lead.score}</td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(lead.createdAt).toLocaleDateString()}</td>
                <td>
                  {lead.status !== "CONVERTED" && (
                    <Button size="sm" variant="secondary" disabled={converting === lead.id} onClick={() => handleConvert(lead.id)}>
                      {converting === lead.id ? "Converting…" : "Convert to client"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
