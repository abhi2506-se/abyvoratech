import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TicketActions } from "./ticket-actions";
import { ReplyBox } from "./reply-box";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { statusTone, formatStatus } from "@/lib/status-tone";

function priorityTone(priority: string): "neutral" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "neutral";
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = session!.user.role;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { name: true, email: true } },
      assignedAgent: { select: { id: true, user: { select: { name: true } } } },
      assignedITSupport: { select: { name: true } },
      relatedProject: { select: { id: true, name: true } },
    },
  });
  if (!ticket) notFound();

  // Mirror the same access rule as assertCanAccessTicket() — a direct link
  // to someone else's ticket must 404, not partially render.
  const canAccess =
    role === "ADMIN" ||
    role === "IT_SUPPORT" ||
    (role === "AGENT" && (ticket.raisedById === session!.user.id || ticket.assignedAgentId === session!.user.agentId)) ||
    (role === "CLIENT" && ticket.raisedById === session!.user.id);
  if (!canAccess) notFound();

  const canSeeInternal = role === "ADMIN" || role === "IT_SUPPORT";
  const [messages, activities, agents] = await Promise.all([
    prisma.supportTicketMessage.findMany({
      where: { ticketId: ticket.id, ...(canSeeInternal ? {} : { isInternal: false }) },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supportTicketActivity.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
    role === "ADMIN" ? prisma.agent.findMany({ include: { user: { select: { name: true } } } }) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="abv-split-hero p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-mono text-[11.5px]" style={{ color: "var(--text-muted)" }}>{ticket.ticketNumber}</p>
            <h1 className="text-[19px] font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{ticket.title}</h1>
          </div>
          <div className="flex gap-2">
            <Badge tone={priorityTone(ticket.priority)}>{ticket.priority}</Badge>
            <Badge tone={statusTone(ticket.status)}>{formatStatus(ticket.status)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
          <span>Raised by {ticket.raisedBy.name} ({ticket.raisedByRole})</span>
          {ticket.relatedProject && <span>Project: {ticket.relatedProject.name}</span>}
        </div>
      </div>

      {ticket.estimateValue && (
        <div className="panel p-3.5 mb-5 text-[12.5px]" style={{ color: "var(--text-primary)" }}>
          <b>Estimated resolution:</b> {ticket.estimateValue} {ticket.estimateUnit?.toLowerCase()}
          {ticket.estimateNote && <> — {ticket.estimateNote}</>}
          <div style={{ color: "var(--text-muted)" }}>This is an estimate, not a guaranteed deadline.</div>
        </div>
      )}

      <div className="mb-5">
        <TicketActions
          ticketId={ticket.id}
          status={ticket.status}
          role={role}
          isAssignedAgent={ticket.assignedAgentId === session!.user.agentId}
          agents={agents as any}
        />
      </div>

      {role === "IT_SUPPORT" && (
        <p className="text-[12.5px] mb-4" style={{ color: "var(--text-secondary)" }}>
          Priority, estimate and resolve actions are available from the IT Support panel.
        </p>
      )}

      <div className="panel p-5 mb-6">
        <div className="field-label mb-1.5">Description</div>
        <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {ticket.description}
        </p>
      </div>

      {/* Premium messaging workspace */}
      <div className="space-y-3 mb-5">
        {messages.length === 0 && (
          <p className="text-[12.5px] text-center py-6" style={{ color: "var(--text-muted)" }}>No replies yet.</p>
        )}
        {messages.map((m) => {
          const isOwn = m.senderId === session!.user.id;
          return (
            <div key={m.id} className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
              <Avatar name={m.senderRole} size={30} />
              <div
                className="max-w-[78%] px-4 py-2.5 text-[13.5px] leading-relaxed"
                style={{
                  background: m.isInternal ? "var(--warning-soft)" : isOwn ? "var(--brand)" : "var(--surface)",
                  color: m.isInternal ? "var(--text-primary)" : isOwn ? "var(--brand-contrast)" : "var(--text-primary)",
                  border: m.isInternal ? "1px dashed var(--warning)" : isOwn ? "none" : "1px solid var(--border)",
                  borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                }}
              >
                <div
                  className="flex items-center gap-2 text-[10.5px] mb-1 uppercase tracking-wide font-semibold"
                  style={{ opacity: 0.7 }}
                >
                  <span>{m.senderRole}</span>
                  {m.isInternal && <span>· internal note</span>}
                </div>
                <p className="whitespace-pre-wrap">{m.message}</p>
                <div className="text-[10.5px] mt-1.5" style={{ opacity: 0.6 }}>
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!["CLOSED", "CANCELLED"].includes(ticket.status) && (
        <ReplyBox ticketId={ticket.id} canPostInternal={canSeeInternal} />
      )}

      <details className="mt-6">
        <summary className="text-[12px] cursor-pointer font-medium" style={{ color: "var(--text-secondary)" }}>
          Activity timeline
        </summary>
        <div className="mt-3 space-y-1.5 panel p-4">
          {activities.map((a) => (
            <div key={a.id} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-muted)" }}>{new Date(a.createdAt).toLocaleString()}</span>
              {" — "}{a.actorRole}: {formatStatus(a.action)}
              {a.previousStatus && a.newStatus && ` (${formatStatus(a.previousStatus)} → ${formatStatus(a.newStatus)})`}
              {a.note && ` — ${a.note}`}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
