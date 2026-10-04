import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await params;
    const { status: newStatus } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== "IT_SUPPORT") {
      throw new AuthzError("IT Support account not found", 404);
    }

    if (newStatus === "DISABLED" && user.status === "ACTIVE") {
      // Real, server-enforced protection — not just a frontend warning.
      // Count active IT_SUPPORT accounts OTHER than this one; if zero, block.
      const otherActiveCount = await prisma.user.count({
        where: { role: "IT_SUPPORT", status: "ACTIVE", id: { not: user.id } },
      });
      if (otherActiveCount === 0) {
        return NextResponse.json(
          {
            error:
              "Protected IT Support System: you cannot remove or deactivate the last active IT Support account. " +
              "At least one authorized IT Support account must remain active to ensure platform support and recovery. " +
              "Add another authorized IT Support account first, or use the secure recovery procedure.",
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data: { status: newStatus } });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: newStatus === "DISABLED" ? "it_support.personnel_deactivated" : "it_support.personnel_reactivated",
      entityType: "User",
      entityId: user.id,
    });

    return NextResponse.json({ user: { id: updated.id, name: updated.name, email: updated.email, status: updated.status } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
