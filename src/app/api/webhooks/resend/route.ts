import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";

/**
 * Resend signs webhooks using Svix. We verify the signature before trusting
 * ANY part of the payload — an unsigned or badly-signed request is rejected
 * outright, never partially processed.
 *
 * Configure this URL in the Resend dashboard under Webhooks, and copy the
 * signing secret it gives you into EMAIL_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("EMAIL_WEBHOOK_SECRET is not configured — rejecting webhook.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  let event: any;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventType: string = event?.type ?? "unknown";
  const providerMessageId: string | undefined = event?.data?.email_id;
  // Svix delivers a unique message id per webhook delivery via the svix-id
  // header — use that (not the email id) as the idempotency key so retried
  // deliveries of the SAME event are ignored, while different events for the
  // same email are not accidentally deduped.
  const providerEventId = svixId;

  if (!providerMessageId) {
    return NextResponse.json({ error: "Event missing email_id" }, { status: 400 });
  }

  const emailMessage = await prisma.emailMessage.findUnique({ where: { providerMessageId } });
  if (!emailMessage) {
    // We don't recognize this message (e.g. sent outside this app) — accept
    // and no-op rather than erroring, so Resend doesn't retry forever.
    return NextResponse.json({ received: true, matched: false });
  }

  const existingEvent = await prisma.emailEvent.findUnique({ where: { providerEventId } });
  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await prisma.emailEvent.create({
    data: {
      emailMessageId: emailMessage.id,
      eventType,
      providerEventId,
      metadata: event?.data ?? undefined,
      occurredAt: event?.created_at ? new Date(event.created_at) : new Date(),
    },
  });

  const statusUpdates: Record<string, any> = {
    "email.sent": { status: "SENT" },
    "email.delivered": { status: "DELIVERED", deliveredAt: new Date() },
    "email.opened": { openedAt: new Date() },
    "email.bounced": { status: "BOUNCED", bouncedAt: new Date() },
    "email.complained": {},
    "email.delivery_delayed": {},
    "email.failed": { status: "FAILED", failedAt: new Date(), failureReason: "Provider reported failure" },
  };

  const update = statusUpdates[eventType];
  if (update && Object.keys(update).length > 0) {
    await prisma.emailMessage.update({ where: { id: emailMessage.id }, data: update });
  }

  // Bounces and spam complaints add the recipient(s) to the suppression list
  // so future sends are blocked before they happen (spec section 15).
  if (eventType === "email.bounced" || eventType === "email.complained") {
    const recipients: string[] = [...emailMessage.toEmails, ...emailMessage.ccEmails];
    for (const email of recipients) {
      await prisma.suppressedRecipient
        .upsert({
          where: { email: email.toLowerCase() },
          create: { email: email.toLowerCase(), reason: eventType },
          update: {},
        })
        .catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
