import { describe, it, expect } from "vitest";
import { isWeakPassword } from "@/lib/password";

describe("isWeakPassword", () => {
  it("rejects letters-only passwords", () => {
    expect(isWeakPassword("longenoughpassword")).toBe(true);
  });

  it("rejects digits-only passwords", () => {
    expect(isWeakPassword("1234567890")).toBe(true);
  });

  it("accepts a password with letters and numbers", () => {
    expect(isWeakPassword("Password123")).toBe(false);
  });

  it("accepts a password with numbers and special characters plus letters", () => {
    expect(isWeakPassword("Str0ng!Pass")).toBe(false);
  });
});
