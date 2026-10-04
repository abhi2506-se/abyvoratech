import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProposal, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog, captureRequestContext } from "@/lib/audit";
import { triggerCommission } from "@/lib/commissions";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.number().nonnegative().optional(),
  status: z
    .enum([
      "DRAFT",
      "READY",
      "SENT",
      "VIEWED",
      "ACCEPTED",
      "REJECTED",
      "CHANGE_REQUESTED",
      "EXPIRED",
      "CANCELLED",
    ])
    .optional(),
  // Required when a Client accepts — the "confirmation screen" from spec
  // section 7. Acceptance is never inferred from email delivery/opens.
  termsAccepted: z.boolean().optional(),
});

// Client-facing transitions are intentionally narrow: a Client can only act
// on a proposal that's actually awaiting their response, and only into one
// of these three outcomes. Everything else (DRAFT→READY, editing title/
// amount, re-sending) stays Agent/Admin-only.
const CLIENT_ALLOWED_FROM = new Set(["SENT", "VIEWED"]);
const CLIENT_ALLOWED_TO = new Set(["ACCEPTED", "REJECTED", "CHANGE_REQUESTED"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { proposal } = await assertCanAccessProposal(id);
    const full = await prisma.proposal.findUnique({
      where: { id },
      include: { agent: { include: { user: true } }, lead: true, client: true, document: true, emailMessages: true },
    });
    return NextResponse.json({ proposal: full ?? proposal });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, proposal } = await assertCanAccessProposal(id);
    const body = await req.json();
    const data = updateSchema.parse(body);

    if (session.user.role === "CLIENT") {
      if (data.title !== undefined || data.amount !== undefined) {
        throw new AuthzError("Clients cannot edit proposal title or amount", 403);
      }
      if (!data.status) throw new AuthzError("status is required", 400);
      if (!CLIENT_ALLOWED_FROM.has(proposal.status)) {
        throw new AuthzError(`This proposal is not currently awaiting your response (status: ${proposal.status})`, 409);
      }
      if (!CLIENT_ALLOWED_TO.has(data.status)) {
        throw new AuthzError("Clients may only Accept, Reject, or Request Changes", 403);
      }
      if (data.status === "ACCEPTED" && !data.termsAccepted) {
        throw new AuthzError("You must confirm acceptance of the proposal terms", 400);
      }
    }

    const isClientAcceptance = session.user.role === "CLIENT" && data.status === "ACCEPTED";
    const ctx = isClientAcceptance ? await captureRequestContext() : null;

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.status === "SENT" ? { sentAt: new Date() } : {}),
        ...(data.status && ["ACCEPTED", "REJECTED", "CHANGE_REQUESTED"].includes(data.status)
          ? { respondedAt: new Date() }
          : {}),
        ...(isClientAcceptance
          ? {
              acceptedByUserId: session.user.id,
              acceptedIp: ctx?.ipAddress ?? undefined,
              acceptedUserAgent: ctx?.userAgent ?? undefined,
            }
          : {}),
      },
    });

    if (data.status && data.status !== proposal.status) {
      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "proposal.status_changed",
        entityType: "Proposal",
        entityId: proposal.id,
        description: isClientAcceptance
          ? `${session.user.name} accepted Proposal v${proposal.version} (terms confirmed)`
          : `${session.user.name} changed Proposal status`,
        previousValue: { status: proposal.status },
        newValue: { status: updated.status, version: proposal.version },
      });

      // Commission auto-trigger — only on genuine acceptance, never on send,
      // view, or any other transition (spec section 20).
      if (data.status === "ACCEPTED" && updated.amount) {
        await triggerCommission({
          agentId: updated.agentId,
          sourceType: "PROPOSAL_ACCEPTED",
          sourceId: updated.id,
          baseAmount: Number(updated.amount),
          actorId: session.user.id,
          actorRole: session.user.role,
          actorName: session.user.name,
        });
      }
    }

    return NextResponse.json({ proposal: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
