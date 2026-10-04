import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getEmailSettings } from "@/lib/settings";
import { sanitizeEmailHtml } from "@/lib/email/validate";

/**
 * NOTE on inbound email: Resend's own inbound-parsing product is separate
 * from outbound sending and, as of this build, not something we could wire
 * to a specific dashboard toggle without your account's exact setup. This
 * endpoint is a generic receiver that accepts a JSON payload in the shape
 * most inbound-email relays produce (Resend inbound, a Cloudflare Email
 * Worker, Mailgun's routes, etc.) — point whichever one you use at this URL:
 *
 *   https://YOUR_DOMAIN/api/webhooks/resend-inbound
 *   Header:  x-inbound-secret: <INBOUND_EMAIL_SECRET>
 *   Body:    { "from": "client@x.com", "to": "proposal.opervia@...",
 *              "subject": "Re: ...", "html": "...", "text": "..." }
 *
 * If your relay signs requests differently, adjust the verification below —
 * the important part (thread matching, dedupe, audit log, unread state) will
 * not need to change.
 */

const inboundSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().max(500),
  html: z.string().optional(),
  text: z.string().optional(),
  providerMessageId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Inbound email is not configured (INBOUND_EMAIL_SECRET missing)" }, { status: 503 });
  }
  if (req.headers.get("x-inbound-secret") !== secret) {
    return NextResponse.json({ error: "Invalid inbound secret" }, { status: 401 });
  }

  const settings = await getEmailSettings();
  if (!settings.inboundEmailEnabled) {
    return NextResponse.json({ error: "Inbound email is disabled in Admin > Email Settings" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inboundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.success ? parsed.data : (null as never);

  // Idempotency: if the relay retries the same message, don't double-record it.
  if (data.providerMessageId) {
    const dup = await prisma.emailMessage.findFirst({
      where: { providerMessageId: data.providerMessageId, direction: "INBOUND" },
    });
    if (dup) return NextResponse.json({ received: true, duplicate: true });
  }

  // Match this reply to the most recent outbound message we sent FROM `to`
  // TO the sender's address — that tells us which agent/lead/client/thread
  // this belongs to.
  const original = await prisma.emailMessage.findFirst({
    where: {
      fromEmail: data.to,
      toEmails: { has: data.from },
      direction: "OUTBOUND",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!original) {
    // We can't attribute this reply to any agent/thread — record nothing
    // rather than guessing an owner. Surface it via a FAILED audit entry so
    // Admin can see unmatched inbound mail.
    await writeAuditLog({
      actorId: (await prisma.user.findFirst({ where: { role: "ADMIN" } }))?.id ?? "unknown",
      actorRole: "ADMIN",
      action: "email.inbound_unmatched",
      entityType: "EmailMessage",
      description: `Inbound email from ${data.from} to ${data.to} could not be matched to any outbound thread`,
      status: "FAILED",
      metadata: { from: data.from, to: data.to, subject: data.subject },
    });
    return NextResponse.json({ received: true, matched: false });
  }

  let threadId = original.threadId;
  if (!threadId) {
    const thread = await prisma.emailThread.create({
      data: {
        agentId: original.agentId,
        clientId: original.clientId,
        leadId: original.leadId,
        subject: original.subject,
        lastMessageAt: new Date(),
      },
    });
    threadId = thread.id;
    await prisma.emailMessage.update({ where: { id: original.id }, data: { threadId } });
  } else {
    await prisma.emailThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
  }

  const inboundMessage = await prisma.emailMessage.create({
    data: {
      threadId,
      createdByUserId: (await prisma.agent.findUnique({ where: { id: original.agentId } }))!.userId,
      agentId: original.agentId,
      emailType: original.emailType,
      direction: "INBOUND",
      fromEmail: data.from,
      fromName: data.from,
      toEmails: [data.to],
      subject: data.subject,
      htmlBody: sanitizeEmailHtml(data.html ?? `<p>${data.text ?? ""}</p>`),
      textBody: data.text,
      status: "REPLIED",
      leadId: original.leadId,
      clientId: original.clientId,
      proposalId: original.proposalId,
      providerMessageId: data.providerMessageId,
    },
  });

  await prisma.emailMessage.update({
    where: { id: original.id },
    data: { status: "REPLIED", repliedAt: new Date() },
  });

  await writeAuditLog({
    actorId: (await prisma.agent.findUnique({ where: { id: original.agentId } }))!.userId,
    actorRole: "AGENT",
    action: "email.reply_received",
    entityType: "EmailMessage",
    entityId: inboundMessage.id,
    description: `Reply received from ${data.from} on thread "${original.subject}"`,
  });

  return NextResponse.json({ received: true, matched: true, emailId: inboundMessage.id });
}
