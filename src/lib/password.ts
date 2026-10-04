/**
 * Minimal password strength gate: requires at least one letter and one
 * number. Length is enforced separately via zod (min 10). This does not
 * replace a breached-password check (e.g. HaveIBeenPwned range API) — that
 * would be a reasonable follow-up before handling real client payments.
 */
export function isWeakPassword(password: string): boolean {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return !(hasLetter && hasNumber);
}
