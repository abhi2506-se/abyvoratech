import crypto from "crypto";

export class RazorpayConfigError extends Error {}

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayConfigError(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured. Set them in your environment before accepting payments."
    );
  }
  return { keyId, keySecret };
}

function authHeader() {
  const { keyId, keySecret } = getCredentials();
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return `Basic ${token}`;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
};

/**
 * Creates a real order via the Razorpay REST API. Amount is passed in the
 * smallest currency unit (paise for INR) — the caller is responsible for
 * converting from a Decimal rupee amount.
 */
export async function createRazorpayOrder(params: {
  amountInSmallestUnit: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amountInSmallestUnit,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || `Razorpay order creation failed (${res.status})`);
  }
  return data as RazorpayOrder;
}

/**
 * Verifies the client-provided payment signature per Razorpay's documented
 * scheme: HMAC-SHA256(order_id + "|" + payment_id, key_secret) must equal the
 * signature. This is the ONLY thing that may mark a payment as captured —
 * never the frontend's "success" callback alone.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getCredentials();
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Verifies an inbound webhook's X-Razorpay-Signature header against the raw body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Fetches the authoritative payment record from Razorpay — used to double-check amount/status/currency server-side. */
export async function fetchRazorpayPayment(paymentId: string) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || `Failed to fetch Razorpay payment (${res.status})`);
  }
  return data as {
    id: string;
    order_id: string;
    status: string;
    amount: number;
    currency: string;
    method: string;
    captured: boolean;
  };
}

/** Issues a real refund via the Razorpay REST API — full or partial. */
export async function createRazorpayRefund(params: {
  paymentId: string;
  amountInSmallestUnit?: number; // omit for full refund
  notes?: Record<string, string>;
  idempotencyKey: string;
}) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${params.paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "X-Razorpay-Idempotency": params.idempotencyKey,
    },
    body: JSON.stringify({
      ...(params.amountInSmallestUnit ? { amount: params.amountInSmallestUnit } : {}),
      notes: params.notes ?? {},
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || `Razorpay refund failed (${res.status})`);
  }
  return data as { id: string; payment_id: string; amount: number; status: string };
}
