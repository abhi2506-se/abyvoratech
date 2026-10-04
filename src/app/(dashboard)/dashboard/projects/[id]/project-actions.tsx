"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const NEXT_STEPS: Record<string, string[]> = {
  SUBMITTED: ["PAYMENT_PENDING", "NEEDS_INFORMATION", "REJECTED"],
  NEEDS_INFORMATION: ["SUBMITTED", "REJECTED"],
  PAYMENT_PENDING: ["PAYMENT_RECEIVED", "REJECTED"],
  PAYMENT_RECEIVED: ["WAITING_FOR_REVIEW"],
  WAITING_FOR_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PLANNING"],
  PLANNING: ["UI_UX"],
  UI_UX: ["DEVELOPMENT"],
  DEVELOPMENT: ["TESTING"],
  TESTING: ["CLIENT_REVIEW"],
  CLIENT_REVIEW: ["DEVELOPMENT", "FINAL_DELIVERY"],
  FINAL_DELIVERY: ["COMPLETED"],
};

const REASON_REQUIRED = new Set(["REJECTED", "NEEDS_INFORMATION"]);
const HOLDABLE = new Set(["PLANNING", "UI_UX", "DEVELOPMENT", "TESTING", "CLIENT_REVIEW"]);
const CANCELLABLE = new Set([
  "SUBMITTED", "NEEDS_INFORMATION", "PAYMENT_PENDING", "PAYMENT_RECEIVED",
  "WAITING_FOR_REVIEW", "ACCEPTED", "PLANNING", "UI_UX", "DEVELOPMENT", "TESTING", "CLIENT_REVIEW", "ON_HOLD",
]);

type Agent = { id: string; user: { name: string } };

export function ProjectActions({
  projectId,
  currentStatus,
  assignedAgentId,
}: {
  projectId: string;
  currentStatus: string;
  assignedAgentId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const options = NEXT_STEPS[currentStatus] || [];

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  async function transition(status: string) {
    let note: string | undefined;
    if (REASON_REQUIRED.has(status)) {
      const input = prompt(`Reason for moving to ${status.replace(/_/g, " ")} (required):`);
      if (!input?.trim()) return;
      note = input.trim();
    } else if (status === "REJECTED") {
      if (!confirm("Reject this project? This should trigger the refund workflow.")) return;
    }

    setLoading(status);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to update status");
  }

  async function holdProject() {
    const reason = prompt("Reason for putting this project on hold (required):");
    if (!reason?.trim()) return;
    setLoading("HOLD");
    const res = await fetch(`/api/projects/${projectId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to pause project");
  }

  async function resumeProject() {
    setLoading("RESUME");
    const res = await fetch(`/api/projects/${projectId}/resume`, { method: "POST" });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to resume project");
  }

  async function cancelProject() {
    const reason = prompt("Reason for cancelling this project (required):");
    if (!reason?.trim()) return;
    if (!confirm("Cancel this project? This should trigger the refund workflow if payment was received.")) return;
    setLoading("CANCEL");
    const res = await fetch(`/api/projects/${projectId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to cancel project");
  }

  async function assignAgent(e: React.ChangeEvent<HTMLSelectElement>) {
    const agentId = e.target.value || null;
    setLoading("ASSIGN");
    const res = await fetch(`/api/projects/${projectId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    setLoading(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error || "Failed to assign agent");
  }

  return (
    <div className="space-y-2">
      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs self-center" style={{ color: "var(--text-secondary)" }}>Assign agent:</span>
        <select className="field-input w-auto text-xs py-1" value={assignedAgentId ?? ""} onChange={assignAgent} disabled={loading === "ASSIGN"}>
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.user.name}</option>
          ))}
        </select>
      </div>

      {options.length > 0 && (
        <div className="panel p-3 flex flex-wrap gap-2">
          <span className="text-xs self-center" style={{ color: "var(--text-secondary)" }}>Move to:</span>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => transition(opt)}
              disabled={loading === opt}
              className={opt === "REJECTED" ? "btn-secondary text-xs px-3 py-1.5" : "btn-primary text-xs px-3 py-1.5"}
              style={opt === "REJECTED" ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
            >
              {loading === opt ? "Updating…" : opt.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      <div className="panel p-3 flex flex-wrap gap-2">
        {currentStatus === "ON_HOLD" ? (
          <button onClick={resumeProject} disabled={loading === "RESUME"} className="btn-primary text-xs px-3 py-1.5">
            {loading === "RESUME" ? "Resuming…" : "Resume project"}
          </button>
        ) : HOLDABLE.has(currentStatus) ? (
          <button onClick={holdProject} disabled={loading === "HOLD"} className="btn-secondary text-xs px-3 py-1.5">
            {loading === "HOLD" ? "Pausing…" : "Put on hold"}
          </button>
        ) : null}

        {CANCELLABLE.has(currentStatus) && (
          <button
            onClick={cancelProject}
            disabled={loading === "CANCEL"}
            className="btn-secondary text-xs px-3 py-1.5"
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          >
            {loading === "CANCEL" ? "Cancelling…" : "Cancel project"}
          </button>
        )}
      </div>
    </div>
  );
}
