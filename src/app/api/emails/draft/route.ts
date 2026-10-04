import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";

const draftSchema = z.object({
  emailType: z.enum(["PROPOSAL", "SALES", "GENERAL"]),
  toEmails: z.array(z.string()).optional(),
  ccEmails: z.array(z.string()).optional(),
  bccEmails: z.array(z.string()).optional(),
  subject: z.string().max(300).optional(),
  htmlBody: z.string().optional(),
  textBody: z.string().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    if (!session.user.agentId) throw new AuthzError("No agent context", 400);

    const drafts = await prisma.emailDraft.findMany({
      where: { agentId: session.user.agentId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ drafts });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session.user.agentId) throw new AuthzError("Only agents can save drafts", 400);

    const body = await req.json();
    const data = draftSchema.parse(body);

    const draft = await prisma.emailDraft.create({
      data: {
        agentId: session.user.agentId,
        emailType: data.emailType,
        toEmails: data.toEmails ?? [],
        ccEmails: data.ccEmails ?? [],
        bccEmails: data.bccEmails ?? [],
        subject: data.subject,
        htmlBody: data.htmlBody,
        textBody: data.textBody,
      },
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
