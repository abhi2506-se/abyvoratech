"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Agent = { id: string; user: { name: string } };

export function TicketActions({
  ticketId,
  status,
  role,
  isAssignedAgent,
  agents,
}: {
  ticketId: string;
  status: string;
  role: string;
  isAssignedAgent: boolean;
  agents: Agent[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("");

  async function call(url: string, body?: any, method = "POST") {
    setLoading(url);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setLoading(null);
    if (res.ok) {
      router.refresh();
    } else {
      alert((await res.json()).error || "Action failed");
    }
  }

  const buttons: React.ReactNode[] = [];

  if (role === "ADMIN") {
    if (["SUBMITTED", "ADMIN_REVIEW"].includes(status)) {
      buttons.push(
        <div key="assign-agent" className="flex items-center gap-2">
          <select className="field-input w-auto text-xs py-1" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
            <option value="">Select agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.user.name}</option>
            ))}
          </select>
          <button
            disabled={!selectedAgent || !!loading}
            onClick={() => call(`/api/support/tickets/${ticketId}/assign`, { assignToType: "AGENT", agentId: selectedAgent })}
            className="btn-secondary text-xs px-2 py-1"
          >
            Assign to Agent
          </button>
        </div>
      );
      buttons.push(
        <button key="forward" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/forward`, {})} className="btn-primary text-xs px-2 py-1">
          Forward to IT Support
        </button>
      );
      buttons.push(
        <button
          key="needs-info"
          disabled={!!loading}
          onClick={() => {
            const note = prompt("What additional information is needed?");
            if (note?.trim()) call(`/api/support/tickets/${ticketId}/status`, { status: "NEEDS_INFORMATION", note: note.trim() });
          }}
          className="btn-secondary text-xs px-2 py-1"
        >
          Request more information
        </button>
      );
      if (status === "SUBMITTED") {
        buttons.push(
          <button key="review" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/status`, { status: "ADMIN_REVIEW" })} className="btn-secondary text-xs px-2 py-1">
            Move to review
          </button>
        );
      }
    }
    if (status === "ESCALATED_TO_ADMIN") {
      buttons.push(
        <button key="approve-esc" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/approve-escalation`, {})} className="btn-primary text-xs px-2 py-1">
          Approve escalation → IT
        </button>
      );
      buttons.push(
        <button
          key="reject-esc"
          disabled={!!loading}
          onClick={() => {
            const reason = prompt("Reason for rejecting this escalation (required):");
            if (reason?.trim()) call(`/api/support/tickets/${ticketId}/reject-escalation`, { reason: reason.trim() });
          }}
          className="btn-secondary text-xs px-2 py-1"
          style={{ color: "var(--danger)" }}
        >
          Reject escalation
        </button>
      );
    }
    if (status === "ESCALATION_REJECTED") {
      buttons.push(
        <button key="back-to-agent" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/status`, { status: "AGENT_IN_PROGRESS" })} className="btn-secondary text-xs px-2 py-1">
          Send back to Agent
        </button>
      );
    }
    if (status === "RESOLVED") {
      buttons.push(
        <button key="close" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/close`, {})} className="btn-secondary text-xs px-2 py-1">
          Close ticket
        </button>
      );
    }
    if (["RESOLVED", "CLOSED"].includes(status)) {
      buttons.push(
        <button
          key="reopen"
          disabled={!!loading}
          onClick={() => {
            const reason = prompt("Reason for reopening (required):");
            if (reason?.trim()) call(`/api/support/tickets/${ticketId}/reopen`, { reason: reason.trim() });
          }}
          className="btn-secondary text-xs px-2 py-1"
        >
          Reopen
        </button>
      );
    }
  }

  if (role === "AGENT" && isAssignedAgent) {
    if (status === "ASSIGNED_TO_AGENT") {
      buttons.push(
        <button key="start" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/status`, { status: "AGENT_IN_PROGRESS" })} className="btn-primary text-xs px-2 py-1">
          Start working
        </button>
      );
    }
    if (["ASSIGNED_TO_AGENT", "AGENT_IN_PROGRESS"].includes(status)) {
      buttons.push(
        <button
          key="escalate"
          disabled={!!loading}
          onClick={() => {
            const escalationReason = prompt("Why does this need Admin's attention? (required)");
            if (!escalationReason?.trim()) return;
            const technicalDetails = prompt("Technical details (required):") || "";
            const stepsAlreadyTaken = prompt("Steps already taken (required):") || "";
            if (!technicalDetails.trim() || !stepsAlreadyTaken.trim()) return;
            call(`/api/support/tickets/${ticketId}/escalate`, { escalationReason: escalationReason.trim(), technicalDetails, stepsAlreadyTaken });
          }}
          className="btn-secondary text-xs px-2 py-1"
        >
          Escalate to Admin
        </button>
      );
    }
    if (status === "AGENT_IN_PROGRESS") {
      buttons.push(
        <button
          key="resolve"
          disabled={!!loading}
          onClick={() => {
            const summary = prompt("Resolution summary (required):");
            if (summary?.trim()) call(`/api/support/tickets/${ticketId}/resolve`, { resolutionSummary: summary.trim() });
          }}
          className="btn-primary text-xs px-2 py-1"
        >
          Mark resolved
        </button>
      );
    }
  }

  if (role === "CLIENT" && ["SUBMITTED", "ADMIN_REVIEW"].includes(status)) {
    buttons.push(
      <button
        key="cancel"
        disabled={!!loading}
        onClick={() => {
          if (confirm("Cancel this ticket?")) call(`/api/support/tickets/${ticketId}/status`, { status: "CANCELLED" });
        }}
        className="btn-secondary text-xs px-2 py-1"
        style={{ color: "var(--danger)" }}
      >
        Cancel ticket
      </button>
    );
  }
  if (role === "CLIENT" && status === "RESOLVED") {
    buttons.push(
      <button key="confirm-close" disabled={!!loading} onClick={() => call(`/api/support/tickets/${ticketId}/close`, {})} className="btn-primary text-xs px-2 py-1">
        Confirm & close
      </button>
    );
    buttons.push(
      <button
        key="reopen-client"
        disabled={!!loading}
        onClick={() => {
          const reason = prompt("What's still wrong? (required)");
          if (reason?.trim()) call(`/api/support/tickets/${ticketId}/reopen`, { reason: reason.trim() });
        }}
        className="btn-secondary text-xs px-2 py-1"
      >
        Not resolved — reopen
      </button>
    );
  }

  if (buttons.length === 0) return null;

  return <div className="panel p-3 flex flex-wrap gap-2 items-center mb-4">{buttons}</div>;
}
