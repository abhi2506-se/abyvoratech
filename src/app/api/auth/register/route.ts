import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, captureRequestContext } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email/transactional";
import { isWeakPassword } from "@/lib/password";

const registerSchema = z.object({
  fullName: z.string().min(2).max(200),
  companyName: z.string().max(200).optional(),
  email: z.string().email().max(255),
  password: z.string().min(10).max(200),
  phone: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  acceptedTerms: z.literal(true, {
    message: "You must accept the Terms of Service and Privacy Policy.",
  }),
});

// Basic composition check beyond raw length — mirrors what most auth
// providers enforce; does not replace a proper breached-password check.
export async function POST(req: NextRequest) {
  try {
    const { ipAddress } = await captureRequestContext();

    // Rate limit by IP to slow down bulk account creation / enumeration.
    const rl = checkRateLimit(`register:${ipAddress ?? "unknown"}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = registerSchema.parse(await req.json());

    if (isWeakPassword(body.password)) {
      return NextResponse.json(
        { error: "Password must contain at least one letter and one number." },
        { status: 400 }
      );
    }

    const emailLower = body.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingUser) {
      // Deliberately generic message — do not reveal whether the email is
      // registered (prevents account enumeration).
      return NextResponse.json(
        { message: "If this email can be registered, a verification email has been sent." },
        { status: 200 }
      );
    }

    const existingClient = await prisma.client.findUnique({ where: { email: emailLower } });

    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: emailLower,
          name: body.fullName,
          passwordHash,
          role: "CLIENT",
          status: "ACTIVE",
          phone: body.phone,
        },
      });

      let client;
      if (existingClient && !existingClient.userId) {
        // A Client record already exists (e.g. created by an Agent from a
        // lead) but has no login yet — link this new account to it instead
        // of creating a duplicate Client row.
        client = await tx.client.update({
          where: { id: existingClient.id },
          data: {
            userId: user.id,
            name: body.fullName,
            company: body.companyName ?? existingClient.company,
            country: body.country ?? existingClient.country,
            termsAcceptedAt: new Date(),
          },
        });
      } else {
        client = await tx.client.create({
          data: {
            userId: user.id,
            name: body.fullName,
            email: emailLower,
            phone: body.phone,
            company: body.companyName,
            country: body.country,
            termsAcceptedAt: new Date(),
          },
        });
      }

      return { user, client };
    });

    await writeAuditLog({
      actorId: result.user.id,
      actorRole: "CLIENT",
      action: "client.registered",
      entityType: "Client",
      entityId: result.client.id,
      description: `${body.fullName} registered a client account`,
      ipAddress,
    });

    const rawToken = await createEmailVerificationToken(emailLower);
    const emailResult = await sendVerificationEmail(emailLower, body.fullName, rawToken);
    if (!emailResult.ok) {
      // Registration still succeeds — the account exists and the client can
      // request a fresh verification email — but we surface the real
      // delivery failure rather than pretending it was sent.
      return NextResponse.json(
        {
          message:
            "Account created, but the verification email could not be sent right now. Use 'Resend verification email' from the login page.",
          emailError: emailResult.error,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { message: "Account created. Check your email to verify your address before logging in." },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
