import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, AuthzError, toApiError } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || undefined;

    let where: any = {};
    if (session.user.role === "CLIENT") {
      where.clientId = session.user.clientId;
    } else if (session.user.role === "AGENT") {
      throw new AuthzError("Agents do not have access to payment records", 403);
    }
    if (projectId) where.projectId = projectId;

    const payments = await prisma.payment.findMany({
      where,
      include: { project: { select: { name: true } }, client: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ payments });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
