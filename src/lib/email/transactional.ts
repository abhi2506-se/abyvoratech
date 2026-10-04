import { sendEmailViaResend } from "@/lib/email/resend";
import { resolveSenderIdentity } from "@/lib/email/senders";
import type { EmailType } from "@prisma/client";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * These are real sends through the same Resend client used for proposal/sales
 * mail — never simulated. If RESEND_API_KEY or the sender identity isn't
 * configured, the caller receives ok:false and must surface that, not pretend
 * the email went out.
 */
export async function sendVerificationEmail(to: string, name: string, rawToken: string) {
  const sender = resolveSenderIdentity("GENERAL" as EmailType);
  const link = `${appUrl()}/verify-email?email=${encodeURIComponent(to)}&token=${rawToken}`;

  return sendEmailViaResend({
    from: `${sender.name} <${sender.email}>`,
    to: [to],
    subject: "Verify your ABYVORA account",
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address to activate your ABYVORA Client Portal account.</p><p><a href="${link}">Verify email address</a></p><p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>`,
    text: `Hi ${name},\n\nConfirm your email address to activate your ABYVORA Client Portal account:\n${link}\n\nThis link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, rawToken: string) {
  const sender = resolveSenderIdentity("GENERAL" as EmailType);
  const link = `${appUrl()}/reset-password?email=${encodeURIComponent(to)}&token=${rawToken}`;

  return sendEmailViaResend({
    from: `${sender.name} <${sender.email}>`,
    to: [to],
    subject: "Reset your ABYVORA password",
    html: `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password will not change.</p>`,
    text: `Hi ${name},\n\nWe received a request to reset your password:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
