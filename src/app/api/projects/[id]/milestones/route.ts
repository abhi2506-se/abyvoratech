import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, requireRole, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await assertCanAccessProject(id);
    const milestones = await prisma.milestone.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ milestones });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  percentage: z.number().int().min(1).max(100),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  requiresClientApproval: z.boolean().optional(),
});

// Milestone CREATION is Admin-only (spec section 11: "Admin creates milestones").
// Agents update progress on existing milestones via PATCH /api/milestones/[id].
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole("ADMIN");
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const data = createSchema.parse(await req.json());

    const existing = await prisma.milestone.aggregate({
      where: { projectId: id },
      _sum: { percentage: true },
    });
    const totalAfter = (existing._sum.percentage ?? 0) + data.percentage;
    if (totalAfter > 100) {
      return NextResponse.json(
        { error: `Milestone percentages would total ${totalAfter}% — cannot exceed 100% across a project's milestones` },
        { status: 400 }
      );
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId: id,
        name: data.name,
        description: data.description,
        percentage: data.percentage,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        requiresClientApproval: data.requiresClientApproval ?? true,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "milestone.created",
      entityType: "Milestone",
      entityId: milestone.id,
      description: `${session.user.name} created milestone "${milestone.name}" (${milestone.percentage}%) on project "${project.name}"`,
    });

    await notifyProjectParticipants(id, {
      excludeUserId: session.user.id,
      type: "MILESTONE_CREATED",
      title: "New milestone added",
      body: `"${milestone.name}" was added to your project`,
    }).catch(() => {});

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
