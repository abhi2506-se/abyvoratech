import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { getFile, getSignedDownloadUrl } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const document = await prisma.document.findUnique({ where: { id } });
    if (!document) throw new AuthzError("Not found", 404);
    if (!document.projectId) throw new AuthzError("Document is not attached to a project", 400);

    const { session } = await assertCanAccessProject(document.projectId);

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "document.downloaded",
      entityType: "Document",
      entityId: document.id,
      description: `${session.user.name} downloaded "${document.filename}"`,
    });

    const signedUrl = await getSignedDownloadUrl(document.storageKey);
    if (signedUrl) return NextResponse.redirect(signedUrl);

    const buffer = await getFile(document.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
