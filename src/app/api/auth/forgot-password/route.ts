import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPasswordResetToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email/transactional";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureRequestContext, writeAuditLog } from "@/lib/audit";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const { ipAddress } = await captureRequestContext();
    const rl = checkRateLimit(`forgot-password:${ipAddress ?? "unknown"}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { email } = schema.parse(await req.json());
    const emailLower = email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (user && user.passwordHash) {
      const rawToken = await createPasswordResetToken(emailLower);
      await sendPasswordResetEmail(emailLower, user.name, rawToken);
      await writeAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: "auth.password_reset_requested",
        entityType: "User",
        entityId: user.id,
        ipAddress,
      });
    }

    // Generic response regardless of account existence.
    return NextResponse.json({
      message: "If an account exists for this email, a password reset link has been sent.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
