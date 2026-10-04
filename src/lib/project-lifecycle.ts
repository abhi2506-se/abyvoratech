import type { ProjectStatus } from "@prisma/client";

/** Stages a project can be paused from — anything actively "in delivery". */
export const HOLDABLE_STATUSES: ProjectStatus[] = ["PLANNING", "UI_UX", "DEVELOPMENT", "TESTING", "CLIENT_REVIEW"];

/** Non-terminal statuses that may still be cancelled outright by an Admin. */
export const CANCELLABLE_STATUSES: ProjectStatus[] = [
  "SUBMITTED",
  "NEEDS_INFORMATION",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "WAITING_FOR_REVIEW",
  "ACCEPTED",
  "PLANNING",
  "UI_UX",
  "DEVELOPMENT",
  "TESTING",
  "CLIENT_REVIEW",
  "ON_HOLD",
];
