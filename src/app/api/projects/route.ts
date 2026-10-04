import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, projectScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins, notifyProjectParticipants } from "@/lib/notifications";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  projectType: z.string().min(1).max(100),
  description: z.string().min(1).max(10000),
  requirements: z.string().max(10000).optional(),
  targetAudience: z.string().max(2000).optional(),
  deadline: z.string().datetime().optional(),
  budgetEstimate: z.number().positive().optional(),
  referenceUrls: z.array(z.string().url()).max(20).optional(),
  technologies: z.array(z.string().max(50)).max(30).optional(),
  totalValue: z.number().positive().optional(),
  advanceAmount: z.number().positive().optional(),
  clientId: z.string().optional(), // used when Admin/Agent creates on behalf of a client
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const scope = projectScope(session);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const projects = await prisma.project.findMany({
      where: { ...scope, ...(status ? { status: status as any } : {}) },
      include: {
        client: true,
        assignedAgent: { include: { user: true } },
        milestones: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ projects });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const data = createProjectSchema.parse(await req.json());

    let clientId: string;
    if (session.user.role === "CLIENT") {
      if (!session.user.clientId) throw new AuthzError("No client profile linked to this account", 400);
      clientId = session.user.clientId;
    } else {
      if (!data.clientId) throw new AuthzError("clientId is required", 400);
      // Reuses the same access check used everywhere else, so an Agent can only
      // attach a project to a client they're actually assigned to.
      const { assertCanAccessClient } = await import("@/lib/authz");
      await assertCanAccessClient(data.clientId);
      clientId = data.clientId;
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });

    const project = await prisma.project.create({
      data: {
        name: data.name,
        clientId,
        assignedAgentId: client?.assignedAgentId ?? null,
        projectType: data.projectType,
        description: data.description,
        requirements: data.requirements,
        targetAudience: data.targetAudience,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        budgetEstimate: data.budgetEstimate,
        referenceUrls: data.referenceUrls ?? [],
        technologies: data.technologies ?? [],
        totalValue: data.totalValue,
        advanceAmount: data.advanceAmount,
        status: "SUBMITTED",
        statusHistory: {
          create: { toStatus: "SUBMITTED", changedById: session.user.id },
        },
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "project.submitted",
      entityType: "Project",
      entityId: project.id,
    });

    await notifyAdmins({
      type: "PROJECT_SUBMITTED",
      title: `New project request: ${project.name}`,
      body: `${client?.name ?? "A client"} submitted a new ${data.projectType} request.`,
      entityType: "Project",
      entityId: project.id,
    });
    if (project.assignedAgentId) {
      await notifyProjectParticipants(project.id, {
        type: "PROJECT_SUBMITTED",
        title: `New project request: ${project.name}`,
        body: "A client you're assigned to submitted a new project request.",
        excludeUserId: session.user.id,
      });
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
