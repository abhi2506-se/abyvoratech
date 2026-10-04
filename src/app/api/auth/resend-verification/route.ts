import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email/transactional";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureRequestContext } from "@/lib/audit";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const { ipAddress } = await captureRequestContext();
    const rl = checkRateLimit(`resend-verify:${ipAddress ?? "unknown"}`, 3, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const { email } = schema.parse(await req.json());
    const emailLower = email.toLowerCase();

    // Always return the same generic message regardless of whether the
    // account exists or is already verified — prevents account enumeration.
    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (user && !user.emailVerified) {
      const rawToken = await createEmailVerificationToken(emailLower);
      await sendVerificationEmail(emailLower, user.name, rawToken);
    }

    return NextResponse.json({
      message: "If an unverified account exists for this email, a new verification link has been sent.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
