"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone, formatStatus } from "@/lib/status-tone";

type ProjectRow = {
  id: string;
  name: string;
  projectType: string;
  status: string;
  totalValue: string | null;
  currency: string;
  createdAt: string;
  client: { name: string; email: string };
};

const PROJECT_TYPES = [
  "Website", "Web App", "E-commerce", "Portfolio", "SaaS", "Mobile App",
  "UI/UX", "API/Backend", "AI Integration", "Automation", "Custom Software", "Other",
];

export default function ProjectsPage() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", projectType: "Website", description: "", targetAudience: "", budgetEstimate: "",
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmitProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budgetEstimate: form.budgetEstimate ? Number(form.budgetEstimate) : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to submit project");
      return;
    }
    setShowForm(false);
    setForm({ name: "", projectType: "Website", description: "", targetAudience: "", budgetEstimate: "" });
    load();
  }

  const isClient = session?.user?.role === "CLIENT";
  const colCount = isClient ? 5 : 6;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Projects</h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading…" : `${projects.length} total`}
          </p>
        </div>
        {isClient && (
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? "Cancel" : "+ Submit new project"}
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmitProject} className="panel p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {error && (
            <p className="sm:col-span-2 text-xs p-2.5 rounded-[10px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div>
            <Label>Project name *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Project type *</Label>
            <select
              className="field-input"
              value={form.projectType}
              onChange={(e) => setForm({ ...form, projectType: e.target.value })}
            >
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description *</Label>
            <Textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Target audience</Label>
            <Input value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} />
          </div>
          <div>
            <Label>Estimated budget</Label>
            <Input type="number" value={form.budgetEstimate} onChange={(e) => setForm({ ...form, budgetEstimate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Submit project request</Button>
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              {!isClient && <th>Client</th>}
              <th>Type</th>
              <th>Status</th>
              <th>Value</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></td>
                  ))}
                </tr>
              ))}
            {!loading && projects.length === 0 && (
              <tr>
                <td colSpan={colCount}>
                  <EmptyState
                    title="No projects yet"
                    description={isClient ? "Submit your first project request to get started." : "Projects submitted by clients will appear here."}
                  />
                </td>
              </tr>
            )}
            {!loading && projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/dashboard/projects/${p.id}`} className="hover:underline font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </Link>
                </td>
                {!isClient && <td style={{ color: "var(--text-secondary)" }}>{p.client?.name}</td>}
                <td style={{ color: "var(--text-secondary)" }}>{p.projectType}</td>
                <td><Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{p.totalValue ? `${p.currency} ${p.totalValue}` : "—"}</td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
