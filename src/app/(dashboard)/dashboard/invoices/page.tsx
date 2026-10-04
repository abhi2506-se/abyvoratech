"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { statusTone, formatStatus } from "@/lib/status-tone";

type Invoice = {
  id: string;
  invoiceNumber: string;
  total: string | number;
  paidAmount: string | number;
  currency: string;
  paymentStatus: string;
  issuedAt: string;
  dueAt: string | null;
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Invoices</h1>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {loading ? "Loading…" : `${invoices.length} invoices`}
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Issued</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><Skeleton className="h-4 w-full max-w-[100px]" /></td>
                  ))}
                </tr>
              ))}
            {!loading && invoices.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="No invoices yet" /></td></tr>
            )}
            {!loading && invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="font-medium" style={{ color: "var(--text-primary)" }}>{inv.invoiceNumber}</td>
                <td style={{ color: "var(--text-secondary)" }}>{inv.currency} {Number(inv.total).toLocaleString()}</td>
                <td style={{ color: "var(--text-secondary)" }}>{inv.currency} {Number(inv.paidAmount).toLocaleString()}</td>
                <td><Badge tone={statusTone(inv.paymentStatus)}>{formatStatus(inv.paymentStatus)}</Badge></td>
                <td style={{ color: "var(--text-muted)" }}>{new Date(inv.issuedAt).toLocaleDateString()}</td>
                <td>
                  <a href={`/invoice/${inv.id}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">View / Print</Button>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
