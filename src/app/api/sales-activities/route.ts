import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, agentOwnedScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const ACTIVITY_TYPES = [
  "INITIAL_OUTREACH",
  "FOLLOW_UP",
  "DEMO_REQUEST",
  "MEETING_REQUEST",
  "PROPOSAL_REQUEST",
  "NEGOTIATION",
  "WON",
  "LOST",
  "NOT_INTERESTED",
  "NO_RESPONSE",
] as const;

const createSchema = z.object({
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  activityType: z.enum(ACTIVITY_TYPES),
  notes: z.string().max(3000).optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  agentId: z.string().optional(), // ADMIN only
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const scope = agentOwnedScope(session);
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");

    const activities = await prisma.salesActivity.findMany({
      where: { ...scope, ...(leadId ? { leadId } : {}) },
      include: { agent: { include: { user: true } }, lead: true, client: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    return NextResponse.json({ activities });
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
    const data = createSchema.parse(body);

    const agentId =
      session.user.role === "ADMIN" ? data.agentId ?? session.user.agentId : session.user.agentId;
    if (!agentId) throw new AuthzError("No agent context to attach this activity to", 400);

    if (data.leadId && session.user.role === "AGENT") {
      const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
      if (!lead || lead.agentId !== session.user.agentId) {
        throw new AuthzError("You do not have access to this lead", 403);
      }
    }

    const activity = await prisma.salesActivity.create({
      data: {
        agentId,
        leadId: data.leadId,
        clientId: data.clientId,
        activityType: data.activityType,
        notes: data.notes,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "sales_activity.created",
      entityType: "SalesActivity",
      entityId: activity.id,
      description: `${session.user.name} logged sales activity: ${activity.activityType}`,
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
