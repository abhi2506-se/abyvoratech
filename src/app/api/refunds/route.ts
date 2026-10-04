import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins } from "@/lib/notifications";

const schema = z.object({
  projectId: z.string().min(1),
  paymentId: z.string().min(1),
  reason: z.string().min(10).max(2000),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;

    // Admin sees all refunds; a client sees only their own; agents are not
    // part of the refund workflow (payments/refunds are Admin+Client only).
    let where: any = {};
    if (session.user.role === "CLIENT") {
      where.clientId = session.user.clientId;
    } else if (session.user.role === "AGENT") {
      throw new AuthzError("Agents do not have access to refund records", 403);
    }
    if (status) where.status = status;

    const refunds = await prisma.refund.findMany({
      where,
      include: { project: { select: { name: true } }, client: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ refunds });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const { session, project } = await assertCanAccessProject(body.projectId);

    if (session.user.role !== "CLIENT") {
      throw new AuthzError("Only the client can request a refund for their project", 403);
    }

    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.projectId !== project.id) {
      return NextResponse.json({ error: "Payment not found for this project" }, { status: 404 });
    }
    if (payment.status !== "CAPTURED" && payment.status !== "PARTIALLY_REFUNDED") {
      return NextResponse.json(
        { error: `Only captured payments are eligible for refund (current status: ${payment.status})` },
        { status: 409 }
      );
    }

    const existingRefund = await prisma.refund.findFirst({
      where: { paymentId: payment.id, status: { in: ["REQUESTED", "PROCESSING", "INITIATED"] } },
    });
    if (existingRefund) {
      return NextResponse.json({ error: "A refund is already pending for this payment" }, { status: 409 });
    }

    // Already-refunded amount, so we never request more than what's left.
    const priorRefunds = await prisma.refund.aggregate({
      where: { paymentId: payment.id, status: "PROCESSED" },
      _sum: { amount: true },
    });
    const remaining = Number(payment.amount) - Number(priorRefunds._sum.amount ?? 0);
    if (remaining <= 0) {
      return NextResponse.json({ error: "This payment has already been fully refunded" }, { status: 409 });
    }

    const refund = await prisma.refund.create({
      data: {
        projectId: project.id,
        paymentId: payment.id,
        clientId: project.clientId,
        requestedById: session.user.id,
        amount: remaining,
        currency: payment.currency,
        reason: body.reason,
        status: "REQUESTED",
        idempotencyKey: crypto.randomUUID(),
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "refund.requested",
      entityType: "Refund",
      entityId: refund.id,
      metadata: { projectId: project.id, paymentId: payment.id, amount: remaining },
    });

    await notifyAdmins({
      type: "PROJECT_STATUS_CHANGED",
      title: `Refund requested for ${project.name}`,
      body: body.reason,
      entityType: "Refund",
      entityId: refund.id,
    });

    return NextResponse.json({ refund }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
