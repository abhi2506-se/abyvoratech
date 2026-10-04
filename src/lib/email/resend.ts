import { Resend } from "resend";

let client: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to your environment and verify your sending domain in the Resend dashboard before sending email."
    );
  }
  if (!client) client = new Resend(apiKey);
  return client;
}

export type SendEmailParams = {
  from: string; // "Display Name <email@domain.com>"
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

/**
 * Sends a real email through Resend. Never simulated — if RESEND_API_KEY is
 * missing or Resend rejects the request (e.g. unverified domain), this
 * returns ok:false with the real provider error, and the caller must persist
 * that as a FAILED status rather than pretending the send succeeded.
 */
export async function sendEmailViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      replyTo: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    });

    if (error) {
      return { ok: false, error: error.message ?? "Unknown Resend error" };
    }
    if (!data?.id) {
      return { ok: false, error: "Resend accepted the request but returned no message id" };
    }
    return { ok: true, providerMessageId: data.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Unexpected error while sending email" };
  }
}
