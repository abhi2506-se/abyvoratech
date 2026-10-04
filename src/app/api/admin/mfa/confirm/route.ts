import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ code: z.string().min(6).max(6) });

/**
 * Finalizes MFA enrollment: the user proves they captured the secret from
 * /setup by submitting one valid current code. On success, generates and
 * returns one-time recovery codes (shown exactly once, stored only as
 * SHA-256 hashes) and flips mfaEnabled on.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role !== "PLATFORM_OWNER") {
      throw new AuthzError("Platform Owner access required", 403);
    }

    const { code } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.mfaSecret) {
      throw new AuthzError("Call /api/admin/mfa/setup first", 400);
    }

    if (!verifyTotp(user.mfaSecret, code)) {
      return NextResponse.json({ error: "Invalid code. Check your authenticator app and try again." }, { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes();
    const hashed = await Promise.all(recoveryCodes.map(hashRecoveryCode));

    await prisma.user.update({
      where: { id: session.user.id },
      data: { mfaEnabled: true, mfaRecoveryCodes: hashed },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "platform_owner.mfa_enabled",
      entityType: "User",
      entityId: session.user.id,
      description: `${session.user.name} enabled MFA on their Platform Owner account`,
    });

    // Recovery codes are returned exactly once — never retrievable again,
    // only re-generatable (which invalidates the old set).
    return NextResponse.json({ recoveryCodes });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "A 6-digit code is required" }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
