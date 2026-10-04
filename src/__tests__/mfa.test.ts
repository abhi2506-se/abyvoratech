import { describe, it, expect } from "vitest";
import {
  generateMfaSecret,
  generateTotp,
  verifyTotp,
  totpAuthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/mfa";

describe("generateMfaSecret", () => {
  it("generates a Base32 secret (A-Z, 2-7 only)", () => {
    const secret = generateMfaSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("generates a different secret every call", () => {
    const a = generateMfaSecret();
    const b = generateMfaSecret();
    expect(a).not.toBe(b);
  });
});

describe("TOTP generate/verify round-trip", () => {
  it("accepts the code it just generated for the same secret", () => {
    const secret = generateMfaSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects a code generated for a different secret", () => {
    const secretA = generateMfaSecret();
    const secretB = generateMfaSecret();
    const codeForA = generateTotp(secretA);
    expect(verifyTotp(secretB, codeForA)).toBe(false);
  });

  it("rejects a malformed code (wrong length / non-numeric)", () => {
    const secret = generateMfaSecret();
    expect(verifyTotp(secret, "123")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("is deterministic for the same secret and time step", () => {
    const secret = generateMfaSecret();
    const code1 = generateTotp(secret);
    const code2 = generateTotp(secret);
    expect(code1).toBe(code2);
  });
});

describe("totpAuthUri", () => {
  it("produces a valid otpauth:// URI containing the issuer and secret", () => {
    const secret = generateMfaSecret();
    const uri = totpAuthUri(secret, "owner@abyvoratech.com", "ABYVORA");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=ABYVORA");
    expect(decodeURIComponent(uri)).toContain("owner@abyvoratech.com");
  });
});

describe("generateRecoveryCodes", () => {
  it("generates the requested number of codes", () => {
    expect(generateRecoveryCodes(8)).toHaveLength(8);
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });

  it("generates codes in XXXX-XXXX-XXXX format", () => {
    const codes = generateRecoveryCodes(5);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{2}$/);
    }
  });

  it("generates unique codes within one batch", () => {
    const codes = generateRecoveryCodes(20);
    expect(new Set(codes).size).toBe(20);
  });
});

describe("hashRecoveryCode", () => {
  it("is deterministic and case-insensitive", async () => {
    const a = await hashRecoveryCode("ABCD-1234-EF");
    const b = await hashRecoveryCode("abcd-1234-ef");
    expect(a).toBe(b);
  });

  it("produces different hashes for different codes", async () => {
    const a = await hashRecoveryCode("ABCD-1234-EF");
    const b = await hashRecoveryCode("WXYZ-5678-GH");
    expect(a).not.toBe(b);
  });

  it("never returns the plaintext code", async () => {
    const hash = await hashRecoveryCode("ABCD-1234-EF");
    expect(hash).not.toContain("ABCD-1234-EF");
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});
