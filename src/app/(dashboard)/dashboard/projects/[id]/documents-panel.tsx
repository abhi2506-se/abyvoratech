"use client";

import { useEffect, useState } from "react";

type Doc = {
  id: string;
  filename: string;
  documentType: string;
  version: number;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { name: string; role: string };
};

const CLIENT_TYPES = ["REQUIREMENT", "BRAND_ASSET", "OTHER"];
const ALL_TYPES = ["REQUIREMENT", "BRAND_ASSET", "PROPOSAL", "INVOICE", "CONTRACT", "REPORT", "SOURCE_DELIVERABLE", "OTHER"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DocumentsPanel({ projectId, role }: { projectId: string; role: "ADMIN" | "AGENT" | "CLIENT" }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState(role === "CLIENT" ? "REQUIREMENT" : "OTHER");
  const [uploading, setUploading] = useState(false);

  const availableTypes = role === "CLIENT" ? CLIENT_TYPES : ALL_TYPES;

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/documents?projectId=${projectId}`);
    if (res.ok) setDocs((await res.json()).documents ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentType: docType, fileName: file.name, mimeType: file.type, contentBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Documents</h2>
        <div className="flex gap-2 items-center">
          <select className="field-input text-xs" value={docType} onChange={(e) => setDocType(e.target.value)}>
            {availableTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <label className="btn-secondary text-xs px-2 py-1 cursor-pointer">
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>
      {error && <div className="text-xs mb-2" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="panel overflow-x-auto mb-6">
        <table className="data-table">
          <thead><tr><th>File</th><th>Type</th><th>Version</th><th>Uploaded by</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {!loading && docs.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6" style={{ color: "var(--text-secondary)" }}>No documents yet.</td></tr>
            )}
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.filename}</td>
                <td><span className="badge">{d.documentType.replace(/_/g, " ")}</span></td>
                <td>v{d.version}</td>
                <td>{d.uploadedBy.name}</td>
                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                <td><a className="underline text-xs" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">Download</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
