import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayButton } from "./pay-button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { statusTone, formatStatus } from "@/lib/status-tone";

function money(amount: unknown, currency: string) {
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

const ICONS = {
  revenue: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  pending: <path d="M12 8v4l3 3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />,
  paid: <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  refund: <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

export default async function PaymentsPage() {
  const session = await auth();
  const role = session!.user.role;

  if (role === "CLIENT") {
    const clientId = session!.user.clientId!;
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const projects = await prisma.project.findMany({
      where: { clientId },
      include: {
        payments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Payments</h1>
          <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
            Payment confirms the selected payment transaction. Project commencement is subject to
            official project approval, requirement confirmation and applicable service terms. See our{" "}
            <a href="/terms" target="_blank" className="underline">Terms</a> and refund policy before paying.
          </p>
        </div>

        {projects.length === 0 && (
          <div className="panel"><EmptyState title="No projects yet" /></div>
        )}

        {projects.map((project) => {
          const capturedTotal = project.payments
            .filter((p) => p.status === "CAPTURED")
            .reduce((sum, p) => sum + Number(p.amount), 0);
          const needsAdvance = project.status === "PAYMENT_PENDING" && project.advanceAmount && capturedTotal === 0;
          const needsFull = project.status === "PAYMENT_PENDING" && !project.advanceAmount && project.totalValue;

          return (
            <div key={project.id} className="panel p-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Link href={`/dashboard/projects/${project.id}`} className="font-medium text-[14px] hover:underline" style={{ color: "var(--text-primary)" }}>
                  {project.name}
                </Link>
                <Badge tone={statusTone(project.status)}>{formatStatus(project.status)}</Badge>
              </div>

              {project.totalValue && (
                <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
                  Total: {money(project.totalValue, project.currency)}
                  {project.advanceAmount && ` · Advance: ${money(project.advanceAmount, project.currency)}`}
                  {" · "}Paid so far: {money(capturedTotal, project.currency)}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {needsAdvance && (
                  <PayButton
                    projectId={project.id}
                    amountType="ADVANCE"
                    label={`Pay advance (${money(project.advanceAmount, project.currency)})`}
                    clientName={client?.name ?? ""}
                    clientEmail={client?.email ?? ""}
                  />
                )}
                {needsFull && (
                  <PayButton
                    projectId={project.id}
                    amountType="FULL"
                    label={`Pay full amount (${money(project.totalValue, project.currency)})`}
                    clientName={client?.name ?? ""}
                    clientEmail={client?.email ?? ""}
                  />
                )}
                {project.status === "PAYMENT_PENDING" && capturedTotal > 0 && project.totalValue && capturedTotal < Number(project.totalValue) && (
                  <PayButton
                    projectId={project.id}
                    amountType="REMAINING"
                    label="Pay remaining balance"
                    clientName={client?.name ?? ""}
                    clientEmail={client?.email ?? ""}
                  />
                )}
              </div>

              {project.payments.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ color: "var(--text-secondary)" }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td style={{ color: "var(--text-primary)" }}>{money(p.amount, p.currency)}</td>
                          <td><Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge></td>
                          <td style={{ color: "var(--text-muted)" }}>{p.receipt ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ADMIN view
  const payments = await prisma.payment.findMany({
    include: { project: { select: { id: true, name: true } }, client: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const [captured, pending, refundedAgg] = await Promise.all([
    prisma.payment.aggregate({ where: { status: "CAPTURED" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: { in: ["PENDING", "AUTHORIZED"] } }, _sum: { amount: true } }),
    prisma.refund.aggregate({ where: { status: "PROCESSED" }, _sum: { amount: true } }),
  ]);

  return (
    <div>
      <h1 className="text-[22px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Payments</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Revenue collected" value={`₹${(captured._sum.amount ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.revenue} />} tone="accent" />
        <KpiCard label="Pending" value={`₹${(pending._sum.amount ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.pending} />} />
        <KpiCard label="Total transactions" value={payments.length} icon={<Icon d={ICONS.paid} />} />
        <KpiCard label="Refunded" value={`₹${(refundedAgg._sum.amount ?? 0).toLocaleString()}`} icon={<Icon d={ICONS.refund} />} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Provider Payment ID</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td style={{ color: "var(--text-secondary)" }}>{new Date(p.createdAt).toLocaleString()}</td>
                <td>
                  <Link href={`/dashboard/projects/${p.project.id}`} className="hover:underline font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.project.name}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{p.client.name}</td>
                <td style={{ color: "var(--text-primary)" }}>{money(p.amount, p.currency)}</td>
                <td><Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge></td>
                <td className="font-mono text-[12px]" style={{ color: "var(--text-muted)" }}>{p.providerPaymentId ?? "—"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="No payments yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
