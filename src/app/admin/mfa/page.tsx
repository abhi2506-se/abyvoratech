"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AbyvoraLogo } from "@/components/brand/abyvora-logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function PlatformOwnerMfaInner() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/admin";

  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user.role !== "PLATFORM_OWNER") {
      router.replace("/dashboard");
      return;
    }
    if (session.user.mfaEnabled) {
      setMode("verify");
    } else {
      setMode("enroll");
      fetch("/api/admin/mfa/setup", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          setQrUri(data.otpauthUri);
          setSecret(data.secret);
        });
    }
  }, [status, session, router]);

  async function handleEnrollConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/mfa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Invalid code");
      return;
    }
    setRecoveryCodes(data.recoveryCodes);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(data.error || "Invalid code");
      return;
    }
    // Patches the JWT so middleware/requirePlatformOwner see mfaVerified=true.
    await update({ user: { mfaVerified: true } });
    router.push(callbackUrl);
    router.refresh();
  }

  if (status === "loading" || mode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: "var(--bg)" }}>
      <div className="mb-7">
        <AbyvoraLogo variant="mark" height={40} />
      </div>

      <div className="w-full max-w-sm panel p-6">
        {mode === "enroll" && !recoveryCodes && (
          <>
            <h1 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Set up multi-factor authentication
            </h1>
            <p className="text-[12.5px] mb-4" style={{ color: "var(--text-secondary)" }}>
              Required for every Platform Owner account. Scan this with an authenticator app
              (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.
            </p>
            {qrUri && (
              <div className="flex justify-center mb-4">
                <img
                  alt="MFA enrollment QR code"
                  className="rounded-lg border"
                  style={{ borderColor: "var(--border)" }}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUri)}`}
                />
              </div>
            )}
            {secret && (
              <p className="text-[11px] text-center mb-4 font-mono break-all" style={{ color: "var(--text-muted)" }}>
                Manual entry key: {secret}
              </p>
            )}
            <form onSubmit={handleEnrollConfirm} className="space-y-3">
              {error && <p className="text-xs p-2 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>}
              <div>
                <Label>6-digit code</Label>
                <Input required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Confirming…" : "Confirm and enable MFA"}
              </Button>
            </form>
          </>
        )}

        {mode === "enroll" && recoveryCodes && (
          <>
            <h1 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Save your recovery codes
            </h1>
            <p className="text-[12.5px] mb-4" style={{ color: "var(--text-secondary)" }}>
              Each code works once, if you lose access to your authenticator app. They are shown
              only this one time.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5 font-mono text-[12px] p-3 rounded-[10px]" style={{ background: "var(--bg)", color: "var(--text-primary)" }}>
              {recoveryCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
              For security you will now be signed out. Sign in again and enter the 6-digit code
              from your authenticator app to finish.
            </p>
            <Button className="w-full" onClick={() => signOut({ callbackUrl: "/login" })}>
              I&apos;ve saved these — continue
            </Button>
          </>
        )}

        {mode === "verify" && (
          <>
            <h1 className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Verify it&apos;s you
            </h1>
            <p className="text-[12.5px] mb-4" style={{ color: "var(--text-secondary)" }}>
              Enter the 6-digit code from your authenticator app, or a recovery code.
            </p>
            <form onSubmit={handleVerify} className="space-y-3">
              {error && <p className="text-xs p-2 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>}
              <div>
                <Label>Code</Label>
                <Input required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Verifying…" : "Verify"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlatformOwnerMfaPage() {
  return (
    <Suspense fallback={null}>
      <PlatformOwnerMfaInner />
    </Suspense>
  );
}
