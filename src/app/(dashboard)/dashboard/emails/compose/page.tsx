"use client";

import { useEffect, useState } from "react";

type Sender = { email: string; name: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ComposeEmailPage() {
  const [emailType, setEmailType] = useState<"PROPOSAL" | "SALES">("PROPOSAL");
  const [sender, setSender] = useState<Sender | null>(null);
  const [senderError, setSenderError] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);

  const [ai, setAi] = useState({
    clientName: "",
    companyName: "",
    serviceName: "",
    projectTitle: "",
    clientRequirements: "",
    budget: "",
    timeline: "",
    proposalAmount: "",
    technologyStack: "",
    agentInstructions: "",
    tone: "PROFESSIONAL",
    language: "ENGLISH",
  });

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSender(type: string) {
    setSenderError(null);
    const res = await fetch(`/api/emails/sender-preview?type=${type}`);
    const data = await res.json();
    if (data.configured) {
      setSender(data.sender);
    } else {
      setSender(null);
      setSenderError(data.error || "Sender not configured");
    }
  }

  useEffect(() => {
    loadSender(emailType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailType]);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailType, ...ai }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed");
      setSubject(data.draft.subject);
      setHtmlBody(data.draft.htmlBody);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setTo("");
    setCc("");
    setBcc("");
    setReplyTo("");
    setSubject("");
    setHtmlBody("");
    setAttachments([]);
    setResult(null);
    setError(null);
  }

  async function handleSend() {
    setError(null);
    setResult(null);
    setSending(true);
    try {
      const attachmentPayload = await Promise.all(
        attachments.map(async (f) => ({
          fileName: f.name,
          mimeType: f.type,
          contentBase64: await fileToBase64(f),
        }))
      );

      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailType,
          toEmails: to.split(",").map((s) => s.trim()).filter(Boolean),
          ccEmails: cc.split(",").map((s) => s.trim()).filter(Boolean),
          bccEmails: bcc.split(",").map((s) => s.trim()).filter(Boolean),
          replyTo: replyTo || undefined,
          subject,
          htmlBody,
          attachments: attachmentPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send email");
        return;
      }
      if (data.delivered) {
        setResult({ ok: true, message: "Email sent and accepted by the provider." });
        reset();
      } else {
        setResult({ ok: false, message: `Send failed: ${data.error}` });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
        Compose Email
      </h1>

      <div className="panel p-4 mb-4">
        <div className="field-label">Email Type</div>
        <div className="flex gap-2 mb-3">
          {(["PROPOSAL", "SALES"] as const).map((t) => (
            <button
              key={t}
              className={t === emailType ? "btn-primary" : "btn-secondary"}
              onClick={() => setEmailType(t)}
              type="button"
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="field-label">From (read-only)</div>
        {sender ? (
          <div className="text-sm mb-3">
            {sender.name} &lt;{sender.email}&gt;
          </div>
        ) : (
          <div className="text-sm mb-3" style={{ color: "var(--danger)" }}>
            {senderError ?? "Loading sender…"}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="field-label">To (comma-separated)</div>
            <input className="field-input w-full" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="field-label">CC</div>
              <input className="field-input w-full" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div>
              <div className="field-label">BCC</div>
              <input className="field-input w-full" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="field-label">Reply-To (optional)</div>
            <input className="field-input w-full" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </div>
          <div>
            <div className="field-label">Subject</div>
            <input className="field-input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>
      </div>

      <details className="panel p-4 mb-4">
        <summary className="cursor-pointer font-medium" style={{ color: "var(--text-primary)" }}>
          AI email generation details
        </summary>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {(
            [
              ["clientName", "Client name"],
              ["companyName", "Company name"],
              ["serviceName", "Service"],
              ["projectTitle", "Project title"],
              ["budget", "Budget"],
              ["timeline", "Timeline"],
              ["proposalAmount", "Proposal amount"],
              ["technologyStack", "Technology stack"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="field-label">{label}</div>
              <input
                className="field-input w-full"
                value={(ai as any)[key]}
                onChange={(e) => setAi({ ...ai, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="col-span-2">
            <div className="field-label">Client requirements</div>
            <textarea
              className="field-input w-full"
              rows={2}
              value={ai.clientRequirements}
              onChange={(e) => setAi({ ...ai, clientRequirements: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <div className="field-label">Additional instructions</div>
            <textarea
              className="field-input w-full"
              rows={2}
              value={ai.agentInstructions}
              onChange={(e) => setAi({ ...ai, agentInstructions: e.target.value })}
            />
          </div>
          <div>
            <div className="field-label">Tone</div>
            <select
              className="field-input w-full"
              value={ai.tone}
              onChange={(e) => setAi({ ...ai, tone: e.target.value })}
            >
              {["PROFESSIONAL", "FRIENDLY", "PERSUASIVE", "PREMIUM", "CONCISE"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="field-label">Language</div>
            <select
              className="field-input w-full"
              value={ai.language}
              onChange={(e) => setAi({ ...ai, language: e.target.value })}
            >
              {["ENGLISH", "HINDI", "HINGLISH"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-primary mt-3" onClick={handleGenerate} disabled={generating} type="button">
          {generating ? "Generating…" : "Generate Email With AI"}
        </button>
      </details>

      <div className="panel p-4 mb-4">
        <div className="field-label">Email Body</div>
        <textarea
          className="field-input w-full"
          rows={12}
          value={htmlBody}
          onChange={(e) => setHtmlBody(e.target.value)}
          placeholder="HTML content — generate with AI above, or write your own."
        />

        <div className="field-label mt-3">Attachments (PDF, DOC/DOCX, PNG, JPEG — max 10MB each)</div>
        <input
          type="file"
          multiple
          onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
        />
        {attachments.length > 0 && (
          <ul className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {attachments.map((f, i) => (
              <li key={i}>
                {f.name} ({(f.size / 1024).toFixed(0)} KB)
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <button className="btn-secondary" type="button" onClick={() => setPreview((p) => !p)}>
          {preview ? "Hide preview" : "Preview"}
        </button>
        <button className="btn-primary" type="button" onClick={handleSend} disabled={sending}>
          {sending ? "Sending…" : "Send Email"}
        </button>
        <button className="btn-secondary" type="button" onClick={reset}>
          Reset
        </button>
      </div>

      {error && (
        <div className="text-sm mt-3" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      {result && (
        <div className="text-sm mt-3" style={{ color: result.ok ? "var(--success)" : "var(--danger)" }}>
          {result.message}
        </div>
      )}

      {preview && (
        <div className="panel p-4 mt-4">
          <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
            Preview
          </div>
          <div className="text-sm font-medium mb-2">{subject || "(no subject)"}</div>
          <div dangerouslySetInnerHTML={{ __html: htmlBody || "<em>(empty body)</em>" }} />
        </div>
      )}
    </div>
  );
}
