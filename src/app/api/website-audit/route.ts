import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, toApiError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { runWebsiteAudit, AuditSecurityError } from "@/lib/website-audit";

const schema = z.object({
  url: z.string().url(),
  leadId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");

    let where: any = {};
    if (session.user.role === "CLIENT") {
      where = { clientId: session.user.clientId };
    } else if (clientId) {
      where = { clientId };
    }

    const audits = await prisma.websiteAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ audits });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const data = schema.parse(await req.json());

    // Rate-limited per user to prevent this endpoint being used as an open
    // SSRF-probe or port-scan tool against arbitrary hosts.
    const rl = checkRateLimit(`website-audit:${session.user.id}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 }
      );
    }

    const audit = await prisma.websiteAudit.create({
      data: {
        url: data.url,
        requestedById: session.user.id,
        clientId: session.user.role === "CLIENT" ? session.user.clientId : undefined,
        leadId: data.leadId,
        status: "RUNNING",
      },
    });

    try {
      const findings = await runWebsiteAudit(data.url);
      const completed = await prisma.websiteAudit.update({
        where: { id: audit.id },
        data: { status: "COMPLETED", score: findings.score, findings: findings as any, completedAt: new Date() },
      });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "website_audit.completed",
        entityType: "WebsiteAudit",
        entityId: audit.id,
        description: `${session.user.name} ran a website audit on ${data.url} (score ${findings.score})`,
      });

      return NextResponse.json({ audit: completed });
    } catch (err: any) {
      const failed = await prisma.websiteAudit.update({
        where: { id: audit.id },
        data: { status: "FAILED", errorMessage: err?.message ?? "Audit failed", completedAt: new Date() },
      });

      await writeAuditLog({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "website_audit.failed",
        entityType: "WebsiteAudit",
        entityId: audit.id,
        status: "FAILED",
        errorDetail: err?.message,
        description: `Website audit on ${data.url} failed`,
      });

      const status = err instanceof AuditSecurityError ? 400 : 502;
      return NextResponse.json({ audit: failed, error: err?.message ?? "Audit failed" }, { status });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
