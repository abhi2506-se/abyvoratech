import { prisma } from "@/lib/prisma";
import { assertCanAccessProject } from "@/lib/authz";
import { notFound } from "next/navigation";
import { ProjectActions } from "./project-actions";
import { MilestonesPanel } from "./milestones-panel";
import { DocumentsPanel } from "./documents-panel";
import { ChatPanel } from "./chat-panel";
import { Badge } from "@/components/ui/badge";
import { statusTone, formatStatus } from "@/lib/status-tone";

function InfoStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="field-label">{label}</div>
      <div className="text-[14px] mt-0.5 font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let session;
  let project;
  try {
    const result = await assertCanAccessProject(id);
    session = result.session;
    project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        assignedAgent: { include: { user: true } },
        milestones: { orderBy: { createdAt: "asc" } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
  } catch {
    notFound();
  }

  if (!project) notFound();

  return (
    <div className="max-w-4xl">
      <div className="abv-split-hero p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
              {project.projectType}
            </p>
            <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</h1>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>{project.client.name}</p>
          </div>
          <Badge tone={statusTone(project.status)} className="text-[12px] px-3 py-1.5">
            {formatStatus(project.status)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          <InfoStat label="Total value" value={project.totalValue ? `${project.currency} ${project.totalValue}` : "Not set"} />
          <InfoStat label="Advance" value={project.advanceAmount ? `${project.currency} ${project.advanceAmount}` : "Not set"} />
          <InfoStat label="Deadline" value={project.deadline ? new Date(project.deadline).toLocaleDateString() : "Not set"} />
          <InfoStat label="Assigned agent" value={project.assignedAgent?.user?.name || "Unassigned"} />
        </div>
      </div>

      {session!.user.role === "ADMIN" && (
        <div className="mb-6">
          <ProjectActions projectId={project.id} currentStatus={project.status} assignedAgentId={project.assignedAgentId} />
        </div>
      )}

      {project.status === "REJECTED" && project.rejectionReason && (
        <div className="panel p-4 mb-6" style={{ borderColor: "var(--danger)" }}>
          <div className="field-label" style={{ color: "var(--danger)" }}>Rejection reason</div>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--text-primary)" }}>{project.rejectionReason}</p>
        </div>
      )}

      <div className="panel p-5 mb-6">
        <div className="field-label mb-1.5">Description</div>
        <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {project.description}
        </p>
      </div>

      <div className="mb-6">
        <MilestonesPanel projectId={project.id} milestones={project.milestones} role={session!.user.role as "ADMIN" | "AGENT" | "CLIENT"} />
      </div>

      <div className="mb-6">
        <DocumentsPanel projectId={project.id} role={session!.user.role as "ADMIN" | "AGENT" | "CLIENT"} />
      </div>

      <div className="mb-6">
        <ChatPanel projectId={project.id} role={session!.user.role as "ADMIN" | "AGENT" | "CLIENT"} />
      </div>

      <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: "var(--text-primary)" }}>Activity timeline</h2>
      <div className="panel p-5">
        <ol className="space-y-3">
          {project.statusHistory.map((h) => (
            <li key={h.id} className="text-[12.5px] flex flex-wrap gap-x-3 gap-y-1">
              <span style={{ color: "var(--text-muted)" }}>{new Date(h.createdAt).toLocaleString()}</span>
              <span style={{ color: "var(--text-primary)" }}>
                {h.fromStatus ? `${formatStatus(h.fromStatus)} → ${formatStatus(h.toStatus)}` : `Created as ${formatStatus(h.toStatus)}`}
              </span>
              {h.note && <span style={{ color: "var(--text-secondary)" }}>— {h.note}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
