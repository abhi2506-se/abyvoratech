import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, agentOwnedScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

// Agents see only their own commission ledger; Admin sees everyone's.
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const scope = agentOwnedScope(session);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const commissions = await prisma.commission.findMany({
      where: { ...scope, ...(status ? { status: status as any } : {}) },
      include: { agent: { include: { user: true } }, commissionRule: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    return NextResponse.json({ commissions });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

// Admin-only: manually record a commission (e.g. an off-platform sale) with a
// caller-supplied idempotency key so retries/duplicate submissions can't double-pay.
const createSchema = z.object({
  agentId: z.string(),
  sourceType: z.string().min(1).max(100),
  sourceId: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.string().max(10).optional(),
  commissionRuleId: z.string().optional(),
  idempotencyKey: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = await req.json();
    const data = createSchema.parse(body);

    const existing = await prisma.commission.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      return NextResponse.json({ commission: existing, deduped: true }, { status: 200 });
    }

    const commission = await prisma.commission.create({
      data: {
        agentId: data.agentId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        amount: data.amount,
        currency: data.currency ?? "INR",
        commissionRuleId: data.commissionRuleId,
        idempotencyKey: data.idempotencyKey,
        calculationSnapshot: { manualEntryBy: session.user.id, at: new Date().toISOString() },
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "commission.created",
      entityType: "Commission",
      entityId: commission.id,
      description: `${session.user.name} recorded a commission of ${commission.currency} ${commission.amount} for agent`,
      newValue: { amount: commission.amount, status: commission.status },
    });

    return NextResponse.json({ commission }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
