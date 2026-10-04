import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notifications";

/**
 * When a project is rejected or cancelled, any captured payment on it should
 * not just sit there with no path back to the client. This creates a
 * REQUESTED refund (full remaining captured amount) for Admin to review and
 * approve — it does NOT auto-approve or call the provider. Per the refund
 * policy, whether the client is actually entitled to it (full/partial/none)
 * is an Admin decision based on stage and completed work; this just ensures
 * the request exists and is visible rather than silently doing nothing.
 */
export async function createSystemRefundRequestIfEligible(params: {
  projectId: string;
  triggerReason: string;
  actorId: string;
}) {
  const capturedPayments = await prisma.payment.findMany({
    where: { projectId: params.projectId, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } },
    include: { refunds: true },
  });

  const created: string[] = [];

  for (const payment of capturedPayments) {
    const hasActiveRefund = payment.refunds.some((r) =>
      ["REQUESTED", "PROCESSING", "INITIATED", "PROCESSED"].includes(r.status)
    );
    if (hasActiveRefund) continue;

    const priorRefunded = payment.refunds
      .filter((r) => r.status === "PROCESSED")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const remaining = Number(payment.amount) - priorRefunded;
    if (remaining <= 0) continue;

    const refund = await prisma.refund.create({
      data: {
        projectId: params.projectId,
        paymentId: payment.id,
        clientId: payment.clientId,
        requestedById: params.actorId,
        amount: remaining,
        currency: payment.currency,
        reason: `Auto-generated: ${params.triggerReason}`,
        status: "REQUESTED",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    created.push(refund.id);
  }

  if (created.length > 0) {
    await notifyAdmins({
      type: "PROJECT_STATUS_CHANGED",
      title: "Refund review needed",
      body: `${created.length} refund request(s) were auto-created because a project was rejected/cancelled with captured payment. Review in Refund Management.`,
      entityType: "Project",
      entityId: params.projectId,
    });
  }

  return created;
}
