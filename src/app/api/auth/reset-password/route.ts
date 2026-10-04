import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumePasswordResetToken } from "@/lib/tokens";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureRequestContext, writeAuditLog } from "@/lib/audit";
import { isWeakPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  newPassword: z.string().min(10).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const { ipAddress } = await captureRequestContext();
    const rl = checkRateLimit(`reset-password:${ipAddress ?? "unknown"}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { email, token, newPassword } = schema.parse(await req.json());
    const emailLower = email.toLowerCase();

    if (isWeakPassword(newPassword)) {
      return NextResponse.json(
        { error: "Password must contain at least one letter and one number." },
        { status: 400 }
      );
    }

    const result = await consumePasswordResetToken(emailLower, token);
    if (!result.valid) {
      return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Invalidate all existing sessions on password reset.
    await prisma.session.deleteMany({ where: { userId: user.id } });

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "auth.password_reset_completed",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    return NextResponse.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
