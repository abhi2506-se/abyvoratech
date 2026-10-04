"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ClientProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  companyDescription: string | null;
  profileImage: string | null;
  emailVerifiedAt: string | null;
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [form, setForm] = useState<Partial<ClientProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.clientId) return;
    fetch(`/api/clients/${session.user.clientId}`)
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.client);
        setForm(data.client ?? {});
        setLoading(false);
      });
  }, [session?.user?.clientId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.clientId) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/clients/${session.user.clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || undefined,
        company: form.company || undefined,
        country: form.country || undefined,
        city: form.city || undefined,
        website: form.website || undefined,
        companyDescription: form.companyDescription || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Failed to update profile.");
      return;
    }
    setProfile(data.client);
    setMessage("Profile updated.");
  }

  async function handleResendVerification() {
    if (!profile?.email) return;
    setResendMsg("Sending…");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: profile.email }),
    });
    setResendMsg("If your email isn't verified yet, a new link has been sent.");
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading profile…</p>;
  if (!profile) return <p className="text-sm" style={{ color: "var(--danger)" }}>Could not load your profile.</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Profile & Settings</h1>
      <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
        Manage your account and company details. Some fields (like email) can't be changed here — contact support if needed.
      </p>

      <div className="panel p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{profile.email}</div>
          <div className="text-xs" style={{ color: profile.emailVerifiedAt ? "var(--success)" : "var(--danger)" }}>
            {profile.emailVerifiedAt ? "Email verified" : "Email not verified"}
          </div>
        </div>
        {!profile.emailVerifiedAt && (
          <button type="button" className="btn-secondary text-xs" onClick={handleResendVerification}>
            Resend verification email
          </button>
        )}
      </div>
      {resendMsg && <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>{resendMsg}</p>}

      <form onSubmit={handleSave} className="panel p-6 space-y-4">
        {error && <p className="text-xs p-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>}
        {message && <p className="text-xs p-2" style={{ background: "var(--success-soft)", color: "var(--success)" }}>{message}</p>}

        <div>
          <label className="field-label">Full name</label>
          <input className="field-input" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Phone</label>
            <input className="field-input" value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Company name</label>
            <input className="field-input" value={form.company ?? ""} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Country</label>
            <input className="field-input" value={form.country ?? ""} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">City</label>
            <input className="field-input" value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="field-label">Website</label>
          <input className="field-input" placeholder="https://" value={form.website ?? ""} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
        </div>
        <div>
          <label className="field-label">Company description</label>
          <textarea className="field-input" rows={3} value={form.companyDescription ?? ""} onChange={(e) => setForm((f) => ({ ...f, companyDescription: e.target.value }))} />
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
