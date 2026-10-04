"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

type Settings = {
  aiGenerationEnabled: boolean;
  inboundEmailEnabled: boolean;
  dailySendingLimitPerAgent: number;
  maxAttachmentSizeMb: number;
};

type ProviderStatus = {
  resendConfigured: boolean;
  proposalSenderConfigured: boolean;
  salesSenderConfigured: boolean;
  webhookSecretConfigured: boolean;
  storageProvider: string;
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13.5px]">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <Badge tone={ok ? "success" : "danger"}>{ok ? "Configured" : "Not configured"}</Badge>
    </div>
  );
}

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/email");
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setStatus(data.providerStatus);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setSaved(true);
    }
    setSaving(false);
  }

  if (!settings || !status) {
    return <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Loading…</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Email Settings</h1>
      <p className="text-[12.5px] mb-5" style={{ color: "var(--text-secondary)" }}>
        Secrets (API keys, webhook secret) are set via environment variables and never shown here —
        this page only shows whether they&apos;re present, and controls behavior toggles.
      </p>

      <div className="panel p-5 mb-5">
        <div className="field-label mb-2">Provider status</div>
        <StatusPill ok={status.resendConfigured} label="Resend API key" />
        <StatusPill ok={status.proposalSenderConfigured} label="Proposal sender (EMAIL_FROM_PROPOSAL)" />
        <StatusPill ok={status.salesSenderConfigured} label="Sales sender (EMAIL_FROM_SALES)" />
        <StatusPill ok={status.webhookSecretConfigured} label="Webhook signing secret" />
        <div className="flex items-center justify-between py-1.5 text-[13.5px]">
          <span style={{ color: "var(--text-secondary)" }}>Attachment storage</span>
          <span style={{ color: "var(--text-primary)" }}>{status.storageProvider}</span>
        </div>
      </div>

      <div className="panel p-5 mb-5 space-y-4">
        <label className="flex items-center justify-between text-[13.5px]" style={{ color: "var(--text-primary)" }}>
          AI email generation enabled
          <Switch checked={settings.aiGenerationEnabled} onChange={(v) => save({ aiGenerationEnabled: v })} />
        </label>
        <label className="flex items-center justify-between text-[13.5px]" style={{ color: "var(--text-primary)" }}>
          Inbound email (reply capture) enabled
          <Switch checked={settings.inboundEmailEnabled} onChange={(v) => save({ inboundEmailEnabled: v })} />
        </label>
        <div>
          <div className="field-label">Daily sending limit per agent</div>
          <Input
            type="number"
            className="w-32"
            value={settings.dailySendingLimitPerAgent}
            onChange={(e) => setSettings({ ...settings, dailySendingLimitPerAgent: Number(e.target.value) })}
            onBlur={(e) => save({ dailySendingLimitPerAgent: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="field-label">Max attachment size (MB)</div>
          <Input
            type="number"
            className="w-32"
            value={settings.maxAttachmentSizeMb}
            onChange={(e) => setSettings({ ...settings, maxAttachmentSizeMb: Number(e.target.value) })}
            onBlur={(e) => save({ maxAttachmentSizeMb: Number(e.target.value) })}
          />
        </div>
      </div>

      {saving && <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Saving…</div>}
      {saved && !saving && <div className="text-[12px]" style={{ color: "var(--success)" }}>Saved.</div>}
    </div>
  );
}
