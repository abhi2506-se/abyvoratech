import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, AuthzError, toApiError } from "@/lib/authz";
import { verifyPaymentSignature, fetchRazorpayPayment } from "@/lib/razorpay";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins, notifyProjectParticipants } from "@/lib/notifications";

const schema = z.object({
  paymentRecordId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    const payment = await prisma.payment.findUnique({
      where: { id: body.paymentRecordId },
      include: { client: true, project: true },
    });
    if (!payment) throw new AuthzError("Payment not found", 404);
    if (session.user.role === "CLIENT" && payment.clientId !== session.user.clientId) {
      throw new AuthzError("You do not have access to this payment", 403);
    }

    // Idempotent: if it's already captured (e.g. duplicate client retry after
    // a network blip), just confirm success without reprocessing anything.
    if (payment.status === "CAPTURED") {
      return NextResponse.json({ status: "CAPTURED", payment });
    }

    if (payment.providerOrderId !== body.razorpay_order_id) {
      return NextResponse.json({ error: "Order ID mismatch" }, { status: 400 });
    }

    // 1. Cryptographic signature check — this alone proves the payment_id is
    // genuinely bound to this order_id by Razorpay, not just claimed by the client.
    const signatureValid = verifyPaymentSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!signatureValid) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", failureReason: "Signature verification failed" },
      });
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "payment.signature_invalid",
        entityType: "Payment",
        entityId: payment.id,
      });
      return NextResponse.json({ error: "Payment signature verification failed" }, { status: 400 });
    }

    // 2. Re-fetch the authoritative payment record from Razorpay itself and
    // cross-check amount, currency and order linkage — never trust the
    // frontend's "success" callback alone for any of these.
    const remote = await fetchRazorpayPayment(body.razorpay_payment_id);
    const expectedAmount = Math.round(Number(payment.amount) * 100);

    if (remote.order_id !== body.razorpay_order_id) {
      return NextResponse.json({ error: "Payment/order linkage mismatch" }, { status: 400 });
    }
    if (remote.amount !== expectedAmount || remote.currency !== payment.currency) {
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "payment.amount_mismatch",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { expected: expectedAmount, remote: remote.amount, currency: remote.currency },
      });
      return NextResponse.json({ error: "Payment amount does not match the expected order amount" }, { status: 400 });
    }
    if (!(remote.status === "captured" || remote.captured)) {
      return NextResponse.json({ error: `Payment is not yet captured (status: ${remote.status})` }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "CAPTURED",
          providerPaymentId: body.razorpay_payment_id,
          providerSignature: body.razorpay_signature,
          paymentMethod: remote.method,
          paidAt: new Date(),
        },
      });

      // System-driven lifecycle transition: payment being captured moves the
      // project from "awaiting payment" to "payment received" — but NOT to
      // "approved". Admin approval is a distinct, separate step (see
      // project-lifecycle docs / ALLOWED_TRANSITIONS) so this only ever
      // targets PAYMENT_RECEIVED, never ACCEPTED.
      if (payment.project.status === "PAYMENT_PENDING" || payment.project.status === "SUBMITTED") {
        await tx.project.update({ where: { id: payment.projectId }, data: { status: "PAYMENT_RECEIVED" } });
        await tx.projectStatusHistory.create({
          data: {
            projectId: payment.projectId,
            fromStatus: payment.project.status,
            toStatus: "PAYMENT_RECEIVED",
            changedById: session.user.id,
            note: `Payment captured (₹${payment.amount} via Razorpay). Awaiting Admin approval — payment does not itself approve the project.`,
          },
        });
      }

      return p;
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "payment.captured",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { amount: Number(payment.amount), providerPaymentId: body.razorpay_payment_id },
    });

    await notifyAdmins({
      type: "PROJECT_STATUS_CHANGED",
      title: `Payment received for ${payment.project.name}`,
      body: `₹${payment.amount} received. Project is now awaiting Admin approval.`,
      entityType: "Project",
      entityId: payment.projectId,
    });
    await notifyProjectParticipants(payment.projectId, {
      type: "PROJECT_STATUS_CHANGED",
      title: "Payment received",
      body: "Your payment was received. Project commencement is subject to official approval and requirement confirmation.",
      excludeUserId: session.user.id,
    });

    return NextResponse.json({ status: "CAPTURED", payment: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
