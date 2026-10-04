"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type Settings = { enabled: boolean; defaultTone: string; defaultLanguage: string };
type ProviderStatus = { aiConfigured: boolean; aiModel: string | null; aiBaseUrl: string | null };

export default function AISettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/ai");
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
    const res = await fetch("/api/settings/ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setSettings((await res.json()).settings);
    setSaving(false);
  }

  if (!settings || !status) {
    return <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Loading…</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>AI Settings</h1>
      <p className="text-[12.5px] mb-5" style={{ color: "var(--text-secondary)" }}>
        The AI API key, base URL and model are set via environment variables (AI_API_KEY, AI_BASE_URL,
        AI_MODEL) and never shown here.
      </p>

      <div className="panel p-5 mb-5 space-y-2.5">
        <div className="flex items-center justify-between text-[13.5px]">
          <span style={{ color: "var(--text-secondary)" }}>AI provider key</span>
          <Badge tone={status.aiConfigured ? "success" : "danger"}>
            {status.aiConfigured ? "Configured" : "Not configured"}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[13.5px]">
          <span style={{ color: "var(--text-secondary)" }}>Model</span>
          <span style={{ color: "var(--text-primary)" }}>{status.aiModel ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between text-[13.5px]">
          <span style={{ color: "var(--text-secondary)" }}>Base URL</span>
          <span style={{ color: "var(--text-primary)" }}>{status.aiBaseUrl ?? "—"}</span>
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <label className="flex items-center justify-between text-[13.5px]" style={{ color: "var(--text-primary)" }}>
          AI generation enabled platform-wide
          <Switch checked={settings.enabled} onChange={(v) => save({ enabled: v })} />
        </label>
        <div>
          <div className="field-label">Default tone</div>
          <select className="field-input" value={settings.defaultTone} onChange={(e) => save({ defaultTone: e.target.value })}>
            {["PROFESSIONAL", "FRIENDLY", "PERSUASIVE", "PREMIUM", "CONCISE"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="field-label">Default language</div>
          <select className="field-input" value={settings.defaultLanguage} onChange={(e) => save({ defaultLanguage: e.target.value })}>
            {["ENGLISH", "HINDI", "HINGLISH"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      {saving && <div className="text-[12px] mt-2.5" style={{ color: "var(--text-muted)" }}>Saving…</div>}
    </div>
  );
}
