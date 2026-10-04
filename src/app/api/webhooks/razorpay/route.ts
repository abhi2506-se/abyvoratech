import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants, notifyAdmins } from "@/lib/notifications";

// Webhooks carry no user session — signature verification against the raw
// body IS the authentication for this endpoint. Do not add auth() here.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    await writeAuditLog({
      actorId: null,
      actorRole: "SYSTEM",
      action: "webhook.razorpay.invalid_signature",
      entityType: "Webhook",
      entityId: "razorpay",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = req.headers.get("x-razorpay-event-id");

  try {
    switch (event.event) {
      case "payment.captured": {
        const entity = event.payload?.payment?.entity;
        if (!entity) break;

        const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
        if (!payment) break; // Not one of ours (or already handled) — ignore, don't error.

        // Idempotency: a payment already CAPTURED with this providerPaymentId
        // means this webhook has already been processed (possibly a Razorpay
        // retry) — no-op rather than double-writing side effects.
        if (payment.status === "CAPTURED" && payment.providerPaymentId === entity.id) break;

        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "CAPTURED",
              providerPaymentId: entity.id,
              paymentMethod: entity.method,
              paidAt: new Date(entity.created_at * 1000),
            },
          });

          const project = await tx.project.findUnique({ where: { id: payment.projectId } });
          if (project && (project.status === "PAYMENT_PENDING" || project.status === "SUBMITTED")) {
            await tx.project.update({ where: { id: project.id }, data: { status: "PAYMENT_RECEIVED" } });
            await tx.projectStatusHistory.create({
              data: {
                projectId: project.id,
                fromStatus: project.status,
                toStatus: "PAYMENT_RECEIVED",
                changedById: null,
                note: "Payment captured (confirmed via Razorpay webhook).",
              },
            });
          }
        });

        await writeAuditLog({
          actorId: null,
          actorRole: "SYSTEM",
          action: "webhook.payment.captured",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { eventId, providerPaymentId: entity.id },
        });

        await notifyAdmins({
          type: "PROJECT_STATUS_CHANGED",
          title: `Payment confirmed for project`,
          body: `Razorpay confirmed capture of payment ${entity.id}.`,
          entityType: "Project",
          entityId: payment.projectId,
        });
        break;
      }

      case "payment.failed": {
        const entity = event.payload?.payment?.entity;
        if (!entity) break;
        const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
        if (!payment || payment.status === "FAILED") break;

        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", failureReason: entity.error_description || "Payment failed" },
        });
        await writeAuditLog({
          actorId: null,
          actorRole: "SYSTEM",
          action: "webhook.payment.failed",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { eventId, reason: entity.error_description },
        });
        await notifyProjectParticipants(payment.projectId, {
          type: "PROJECT_STATUS_CHANGED",
          title: "Payment failed",
          body: entity.error_description || "Your payment attempt failed. You can try again from the Payments tab.",
        });
        break;
      }

      case "refund.processed": {
        const entity = event.payload?.refund?.entity;
        if (!entity) break;
        const refund = await prisma.refund.findUnique({ where: { providerRefundId: entity.id } });
        if (!refund || refund.status === "PROCESSED") break;

        await prisma.$transaction(async (tx) => {
          await tx.refund.update({
            where: { id: refund.id },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
          await tx.payment.update({
            where: { id: refund.paymentId },
            data: { status: Number(refund.amount) >= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED" },
          });
        });

        await writeAuditLog({
          actorId: null,
          actorRole: "SYSTEM",
          action: "webhook.refund.processed",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { eventId, providerRefundId: entity.id },
        });
        await notifyProjectParticipants(refund.projectId, {
          type: "PROJECT_STATUS_CHANGED",
          title: "Refund processed",
          body: `Your refund of ₹${refund.amount} has been processed by Razorpay.`,
        });
        break;
      }

      case "refund.failed": {
        const entity = event.payload?.refund?.entity;
        if (!entity) break;
        const refund = await prisma.refund.findUnique({ where: { providerRefundId: entity.id } });
        if (!refund || refund.status === "FAILED") break;

        await prisma.refund.update({
          where: { id: refund.id },
          data: { status: "FAILED", failureReason: "Refund failed at provider" },
        });
        await writeAuditLog({
          actorId: null,
          actorRole: "SYSTEM",
          action: "webhook.refund.failed",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { eventId },
        });
        await notifyAdmins({
          type: "PROJECT_STATUS_CHANGED",
          title: "Refund failed",
          body: `Refund ${refund.id} failed at the payment provider — needs manual review/retry.`,
          entityType: "Refund",
          entityId: refund.id,
        });
        break;
      }

      default:
        // Unhandled event types are acknowledged (200) but ignored, per
        // Razorpay's recommendation, so it doesn't keep retrying forever.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Razorpay webhook processing error", err);
    // Still 200 here would hide real bugs from Razorpay's retry mechanism;
    // return 500 so Razorpay retries and we don't silently drop the event.
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}
