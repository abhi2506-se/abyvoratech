import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, agentOwnedScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createProposalSchema = z.object({
  title: z.string().min(1).max(200),
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  agentId: z.string().optional(), // ADMIN only: assign to a specific agent
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();

    let where: any;
    if (session.user.role === "CLIENT") {
      if (!session.user.clientId) throw new AuthzError("No client profile", 400);
      where = { clientId: session.user.clientId };
    } else {
      where = agentOwnedScope(session);
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const proposals = await prisma.proposal.findMany({
      where: {
        ...where,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        agent: { include: { user: true } },
        lead: true,
        client: true,
        document: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ proposals });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const body = await req.json();
    const data = createProposalSchema.parse(body);

    // An agent can only ever create proposals under their own agentId, no
    // matter what the request body says — enforced here, not just in the UI.
    const agentId =
      session.user.role === "ADMIN" ? data.agentId ?? session.user.agentId : session.user.agentId;
    if (!agentId) throw new AuthzError("No agent context to attach this proposal to", 400);

    // If leadId is provided, an Agent may only attach to a lead they own.
    if (data.leadId && session.user.role === "AGENT") {
      const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
      if (!lead || lead.agentId !== session.user.agentId) {
        throw new AuthzError("You do not have access to this lead", 403);
      }
    }
    if (data.clientId && session.user.role === "AGENT") {
      const client = await prisma.client.findUnique({ where: { id: data.clientId } });
      if (!client || client.assignedAgentId !== session.user.agentId) {
        throw new AuthzError("You do not have access to this client", 403);
      }
    }

    const proposal = await prisma.proposal.create({
      data: {
        title: data.title,
        agentId,
        leadId: data.leadId,
        clientId: data.clientId,
        amount: data.amount,
        currency: data.currency ?? "INR",
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "proposal.created",
      entityType: "Proposal",
      entityId: proposal.id,
      description: `${session.user.name} created proposal "${proposal.title}"`,
      newValue: { title: proposal.title, status: proposal.status },
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
