import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { createRazorpayRefund, RazorpayConfigError } from "@/lib/razorpay";
import { writeAuditLog } from "@/lib/audit";

function toSmallestUnit(amount: number) {
  return Math.round(amount * 100);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;

    const refund = await prisma.refund.findUnique({ where: { id }, include: { payment: true } });
    if (!refund) throw new AuthzError("Refund not found", 404);
    if (refund.status !== "FAILED") {
      return NextResponse.json({ error: `Only FAILED refunds can be retried (current: ${refund.status})` }, { status: 409 });
    }
    if (!refund.payment.providerPaymentId) {
      return NextResponse.json({ error: "Underlying payment has no provider payment ID on record" }, { status: 409 });
    }

    await prisma.refund.update({ where: { id: refund.id }, data: { status: "PROCESSING", failureReason: null } });

    try {
      // Same idempotencyKey as the original attempt — if Razorpay actually
      // processed the earlier call despite us recording FAILED (e.g. a
      // timeout on our side), this returns the existing refund instead of
      // creating a duplicate one.
      const providerRefund = await createRazorpayRefund({
        paymentId: refund.payment.providerPaymentId,
        amountInSmallestUnit: toSmallestUnit(Number(refund.amount)),
        idempotencyKey: refund.idempotencyKey,
        notes: { refundId: refund.id, retried: "true" },
      });

      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: { status: "INITIATED", providerRefundId: providerRefund.id },
      });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "refund.retry_succeeded",
        entityType: "Refund",
        entityId: refund.id,
        metadata: { providerRefundId: providerRefund.id },
      });

      return NextResponse.json({ refund: updated });
    } catch (providerErr) {
      const message = providerErr instanceof RazorpayConfigError
        ? "Refunds are not configured (missing Razorpay credentials)."
        : providerErr instanceof Error ? providerErr.message : "Refund provider call failed";

      await prisma.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: message } });
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "refund.retry_failed",
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
