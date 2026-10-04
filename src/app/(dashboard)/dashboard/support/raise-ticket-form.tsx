"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "LOGIN_AND_AUTHENTICATION", "ACCOUNT_ACCESS", "PROJECT_PORTAL", "PAYMENT_TECHNICAL_ISSUE",
  "DOCUMENT_UPLOAD_DOWNLOAD", "PROJECT_CHAT", "NOTIFICATIONS", "WEBSITE_AUDIT", "WEBSITE_ERROR",
  "PERFORMANCE", "BUG_REPORT", "SECURITY_CONCERN", "OTHER",
];

export function RaiseTicketForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, description }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create ticket.");
      return;
    }
    setOpen(false);
    setTitle("");
    setDescription("");
    router.refresh();
    router.push(`/dashboard/support/${data.ticket.id}`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary text-sm px-3 py-1.5">
        Raise a complaint
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="panel p-4 space-y-3 mb-4">
      {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      <div>
        <label className="field-label">Title</label>
        <input required className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label className="field-label">Category</label>
        <select className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Describe the issue</label>
        <textarea required minLength={10} rows={4} className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary text-sm px-3 py-1.5">
          {loading ? "Submitting…" : "Submit ticket"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
