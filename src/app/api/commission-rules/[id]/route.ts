import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  active: z.boolean().optional(),
  percentage: z.number().min(0).max(100).optional(),
  flatAmount: z.number().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("ADMIN");
    const rule = await prisma.commissionRule.findUnique({ where: { id } });
    if (!rule) throw new AuthzError("Not found", 404);

    const data = patchSchema.parse(await req.json());
    const updated = await prisma.commissionRule.update({ where: { id }, data });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "commission_rule.updated",
      entityType: "CommissionRule",
      entityId: id,
      description: `${session.user.name} updated commission rule "${rule.name}"`,
      previousValue: { active: rule.active, percentage: rule.percentage, flatAmount: rule.flatAmount },
      newValue: data,
    });

    return NextResponse.json({ rule: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
