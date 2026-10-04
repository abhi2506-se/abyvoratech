import type { EmailType } from "@prisma/client";

export class EmailConfigError extends Error {}

/**
 * Resolves the From identity for a given email type from server-side env vars
 * only. This is deliberately the ONLY place that decides the From address —
 * nothing in the compose form or API body can override it, which is what
 * prevents sender spoofing (spec section 8).
 */
export function resolveSenderIdentity(emailType: EmailType): { email: string; name: string } {
  if (emailType === "PROPOSAL") {
    const email = process.env.EMAIL_FROM_PROPOSAL;
    const name = process.env.EMAIL_FROM_PROPOSAL_NAME || "ABYVORA Proposals";
    if (!email) {
      throw new EmailConfigError(
        "EMAIL_FROM_PROPOSAL is not configured. Set it in your environment and verify that address's domain in Resend before sending proposal emails."
      );
    }
    return { email, name };
  }

  if (emailType === "SALES") {
    const email = process.env.EMAIL_FROM_SALES;
    const name = process.env.EMAIL_FROM_SALES_NAME || "ABYVORA Sales";
    if (!email) {
      throw new EmailConfigError(
        "EMAIL_FROM_SALES is not configured. Set it in your environment and verify that address's domain in Resend before sending sales emails."
      );
    }
    return { email, name };
  }

  const email = process.env.EMAIL_FROM_GENERAL || process.env.EMAIL_FROM_SALES;
  const name = process.env.EMAIL_FROM_GENERAL_NAME || "ABYVORA Technologies";
  if (!email) {
    throw new EmailConfigError("No general sender address configured (EMAIL_FROM_GENERAL).");
  }
  return { email, name };
}
