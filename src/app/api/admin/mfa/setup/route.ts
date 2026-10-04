import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { generateMfaSecret, totpAuthUri } from "@/lib/mfa";

/**
 * Begins MFA enrollment: generates a new secret and returns its enrollment
 * URI (for a QR code) plus the raw secret as a manual-entry fallback.
 *
 * The secret is persisted immediately but `mfaEnabled` stays false until
 * POST /api/admin/mfa/confirm proves the user actually saved it by
 * submitting one valid code — otherwise a user could "enable" MFA with a
 * secret they never captured and permanently lock themselves out.
 *
 * Scope: Platform Owner only. Session-only (not requirePlatformOwner's full
 * MFA-verified check) since this route IS how MFA gets verified for the
 * first time — a chicken-and-egg the full gate would otherwise block.
 */
export async function POST() {
  try {
    const session = await requireSession();
    if (session.user.role !== "PLATFORM_OWNER") {
      throw new AuthzError("Platform Owner access required", 403);
    }

    const secret = generateMfaSecret();
    await prisma.user.update({
      where: { id: session.user.id },
      data: { mfaSecret: secret, mfaEnabled: false, mfaRecoveryCodes: [] },
    });

    return NextResponse.json({
      secret,
      otpauthUri: totpAuthUri(secret, session.user.email),
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
