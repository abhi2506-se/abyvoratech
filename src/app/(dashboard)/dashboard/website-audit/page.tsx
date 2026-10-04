"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type Findings = {
  https: boolean;
  securityHeaders: { header: string; present: boolean }[];
  hasViewportMeta: boolean;
  hasTitle: boolean;
  titleLength: number;
  hasMetaDescription: boolean;
  responseTimeMs: number;
  htmlSizeBytes: number;
  recommendations: string[];
};

type Audit = {
  id: string;
  url: string;
  status: string;
  score: number | null;
  findings: Findings;
  errorMessage: string | null;
  createdAt: string;
};

function ScoreGauge({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="56" cy="56" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-semibold" style={{ color: "var(--text-primary)" }}>{score}</span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>/ 100</span>
      </div>
    </div>
  );
}

function CategoryCard({ title, checks }: { title: string; checks: { label: string; pass: boolean }[] }) {
  const passed = checks.filter((c) => c.pass).length;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        <Badge tone={passed === checks.length ? "success" : passed === 0 ? "danger" : "warning"}>
          {passed}/{checks.length}
        </Badge>
      </div>
      <ul className="space-y-1.5">
        {checks.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: c.pass ? "var(--success)" : "var(--danger)" }}>{c.pass ? "✓" : "✗"}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WebsiteAuditPage() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [selected, setSelected] = useState<Audit | null>(null);

  async function load() {
    const res = await fetch("/api/website-audit");
    if (res.ok) setAudits((await res.json()).audits ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    const res = await fetch("/api/website-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    setRunning(false);
    if (!res.ok) {
      setError(data.error || "Audit failed");
      return;
    }
    setUrl("");
    setSelected(data.audit);
    load();
  }

  const f = selected?.findings;

  return (
    <div className="max-w-3xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Website Audit</h1>
      <p className="text-[12.5px] mb-5" style={{ color: "var(--text-secondary)" }}>
        Real fetch-based checks (HTTPS, security headers, viewport, title/meta, response time) — not a
        full Lighthouse-grade report. Private/internal URLs are blocked for security.
      </p>

      <form onSubmit={run} className="panel p-4 mb-6 flex gap-2 items-end">
        <div className="flex-1">
          <div className="field-label">Website URL</div>
          <Input required type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <Button type="submit" disabled={running}>{running ? "Running…" : "Run audit"}</Button>
      </form>
      {error && (
        <div className="text-[13px] mb-5 p-3 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {selected && selected.status === "COMPLETED" && f && (
        <div className="abv-split-hero p-5 mb-6">
          <div className="flex flex-wrap items-center gap-5">
            <ScoreGauge score={selected.score ?? 0} />
            <div>
              <p className="font-medium text-[14px]" style={{ color: "var(--text-primary)" }}>{selected.url}</p>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                Audited {new Date(selected.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <CategoryCard
              title="Security"
              checks={[
                { label: "Served over HTTPS", pass: f.https },
                ...f.securityHeaders.map((h) => ({ label: `Header: ${h.header}`, pass: h.present })),
              ]}
            />
            <CategoryCard
              title="SEO"
              checks={[
                { label: "Has a <title> tag", pass: f.hasTitle },
                { label: "Title length ≤ 60 chars", pass: f.titleLength > 0 && f.titleLength <= 60 },
                { label: "Has a meta description", pass: f.hasMetaDescription },
              ]}
            />
            <CategoryCard
              title="Performance"
              checks={[
                { label: `Response time (${f.responseTimeMs}ms) ≤ 3000ms`, pass: f.responseTimeMs <= 3000 },
                { label: `Page size: ${(f.htmlSizeBytes / 1024).toFixed(0)} KB`, pass: true },
              ]}
            />
            <CategoryCard
              title="Accessibility"
              checks={[{ label: "Responsive viewport meta tag", pass: f.hasViewportMeta }]}
            />
          </div>

          {f.recommendations.length > 0 && (
            <div className="mt-5">
              <div className="field-label mb-1.5">Recommendations</div>
              <ul className="space-y-1">
                {f.recommendations.map((r, i) => (
                  <li key={i} className="text-[12.5px]" style={{ color: "var(--warning)" }}>⚠ {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <h2 className="text-[15px] font-semibold mb-2.5" style={{ color: "var(--text-primary)" }}>History</h2>
      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>URL</th><th>Score</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id} className="cursor-pointer" onClick={() => setSelected(a)}>
                <td style={{ color: "var(--text-primary)" }}>{a.url}</td>
                <td style={{ color: "var(--text-secondary)" }}>{a.score ?? "—"}</td>
                <td><Badge tone={a.status === "COMPLETED" ? "success" : a.status === "FAILED" ? "danger" : "neutral"}>{a.status}</Badge></td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(a.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {audits.length === 0 && <tr><td colSpan={4}><EmptyState title="No audits run yet" /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
