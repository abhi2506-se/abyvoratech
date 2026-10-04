import crypto from "crypto";

/**
 * Minimal, dependency-free TOTP (RFC 6238) + HOTP (RFC 4226) implementation
 * used to enforce MFA for Platform Owner accounts. No external package
 * (otplib/speakeasy) is required — this is ~100 lines of well-specified
 * crypto, and keeping it in-repo avoids trusting a third-party package with
 * the platform's highest-privilege login path.
 *
 * Secrets are stored Base32-encoded on User.mfaSecret and are never sent to
 * the client after initial enrollment (the enrollment response is the only
 * place the raw secret/QR URI appears).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const WINDOW = 1; // tolerate ±1 step (±30s) of clock drift

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Generates a new random MFA secret, Base32-encoded for authenticator apps. */
export function generateMfaSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (binary % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, "0");
  return code;
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / STEP_SECONDS);
}

/** Generates the current 6-digit TOTP code for a secret — used only in tests. */
export function generateTotp(secret: string): string {
  return hotp(secret, currentStep());
}

/**
 * Verifies a user-submitted TOTP code against the secret, tolerating a small
 * window of clock drift. Uses a constant-time comparison so response timing
 * can't be used to narrow down the correct code digit by digit.
 */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const step = currentStep();
  for (let errorWindow = -WINDOW; errorWindow <= WINDOW; errorWindow++) {
    const candidate = hotp(secret, step + errorWindow);
    if (
      candidate.length === clean.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))
    ) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for rendering an enrollment QR code in an authenticator app. */
export function totpAuthUri(secret: string, email: string, issuer = "ABYVORA"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Generates one-time recovery codes for when the authenticator device is lost. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-")
  );
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}
