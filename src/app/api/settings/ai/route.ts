import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, toApiError } from "@/lib/authz";
import { getAISettings, setAISettings, getProviderConfigStatus } from "@/lib/settings";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await getAISettings();
    return NextResponse.json({ settings, providerStatus: getProviderConfigStatus() });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  defaultTone: z.string().max(30).optional(),
  defaultLanguage: z.string().max(30).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = await req.json();
    const data = patchSchema.parse(body);
    const settings = await setAISettings(data);

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "settings.ai_updated",
      entityType: "Setting",
      entityId: "ai_settings",
      description: `${session.user.name} updated AI Settings`,
      newValue: data,
    });

    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
