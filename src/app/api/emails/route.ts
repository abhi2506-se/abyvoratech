import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, agentOwnedScope, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { resolveSenderIdentity, EmailConfigError } from "@/lib/email/senders";
import {
  assertValidRecipients,
  assertValidSubjectAndBody,
  assertValidAttachment,
  assertNotSuppressed,
  sanitizeEmailHtml,
  EmailValidationError,
} from "@/lib/email/validate";
import { sendEmailViaResend } from "@/lib/email/resend";
import { saveFile } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEmailSettings } from "@/lib/settings";

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

const sendSchema = z.object({
  emailType: z.enum(["PROPOSAL", "SALES", "GENERAL"]),
  toEmails: z.array(z.string()).min(1),
  ccEmails: z.array(z.string()).optional(),
  bccEmails: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  subject: z.string().min(1).max(300),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  proposalId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const scope = agentOwnedScope(session);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const emailType = searchParams.get("emailType");

    const emails = await prisma.emailMessage.findMany({
      where: {
        ...scope,
        ...(status ? { status: status as any } : {}),
        ...(emailType ? { emailType: emailType as any } : {}),
      },
      include: {
        agent: { include: { user: true } },
        lead: true,
        client: true,
        proposal: true,
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ emails });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const agentId = session.user.agentId;
    if (!agentId) {
      throw new AuthzError(
        "Only users with an Agent profile can send email. An Admin without an Agent profile cannot send from Compose Email.",
        400
      );
    }

    // Admin-configurable daily sending limit per agent (spec section 22).
    const emailSettings = await getEmailSettings();
    const rl = checkRateLimit(`email-send:${agentId}`, emailSettings.dailySendingLimitPerAgent, 24 * 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Daily sending limit (${emailSettings.dailySendingLimitPerAgent}) reached. Try again in ${Math.ceil(rl.retryAfterMs / 3600_000)}h.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const data = sendSchema.parse(body);

    // Server-side ownership checks — an Agent can only send in the context of
    // their own leads/clients/proposals, never someone else's.
    if (session.user.role === "AGENT") {
      if (data.leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
        if (!lead || lead.agentId !== agentId) throw new AuthzError("You do not have access to this lead", 403);
      }
      if (data.clientId) {
        const client = await prisma.client.findUnique({ where: { id: data.clientId } });
        if (!client || client.assignedAgentId !== agentId)
          throw new AuthzError("You do not have access to this client", 403);
      }
      if (data.proposalId) {
        const proposal = await prisma.proposal.findUnique({ where: { id: data.proposalId } });
        if (!proposal || proposal.agentId !== agentId)
          throw new AuthzError("You do not have access to this proposal", 403);
      }
    }

    // Sender identity is resolved server-side ONLY — nothing in the request
    // body can pick a From address. Throws a clear config error (not a fake
    // success) if the domain/sender isn't set up yet.
    const sender = resolveSenderIdentity(data.emailType as any);

    assertValidRecipients({ to: data.toEmails, cc: data.ccEmails, bcc: data.bccEmails });
    assertValidSubjectAndBody(data.subject, data.htmlBody);
    if (data.replyTo && !data.replyTo.match(/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/)) {
      throw new EmailValidationError("Invalid reply-to address");
    }

    await assertNotSuppressed([...data.toEmails, ...(data.ccEmails ?? [])], async (email) => {
      const row = await prisma.suppressedRecipient.findUnique({ where: { email } });
      return !!row;
    });

    for (const att of data.attachments ?? []) {
      const buf = Buffer.from(att.contentBase64, "base64");
      assertValidAttachment({ fileName: att.fileName, mimeType: att.mimeType, size: buf.length });
    }

    const cleanHtml = sanitizeEmailHtml(data.htmlBody);

    // Create the record as QUEUED first, inside the same request, so the
    // audit trail and Admin visibility exist even if the provider call fails.
    const emailMessage = await prisma.emailMessage.create({
      data: {
        createdByUserId: session.user.id,
        agentId,
        emailType: data.emailType as any,
        fromEmail: sender.email,
        fromName: sender.name,
        toEmails: data.toEmails,
        ccEmails: data.ccEmails ?? [],
        bccEmails: data.bccEmails ?? [],
        replyTo: data.replyTo,
        subject: data.subject,
        htmlBody: cleanHtml,
        textBody: data.textBody,
        status: "QUEUED",
        leadId: data.leadId,
        clientId: data.clientId,
        proposalId: data.proposalId,
      },
    });

    const attachmentBuffers: { filename: string; content: Buffer }[] = [];
    for (const att of data.attachments ?? []) {
      const buf = Buffer.from(att.contentBase64, "base64");
      const storageKey = await saveFile(buf, att.fileName, att.mimeType);
      await prisma.emailAttachment.create({
        data: {
          emailMessageId: emailMessage.id,
          fileName: att.fileName,
          storageKey,
          mimeType: att.mimeType,
          size: buf.length,
        },
      });
      attachmentBuffers.push({ filename: att.fileName, content: buf });
    }

    const result = await sendEmailViaResend({
      from: `${sender.name} <${sender.email}>`,
      to: data.toEmails,
      cc: data.ccEmails,
      bcc: data.bccEmails,
      replyTo: data.replyTo,
      subject: data.subject,
      html: cleanHtml,
      text: data.textBody,
      attachments: attachmentBuffers,
    });

    let updated;
    if (result.ok) {
      updated = await prisma.emailMessage.update({
        where: { id: emailMessage.id },
        data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date() },
      });

      if (data.proposalId && data.emailType === "PROPOSAL") {
        await prisma.proposal.update({
          where: { id: data.proposalId },
          data: { status: "SENT", sentAt: new Date() },
        });
      }

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "email.sent",
        entityType: "EmailMessage",
        entityId: emailMessage.id,
        description: `${session.user.name} sent a ${data.emailType} email to ${data.toEmails.join(", ")}`,
        newValue: { status: "SENT", subject: data.subject },
        status: "SUCCESS",
      });
    } else {
      updated = await prisma.emailMessage.update({
        where: { id: emailMessage.id },
        data: { status: "FAILED", failedAt: new Date(), failureReason: result.error },
      });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "email.failed",
        entityType: "EmailMessage",
        entityId: emailMessage.id,
        description: `${session.user.name}'s email to ${data.toEmails.join(", ")} failed to send`,
        status: "FAILED",
        errorDetail: result.error,
      });
    }

    return NextResponse.json({ email: updated, delivered: result.ok, error: result.ok ? undefined : result.error });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    if (err instanceof EmailConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof EmailValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
