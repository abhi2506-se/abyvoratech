import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { RequestRefundForm } from "./request-refund-form";
import { RefundAdminActions } from "./refund-admin-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { statusTone, formatStatus } from "@/lib/status-tone";

function money(amount: unknown, currency: string) {
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default async function RefundsPage() {
  const session = await auth();
  const role = session!.user.role;

  if (role === "CLIENT") {
    const clientId = session!.user.clientId!;

    const eligiblePayments = await prisma.payment.findMany({
      where: { clientId, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } },
      include: {
        project: { select: { id: true, name: true } },
        refunds: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Refunds</h1>
          <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
            Refund eligibility depends on project stage, completed work and applicable service terms.
            See our <a href="/terms" target="_blank" className="underline">Refund Policy</a> for details.
            Every request is reviewed by an Admin before any refund is issued or processed.
          </p>
        </div>

        {eligiblePayments.length === 0 && (
          <div className="panel"><EmptyState title="No captured payments eligible for refund yet" /></div>
        )}

        {eligiblePayments.map((payment) => {
          const activeRefund = payment.refunds.find((r) => ["REQUESTED", "PROCESSING", "INITIATED"].includes(r.status));
          return (
            <div key={payment.id} className="panel p-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Link href={`/dashboard/projects/${payment.project.id}`} className="font-medium text-[14px] hover:underline" style={{ color: "var(--text-primary)" }}>
                  {payment.project.name}
                </Link>
                <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                  Paid {money(payment.amount, payment.currency)}
                </span>
              </div>

              {payment.refunds.length > 0 && (
                <div className="overflow-x-auto mt-3">
                  <table className="data-table">
                    <tbody>
                      {payment.refunds.map((r) => (
                        <tr key={r.id}>
                          <td style={{ color: "var(--text-secondary)" }}>{new Date(r.requestedAt).toLocaleDateString()}</td>
                          <td style={{ color: "var(--text-primary)" }}>{money(r.amount, r.currency)}</td>
                          <td><Badge tone={statusTone(r.status)}>{formatStatus(r.status)}</Badge></td>
                          <td style={{ color: "var(--text-muted)" }}>
                            {r.status === "REJECTED" ? r.rejectionReason : r.status === "FAILED" ? r.failureReason : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!activeRefund && (
                <div className="mt-3">
                  <RequestRefundForm projectId={payment.project.id} paymentId={payment.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ADMIN view
  const refunds = await prisma.refund.findMany({
    include: {
      project: { select: { id: true, name: true } },
      client: { select: { name: true, email: true } },
      payment: { select: { providerPaymentId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Refund Management</h1>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Requested</th>
              <th>Project</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "var(--text-secondary)" }}>{new Date(r.requestedAt).toLocaleString()}</td>
                <td>
                  <Link href={`/dashboard/projects/${r.project.id}`} className="hover:underline font-medium" style={{ color: "var(--text-primary)" }}>
                    {r.project.name}
                  </Link>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{r.client.name}</td>
                <td style={{ color: "var(--text-primary)" }}>{money(r.amount, r.currency)}</td>
                <td className="max-w-xs truncate" title={r.reason} style={{ color: "var(--text-secondary)" }}>{r.reason}</td>
                <td><Badge tone={statusTone(r.status)}>{formatStatus(r.status)}</Badge></td>
                <td><RefundAdminActions refundId={r.id} status={r.status} /></td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No refund requests yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
