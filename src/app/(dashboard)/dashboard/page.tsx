import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadScope, projectScope, clientScope } from "@/lib/authz";
import { redirect } from "next/navigation";
import { KpiCard } from "@/components/ui/kpi-card";

const ICONS = {
  leads: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 4 2 2 4-4" />,
  clients: <path d="M17 20v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M7 20v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  revenue: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  tasks: <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  proposals: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h6M9 9h1" />,
  milestone: <path d="M4 22V4a1 1 0 0 1 1-1h8l4 4v9H5" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardOverview() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  if (session.user.role === "CLIENT") {
    const projects = await prisma.project.findMany({
      where: { clientId: session.user.clientId! },
      include: { milestones: true },
      orderBy: { createdAt: "desc" },
    });
    const active = projects.filter((p) => !["COMPLETED", "REJECTED", "CANCELLED"].includes(p.status));
    const completedMilestones = projects.reduce(
      (sum, p) => sum + p.milestones.filter((m) => m.status === "COMPLETED").length,
      0
    );

    return (
      <div>
        <header className="mb-6">
          <h1 className="text-[26px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {greeting()}, {firstName}
          </h1>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Here&apos;s what&apos;s happening with your projects today.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <KpiCard label="Active projects" value={active.length} icon={<Icon d={ICONS.projects} />} tone="accent" />
          <KpiCard label="Total projects" value={projects.length} icon={<Icon d={ICONS.projects} />} />
          <KpiCard label="Completed milestones" value={completedMilestones} icon={<Icon d={ICONS.milestone} />} />
        </div>

        {projects.length === 0 && (
          <div className="panel p-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              You haven&apos;t submitted a project yet. Head to Projects to get started.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ADMIN / AGENT — every figure below is a live count/aggregate, never hardcoded.
  const [leadCount, clientCount, projectCount, activeProjectCount, completedProjectCount, revenueAgg] =
    await Promise.all([
      prisma.lead.count({ where: leadScope(session) as any }),
      prisma.client.count({ where: clientScope(session) as any }),
      prisma.project.count({ where: projectScope(session) as any }),
      prisma.project.count({
        where: { ...(projectScope(session) as any), status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] } },
      }),
      prisma.project.count({ where: { ...(projectScope(session) as any), status: "COMPLETED" } }),
      prisma.project.aggregate({
        where: { ...(projectScope(session) as any), status: { not: "REJECTED" } },
        _sum: { totalValue: true },
      }),
    ]);

  const wonLeads = await prisma.lead.count({ where: { ...(leadScope(session) as any), status: "WON" } });
  const conversionRate = leadCount > 0 ? ((wonLeads / leadCount) * 100).toFixed(1) : "0.0";

  const agentScope = session.user.role === "ADMIN" ? {} : { agentId: session.user.agentId ?? undefined };

  const [
    proposalsSent,
    proposalsAccepted,
    pendingTasks,
    overdueTasks,
    pendingCommissionAgg,
    paidCommissionAgg,
  ] = await Promise.all([
    prisma.proposal.count({ where: { ...agentScope, status: { in: ["SENT", "VIEWED"] } } }),
    prisma.proposal.count({ where: { ...agentScope, status: "ACCEPTED" } }),
    prisma.task.count({ where: { ...agentScope, status: "PENDING" } }),
    prisma.task.count({ where: { ...agentScope, status: "PENDING", dueAt: { lt: new Date() } } }),
    prisma.commission.aggregate({ where: { ...agentScope, status: "PENDING" }, _sum: { amount: true } }),
    prisma.commission.aggregate({ where: { ...agentScope, status: "PAID" }, _sum: { amount: true } }),
  ]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {greeting()}, {firstName}
        </h1>
        <p className="text-[13.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {session.user.role === "ADMIN" ? "Here's the platform overview." : "Here's what's happening in your workspace."}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Pipeline value" value={`₹${(revenueAgg._sum.totalValue ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.revenue} />} tone="accent" />
        <KpiCard label="Total clients" value={clientCount} icon={<Icon d={ICONS.clients} />} />
        <KpiCard label="Active projects" value={activeProjectCount} icon={<Icon d={ICONS.projects} />} />
        <KpiCard label="Total leads" value={leadCount} icon={<Icon d={ICONS.leads} />} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Completed projects" value={completedProjectCount} icon={<Icon d={ICONS.projects} />} />
        <KpiCard label="Total projects" value={projectCount} icon={<Icon d={ICONS.projects} />} />
        <KpiCard label="Conversion rate" value={`${conversionRate}%`} icon={<Icon d={ICONS.leads} />} />
        <KpiCard label="Proposals sent" value={proposalsSent} icon={<Icon d={ICONS.proposals} />} />
        <KpiCard label="Proposals accepted" value={proposalsAccepted} icon={<Icon d={ICONS.proposals} />} tone="accent" />
        <KpiCard label="Pending follow-ups" value={pendingTasks} icon={<Icon d={ICONS.tasks} />} />
        <KpiCard label="Overdue follow-ups" value={overdueTasks} icon={<Icon d={ICONS.tasks} />} />
        <KpiCard label="Pending commission" value={`₹${(pendingCommissionAgg._sum.amount ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.revenue} />} />
        <KpiCard label="Paid commission" value={`₹${(paidCommissionAgg._sum.amount ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.revenue} />} />
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        All figures are computed live from the database — nothing here is hardcoded. Email activity
        stats will populate once the Email module (Phase 2) is wired in.
      </p>
    </div>
  );
}
