"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone } from "@/lib/status-tone";

type Commission = {
  id: string;
  sourceType: string;
  sourceId: string;
  amount: string | number;
  currency: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "REVERSED";
  createdAt: string;
  reversalReason: string | null;
  agent: { user: { name: string; email: string } };
};

const ICON_REVENUE = <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />;

function Icon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_REVENUE}
    </svg>
  );
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/commissions");
    if (res.ok) {
      const data = await res.json();
      setCommissions(data.commissions ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/agents")
      .then((r) => setIsAdmin(r.ok))
      .catch(() => setIsAdmin(false));
  }, []);

  async function act(commission: Commission, action: "APPROVE" | "REJECT" | "PAY" | "REVERSE") {
    let reason: string | undefined;
    if (action === "REJECT" || action === "REVERSE") {
      reason = window.prompt(`Reason to ${action.toLowerCase()} this commission:`) ?? undefined;
      if (!reason) return;
    }
    setBusyId(commission.id);
    await fetch(`/api/commissions/${commission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    setBusyId(null);
    load();
  }

  const totals = commissions.reduce(
    (acc, c) => {
      const amt = Number(c.amount);
      if (c.status === "PENDING") acc.pending += amt;
      if (c.status === "APPROVED") acc.approved += amt;
      if (c.status === "PAID") acc.paid += amt;
      return acc;
    },
    { pending: 0, approved: 0, paid: 0 }
  );

  return (
    <div>
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Commissions</h1>
      <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>
        {commissions.length} records — figures are live, computed from this ledger only.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Pending" value={`₹${totals.pending.toLocaleString()}`} icon={<Icon />} />
        <KpiCard label="Approved" value={`₹${totals.approved.toLocaleString()}`} icon={<Icon />} tone="accent" />
        <KpiCard label="Paid" value={`₹${totals.paid.toLocaleString()}`} icon={<Icon />} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th><th>Source</th><th>Amount</th><th>Status</th><th>Date</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: isAdmin ? 6 : 5 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && commissions.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5}>
                  <EmptyState
                    title="No commission records yet"
                    description="Commissions will populate automatically once triggers fire, or an Admin can record one manually."
                  />
                </td>
              </tr>
            )}
            {!loading && commissions.map((c) => (
              <tr key={c.id}>
                <td className="font-medium" style={{ color: "var(--text-primary)" }}>{c.agent.user.name}</td>
                <td style={{ color: "var(--text-secondary)" }}>
                  {c.sourceType} <span style={{ color: "var(--text-muted)" }}>#{c.sourceId.slice(0, 8)}</span>
                </td>
                <td style={{ color: "var(--text-primary)" }}>{c.currency} {Number(c.amount).toLocaleString()}</td>
                <td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  {c.reversalReason && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{c.reversalReason}</div>
                  )}
                </td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                {isAdmin && (
                  <td>
                    <div className="flex gap-1.5 flex-wrap">
                      {c.status === "PENDING" && (
                        <>
                          <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => act(c, "APPROVE")}>Approve</Button>
                          <Button size="sm" variant="ghost" style={{ color: "var(--danger)" }} disabled={busyId === c.id} onClick={() => act(c, "REJECT")}>Reject</Button>
                        </>
                      )}
                      {c.status === "APPROVED" && (
                        <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => act(c, "PAY")}>Mark paid</Button>
                      )}
                      {["APPROVED", "PAID"].includes(c.status) && (
                        <Button size="sm" variant="ghost" disabled={busyId === c.id} onClick={() => act(c, "REVERSE")}>Reverse</Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
