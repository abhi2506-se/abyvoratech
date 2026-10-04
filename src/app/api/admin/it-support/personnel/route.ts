import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
});

export async function GET() {
  try {
    await requireRole("ADMIN");
    const personnel = await prisma.user.findMany({
      where: { role: "IT_SUPPORT" },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ personnel });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = createSchema.parse(await req.json());
    const emailLower = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existing) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });

    // Temporary password — real deployment should instead email an
    // invite/set-password link via the existing password-reset token flow;
    // this at least avoids ever displaying/logging a guessable default.
    const tempPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: { name: body.name, email: emailLower, passwordHash, role: "IT_SUPPORT", status: "ACTIVE" },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "it_support.personnel_created",
      entityType: "User",
      entityId: user.id,
    });

    return NextResponse.json(
      {
        user: { id: user.id, name: user.name, email: user.email },
        temporaryPassword: tempPassword,
        note: "Share this temporary password securely and have them change it on first login. (This build has no forced-password-change flow yet — treat this as a known gap.)",
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
