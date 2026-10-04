import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Reuses the NextAuth `VerificationToken` table for both email verification
 * and password reset, distinguished by an `identifier` prefix. Tokens are
 * stored hashed (SHA-256) so a database read alone never yields a usable
 * token — only the raw value emailed to the user does.
 */
const EMAIL_VERIFY_PREFIX = "verify-email:";
const PASSWORD_RESET_PREFIX = "reset-password:";

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createToken(identifierPrefix: string, email: string, ttlMs: number) {
  const identifier = `${identifierPrefix}${email}`;
  // Invalidate any previous outstanding tokens of this kind for this email.
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const raw = generateRawToken();
  const token = hashToken(raw);
  const expires = new Date(Date.now() + ttlMs);

  await prisma.verificationToken.create({ data: { identifier, token, expires } });
  return raw;
}

async function consumeToken(identifierPrefix: string, email: string, raw: string) {
  const identifier = `${identifierPrefix}${email}`;
  const token = hashToken(raw);

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });
  if (!record) return { valid: false as const };
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
    return { valid: false as const };
  }

  await prisma.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
  return { valid: true as const };
}

export function createEmailVerificationToken(email: string) {
  return createToken(EMAIL_VERIFY_PREFIX, email, 24 * 60 * 60 * 1000); // 24h
}

export function consumeEmailVerificationToken(email: string, raw: string) {
  return consumeToken(EMAIL_VERIFY_PREFIX, email, raw);
}

export function createPasswordResetToken(email: string) {
  return createToken(PASSWORD_RESET_PREFIX, email, 60 * 60 * 1000); // 1h
}

export function consumePasswordResetToken(email: string, raw: string) {
  return consumeToken(PASSWORD_RESET_PREFIX, email, raw);
}
