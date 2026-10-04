import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { verifyTotp, hashRecoveryCode } from "@/lib/mfa";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { updateSession } from "@/lib/auth";

const schema = z.object({ code: z.string().min(6).max(9) });

/**
 * Second-factor check for an already-password-authenticated Platform Owner
 * session. On success, patches the JWT (via next-auth's unstable_update) so
 * `session.user.mfaVerified` flips to true — this is the only write path
 * for that flag; see the `trigger === "update"` branch in lib/auth.ts, which
 * ignores every other field a caller might try to smuggle in.
 *
 * Accepts either a 6-digit TOTP code or one of the user's recovery codes
 * (format XXXX-XXXX-XXXX, consumed on use).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role !== "PLATFORM_OWNER") {
      throw new AuthzError("Platform Owner access required", 403);
    }
    if (!session.user.mfaEnabled) {
      return NextResponse.json({ error: "MFA is not enabled on this account" }, { status: 400 });
    }

    const rl = checkRateLimit(`mfa-verify:${session.user.id}`, 8, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 }
      );
    }

    const { code } = schema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.mfaSecret) {
      return NextResponse.json({ error: "MFA is not configured on this account" }, { status: 400 });
    }

    let verified = false;
    let usedRecoveryCode: string | null = null;

    if (/^\d{6}$/.test(code)) {
      verified = verifyTotp(user.mfaSecret, code);
    } else {
      const candidateHash = await hashRecoveryCode(code);
      if (user.mfaRecoveryCodes.includes(candidateHash)) {
        verified = true;
        usedRecoveryCode = candidateHash;
      }
    }

    if (!verified) {
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "platform_owner.mfa_failed",
        entityType: "User",
        entityId: session.user.id,
        status: "FAILED",
        description: `${session.user.name} submitted an invalid MFA code`,
      });
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    if (usedRecoveryCode) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((c) => c !== usedRecoveryCode) },
      });
    }

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: usedRecoveryCode ? "platform_owner.mfa_verified_via_recovery_code" : "platform_owner.mfa_verified",
      entityType: "User",
      entityId: session.user.id,
      description: `${session.user.name} completed MFA verification`,
    });

    await updateSession({ user: { mfaVerified: true } });

    return NextResponse.json({ verified: true, recoveryCodeConsumed: !!usedRecoveryCode });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "A code is required" }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
