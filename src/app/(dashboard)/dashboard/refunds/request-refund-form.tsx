"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestRefundForm({ projectId, paymentId }: { projectId: string; paymentId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, paymentId, reason }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not submit refund request.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary text-xs px-3 py-1.5">
        Request refund / cancellation
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="panel p-3 space-y-2 mt-2">
      {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      <textarea
        required
        minLength={10}
        placeholder="Tell us why you're requesting a refund or cancellation (min 10 characters)"
        className="field-input text-xs"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
        Refund eligibility depends on project stage and completed work, per our refund policy. This
        request will be reviewed by an Admin before any refund is issued.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary text-xs px-3 py-1.5">
          {loading ? "Submitting…" : "Submit request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
