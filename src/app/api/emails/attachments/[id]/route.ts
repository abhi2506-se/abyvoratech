import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { getFile, getSignedDownloadUrl } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const attachment = await prisma.emailAttachment.findUnique({
      where: { id },
      include: { emailMessage: true },
    });
    if (!attachment) throw new AuthzError("Not found", 404);

    if (session.user.role === "AGENT" && attachment.emailMessage.agentId !== session.user.agentId) {
      throw new AuthzError("You do not have access to this attachment", 403);
    }

    const signedUrl = await getSignedDownloadUrl(attachment.storageKey);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl);
    }

    const buffer = await getFile(attachment.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
