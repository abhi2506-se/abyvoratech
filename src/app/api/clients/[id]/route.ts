import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessClient, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  website: z.string().url().max(300).optional().or(z.literal("")),
  companyDescription: z.string().max(4000).optional(),
  profileImage: z.string().url().max(1000).optional().or(z.literal("")),
  preferredLanguage: z.string().max(10).optional(),
  assignedAgentId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { client } = await assertCanAccessClient(id);
    const full = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        assignedAgent: { include: { user: true } },
        projects: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        lead: true,
      },
    });
    return NextResponse.json({ client: full });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, client } = await assertCanAccessClient(id);

    if (session.user.role === "CLIENT") {
      // Clients may only edit their own contact/profile fields, not agent assignment.
      const body = updateSchema
        .omit({ assignedAgentId: true })
        .parse(await req.json());
      const updated = await prisma.client.update({ where: { id: client.id }, data: body });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "client.self_profile_updated",
        entityType: "Client",
        entityId: client.id,
        metadata: { changes: body },
      });

      return NextResponse.json({ client: updated });
    }

    const data = updateSchema.parse(await req.json());
    const updated = await prisma.client.update({ where: { id: client.id }, data });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "client.updated",
      entityType: "Client",
      entityId: client.id,
      metadata: { changes: data },
    });

    return NextResponse.json({ client: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
