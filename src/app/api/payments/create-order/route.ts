import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { createRazorpayOrder, RazorpayConfigError } from "@/lib/razorpay";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  projectId: z.string().min(1),
  // Which figure to charge — never trust a client-supplied amount directly.
  amountType: z.enum(["ADVANCE", "FULL", "REMAINING"]),
});

function toSmallestUnit(amount: number) {
  // INR/most Razorpay-supported currencies use 2 decimal places (paise, cents).
  return Math.round(amount * 100);
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, amountType } = schema.parse(await req.json());
    const { session, project } = await assertCanAccessProject(projectId);

    if (session.user.role !== "CLIENT") {
      throw new AuthzError("Only the client can initiate payment for their project", 403);
    }

    if (!["PAYMENT_PENDING", "SUBMITTED"].includes(project.status)) {
      return NextResponse.json(
        { error: `Project is not currently awaiting payment (status: ${project.status})` },
        { status: 409 }
      );
    }

    if (!project.totalValue) {
      return NextResponse.json(
        { error: "This project does not yet have a price set. Contact your account manager." },
        { status: 409 }
      );
    }

    // Determine the authoritative amount server-side from the Project record —
    // never from anything the client sends.
    let amount: number;
    if (amountType === "ADVANCE") {
      if (!project.advanceAmount) {
        return NextResponse.json({ error: "No advance amount configured for this project." }, { status: 409 });
      }
      amount = Number(project.advanceAmount);
    } else if (amountType === "FULL") {
      amount = Number(project.totalValue);
    } else {
      const paidAgg = await prisma.payment.aggregate({
        where: { projectId: project.id, status: "CAPTURED" },
        _sum: { amount: true },
      });
      const paid = Number(paidAgg._sum.amount ?? 0);
      amount = Number(project.totalValue) - paid;
      if (amount <= 0) {
        return NextResponse.json({ error: "This project has already been paid in full." }, { status: 409 });
      }
    }

    const receipt = `proj_${project.id}_${Date.now()}`;

    let order;
    try {
      order = await createRazorpayOrder({
        amountInSmallestUnit: toSmallestUnit(amount),
        currency: project.currency,
        receipt,
        notes: { projectId: project.id, clientId: project.clientId, amountType },
      });
    } catch (err) {
      if (err instanceof RazorpayConfigError) {
        return NextResponse.json({ error: "Payments are not configured yet. Contact support." }, { status: 503 });
      }
      throw err;
    }

    const payment = await prisma.payment.create({
      data: {
        projectId: project.id,
        clientId: project.clientId,
        agentId: project.assignedAgentId,
        provider: "razorpay",
        providerOrderId: order.id,
        amount,
        currency: project.currency,
        status: "CREATED",
        receipt,
        metadata: { amountType },
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "payment.order_created",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { projectId: project.id, amount, amountType, providerOrderId: order.id },
    });

    return NextResponse.json({
      paymentId: payment.id,
      orderId: order.id,
      amount: toSmallestUnit(amount),
      currency: project.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
