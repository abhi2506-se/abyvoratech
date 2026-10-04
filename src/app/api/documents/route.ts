import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessProject, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { saveFile } from "@/lib/storage";
import { notifyProjectParticipants } from "@/lib/notifications";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "text/plain",
]);

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

    await assertCanAccessProject(projectId); // throws if not authorized for this project

    const documents = await prisma.document.findMany({
      where: { projectId },
      include: { uploadedBy: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const uploadSchema = z.object({
  projectId: z.string(),
  documentType: z.enum([
    "REQUIREMENT",
    "BRAND_ASSET",
    "PROPOSAL",
    "INVOICE",
    "CONTRACT",
    "REPORT",
    "SOURCE_DELIVERABLE",
    "OTHER",
  ]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const data = uploadSchema.parse(await req.json());
    const { project } = await assertCanAccessProject(data.projectId);

    if (/\.\.|\//.test(data.fileName)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(data.mimeType)) {
      return NextResponse.json({ error: `Unsupported file type: ${data.mimeType}` }, { status: 400 });
    }

    const buffer = Buffer.from(data.contentBase64, "base64");
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds the 20MB limit" }, { status: 400 });
    }
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // Clients may only attach requirement/reference material, not upload
    // internal contract/source-deliverable/report documents.
    if (session.user.role === "CLIENT" && !["REQUIREMENT", "BRAND_ASSET", "OTHER"].includes(data.documentType)) {
      throw new AuthzError("Clients may only upload requirement, brand-asset, or general attachments", 403);
    }

    // Highest existing version among documents with the same filename on
    // this project — a simple, real versioning scheme (spec section 13).
    const priorVersion = await prisma.document.findFirst({
      where: { projectId: data.projectId, filename: data.fileName },
      orderBy: { version: "desc" },
    });

    const storageKey = await saveFile(buffer, data.fileName, data.mimeType);

    const document = await prisma.document.create({
      data: {
        filename: data.fileName,
        storageKey,
        mimeType: data.mimeType,
        sizeBytes: buffer.length,
        documentType: data.documentType,
        version: (priorVersion?.version ?? 0) + 1,
        projectId: data.projectId,
        clientId: project.clientId,
        uploadedById: session.user.id,
      },
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "document.uploaded",
      entityType: "Document",
      entityId: document.id,
      description: `${session.user.name} uploaded "${data.fileName}" (${data.documentType}, v${document.version}) to project "${project.name}"`,
    });

    await notifyProjectParticipants(data.projectId, {
      excludeUserId: session.user.id,
      type: "DOCUMENT_UPLOADED",
      title: "New document uploaded",
      body: `${session.user.name} uploaded "${data.fileName}"`,
    }).catch(() => {});

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
