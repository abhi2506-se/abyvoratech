import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  designation: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const agent = await prisma.agent.findUnique({ where: { id }, include: { user: true } });
    if (!agent) throw new AuthzError("Not found", 404);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.status) {
        await tx.user.update({ where: { id: agent.userId }, data: { status: data.status } });
      }
      return tx.agent.update({
        where: { id },
        data: { designation: data.designation, notes: data.notes },
        include: { user: true },
      });
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: data.status === "DISABLED" ? "agent.disabled" : data.status === "ACTIVE" ? "agent.enabled" : "agent.updated",
      entityType: "Agent",
      entityId: id,
      metadata: data,
    });

    return NextResponse.json({ agent: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
