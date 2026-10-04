import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  designation: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

function generateTempPassword() {
  // 12-char readable temporary password, e.g. "Xk4p-Tq82-Rw"
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x").slice(0, 12);
}

export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const agents = await prisma.agent.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, status: true } },
        _count: { select: { leads: true, clients: true, projects: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ agents });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const data = createAgentSchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const agent = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: "AGENT",
          status: "ACTIVE",
        },
      });
      return tx.agent.create({
        data: {
          userId: user.id,
          designation: data.designation,
          notes: data.notes,
        },
        include: { user: true },
      });
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "agent.created",
      entityType: "Agent",
      entityId: agent.id,
      metadata: { email: data.email },
    });

    // Temp password is returned ONCE in this response only — it is never
    // stored in plaintext or logged. Share it with the agent out of band
    // and have them change it after first login (password change UI is a
    // later phase — for now, re-run this differently or update via SQL if needed).
    return NextResponse.json({ agent, tempPassword }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
