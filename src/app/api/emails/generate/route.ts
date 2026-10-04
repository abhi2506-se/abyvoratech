import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateEmailWithAI, AIConfigError, AIGenerationError } from "@/lib/ai/generate";
import { getEmailSettings } from "@/lib/settings";

const schema = z.object({
  emailType: z.enum(["PROPOSAL", "SALES"]),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "PERSUASIVE", "PREMIUM", "CONCISE"]).default("PROFESSIONAL"),
  language: z.string().max(30).default("ENGLISH"),
  clientName: z.string().max(200).optional(),
  companyName: z.string().max(200).optional(),
  serviceName: z.string().max(200).optional(),
  projectTitle: z.string().max(200).optional(),
  clientRequirements: z.string().max(3000).optional(),
  budget: z.string().max(100).optional(),
  timeline: z.string().max(100).optional(),
  proposalAmount: z.string().max(100).optional(),
  technologyStack: z.string().max(300).optional(),
  agentInstructions: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const emailSettings = await getEmailSettings();
    if (!emailSettings.aiGenerationEnabled) {
      return NextResponse.json({ error: "AI email generation is disabled by Admin" }, { status: 403 });
    }

    // 10 generations per agent per 10 minutes — generous for real drafting,
    // tight enough to block runaway/abusive use of the AI provider.
    const rl = checkRateLimit(`ai-generate:${session.user.id}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const data = schema.parse(body);

    const result = await generateEmailWithAI({
      ...data,
      agentName: session.user.name,
    });

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "email.ai_generated",
      entityType: "EmailDraft",
      description: `${session.user.name} generated a ${data.emailType} email draft with AI`,
      metadata: { emailType: data.emailType, tone: data.tone, language: data.language },
    });

    return NextResponse.json({ draft: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    if (err instanceof AIConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AIGenerationError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
