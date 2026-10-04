import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { SupportTicketStatus } from "@prisma/client";

const STATUS_COLORS: Record<string, string> = {
  FORWARDED_TO_IT: "var(--gold)", IT_ASSIGNED: "var(--gold)", IT_IN_PROGRESS: "var(--gold)",
  WAITING_FOR_USER: "var(--gold)", RESOLVED: "var(--success)", CLOSED: "var(--ink-muted)",
  REOPENED: "var(--danger)",
};
const PRIORITY_COLORS: Record<string, string> = { LOW: "var(--ink-muted)", MEDIUM: "var(--gold)", HIGH: "var(--danger)" };

export default async function ITDashboardPage({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }) {
  const { status, priority } = await searchParams;

  const IT_VISIBLE_STATUSES: SupportTicketStatus[] = [
    "FORWARDED_TO_IT",
    "IT_ASSIGNED",
    "IT_IN_PROGRESS",
    "WAITING_FOR_USER",
    "RESOLVED",
    "CLOSED",
    "REOPENED",
  ];

  const where: any = { status: { in: IT_VISIBLE_STATUSES } };
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [tickets, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        raisedBy: { select: { name: true } },
        assignedITSupport: { select: { name: true } },
        relatedProject: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.supportTicket.groupBy({
      by: ["status"],
      where: { status: { in: IT_VISIBLE_STATUSES } },
      _count: { _all: true },
    }),
  ]);

  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4" style={{ color: "var(--navy-deep)" }}>IT Support Dashboard</h1>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ["New (forwarded)", countFor("FORWARDED_TO_IT")],
          ["In progress", countFor("IT_IN_PROGRESS")],
          ["Waiting for user", countFor("WAITING_FOR_USER")],
          ["Resolved", countFor("RESOLVED")],
        ].map(([label, count]) => (
          <div key={label as string} className="panel p-3">
            <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{label}</div>
            <div className="text-xl font-semibold" style={{ color: "var(--navy-deep)" }}>{count as number}</div>
          </div>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--line)" }}>
              <th className="text-left font-normal p-2">Ticket</th>
              <th className="text-left font-normal p-2">Title</th>
              <th className="text-left font-normal p-2">Raised by</th>
              <th className="text-left font-normal p-2">Priority</th>
              <th className="text-left font-normal p-2">Status</th>
              <th className="text-left font-normal p-2">Assigned IT</th>
              <th className="text-left font-normal p-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td className="p-2 font-mono">
                  <Link href={`/IT/secretme/${t.id}`} className="underline">{t.ticketNumber}</Link>
                </td>
                <td className="p-2 max-w-xs truncate">{t.title}</td>
                <td className="p-2">
                  {t.raisedBy.name} <span className="px-1" style={{ background: "var(--slate-bg)" }}>{t.raisedByRole}</span>
                </td>
                <td className="p-2" style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</td>
                <td className="p-2" style={{ color: STATUS_COLORS[t.status] }}>{t.status.replace(/_/g, " ")}</td>
                <td className="p-2">{t.assignedITSupport?.name || "Unclaimed"}</td>
                <td className="p-2">{new Date(t.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center" style={{ color: "var(--ink-muted)" }}>No tickets in this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
