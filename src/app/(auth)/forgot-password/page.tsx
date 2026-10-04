"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/layout/auth-split-layout";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <AuthSplitLayout heading="Reset your password">
      {sent ? (
        <div className="panel p-6 text-center space-y-3">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            If an account exists for <strong style={{ color: "var(--text-primary)" }}>{email}</strong>, a reset link has been sent.
          </p>
          <Link href="/login" className="btn-secondary inline-block">Back to login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-xs" style={{ color: "var(--text-secondary)" }}>
            <Link href="/login" className="underline">Back to login</Link>
          </p>
        </form>
      )}
    </AuthSplitLayout>
  );
}
