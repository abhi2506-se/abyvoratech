export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

/**
 * Maps a domain status string (project/proposal/payment/invoice/task/ticket
 * status, etc.) to a badge tone. Purely presentational — never used for
 * business logic decisions.
 */
export function statusTone(status: string): Tone {
  const s = status.toUpperCase();

  if (["COMPLETED", "PAID", "ACCEPTED", "WON", "RESOLVED", "ACTIVE", "APPROVED", "SUCCESS"].some((k) => s.includes(k))) {
    return "success";
  }
  if (["REJECTED", "CANCELLED", "FAILED", "LOST", "OVERDUE", "DECLINED", "REFUNDED"].some((k) => s.includes(k))) {
    return "danger";
  }
  if (["PENDING", "SENT", "VIEWED", "IN_PROGRESS", "IN_REVIEW", "AWAITING", "PARTIAL", "ESCALATED"].some((k) => s.includes(k))) {
    return "warning";
  }
  if (["DRAFT", "NEW", "OPEN"].some((k) => s.includes(k))) {
    return "accent";
  }
  return "neutral";
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
