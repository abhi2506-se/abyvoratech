import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  assertValidRecipients,
  assertValidSubjectAndBody,
  assertValidAttachment,
  sanitizeEmailHtml,
  EmailValidationError,
} from "@/lib/email/validate";

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("client@example.com")).toBe(true);
  });
  it("rejects header-injection attempts", () => {
    expect(isValidEmail("client@example.com\nBcc: attacker@evil.com")).toBe(false);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("assertValidRecipients", () => {
  it("passes for a single valid To", () => {
    expect(() => assertValidRecipients({ to: ["client@example.com"] })).not.toThrow();
  });
  it("throws when To is empty", () => {
    expect(() => assertValidRecipients({ to: [] })).toThrow(EmailValidationError);
  });
  it("throws on duplicate recipients across to/cc/bcc", () => {
    expect(() =>
      assertValidRecipients({ to: ["a@example.com"], cc: ["a@example.com"] })
    ).toThrow(/Duplicate/);
  });
  it("throws when recipient count exceeds the max", () => {
    const many = Array.from({ length: 30 }, (_, i) => `user${i}@example.com`);
    expect(() => assertValidRecipients({ to: many })).toThrow(/Too many recipients/);
  });
});

describe("assertValidSubjectAndBody", () => {
  it("throws on empty subject", () => {
    expect(() => assertValidSubjectAndBody("", "<p>hi</p>")).toThrow(/Subject/);
  });
  it("throws on empty body", () => {
    expect(() => assertValidSubjectAndBody("Hello", "")).toThrow(/body/);
  });
  it("throws on subject containing a line break (header injection)", () => {
    expect(() => assertValidSubjectAndBody("Hi\nBcc: x@evil.com", "<p>hi</p>")).toThrow();
  });
});

describe("assertValidAttachment", () => {
  it("rejects files over the size limit", () => {
    expect(() =>
      assertValidAttachment({ fileName: "big.pdf", mimeType: "application/pdf", size: 20 * 1024 * 1024 })
    ).toThrow(/exceeds/);
  });
  it("rejects disallowed mime types", () => {
    expect(() =>
      assertValidAttachment({ fileName: "virus.exe", mimeType: "application/x-msdownload", size: 100 })
    ).toThrow(/unsupported/);
  });
  it("rejects path traversal in file names", () => {
    expect(() =>
      assertValidAttachment({ fileName: "../../etc/passwd", mimeType: "application/pdf", size: 100 })
    ).toThrow(/Invalid file name/);
  });
  it("accepts a normal PDF within limits", () => {
    expect(() =>
      assertValidAttachment({ fileName: "proposal.pdf", mimeType: "application/pdf", size: 1024 })
    ).not.toThrow();
  });
});

describe("sanitizeEmailHtml", () => {
  it("strips script tags", () => {
    const out = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
  });
  it("strips inline event handlers", () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
  });
  it("strips javascript: URLs", () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
  it("preserves ordinary formatting", () => {
    const out = sanitizeEmailHtml("<p><strong>Hello</strong></p>");
    expect(out).toContain("<strong>Hello</strong>");
  });
});
