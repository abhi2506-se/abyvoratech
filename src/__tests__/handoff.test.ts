import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHandoffToken, verifyHandoffToken, HandoffError } from "@/lib/handoff";

const ORIGINAL_ENV = { ...process.env };

describe("portfolio handoff tokens", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, PORTFOLIO_HANDOFF_SECRET: "test-secret-key" };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it("round-trips a valid token", () => {
    const token = createHandoffToken({ purpose: "CLIENT_REGISTER", email: "lead@example.com", name: "Test Lead" });
    const payload = verifyHandoffToken(token);
    expect(payload.email).toBe("lead@example.com");
    expect(payload.purpose).toBe("CLIENT_REGISTER");
  });

  it("rejects a tampered payload", () => {
    const token = createHandoffToken({ purpose: "CLIENT_REGISTER", email: "lead@example.com" });
    const [body, sig] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), email: "attacker@evil.com" })
    ).toString("base64url");
    expect(() => verifyHandoffToken(`${tamperedBody}.${sig}`)).toThrow(HandoffError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = createHandoffToken({ purpose: "WEBSITE_AUDIT", email: "lead@example.com", websiteUrl: "https://example.com" });
    process.env.PORTFOLIO_HANDOFF_SECRET = "a-different-secret";
    expect(() => verifyHandoffToken(token)).toThrow(HandoffError);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createHandoffToken({ purpose: "CLIENT_REGISTER", email: "lead@example.com" }, 60);
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z")); // 2 minutes later, ttl was 60s
    expect(() => verifyHandoffToken(token)).toThrow(/expired/i);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyHandoffToken("not-a-real-token")).toThrow(HandoffError);
  });

  it("throws a clear config error when the secret isn't set", () => {
    delete process.env.PORTFOLIO_HANDOFF_SECRET;
    expect(() => createHandoffToken({ purpose: "CLIENT_REGISTER", email: "a@b.com" })).toThrow(HandoffError);
  });
});
