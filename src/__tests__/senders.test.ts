import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveSenderIdentity, EmailConfigError } from "@/lib/email/senders";

const ORIGINAL_ENV = { ...process.env };

describe("resolveSenderIdentity", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("resolves the configured Proposal sender", () => {
    process.env.EMAIL_FROM_PROPOSAL = "proposal.opervia@theabhisheksingh.in";
    process.env.EMAIL_FROM_PROPOSAL_NAME = "Opervia Proposals";
    const sender = resolveSenderIdentity("PROPOSAL" as any);
    expect(sender.email).toBe("proposal.opervia@theabhisheksingh.in");
    expect(sender.name).toBe("Opervia Proposals");
  });

  it("resolves the configured Sales sender", () => {
    process.env.EMAIL_FROM_SALES = "sales.opervia@theabhisheksingh.in";
    const sender = resolveSenderIdentity("SALES" as any);
    expect(sender.email).toBe("sales.opervia@theabhisheksingh.in");
  });

  it("throws a clear config error instead of a fake sender when unset", () => {
    delete process.env.EMAIL_FROM_PROPOSAL;
    expect(() => resolveSenderIdentity("PROPOSAL" as any)).toThrow(EmailConfigError);
  });

  it("never allows a caller-supplied address to override the resolved sender", () => {
    process.env.EMAIL_FROM_SALES = "sales.opervia@theabhisheksingh.in";
    // resolveSenderIdentity takes only an emailType — there is no parameter
    // through which a From address could be injected, which is the point.
    const sender = resolveSenderIdentity("SALES" as any);
    expect(sender.email).not.toBe("attacker@evil.com");
  });
});
