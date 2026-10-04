"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type Person = { id: string; name: string; email: string; status: string; createdAt: string };

export function PersonnelManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

  async function load() {
    const res = await fetch("/api/admin/it-support/personnel");
    if (res.ok) setPeople((await res.json()).personnel);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreated(null);
    const res = await fetch("/api/admin/it-support/personnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create account.");
      return;
    }
    setName("");
    setEmail("");
    setCreated({ email: data.user.email, temporaryPassword: data.temporaryPassword });
    load();
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (newStatus === "DISABLED" && !confirm("Deactivate this IT Support account?")) return;
    const res = await fetch(`/api/admin/it-support/personnel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      load();
    } else {
      alert((await res.json()).error || "Action failed");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>IT Support Personnel</h1>
      <p className="text-[12.5px] mb-5" style={{ color: "var(--text-secondary)" }}>
        At least one active IT Support account must always exist — deactivating the last one is blocked server-side.
      </p>

      <form onSubmit={create} className="panel p-5 space-y-3.5 mb-6">
        {error && (
          <p className="text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</p>
        )}
        {created && (
          <div className="text-xs p-3 rounded-[10px]" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
            Account created for {created.email}. Temporary password: <b className="font-mono">{created.temporaryPassword}</b>
            <br />Share this securely — it will not be shown again.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create IT Support account"}
        </Button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td style={{ color: "var(--text-primary)" }}>{p.name}</td>
                <td style={{ color: "var(--text-secondary)" }}>{p.email}</td>
                <td><Badge tone={p.status === "ACTIVE" ? "success" : "danger"}>{p.status}</Badge></td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => toggleStatus(p.id, p.status)}>
                    {p.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr><td colSpan={4}><EmptyState title="No IT Support accounts yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
