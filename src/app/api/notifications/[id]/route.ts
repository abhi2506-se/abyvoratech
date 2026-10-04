import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, AuthzError, toApiError } from "@/lib/authz";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new AuthzError("Not found", 404);
    if (notification.userId !== session.user.id) {
      // A user can only ever mark their own notifications — no IDOR via URL id.
      throw new AuthzError("You do not have access to this notification", 403);
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    return NextResponse.json({ notification: updated });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
