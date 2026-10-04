import crypto from "crypto";

export class HandoffError extends Error {}

/**
 * Purposes are a closed set, not an arbitrary redirect target — this is the
 * "secure redirect allowlist" from spec section 17. The token payload can
 * only ever resolve to one of these, never an attacker-supplied URL.
 */
export type HandoffPurpose = "WEBSITE_AUDIT" | "CLIENT_REGISTER" | "PROJECT_REQUEST";

export type HandoffPayload = {
  purpose: HandoffPurpose;
  email: string;
  name?: string;
  websiteUrl?: string; // only meaningful for WEBSITE_AUDIT
  iat: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.PORTFOLIO_HANDOFF_SECRET;
  if (!secret) {
    throw new HandoffError(
      "PORTFOLIO_HANDOFF_SECRET is not configured. Set it to the same value on both the portfolio site and ABYVORA."
    );
  }
  return secret;
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/** Creates a short-lived (default 10 min), single-purpose, signed handoff token. No DB row, no session — just a signed claim. */
export function createHandoffToken(payload: Omit<HandoffPayload, "iat" | "exp">, ttlSeconds = 600): string {
  const secret = getSecret();
  const full: HandoffPayload = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

/** Verifies signature and expiry. Throws rather than returning null so callers can't accidentally skip the check. */
export function verifyHandoffToken(token: string): HandoffPayload {
  const secret = getSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new HandoffError("Malformed handoff token");

  const expectedSig = sign(body, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new HandoffError("Invalid handoff token signature");
  }

  let payload: HandoffPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new HandoffError("Malformed handoff token payload");
  }

  if (Date.now() > payload.exp) {
    throw new HandoffError("This link has expired — please try again from the portfolio site.");
  }

  return payload;
}
