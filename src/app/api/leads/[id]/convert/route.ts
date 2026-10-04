import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessLead, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

/**
 * Converts a Lead into a Client without duplicate data entry.
 * The Client row links back to the Lead (leadId) so the full history
 * (source, notes, original contact) stays intact and queryable.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, lead } = await assertCanAccessLead(id);

    if (lead.status === "CONVERTED") {
      const existing = await prisma.client.findUnique({ where: { leadId: lead.id } });
      return NextResponse.json({ client: existing, alreadyConverted: true });
    }

    const existingClient = await prisma.client.findUnique({ where: { email: lead.email } });
    if (existingClient) {
      return NextResponse.json(
        { error: "A client with this email already exists" },
        { status: 409 }
      );
    }

    const [client] = await prisma.$transaction([
      prisma.client.create({
        data: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          country: lead.country,
          assignedAgentId: lead.agentId,
          leadId: lead.id,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONVERTED" },
      }),
    ]);

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "lead.converted_to_client",
      entityType: "Client",
      entityId: client.id,
      metadata: { leadId: lead.id },
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
