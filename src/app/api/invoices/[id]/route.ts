import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { project: true, payment: true } });
    if (!invoice) throw new AuthzError("Not found", 404);

    if (session.user.role === "CLIENT" && invoice.clientId !== session.user.clientId) {
      throw new AuthzError("You do not have access to this invoice", 403);
    }
    if (session.user.role === "AGENT" && invoice.project.assignedAgentId !== session.user.agentId) {
      throw new AuthzError("You do not have access to this invoice", 403);
    }

    return NextResponse.json({ invoice });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
