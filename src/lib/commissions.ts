import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { Role } from "@prisma/client";

/**
 * Central place where every automatic commission gets created. Never called
 * for failed/bounced emails or unpaid/unaccepted outcomes — only from the
 * specific trigger points below (spec section 20).
 *
 * Idempotency: `idempotencyKey` is unique in the DB, so calling this twice
 * for the same source (e.g. a duplicate webhook re-delivering "accepted")
 * creates the commission once and returns the existing row the second time.
 */
export async function triggerCommission(params: {
  agentId: string;
  sourceType: string;
  sourceId: string;
  baseAmount: number;
  actorId: string;
  actorRole: Role;
  actorName: string;
}) {
  const idempotencyKey = `${params.sourceType}:${params.sourceId}`;

  const existing = await prisma.commission.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const rule = await prisma.commissionRule.findFirst({
    where: { sourceType: params.sourceType, active: true },
  });

  // No rule configured = no invented number. We record nothing rather than
  // guessing a commission amount, matching "never invent pricing" elsewhere
  // in this spec.
  if (!rule) {
    await writeAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: "commission.skipped_no_rule",
      entityType: "Commission",
      entityId: params.sourceId,
      description: `No active CommissionRule for "${params.sourceType}" — no commission was recorded`,
      status: "FAILED",
      errorDetail: `Missing CommissionRule for sourceType=${params.sourceType}`,
    });
    return null;
  }

  const amount = rule.flatAmount
    ? Number(rule.flatAmount)
    : rule.percentage
    ? Math.round(params.baseAmount * (Number(rule.percentage) / 100) * 100) / 100
    : 0;

  if (amount <= 0) return null;

  const commission = await prisma.commission.create({
    data: {
      agentId: params.agentId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      commissionRuleId: rule.id,
      amount,
      idempotencyKey,
      calculationSnapshot: {
        ruleId: rule.id,
        ruleName: rule.name,
        percentage: rule.percentage ? Number(rule.percentage) : null,
        flatAmount: rule.flatAmount ? Number(rule.flatAmount) : null,
        baseAmount: params.baseAmount,
        computedAt: new Date().toISOString(),
      },
    },
  });

  await writeAuditLog({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "commission.auto_generated",
    entityType: "Commission",
    entityId: commission.id,
    description: `Commission of ${commission.currency} ${amount} auto-generated for ${params.actorName} from ${params.sourceType}`,
    newValue: { amount, sourceType: params.sourceType, sourceId: params.sourceId },
  });

  return commission;
}
