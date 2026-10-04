import { prisma } from "@/lib/prisma";
import { assertCanAccessClient } from "@/lib/authz";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { statusTone, formatStatus } from "@/lib/status-tone";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let client;
  try {
    await assertCanAccessClient(id);
    client = await prisma.client.findUnique({
      where: { id },
      include: {
        assignedAgent: { include: { user: true } },
        projects: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        lead: true,
      },
    });
  } catch {
    notFound();
  }

  if (!client) notFound();

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Avatar name={client.name} size={44} />
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text-primary)" }}>{client.name}</h1>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{client.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="panel p-4">
          <div className="field-label">Company</div>
          <div className="text-[13.5px] mt-0.5" style={{ color: "var(--text-primary)" }}>{client.company || "—"}</div>
        </div>
        <div className="panel p-4">
          <div className="field-label">Country</div>
          <div className="text-[13.5px] mt-0.5" style={{ color: "var(--text-primary)" }}>{client.country || "—"}</div>
        </div>
        <div className="panel p-4">
          <div className="field-label">Assigned agent</div>
          <div className="text-[13.5px] mt-0.5" style={{ color: "var(--text-primary)" }}>
            {client.assignedAgent?.user?.name || "Unassigned"}
          </div>
        </div>
      </div>

      {client.lead && (
        <div className="panel p-4 mb-6">
          <div className="field-label mb-1">Converted from lead</div>
          <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Source: {client.lead.source || "—"} · Original notes: {client.lead.notes || "none"}
          </p>
        </div>
      )}

      <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: "var(--text-primary)" }}>Projects</h2>
      <div className="panel overflow-x-auto mb-6">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Status</th><th>Value</th><th>Created</th></tr>
          </thead>
          <tbody>
            {client.projects.length === 0 && (
              <tr><td colSpan={5}><EmptyState title="No projects yet" /></td></tr>
            )}
            {client.projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/dashboard/projects/${p.id}`} className="hover:underline font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{p.projectType}</td>
                <td><Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{p.totalValue ? `${p.currency} ${p.totalValue}` : "—"}</td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: "var(--text-primary)" }}>Documents</h2>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>File</th><th>Type</th><th>Size</th><th>Uploaded</th></tr>
          </thead>
          <tbody>
            {client.documents.length === 0 && (
              <tr><td colSpan={4}><EmptyState title="No documents yet" /></td></tr>
            )}
            {client.documents.map((d) => (
              <tr key={d.id}>
                <td style={{ color: "var(--text-primary)" }}>{d.filename}</td>
                <td style={{ color: "var(--text-secondary)" }}>{d.documentType}</td>
                <td style={{ color: "var(--text-secondary)" }}>{(d.sizeBytes / 1024).toFixed(0)} KB</td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(d.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
