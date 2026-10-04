import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { RaiseTicketForm } from "./raise-ticket-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { statusTone, formatStatus } from "@/lib/status-tone";

function priorityTone(priority: string): "neutral" | "warning" | "danger" {
  if (priority === "HIGH") return "danger";
  if (priority === "MEDIUM") return "warning";
  return "neutral";
}

export default async function SupportPage() {
  const session = await auth();
  const role = session!.user.role;

  const where: any = {};
  if (role === "CLIENT") {
    where.raisedById = session!.user.id;
  } else if (role === "AGENT") {
    where.OR = [{ raisedById: session!.user.id }, { assignedAgentId: session!.user.agentId }];
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: {
      raisedBy: { select: { name: true } },
      assignedAgent: { select: { user: { select: { name: true } } } },
      assignedITSupport: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {role === "ADMIN" ? "Support Management" : "Support"}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {role === "CLIENT" && "Raise and track technical or platform issues with your projects."}
            {role === "AGENT" && "Raise technical issues and track complaints assigned to you."}
            {role === "ADMIN" && "Review, assign and forward all support tickets."}
          </p>
        </div>
        {role !== "ADMIN" && <RaiseTicketForm />}
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Title</th>
              <th>Raised by</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="font-mono text-[12px]">
                  <Link href={`/dashboard/support/${t.id}`} className="hover:underline" style={{ color: "var(--text-primary)" }}>
                    {t.ticketNumber}
                  </Link>
                </td>
                <td className="max-w-xs truncate" style={{ color: "var(--text-primary)" }}>{t.title}</td>
                <td style={{ color: "var(--text-secondary)" }}>
                  {t.raisedBy.name} <span style={{ color: "var(--text-muted)" }}>({t.raisedByRole})</span>
                </td>
                <td><Badge tone={priorityTone(t.priority)}>{t.priority}</Badge></td>
                <td><Badge tone={statusTone(t.status)}>{formatStatus(t.status)}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{t.assignedAgent?.user?.name || t.assignedITSupport?.name || "—"}</td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(t.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No tickets yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
