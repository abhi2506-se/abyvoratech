import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, clientScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  preferredLanguage: z.string().max(10).default("en"),
  assignedAgentId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const scope = clientScope(session);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");

    const clients = await prisma.client.findMany({
      where: {
        ...scope,
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
      include: {
        assignedAgent: { include: { user: true } },
        projects: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ clients });
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
    const data = createClientSchema.parse(body);

    const assignedAgentId =
      session.user.role === "ADMIN" ? data.assignedAgentId ?? null : session.user.agentId ?? null;

    const existing = await prisma.client.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 });
    }

    const client = await prisma.client.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        country: data.country,
        preferredLanguage: data.preferredLanguage,
        assignedAgentId,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "client.created",
      entityType: "Client",
      entityId: client.id,
    });

    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
