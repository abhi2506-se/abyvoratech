import { describe, it, expect } from "vitest";
import { TICKET_TRANSITIONS } from "@/lib/support-lifecycle";

describe("TICKET_TRANSITIONS", () => {
  it("allows the standard happy path from submission to resolution", () => {
    expect(TICKET_TRANSITIONS.SUBMITTED).toContain("ADMIN_REVIEW");
    expect(TICKET_TRANSITIONS.ADMIN_REVIEW).toContain("FORWARDED_TO_IT");
    expect(TICKET_TRANSITIONS.FORWARDED_TO_IT).toContain("IT_IN_PROGRESS");
    expect(TICKET_TRANSITIONS.IT_IN_PROGRESS).toContain("RESOLVED");
    expect(TICKET_TRANSITIONS.RESOLVED).toContain("CLOSED");
  });

  it("does not allow resurrecting a cancelled ticket", () => {
    expect(TICKET_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("supports the agent escalation loop back to Admin", () => {
    expect(TICKET_TRANSITIONS.AGENT_IN_PROGRESS).toContain("ESCALATED_TO_ADMIN");
    expect(TICKET_TRANSITIONS.ESCALATED_TO_ADMIN).toContain("FORWARDED_TO_IT");
    expect(TICKET_TRANSITIONS.ESCALATED_TO_ADMIN).toContain("ESCALATION_REJECTED");
    expect(TICKET_TRANSITIONS.ESCALATION_REJECTED).toContain("AGENT_IN_PROGRESS");
  });

  it("allows a closed or resolved ticket to be reopened, but nothing else", () => {
    expect(TICKET_TRANSITIONS.CLOSED).toEqual(["REOPENED"]);
    expect(TICKET_TRANSITIONS.RESOLVED).toContain("REOPENED");
  });

  it("every status referenced as a target actually exists as a key", () => {
    const keys = new Set(Object.keys(TICKET_TRANSITIONS));
    for (const targets of Object.values(TICKET_TRANSITIONS)) {
      for (const target of targets) {
        expect(keys.has(target)).toBe(true);
      }
    }
  });
});
