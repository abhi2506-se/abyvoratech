"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone } from "@/lib/status-tone";

type EmailRow = {
  id: string;
  emailType: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  subject: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  agent: { user: { name: string } };
  attachments: { id: string; fileName: string }[];
};

const STATUSES = ["DRAFT", "QUEUED", "SENDING", "SENT", "DELIVERED", "BOUNCED", "FAILED", "REPLIED", "CANCELLED"];

export default function EmailActivityPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<EmailRow | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("emailType", typeFilter);
    const res = await fetch(`/api/emails?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEmails(data.emails ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Email Activity</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{emails.length} shown</p>
        </div>
        <a href="/dashboard/emails/compose"><Button>Compose Email</Button></a>
      </div>

      <div className="flex gap-2 mb-5">
        <select className="field-input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="field-input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="PROPOSAL">Proposal</option>
          <option value="SALES">Sales</option>
          <option value="GENERAL">General</option>
        </select>
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Subject</th><th>Type</th><th>To</th><th>Agent</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[110px]" /></td>)}</tr>
              ))}
            {!loading && emails.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="No emails yet" description='Nothing shows here as "Sent" unless the provider actually accepted it.' />
                </td>
              </tr>
            )}
            {!loading && emails.map((e) => (
              <tr key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                <td className="max-w-xs truncate font-medium" style={{ color: "var(--text-primary)" }}>{e.subject}</td>
                <td style={{ color: "var(--text-secondary)" }}>{e.emailType}</td>
                <td className="max-w-[160px] truncate" style={{ color: "var(--text-secondary)" }}>{e.toEmails.join(", ")}</td>
                <td style={{ color: "var(--text-secondary)" }}>{e.agent.user.name}</td>
                <td><Badge tone={statusTone(e.status)}>{e.status}</Badge></td>
                <td className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{new Date(e.sentAt ?? e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.subject}
        footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}
      >
        {selected && (
          <div className="text-[13px] space-y-2">
            <div style={{ color: "var(--text-secondary)" }}>From {selected.fromName} &lt;{selected.fromEmail}&gt;</div>
            <div style={{ color: "var(--text-secondary)" }}>To {selected.toEmails.join(", ")}</div>
            <div style={{ color: "var(--text-primary)" }}>
              Status: <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
            </div>
            {selected.failureReason && (
              <div style={{ color: "var(--danger)" }}>Failure reason: {selected.failureReason}</div>
            )}
            {selected.attachments.length > 0 && (
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Attachments:</span>
                <ul className="mt-1 space-y-0.5">
                  {selected.attachments.map((a) => (
                    <li key={a.id}>
                      <a className="underline" href={`/api/emails/attachments/${a.id}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        {a.fileName}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
