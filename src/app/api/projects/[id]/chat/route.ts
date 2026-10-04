import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { notifyProjectParticipants } from "@/lib/notifications";

// GET supports `?since=<ISO timestamp>` for lightweight polling from the
// client — this is real polling against the database, not a simulated
// real-time connection. If you later add a WebSocket/SSE transport, this
// endpoint's access checks and isInternal filtering must be preserved.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await assertCanAccessProject(id);
    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");

    const messages = await prisma.chatMessage.findMany({
      where: {
        projectId: id,
        deletedAt: null,
        // A Client must NEVER see isInternal=true rows — enforced here, not
        // just hidden in the UI (spec section 12).
        ...(session.user.role === "CLIENT" ? { isInternal: false } : {}),
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      include: { sender: { select: { name: true, role: true } }, attachmentDocument: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    return NextResponse.json({ messages });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const sendSchema = z.object({
  message: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
  attachmentDocumentId: z.string().optional(),
  replyToMessageId: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, project } = await assertCanAccessProject(id);
    const data = sendSchema.parse(await req.json());

    // Clients can never post — or even flag — an internal note.
    const isInternal = session.user.role === "CLIENT" ? false : data.isInternal ?? false;

    if (data.attachmentDocumentId) {
      const doc = await prisma.document.findUnique({ where: { id: data.attachmentDocumentId } });
      if (!doc || doc.projectId !== id) {
        throw new AuthzError("Attachment does not belong to this project", 400);
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        projectId: id,
        senderId: session.user.id,
        senderRole: session.user.role,
        message: data.message,
        isInternal,
        attachmentDocumentId: data.attachmentDocumentId,
        replyToMessageId: data.replyToMessageId,
        readByUserIds: [session.user.id],
      },
      include: { sender: { select: { name: true, role: true } } },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: isInternal ? "chat.internal_note_added" : "chat.message_sent",
      entityType: "ChatMessage",
      entityId: message.id,
      description: `${session.user.name} ${isInternal ? "added an internal note" : "sent a message"} on project "${project.name}"`,
    });

    // Internal notes never generate a Client-facing notification.
    if (!isInternal) {
      await notifyProjectParticipants(id, {
        excludeUserId: session.user.id,
        type: "CHAT_MESSAGE_RECEIVED",
        title: "New project message",
        body: data.message.slice(0, 140),
      }).catch(() => {});
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

// Mark all currently-visible messages as read by the caller.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session } = await assertCanAccessProject(id);

    const unread = await prisma.chatMessage.findMany({
      where: {
        projectId: id,
        deletedAt: null,
        ...(session.user.role === "CLIENT" ? { isInternal: false } : {}),
        NOT: { readByUserIds: { has: session.user.id } },
      },
      select: { id: true, readByUserIds: true },
    });

    await Promise.all(
      unread.map((m) =>
        prisma.chatMessage.update({
          where: { id: m.id },
          data: { readByUserIds: { push: session.user.id } },
        })
      )
    );

    return NextResponse.json({ markedRead: unread.length });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
