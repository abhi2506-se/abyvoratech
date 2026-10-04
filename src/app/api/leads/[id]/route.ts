import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessLead, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const updateLeadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  status: z
    .enum([
      "NEW",
      "CONTACTED",
      "REPLIED",
      "QUALIFIED",
      "PROPOSAL_SENT",
      "NEGOTIATION",
      "WON",
      "LOST",
      "CONVERTED",
    ])
    .optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { lead } = await assertCanAccessLead(id);
    return NextResponse.json({ lead });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, lead } = await assertCanAccessLead(id);
    const body = await req.json();
    const data = updateLeadSchema.parse(body);

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { ...data, website: data.website || undefined },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "lead.updated",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { changes: data },
    });

    return NextResponse.json({ lead: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, lead } = await assertCanAccessLead(id);

    // Only Admin can hard-delete; Agents can only mark LOST.
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only Admin can delete leads" }, { status: 403 });
    }

    await prisma.lead.delete({ where: { id: lead.id } });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "lead.deleted",
      entityType: "Lead",
      entityId: lead.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
