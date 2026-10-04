"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  sender: { name: string; role: string };
};

export function ChatPanel({ projectId, role }: { projectId: string; role: "ADMIN" | "AGENT" | "CLIENT" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const lastFetchRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function poll() {
    const url = lastFetchRef.current
      ? `/api/projects/${projectId}/chat?since=${encodeURIComponent(lastFetchRef.current)}`
      : `/api/projects/${projectId}/chat`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const incoming: Message[] = data.messages ?? [];
    if (incoming.length > 0) {
      setMessages((prev) => [...prev, ...incoming]);
      lastFetchRef.current = incoming[incoming.length - 1].createdAt;
    } else if (!lastFetchRef.current) {
      lastFetchRef.current = new Date(0).toISOString();
    }
  }

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000); // real polling, not a fake live-update claim
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, isInternal: role !== "CLIENT" && isInternal }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastFetchRef.current = data.message.createdAt;
      setText("");
    }
    setSending(false);
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Project Chat</h2>
      <div className="panel p-3 mb-2" style={{ height: 280, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>No messages yet.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="mb-2 text-xs">
            <span className="font-semibold">{m.sender.name}</span>{" "}
            <span style={{ color: "var(--text-secondary)" }}>({m.sender.role})</span>
            {m.isInternal && (
              <span className="badge ml-1" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>internal</span>
            )}
            <div>{m.message}</div>
            <div style={{ color: "var(--text-secondary)" }}>{new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 items-end">
        <textarea
          className="field-input flex-1"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
        />
        <button className="btn-primary text-xs px-3 py-2" onClick={send} disabled={sending}>
          Send
        </button>
      </div>
      {role !== "CLIENT" && (
        <label className="text-xs flex items-center gap-1 mt-1" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
          Internal note (never visible to Client)
        </label>
      )}
    </div>
  );
}
