import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ITControls } from "./it-controls";
import { ReplyBox } from "../../../(dashboard)/dashboard/support/[id]/reply-box";

export default async function ITTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { name: true, email: true, role: true } },
      client: { select: { name: true, email: true } },
      agent: { select: { user: { select: { name: true } } } },
      relatedProject: { select: { id: true, name: true } },
    },
  });
  if (!ticket) notFound();

  const [messages, activities] = await Promise.all([
    prisma.supportTicketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
    prisma.supportTicketActivity.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold" style={{ color: "var(--navy-deep)" }}>{ticket.title}</h1>
        <span className="text-xs font-mono" style={{ color: "var(--ink-muted)" }}>{ticket.ticketNumber}</span>
      </div>
      <div className="flex gap-2 mb-4">
        <span className="text-xs px-2 py-0.5" style={{ background: "var(--slate-bg)" }}>{ticket.raisedByRole}</span>
        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{ticket.raisedBy.name} ({ticket.raisedBy.email})</span>
        {ticket.relatedProject && <span className="text-xs" style={{ color: "var(--ink-muted)" }}>Project: {ticket.relatedProject.name}</span>}
      </div>

      <ITControls ticketId={ticket.id} status={ticket.status} priority={ticket.priority} />

      <div className="panel p-4 mb-4">
        <div className="field-label mb-1">Description</div>
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        {ticket.category && <p className="text-xs mt-2" style={{ color: "var(--ink-muted)" }}>Category: {ticket.category.replace(/_/g, " ")}</p>}
      </div>

      {ticket.escalationReason && (
        <div className="panel p-4 mb-4" style={{ borderColor: "var(--gold)" }}>
          <div className="field-label mb-1">Escalation context</div>
          <p className="text-xs whitespace-pre-wrap">{ticket.escalationReason}</p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {messages.map((m) => (
          <div key={m.id} className="panel p-3 text-sm" style={m.isInternal ? { background: "#fff6e5", border: "1px solid var(--gold)" } : undefined}>
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: "var(--ink-muted)" }}>
              <span>{m.senderRole}{m.isInternal ? " · internal note" : ""}</span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap">{m.message}</p>
          </div>
        ))}
        {messages.length === 0 && <p className="text-xs" style={{ color: "var(--ink-muted)" }}>No messages yet.</p>}
      </div>

      {!["CLOSED", "CANCELLED"].includes(ticket.status) && <ReplyBox ticketId={ticket.id} canPostInternal={true} />}

      <details className="mt-6">
        <summary className="text-xs cursor-pointer" style={{ color: "var(--ink-muted)" }}>Activity timeline</summary>
        <div className="mt-2 space-y-1">
          {activities.map((a) => (
            <div key={a.id} className="text-xs" style={{ color: "var(--ink-muted)" }}>
              {new Date(a.createdAt).toLocaleString()} — {a.actorRole}: {a.action.replace(/_/g, " ")}
              {a.previousStatus && a.newStatus && ` (${a.previousStatus} → ${a.newStatus})`}
              {a.note && ` — ${a.note}`}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
