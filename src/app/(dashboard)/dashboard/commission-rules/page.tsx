"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Rule = {
  id: string;
  name: string;
  sourceType: string;
  percentage: string | number | null;
  flatAmount: string | number | null;
  active: boolean;
};

export default function CommissionRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", sourceType: "PROPOSAL_ACCEPTED", percentage: "", flatAmount: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/commission-rules");
    if (res.ok) setRules((await res.json()).rules);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/commission-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        sourceType: form.sourceType,
        percentage: form.percentage ? Number(form.percentage) : undefined,
        flatAmount: form.flatAmount ? Number(form.flatAmount) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create rule");
      return;
    }
    setForm({ name: "", sourceType: "PROPOSAL_ACCEPTED", percentage: "", flatAmount: "" });
    load();
  }

  async function toggle(rule: Rule) {
    await fetch(`/api/commission-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    load();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Commission Rules</h1>
      <p className="text-[12.5px] mb-5" style={{ color: "var(--text-secondary)" }}>
        Commissions are only auto-generated when an active rule exists for the trigger&apos;s sourceType
        (e.g. &quot;PROPOSAL_ACCEPTED&quot;). No rule = no commission — nothing is invented.
      </p>

      <form onSubmit={create} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <div className="field-label">Rule name</div>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <div className="field-label">Source type</div>
          <Input required value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })} />
        </div>
        <div>
          <div className="field-label">Percentage (%)</div>
          <Input type="number" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
        </div>
        <div>
          <div className="field-label">Flat amount (₹)</div>
          <Input type="number" value={form.flatAmount} onChange={(e) => setForm({ ...form, flatAmount: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit">Create rule</Button>
          {error && <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Source</th><th>Rate</th><th>Active</th></tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 4 }).map((__, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>)}</tr>
              ))}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={4}><EmptyState title="No commission rules yet" /></td></tr>
            )}
            {!loading && rules.map((r) => (
              <tr key={r.id}>
                <td className="font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</td>
                <td style={{ color: "var(--text-secondary)" }}>{r.sourceType}</td>
                <td style={{ color: "var(--text-secondary)" }}>{r.percentage ? `${r.percentage}%` : `₹${r.flatAmount}`}</td>
                <td className="flex items-center gap-2">
                  <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => toggle(r)}>
                    {r.active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
