"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefundAdminActions({ refundId, status }: { refundId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function approve() {
    if (!confirm("Approve this refund and initiate it with Razorpay?")) return;
    setLoading("approve");
    const res = await fetch(`/api/refunds/${refundId}/approve`, { method: "POST" });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to approve refund");
  }

  async function reject() {
    const reason = prompt("Reason for rejecting this refund (required):");
    if (!reason?.trim()) return;
    setLoading("reject");
    const res = await fetch(`/api/refunds/${refundId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to reject refund");
  }

  async function retry() {
    setLoading("retry");
    const res = await fetch(`/api/refunds/${refundId}/retry`, { method: "POST" });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to retry refund");
  }

  if (status === "REQUESTED") {
    return (
      <div className="flex gap-2">
        <button onClick={approve} disabled={!!loading} className="btn-primary text-xs px-2 py-1">
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button onClick={reject} disabled={!!loading} className="btn-secondary text-xs px-2 py-1" style={{ color: "var(--danger)" }}>
          Reject
        </button>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <button onClick={retry} disabled={!!loading} className="btn-secondary text-xs px-2 py-1">
        {loading === "retry" ? "Retrying…" : "Retry"}
      </button>
    );
  }

  return null;
}
