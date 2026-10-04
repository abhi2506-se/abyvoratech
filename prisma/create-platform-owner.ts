/**
 * Creates (or resets) the Platform Owner / Super Admin account.
 *
 * Credentials are read from environment variables so no password is ever
 * written into source control:
 *
 *   OWNER_EMAIL      required
 *   OWNER_PASSWORD   required (min 12 characters)
 *   OWNER_NAME       optional (default "Platform Owner")
 *   OWNER_RESET      optional; set to "true" to overwrite the password of an
 *                    existing account (and clear its MFA so you re-enroll)
 *
 * Run:  npm run create-owner
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase(); // login lowercases too
  const password = process.env.OWNER_PASSWORD;
  const name = process.env.OWNER_NAME?.trim() || "Platform Owner";
  const reset = process.env.OWNER_RESET === "true";

  if (!email || !password) {
    console.error("Set OWNER_EMAIL and OWNER_PASSWORD before running this script.");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("OWNER_EMAIL is not a valid email address.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("OWNER_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && existing.role !== "PLATFORM_OWNER") {
    console.error(
      `${email} already exists with role ${existing.role}. Refusing to change its role — use a different email.`
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (!existing) {
    // Platform Owner is intentionally not attached to any Organization.
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "PLATFORM_OWNER",
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });
    console.log(`Created Platform Owner: ${email}`);
    console.log("Sign in at /login — you will be asked to enroll MFA on first login.");
    return;
  }

  if (!reset) {
    console.log(`Platform Owner ${email} already exists. Set OWNER_RESET=true to overwrite the password.`);
    return;
  }

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      name,
      status: "ACTIVE",
      // Clear MFA so a lost authenticator cannot lock the owner out;
      // the owner re-enrolls at /admin/mfa on next login.
      mfaEnabled: false,
      mfaSecret: null,
      mfaRecoveryCodes: [],
    },
  });
  console.log(`Reset password and MFA for Platform Owner: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
