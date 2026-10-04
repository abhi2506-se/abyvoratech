import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeEmailVerificationToken } from "@/lib/tokens";
import { writeAuditLog, captureRequestContext } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const { ipAddress } = await captureRequestContext();
    const rl = checkRateLimit(`verify-email:${ipAddress ?? "unknown"}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { email, token } = schema.parse(await req.json());
    const emailLower = email.toLowerCase();

    const result = await consumeEmailVerificationToken(emailLower, token);
    if (!result.valid) {
      return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }),
      prisma.client.updateMany({
        where: { userId: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "client.email_verified",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    return NextResponse.json({ message: "Email verified. You can now log in." });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
