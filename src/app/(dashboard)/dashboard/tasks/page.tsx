"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  agent: { user: { name: string } };
  lead: { name: string } | null;
  client: { name: string } | null;
};

function priorityTone(priority: string): "neutral" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "neutral";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", dueAt: "", priority: "MEDIUM" });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"PENDING" | "COMPLETED" | "ALL">("PENDING");

  async function load() {
    setLoading(true);
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/tasks${qs}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        notes: form.notes || undefined,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        priority: form.priority,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create follow-up");
      return;
    }
    setForm({ title: "", notes: "", dueAt: "", priority: "MEDIUM" });
    setShowForm(false);
    load();
  }

  async function complete(task: Task) {
    setBusyId(task.id);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    setBusyId(null);
    load();
  }

  const now = Date.now();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Follow-ups &amp; Tasks</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{tasks.length} shown</p>
        </div>
        <div className="flex gap-2">
          <select className="field-input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="ALL">All</option>
          </select>
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? "Cancel" : "New follow-up"}
          </Button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <div className="field-label">Title</div>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <div className="field-label">Due</div>
            <Input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </div>
          <div>
            <div className="field-label">Priority</div>
            <select className="field-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <div className="field-label">Notes</div>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-4 flex items-center gap-3">
            <Button type="submit">Create</Button>
            {error && <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>{error}</span>}
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Task</th><th>Related</th><th>Agent</th><th>Due</th><th>Priority</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && tasks.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="Nothing here" /></td></tr>
            )}
            {!loading && tasks.map((t) => {
              const overdue = t.dueAt && new Date(t.dueAt).getTime() < now && t.status === "PENDING";
              return (
                <tr key={t.id}>
                  <td>
                    <div style={{ color: "var(--text-primary)" }}>{t.title}</div>
                    {t.notes && <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{t.notes}</div>}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{t.lead?.name ?? t.client?.name ?? "—"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{t.agent.user.name}</td>
                  <td style={overdue ? { color: "var(--danger)" } : { color: "var(--text-secondary)" }}>
                    {t.dueAt ? new Date(t.dueAt).toLocaleString() : "—"}
                    {overdue ? " (overdue)" : ""}
                  </td>
                  <td><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge></td>
                  <td>
                    {t.status === "PENDING" ? (
                      <Button size="sm" variant="secondary" disabled={busyId === t.id} onClick={() => complete(t)}>Mark complete</Button>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>{t.status}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
