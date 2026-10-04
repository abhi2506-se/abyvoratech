import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const rules = await prisma.commissionRule.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ rules });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    sourceType: z.string().min(1).max(100),
    percentage: z.number().min(0).max(100).optional(),
    flatAmount: z.number().min(0).optional(),
  })
  .refine((d) => d.percentage !== undefined || d.flatAmount !== undefined, {
    message: "Provide either a percentage or a flat amount",
  });

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = await req.json();
    const data = createSchema.parse(body);

    const rule = await prisma.commissionRule.create({ data });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "commission_rule.created",
      entityType: "CommissionRule",
      entityId: rule.id,
      description: `${session.user.name} created commission rule "${rule.name}" for ${rule.sourceType}`,
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
