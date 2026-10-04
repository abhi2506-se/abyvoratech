import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessTicket, toApiError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, ticket } = await assertCanAccessTicket(id);

    const canSeeInternal = session.user.role === "ADMIN" || session.user.role === "IT_SUPPORT";

    const [full, messages, activities] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { id: ticket.id },
        include: {
          raisedBy: { select: { name: true, email: true, role: true } },
          client: { select: { name: true, email: true } },
          agent: { select: { user: { select: { name: true } } } },
          assignedAgent: { select: { user: { select: { name: true } } } },
          assignedITSupport: { select: { name: true } },
          relatedProject: { select: { id: true, name: true } },
        },
      }),
      // Internal notes are stripped from the response entirely for anyone
      // who isn't Admin/IT_SUPPORT — never sent to the client and filtered
      // out server-side, not just hidden in the UI.
      prisma.supportTicketMessage.findMany({
        where: { ticketId: ticket.id, ...(canSeeInternal ? {} : { isInternal: false }) },
        orderBy: { createdAt: "asc" },
      }),
      prisma.supportTicketActivity.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ ticket: full, messages, activities });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
