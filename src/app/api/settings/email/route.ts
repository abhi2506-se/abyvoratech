import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, toApiError } from "@/lib/authz";
import { getEmailSettings, setEmailSettings, getProviderConfigStatus } from "@/lib/settings";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const settings = await getEmailSettings();
    return NextResponse.json({ settings, providerStatus: getProviderConfigStatus() });
  } catch (err) {
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

const patchSchema = z.object({
  aiGenerationEnabled: z.boolean().optional(),
  inboundEmailEnabled: z.boolean().optional(),
  dailySendingLimitPerAgent: z.number().int().min(1).max(10000).optional(),
  maxAttachmentSizeMb: z.number().int().min(1).max(50).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = await req.json();
    const data = patchSchema.parse(body);
    const settings = await setEmailSettings(data);

    await writeAuditLog({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "settings.email_updated",
      entityType: "Setting",
      entityId: "email_settings",
      description: `${session.user.name} updated Email Settings`,
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
