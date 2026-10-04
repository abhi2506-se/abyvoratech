import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";

const schema = z.object({
  agentId: z.string().min(1).nullable(), // null unassigns
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);
    if (session.user.role !== "ADMIN") throw new AuthzError("Only Admin can assign agents", 403);

    const { agentId, reason } = schema.parse(await req.json());

    if (agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { user: true } });
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const previousAgentId = project.assignedAgentId;
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { assignedAgentId: agentId },
      include: { assignedAgent: { include: { user: true } } },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: agentId ? "project.agent_assigned" : "project.agent_unassigned",
      entityType: "Project",
      entityId: project.id,
      previousValue: { assignedAgentId: previousAgentId },
      newValue: { assignedAgentId: agentId },
      metadata: { reason },
    });

    if (updated.assignedAgent?.user?.id) {
      await notifyUser({
        userId: updated.assignedAgent.user.id,
        type: "AGENT_ASSIGNED",
        title: `You were assigned to ${project.name}`,
        body: reason,
        entityType: "Project",
        entityId: project.id,
      });
    }

    return NextResponse.json({ project: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
