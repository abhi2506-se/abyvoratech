"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

export function PayButton({
  projectId,
  amountType,
  label,
  clientName,
  clientEmail,
}: {
  projectId: string;
  amountType: "ADVANCE" | "FULL" | "REMAINING";
  label: string;
  clientName: string;
  clientEmail: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPayment() {
    setLoading(true);
    setError(null);

    const orderRes = await fetch("/api/payments/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, amountType }),
    });
    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      setLoading(false);
      setError(orderData.error || "Could not start payment.");
      return;
    }

    if (typeof (window as any).Razorpay === "undefined") {
      setLoading(false);
      setError("Payment SDK failed to load. Please refresh and try again.");
      return;
    }

    const rzp = new (window as any).Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: "ABYVORA Technologies",
      description: label,
      prefill: { name: clientName, email: clientEmail },
      handler: async (response: any) => {
        const verifyRes = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentRecordId: orderData.paymentId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        });
        const verifyData = await verifyRes.json();
        setLoading(false);
        if (!verifyRes.ok) {
          setError(verifyData.error || "Payment verification failed. If money was deducted, contact support — do not retry blindly.");
          return;
        }
        router.refresh();
      },
      modal: {
        ondismiss: () => setLoading(false),
      },
      theme: { color: "#C9A45C" },
    });

    rzp.on("payment.failed", () => {
      setLoading(false);
      setError("Payment failed or was cancelled.");
    });

    rzp.open();
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <button onClick={startPayment} disabled={loading} className="btn-primary text-sm px-4 py-2">
        {loading ? "Processing…" : label}
      </button>
      {error && <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{error}</p>}
    </>
  );
}
