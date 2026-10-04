"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/layout/auth-split-layout";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const email = params.get("email") || "";
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !token) {
      setError("This reset link is invalid.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, newPassword: password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <AuthSplitLayout heading="Set a new password">
      {done ? (
        <div className="panel p-6 text-center">
          <p className="text-sm" style={{ color: "var(--success)" }}>Password updated. Redirecting to login…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          {error && (
            <p className="text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" required type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" required type="password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
      <p className="text-center text-xs mt-5" style={{ color: "var(--text-secondary)" }}>
        <Link href="/login" className="underline">Back to login</Link>
      </p>
    </AuthSplitLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
