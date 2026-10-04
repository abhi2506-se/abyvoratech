"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ITControls({ ticketId, status, priority }: { ticketId: string; status: string; priority: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [estValue, setEstValue] = useState("");
  const [estUnit, setEstUnit] = useState("HOURS");
  const [estNote, setEstNote] = useState("");

  async function call(url: string, body?: any, method = "POST") {
    setLoading(url);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Action failed");
  }

  return (
    <div className="panel p-4 space-y-4 mb-4">
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>Priority:</span>
        {["LOW", "MEDIUM", "HIGH"].map((p) => (
          <button
            key={p}
            disabled={!!loading || p === priority}
            onClick={() => call(`/api/support/tickets/${ticketId}/priority`, { priority: p }, "PATCH")}
            className={p === priority ? "btn-primary text-xs px-2 py-1" : "btn-secondary text-xs px-2 py-1"}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>Estimate:</span>
        <input className="field-input w-16 text-xs py-1" placeholder="2" value={estValue} onChange={(e) => setEstValue(e.target.value)} />
        <select className="field-input w-auto text-xs py-1" value={estUnit} onChange={(e) => setEstUnit(e.target.value)}>
          <option value="MINUTES">Minutes</option>
          <option value="HOURS">Hours</option>
          <option value="DAYS">Days</option>
        </select>
        <input className="field-input flex-1 text-xs py-1" placeholder="Reason / note" value={estNote} onChange={(e) => setEstNote(e.target.value)} />
        <button
          disabled={!estValue || !!loading}
          onClick={() => call(`/api/support/tickets/${ticketId}/estimate`, { estimateValue: estValue, estimateUnit: estUnit, estimateNote: estNote || undefined }, "PATCH")}
          className="btn-secondary text-xs px-2 py-1"
        >
          Update
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "FORWARDED_TO_IT" && (
          <button disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/status`, { status: "IT_IN_PROGRESS" })} className="btn-primary text-xs px-2 py-1">
            Accept & start work
          </button>
        )}
        {status === "IT_IN_PROGRESS" && (
          <>
            <button
              disabled={!!loading}
              onClick={() => {
                const note = prompt("What are you waiting on from the user? (required)");
                if (note?.trim()) call(`/api/support/tickets/${ticketId}/status`, { status: "WAITING_FOR_USER", note: note.trim() });
              }}
              className="btn-secondary text-xs px-2 py-1"
            >
              Waiting on user
            </button>
            <button
              disabled={!!loading}
              onClick={() => {
                const summary = prompt("Resolution summary (required):");
                if (summary?.trim()) call(`/api/support/tickets/${ticketId}/resolve`, { resolutionSummary: summary.trim() });
              }}
              className="btn-primary text-xs px-2 py-1"
            >
              Mark resolved
            </button>
          </>
        )}
        {status === "WAITING_FOR_USER" && (
          <button disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/status`, { status: "IT_IN_PROGRESS" })} className="btn-secondary text-xs px-2 py-1">
            Resume work
          </button>
        )}
      </div>
    </div>
  );
}
