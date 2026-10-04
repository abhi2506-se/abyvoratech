import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, agentOwnedScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(3000).optional(),
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  agentId: z.string().optional(), // ADMIN only
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const scope = agentOwnedScope(session);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const overdue = searchParams.get("overdue") === "true";

    const tasks = await prisma.task.findMany({
      where: {
        ...scope,
        ...(status ? { status: status as any } : {}),
        ...(overdue ? { dueAt: { lt: new Date() }, status: "PENDING" } : {}),
      },
      include: {
        agent: { include: { user: true } },
        lead: true,
        client: true,
        project: true,
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 300,
    });

    return NextResponse.json({ tasks });
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
    const data = createTaskSchema.parse(body);

    const agentId =
      session.user.role === "ADMIN" ? data.agentId ?? session.user.agentId : session.user.agentId;
    if (!agentId) throw new AuthzError("No agent context to attach this task to", 400);

    const task = await prisma.task.create({
      data: {
        agentId,
        title: data.title,
        notes: data.notes,
        leadId: data.leadId,
        clientId: data.clientId,
        projectId: data.projectId,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        priority: data.priority ?? "MEDIUM",
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      description: `${session.user.name} created a follow-up: "${task.title}"`,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
