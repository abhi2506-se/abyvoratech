"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Milestone = {
  id: string;
  name: string;
  percentage: number;
  status: string;
  dueDate: string | Date | null;
  requiresClientApproval: boolean;
};

export function MilestonesPanel({
  projectId,
  milestones,
  role,
}: {
  projectId: string;
  milestones: Milestone[];
  role: "ADMIN" | "AGENT" | "CLIENT";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", percentage: "", dueDate: "" });

  async function act(id: string, action: string, extra?: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Action failed");
      return;
    }
    router.refresh();
  }

  async function createMilestone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        percentage: Number(form.percentage),
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create milestone");
      return;
    }
    setForm({ name: "", percentage: "", dueDate: "" });
    setShowForm(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Milestones</h2>
        {role === "ADMIN" && (
          <button className="btn-secondary text-xs px-2 py-1" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add milestone"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={createMilestone} className="panel p-3 mb-3 grid grid-cols-3 gap-2 items-end">
          <input required placeholder="Name" className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="number" placeholder="%" className="field-input" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
          <input type="date" className="field-input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <button className="btn-primary col-span-3 text-xs py-1" type="submit">Create</button>
        </form>
      )}

      {error && <div className="text-xs mb-2" style={{ color: "var(--danger)" }}>{error}</div>}

      <div className="panel overflow-x-auto mb-6">
        <table className="data-table">
          <thead><tr><th>Name</th><th>%</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead>
          <tbody>
            {milestones.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6" style={{ color: "var(--text-secondary)" }}>No milestones defined yet.</td></tr>
            )}
            {milestones.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.percentage}%</td>
                <td><span className="badge">{m.status.replace(/_/g, " ")}</span></td>
                <td>{m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}</td>
                <td className="flex gap-1 flex-wrap py-1">
                  {(role === "AGENT" || role === "ADMIN") && m.status === "PENDING" && (
                    <button disabled={busyId === m.id} className="btn-secondary text-xs px-2 py-1" onClick={() => act(m.id, "START")}>Start</button>
                  )}
                  {(role === "AGENT" || role === "ADMIN") && ["IN_PROGRESS", "CHANGES_REQUESTED"].includes(m.status) && (
                    <button disabled={busyId === m.id} className="btn-secondary text-xs px-2 py-1" onClick={() => act(m.id, "SUBMIT_FOR_APPROVAL")}>Submit for approval</button>
                  )}
                  {(role === "CLIENT" || role === "ADMIN") && m.status === "SUBMITTED_FOR_APPROVAL" && (
                    <>
                      <button disabled={busyId === m.id} className="btn-primary text-xs px-2 py-1" onClick={() => act(m.id, "APPROVE")}>Approve</button>
                      <button
                        disabled={busyId === m.id}
                        className="btn-secondary text-xs px-2 py-1"
                        onClick={() => {
                          const note = window.prompt("What changes are needed?");
                          if (note) act(m.id, "REQUEST_CHANGES", { note });
                        }}
                      >
                        Request changes
                      </button>
                    </>
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
