import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, AuthzError, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyAdmins, notifyITSupport } from "@/lib/notifications";
import { generateTicketNumber } from "@/lib/support-lifecycle";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.enum([
    "LOGIN_AND_AUTHENTICATION", "ACCOUNT_ACCESS", "PROJECT_PORTAL", "PAYMENT_TECHNICAL_ISSUE",
    "DOCUMENT_UPLOAD_DOWNLOAD", "PROJECT_CHAT", "NOTIFICATIONS", "WEBSITE_AUDIT", "WEBSITE_ERROR",
    "PERFORMANCE", "BUG_REPORT", "SECURITY_CONCERN", "OTHER",
  ]),
  subcategory: z.string().max(100).optional(),
  relatedProjectId: z.string().optional(),
  relatedPaymentId: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const priority = searchParams.get("priority") || undefined;

    let where: any = {};
    if (session.user.role === "CLIENT") {
      where.raisedById = session.user.id;
    } else if (session.user.role === "AGENT") {
      where.OR = [{ raisedById: session.user.id }, { assignedAgentId: session.user.agentId }];
    }
    // ADMIN and IT_SUPPORT see everything (IT_SUPPORT's UI further filters to
    // tickets forwarded to IT, but the API itself doesn't need to hide rows
    // from them — they're both authorized support-facing roles).

    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: {
        raisedBy: { select: { name: true, email: true } },
        client: { select: { name: true } },
        agent: { select: { user: { select: { name: true } } } },
        assignedAgent: { select: { user: { select: { name: true } } } },
        assignedITSupport: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ tickets });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "IT_SUPPORT") {
      throw new AuthzError("IT Support personnel do not raise tickets through this form", 403);
    }

    const body = createSchema.parse(await req.json());

    if (body.relatedProjectId) {
      const project = await prisma.project.findUnique({ where: { id: body.relatedProjectId } });
      if (!project) return NextResponse.json({ error: "Related project not found" }, { status: 404 });
      const allowed =
        session.user.role === "ADMIN" ||
        (session.user.role === "AGENT" && project.assignedAgentId === session.user.agentId) ||
        (session.user.role === "CLIENT" && project.clientId === session.user.clientId);
      if (!allowed) return NextResponse.json({ error: "You do not have access to that project" }, { status: 403 });
    }

    const ticketNumber = await generateTicketNumber();

    // Business rule (30.6): Client/Agent complaints go to Admin review first;
    // Admin's own complaints skip straight to the IT queue.
    const initialStatus = session.user.role === "ADMIN" ? "FORWARDED_TO_IT" : "SUBMITTED";

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        title: body.title,
        description: body.description,
        category: body.category,
        subcategory: body.subcategory,
        raisedById: session.user.id,
        raisedByRole: session.user.role,
        clientId: session.user.role === "CLIENT" ? session.user.clientId : undefined,
        agentId: session.user.role === "AGENT" ? session.user.agentId : undefined,
        relatedProjectId: body.relatedProjectId,
        relatedPaymentId: body.relatedPaymentId,
        priority: body.priority ?? "MEDIUM",
        status: initialStatus,
      },
    });

    await prisma.supportTicketActivity.create({
      data: {
        ticketId: ticket.id,
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "ticket.created",
        newStatus: initialStatus,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "support_ticket.created",
      entityType: "SupportTicket",
      entityId: ticket.id,
      metadata: { category: body.category, priority: ticket.priority },
    });

    if (initialStatus === "FORWARDED_TO_IT") {
      await notifyITSupport({
        type: "SUPPORT_TICKET_CREATED",
        title: `New ticket from Admin: ${ticket.title}`,
        body: ticket.description,
        entityType: "SupportTicket",
        entityId: ticket.id,
      });
    } else {
      await notifyAdmins({
        type: "SUPPORT_TICKET_CREATED",
        title: `New support ticket: ${ticket.title}`,
        body: `Raised by ${session.user.role.toLowerCase()} — ${body.category.replace(/_/g, " ")}`,
        entityType: "SupportTicket",
        entityId: ticket.id,
      });
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
