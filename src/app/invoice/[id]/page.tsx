"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AbyvoraLogo } from "@/components/brand/abyvora-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Invoice = {
  invoiceNumber: string;
  billingName: string;
  billingAddress: string | null;
  billingEmail: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  subtotal: string | number;
  taxLabel: string | null;
  taxAmount: string | number;
  discount: string | number;
  total: string | number;
  paidAmount: string | number;
  currency: string;
  paymentStatus: string;
  issuedAt: string;
  dueAt: string | null;
  project: { name: string };
};

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const s = status.toUpperCase();
  if (s.includes("PAID")) return "success";
  if (s.includes("PARTIAL") || s.includes("PENDING")) return "warning";
  if (s.includes("OVERDUE") || s.includes("FAILED")) return "danger";
  return "neutral";
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setInvoice(data.invoice);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }
  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading invoice…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "var(--bg)" }}>
      <div
        className="max-w-2xl mx-auto p-8 sm:p-10 text-sm print:shadow-none print:border-none"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div className="flex justify-between items-start mb-10">
          <div>
            <AbyvoraLogo variant="full" height={44} />
          </div>
          <div className="text-right">
            <p className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{invoice.invoiceNumber}</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Issued {new Date(invoice.issuedAt).toLocaleDateString()}
            </p>
            {invoice.dueAt && (
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Due {new Date(invoice.dueAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Bill to
            </p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>{invoice.billingName}</p>
            {invoice.billingAddress && (
              <p className="whitespace-pre-line text-[13px]" style={{ color: "var(--text-secondary)" }}>{invoice.billingAddress}</p>
            )}
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{invoice.billingEmail}</p>
            <p className="text-[12.5px] mt-1.5" style={{ color: "var(--text-muted)" }}>Project: {invoice.project.name}</p>
          </div>
          <Badge tone={statusTone(invoice.paymentStatus)}>{invoice.paymentStatus}</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table mb-6" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>Description</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.description}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">{invoice.currency} {item.unitPrice.toLocaleString()}</td>
                  <td className="text-right">{invoice.currency} {(item.quantity * item.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1.5 text-[13px]">
            <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
              <span>Subtotal</span><span>{invoice.currency} {Number(invoice.subtotal).toLocaleString()}</span>
            </div>
            {Number(invoice.taxAmount) > 0 && (
              <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                <span>{invoice.taxLabel || "Tax"}</span><span>{invoice.currency} {Number(invoice.taxAmount).toLocaleString()}</span>
              </div>
            )}
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                <span>Discount</span><span>-{invoice.currency} {Number(invoice.discount).toLocaleString()}</span>
              </div>
            )}
            <div
              className="flex justify-between font-semibold text-[15px] pt-2 mt-1"
              style={{ borderTop: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <span>Total</span><span>{invoice.currency} {Number(invoice.total).toLocaleString()}</span>
            </div>
            <div className="flex justify-between" style={{ color: "var(--text-muted)" }}>
              <span>Paid</span><span>{invoice.currency} {Number(invoice.paidAmount).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>ABYVORA Technologies — Ideas Beyond Tomorrow</p>
          <Button onClick={() => window.print()} className="print:hidden" size="sm">
            Print / Save as PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
