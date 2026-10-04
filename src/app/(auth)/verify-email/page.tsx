"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/layout/auth-split-layout";

function VerifyEmailInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const email = params.get("email");
    const token = params.get("token");
    if (!email || !token) {
      setStatus("error");
      setMessage("This verification link is missing required parameters.");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Verification failed.");
          return;
        }
        setStatus("ok");
        setMessage(data.message || "Email verified.");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong verifying your email.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthSplitLayout>
      <div className="panel p-6 text-center space-y-3">
        {status === "loading" && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Verifying your email…</p>}
        {status === "ok" && (
          <>
            <p className="text-sm" style={{ color: "var(--success)" }}>{message}</p>
            <Link href="/login" className="btn-primary inline-block">Go to login</Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-sm" style={{ color: "var(--danger)" }}>{message}</p>
            <Link href="/login" className="btn-secondary inline-block">Back to login</Link>
          </>
        )}
      </div>
    </AuthSplitLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
