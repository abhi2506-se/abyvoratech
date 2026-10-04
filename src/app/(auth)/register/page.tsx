"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/layout/auth-split-layout";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    phone: "",
    country: "",
    password: "",
    confirmPassword: "",
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  // Prefill from a verified portfolio handoff (see /portal/continue) —
  // these are just display defaults, never trusted for authentication.
  useEffect(() => {
    const email = searchParams.get("email");
    const name = searchParams.get("name");
    const intent = searchParams.get("intent");
    const url = searchParams.get("url");
    if (email || name) {
      setForm((f) => ({ ...f, email: email ?? f.email, fullName: name ?? f.fullName }));
    }
    if (intent === "audit" && url) {
      setHandoffNote(`Continuing from theabhisheksingh.in — we'll run a free audit on ${url} once your account is verified.`);
    } else if (intent === "project") {
      setHandoffNote("Continuing from theabhisheksingh.in — you can submit your project request right after verifying your email.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!acceptedTerms) {
      setError("You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.fullName,
        companyName: form.companyName || undefined,
        email: form.email,
        phone: form.phone || undefined,
        country: form.country || undefined,
        password: form.password,
        acceptedTerms: true,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Something went wrong. Please try again.");
      return;
    }
    setSuccess(data.message || "Account created. Check your email to verify your address.");
  }

  return (
    <AuthSplitLayout
      heading="Create your Client Portal account"
      subheading="Track projects, proposals, payments and support in one place."
    >
      {handoffNote && (
        <div className="text-xs mb-4 p-3 rounded-[10px]" style={{ background: "var(--accent-soft)", color: "var(--text-primary)" }}>
          {handoffNote}
        </div>
      )}

      {success ? (
        <div className="panel p-6 text-center space-y-3">
          <p className="text-sm" style={{ color: "var(--success)" }}>{success}</p>
          <Link href="/login" className="btn-primary inline-block">Go to login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="panel p-6 space-y-3">
          {error && (
            <p className="text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div>
            <Label>Full name *</Label>
            <Input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
          </div>
          <div>
            <Label>Email address *</Label>
            <Input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Company name</Label>
              <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => update("country", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Password *</Label>
              <Input required type="password" minLength={10} value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <Label>Confirm password *</Label>
              <Input required type="password" minLength={10} value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            At least 10 characters, including a letter and a number.
          </p>

          <label className="flex items-start gap-2 text-xs pt-1" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5" />
            <span>
              I agree to the <a href="/terms" target="_blank" className="underline">Terms of Service</a> and{" "}
              <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
            </span>
          </label>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}

      <p className="text-center text-xs mt-5" style={{ color: "var(--text-secondary)" }}>
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </AuthSplitLayout>
  );
}
