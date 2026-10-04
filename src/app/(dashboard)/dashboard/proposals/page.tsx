"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone, formatStatus } from "@/lib/status-tone";

type Proposal = {
  id: string;
  title: string;
  amount: string | number | null;
  currency: string;
  status: string;
  version: number;
  createdAt: string;
  agent: { user: { name: string } };
  lead: { name: string } | null;
  client: { name: string } | null;
};

const NEXT_STATUS: Record<string, string[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["SENT", "CANCELLED"],
  SENT: ["VIEWED", "ACCEPTED", "REJECTED", "CHANGE_REQUESTED"],
  VIEWED: ["ACCEPTED", "REJECTED", "CHANGE_REQUESTED"],
  CHANGE_REQUESTED: ["READY", "CANCELLED"],
};

export default function ProposalsPage() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === "CLIENT";
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", currency: "INR" });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Proposal | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/proposals");
    if (res.ok) {
      const data = await res.json();
      setProposals(data.proposals ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        amount: form.amount ? Number(form.amount) : undefined,
        currency: form.currency,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create proposal");
      return;
    }
    setForm({ title: "", amount: "", currency: "INR" });
    setShowForm(false);
    load();
  }

  async function setStatus(proposal: Proposal, status: string, termsAccepted?: boolean) {
    setBusyId(proposal.id);
    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(termsAccepted !== undefined ? { termsAccepted } : {}) }),
    });
    setBusyId(null);
    setConfirming(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update proposal");
      return;
    }
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Proposals</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${proposals.length} total`}
          </p>
        </div>
        {!isClient && (
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? "Cancel" : "+ New proposal"}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs mb-4 p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {showForm && !isClient && (
        <form onSubmit={handleCreate} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <Label>Title</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit">Create draft</Button>
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              {!isClient && <th>Lead / Client</th>}
              <th>{isClient ? "From" : "Agent"}</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: isClient ? 5 : 6 }).map((__, j) => (
                    <td key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  ))}
                </tr>
              ))}
            {!loading && proposals.length === 0 && (
              <tr>
                <td colSpan={isClient ? 5 : 6}>
                  <EmptyState title={isClient ? "You have no proposals yet" : "No proposals yet"} />
                </td>
              </tr>
            )}
            {!loading && proposals.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{p.title}</span>{" "}
                  <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>v{p.version}</span>
                </td>
                {!isClient && <td style={{ color: "var(--text-secondary)" }}>{p.lead?.name ?? p.client?.name ?? "—"}</td>}
                <td style={{ color: "var(--text-secondary)" }}>{p.agent.user.name}</td>
                <td style={{ color: "var(--text-secondary)" }}>
                  {p.amount ? `${p.currency} ${Number(p.amount).toLocaleString()}` : "—"}
                </td>
                <td><Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge></td>
                <td>
                  {isClient ? (
                    ["SENT", "VIEWED"].includes(p.status) && (
                      <div className="flex gap-1.5 flex-wrap">
                        <Button size="sm" disabled={busyId === p.id} onClick={() => setConfirming(p)}>Accept</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => setStatus(p, "CHANGE_REQUESTED")}>
                          Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === p.id}
                          style={{ color: "var(--danger)" }}
                          onClick={() => {
                            if (confirm("Reject this proposal?")) setStatus(p, "REJECTED");
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {(NEXT_STATUS[p.status] ?? []).map((next) => (
                        <Button key={next} size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => setStatus(p, next)}>
                          {formatStatus(next)}
                        </Button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Confirm acceptance"
        footer={
          confirming && (
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button disabled={busyId === confirming.id} onClick={() => setStatus(confirming, "ACCEPTED", true)}>
                {busyId === confirming.id ? "Confirming…" : "I accept these terms"}
              </Button>
            </>
          )
        }
      >
        {confirming && (
          <div className="text-[13.5px] space-y-2">
            <p style={{ color: "var(--text-primary)" }}>
              You&apos;re accepting <strong>{confirming.title}</strong> (v{confirming.version})
              {confirming.amount ? ` for ${confirming.currency} ${Number(confirming.amount).toLocaleString()}` : ""}.
            </p>
            <p style={{ color: "var(--text-secondary)" }}>
              This confirms the proposal terms. Payment confirms the selected transaction only — project
              commencement is subject to official Admin approval and applicable service terms.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
