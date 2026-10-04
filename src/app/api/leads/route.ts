import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, leadScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  agentId: z.string().optional(), // ADMIN only: assign to a specific agent
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const scope = leadScope(session);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const leads = await prisma.lead.findMany({
      where: {
        ...scope,
        ...(status ? { status: status as any } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { agent: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ leads });
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
    const data = createLeadSchema.parse(body);

    // Agents can only create leads assigned to themselves, regardless of what
    // the request body claims — this is enforced server-side, not just hidden in UI.
    const agentId =
      session.user.role === "ADMIN" ? data.agentId ?? null : session.user.agentId ?? null;

    const lead = await prisma.lead.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        country: data.country,
        website: data.website || undefined,
        industry: data.industry,
        source: data.source,
        notes: data.notes,
        agentId,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "lead.created",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { name: lead.name, email: lead.email },
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
