import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { createRazorpayRefund, RazorpayConfigError } from "@/lib/razorpay";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

function toSmallestUnit(amount: number) {
  return Math.round(amount * 100);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: { payment: true, project: true },
    });
    if (!refund) throw new AuthzError("Refund not found", 404);
    if (refund.status !== "REQUESTED") {
      return NextResponse.json({ error: `Refund is not in a requestable state (current: ${refund.status})` }, { status: 409 });
    }
    if (!refund.payment.providerPaymentId) {
      return NextResponse.json({ error: "Underlying payment has no provider payment ID on record" }, { status: 409 });
    }

    // Mark PROCESSING before calling the provider so a concurrent duplicate
    // approval click can't fire two refund calls for the same record.
    const claimed = await prisma.refund.updateMany({
      where: { id: refund.id, status: "REQUESTED" },
      data: { status: "PROCESSING", approvedById: session.user.id },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Refund was already claimed for processing" }, { status: 409 });
    }

    try {
      const providerRefund = await createRazorpayRefund({
        paymentId: refund.payment.providerPaymentId,
        amountInSmallestUnit: toSmallestUnit(Number(refund.amount)),
        idempotencyKey: refund.idempotencyKey,
        notes: { refundId: refund.id, projectId: refund.projectId },
      });

      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: "INITIATED",
          providerRefundId: providerRefund.id,
          providerPaymentId: refund.payment.providerPaymentId,
        },
      });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "refund.approved_and_initiated",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { providerRefundId: providerRefund.id, amount: Number(refund.amount) },
      });

      await notifyProjectParticipants(refund.projectId, {
        type: "PROJECT_STATUS_CHANGED",
        title: "Refund approved",
        body: `Your refund of ₹${refund.amount} has been approved and initiated with the payment provider.`,
        excludeUserId: session.user.id,
      });

      return NextResponse.json({ refund: updated });
    } catch (providerErr) {
      // Provider call failed — record it as FAILED (not stuck at PROCESSING
      // forever) so Admin can see it and use /retry.
      const message = providerErr instanceof RazorpayConfigError
        ? "Refunds are not configured (missing Razorpay credentials)."
        : providerErr instanceof Error ? providerErr.message : "Refund provider call failed";

      await prisma.refund.update({
        where: { id: refund.id },
        data: { status: "FAILED", failureReason: message },
      });
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "refund.provider_call_failed",
        entityType: "Refund",
        entityId: refund.id,
        status: "FAILED",
        errorDetail: message,
      });

      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
