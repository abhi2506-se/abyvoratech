const EMAIL_RE = /^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/;
const MAX_RECIPIENTS = 25; // to + cc + bcc combined
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per attachment
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

export class EmailValidationError extends Error {}

export function isValidEmail(value: string): boolean {
  // Header-injection guard: reject anything containing CR/LF before format-checking.
  if (/[\r\n]/.test(value)) return false;
  return EMAIL_RE.test(value.trim());
}

export function assertValidRecipients(params: { to: string[]; cc?: string[]; bcc?: string[] }) {
  const all = [...params.to, ...(params.cc ?? []), ...(params.bcc ?? [])];
  if (params.to.length === 0) throw new EmailValidationError("At least one To recipient is required");

  for (const addr of all) {
    if (!isValidEmail(addr)) throw new EmailValidationError(`Invalid email address: ${addr}`);
  }

  const lower = all.map((a) => a.toLowerCase());
  const dupes = lower.filter((a, i) => lower.indexOf(a) !== i);
  if (dupes.length > 0) {
    throw new EmailValidationError(`Duplicate recipient(s): ${[...new Set(dupes)].join(", ")}`);
  }

  if (all.length > MAX_RECIPIENTS) {
    throw new EmailValidationError(`Too many recipients (max ${MAX_RECIPIENTS})`);
  }
}

export async function assertNotSuppressed(
  emails: string[],
  isSuppressed: (email: string) => Promise<boolean>
) {
  for (const email of emails) {
    if (await isSuppressed(email.toLowerCase())) {
      throw new EmailValidationError(`${email} is on the suppression list (previous bounce/complaint)`);
    }
  }
}

export function assertValidSubjectAndBody(subject: string, htmlBody: string) {
  if (/[\r\n]/.test(subject)) throw new EmailValidationError("Subject cannot contain line breaks");
  if (!subject.trim()) throw new EmailValidationError("Subject is required");
  if (!htmlBody || !htmlBody.trim()) throw new EmailValidationError("Email body is required");
}

export function assertValidAttachment(file: { mimeType: string; size: number; fileName: string }) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new EmailValidationError(`${file.fileName} exceeds the 10MB attachment limit`);
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.mimeType)) {
    throw new EmailValidationError(`${file.fileName} has an unsupported file type (${file.mimeType})`);
  }
  if (/\.\.|\//.test(file.fileName)) {
    throw new EmailValidationError("Invalid file name");
  }
}

/**
 * Minimal HTML sanitizer for AI-generated / agent-authored email bodies.
 * Strips script/style/iframe/object/embed tags and inline event handlers.
 * This is intentionally conservative — email bodies are simple formatted
 * text, not full web pages, so a small denylist is sufficient and avoids
 * pulling in a heavy HTML parser dependency.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = html;
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "");
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/javascript\s*:/gi, "");
  return out;
}
