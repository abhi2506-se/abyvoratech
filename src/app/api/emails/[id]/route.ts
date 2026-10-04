import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const email = await prisma.emailMessage.findUnique({
      where: { id },
      include: {
        agent: { include: { user: true } },
        lead: true,
        client: true,
        proposal: true,
        attachments: true,
        events: { orderBy: { occurredAt: "desc" } },
        thread: { include: { messages: { orderBy: { createdAt: "asc" } } } },
      },
    });
    if (!email) throw new AuthzError("Not found", 404);

    if (session.user.role === "AGENT" && email.agentId !== session.user.agentId) {
      throw new AuthzError("You do not have access to this email", 403);
    }

    return NextResponse.json({ email });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const patchSchema = z.object({
  readAt: z.literal("now").optional(),
  important: z.boolean().optional(),
  archived: z.boolean().optional(),
});

// Agent-facing conversation actions: mark read, mark important, archive.
// Deliberately does NOT allow editing subject/body/status here — those are
// controlled by the send/webhook flows so history stays trustworthy.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const email = await prisma.emailMessage.findUnique({ where: { id } });
    if (!email) throw new AuthzError("Not found", 404);
    if (session.user.role === "AGENT" && email.agentId !== session.user.agentId) {
      throw new AuthzError("You do not have access to this email", 403);
    }

    const data = patchSchema.parse(await req.json());

    const updated = await prisma.emailMessage.update({
      where: { id },
      data: {
        ...(data.readAt === "now" ? { readAt: new Date() } : {}),
        ...(data.important !== undefined ? { important: data.important } : {}),
        ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
      },
    });

    if (data.archived !== undefined) {
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: data.archived ? "email.archived" : "email.unarchived",
        entityType: "EmailMessage",
        entityId: id,
        description: `${session.user.name} ${data.archived ? "archived" : "unarchived"} an email conversation`,
      });
    }

    return NextResponse.json({ email: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

