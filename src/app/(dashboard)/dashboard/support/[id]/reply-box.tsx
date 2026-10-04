"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplyBox({ ticketId, canPostInternal }: { ticketId: string; canPostInternal: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim(), isInternal }),
    });
    setLoading(false);
    if (res.ok) {
      setMessage("");
      router.refresh();
    } else {
      alert((await res.json()).error || "Could not send message");
    }
  }

  return (
    <form onSubmit={submit} className="panel p-3 space-y-2">
      <textarea
        className="field-input text-sm"
        rows={3}
        placeholder={isInternal ? "Internal note (not visible to the client)…" : "Write a reply…"}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex items-center justify-between">
        {canPostInternal ? (
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-muted)" }}>
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            Internal note (Admin/IT Support only)
          </label>
        ) : <span />}
        <button type="submit" disabled={loading} className="btn-primary text-xs px-3 py-1.5">
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
