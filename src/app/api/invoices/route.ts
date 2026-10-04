import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: `INV-${year}-` } } });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (projectId) {
      await assertCanAccessProject(projectId);
      const invoices = await prisma.invoice.findMany({ where: { projectId }, orderBy: { issuedAt: "desc" } });
      return NextResponse.json({ invoices });
    }

    // No projectId: Admin sees all, Client sees only their own, Agent none
    // (invoices are a billing artifact between ABYVORA and the Client).
    if (session.user.role === "ADMIN") {
      const invoices = await prisma.invoice.findMany({ orderBy: { issuedAt: "desc" }, take: 300 });
      return NextResponse.json({ invoices });
    }
    if (session.user.role === "CLIENT" && session.user.clientId) {
      const invoices = await prisma.invoice.findMany({
        where: { clientId: session.user.clientId },
        orderBy: { issuedAt: "desc" },
      });
      return NextResponse.json({ invoices });
    }
    return NextResponse.json({ invoices: [] });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const lineItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSchema = z.object({
  projectId: z.string(),
  paymentId: z.string().optional(),
  billingName: z.string().min(1).max(200),
  billingAddress: z.string().max(1000).optional(),
  billingEmail: z.string().email(),
  items: z.array(lineItemSchema).min(1).max(50),
  taxLabel: z.string().max(50).optional(),
  taxAmount: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  dueAt: z.string().datetime().optional(),
});

// Admin-only — invoices are a financial/legal document, never auto-generated
// with guessed figures (spec section 14: "Do not invent tax values").
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const data = createSchema.parse(await req.json());

    const project = await prisma.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw new AuthzError("Project not found", 404);

    if (data.paymentId) {
      const payment = await prisma.payment.findUnique({ where: { id: data.paymentId } });
      if (!payment || payment.projectId !== data.projectId) {
        throw new AuthzError("Payment does not belong to this project", 400);
      }
    }

    const subtotal = data.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const taxAmount = data.taxAmount ?? 0;
    const discount = data.discount ?? 0;
    const total = Math.max(0, subtotal + taxAmount - discount);

    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        projectId: data.projectId,
        clientId: project.clientId,
        paymentId: data.paymentId,
        billingName: data.billingName,
        billingAddress: data.billingAddress,
        billingEmail: data.billingEmail,
        items: data.items,
        subtotal,
        taxLabel: data.taxLabel,
        taxAmount,
        discount,
        total,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        createdById: session.user.id,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      description: `${session.user.name} issued invoice ${invoiceNumber} (${invoice.currency} ${total}) for project "${project.name}"`,
    });

    await notifyProjectParticipants(data.projectId, {
      excludeUserId: session.user.id,
      type: "INVOICE_ISSUED",
      title: "New invoice issued",
      body: `Invoice ${invoiceNumber} for ${invoice.currency} ${total}`,
    }).catch(() => {});

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
