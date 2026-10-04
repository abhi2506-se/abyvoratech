"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type AuditLogRow = {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  status: "SUCCESS" | "FAILED";
  ipAddress: string | null;
  createdAt: string;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");

  function buildQuery(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (action) params.set("action", action);
    if (role) params.set("role", role);
    if (entityType) params.set("entityType", entityType);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-logs?${buildQuery()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load audit logs");
      }
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (page !== 1) setPage(1);
    else load();
  }

  function handleExport() {
    const query = buildQuery({ format: "csv" });
    window.open(`/api/audit-logs?${query}`, "_blank");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Audit Logs</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {total} events — every agent and admin action, immutable
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport}>Export CSV</Button>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-2 mb-5">
        <Input className="w-auto" placeholder="Search agent name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Input className="w-auto" placeholder="Action (e.g. lead.created)" value={action} onChange={(e) => setAction(e.target.value)} />
        <select className="field-input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="ADMIN">Admin</option>
          <option value="AGENT">Agent</option>
          <option value="CLIENT">Client</option>
        </select>
        <Input className="w-auto" placeholder="Entity type (e.g. Lead, EmailMessage)" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        <select className="field-input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
        <Button type="submit">Filter</Button>
      </form>

      {error && (
        <div className="text-[13px] mb-4 p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</div>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="No audit events match these filters" /></td></tr>
            )}
            {!loading && logs.map((log) => (
              <tr key={log.id} className="cursor-pointer" onClick={() => setSelected(log)}>
                <td className="whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{new Date(log.createdAt).toLocaleString()}</td>
                <td>
                  <div style={{ color: "var(--text-primary)" }}>{log.actorName ?? "Unknown"}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{log.actorEmail}</div>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{log.actorRole}</td>
                <td>
                  <div style={{ color: "var(--text-primary)" }}>{log.action}</div>
                  {log.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{log.description}</div>}
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{log.entityType}{log.entityId ? `#${log.entityId.slice(0, 8)}` : ""}</td>
                <td><Badge tone={log.status === "SUCCESS" ? "success" : "danger"}>{log.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && logs.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-[13px]">
          <span style={{ color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Event details"
        footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && (
          <dl className="space-y-2 text-[13px]">
            <Row label="Actor" value={`${selected.actorName ?? "Unknown"} (${selected.actorEmail ?? "—"})`} />
            <Row label="Role" value={selected.actorRole} />
            <Row label="Action" value={selected.action} />
            <Row label="Description" value={selected.description ?? "—"} />
            <Row label="Entity" value={`${selected.entityType} ${selected.entityId ?? ""}`} />
            <Row label="Status" value={selected.status} />
            <Row label="IP address" value={selected.ipAddress ?? "—"} />
            <Row label="Time" value={new Date(selected.createdAt).toLocaleString()} />
          </dl>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--text-primary)" }}>{value}</dd>
    </div>
  );
}
