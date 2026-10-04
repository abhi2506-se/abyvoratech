"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthSplitLayout } from "@/components/layout/auth-split-layout";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      if (res.error === "TOO_MANY_ATTEMPTS") {
        setError("Too many login attempts. Please wait a few minutes and try again.");
      } else if (res.error === "ACCOUNT_DISABLED") {
        setError("This account has been disabled. Contact your administrator.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }

    router.push(params.get("callbackUrl") || "/dashboard");
    router.refresh();
  }

  return (
    <AuthSplitLayout heading="Welcome back" subheading="Sign in to your ABYVORA account">
      <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
        {params.get("error") === "disabled" && (
          <p className="text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            This account has been disabled. Contact your administrator.
          </p>
        )}
        {error && (
          <p className="text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
          <a href="/forgot-password" className="underline">Forgot password?</a>
          <a href="/register" className="underline">Create a client account</a>
        </div>

        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Continue with Google
        </Button>
      </form>

      <p className="text-center text-xs mt-5" style={{ color: "var(--text-secondary)" }}>
        New client? <a href="/register" className="underline">Create your Client Portal account</a>.
      </p>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
