import { prisma } from "@/lib/prisma";

/**
 * Non-secret configuration lives in the DB (Setting table) so Admin can
 * toggle it from the UI without a redeploy. Actual secrets (API keys,
 * webhook signing secrets) stay in environment variables only — this file
 * never reads or writes them, matching spec section 22 ("never display full
 * API keys or SMTP passwords").
 */
export type EmailSettings = {
  aiGenerationEnabled: boolean;
  inboundEmailEnabled: boolean;
  dailySendingLimitPerAgent: number;
  maxAttachmentSizeMb: number;
};

export type AISettings = {
  enabled: boolean;
  defaultTone: string;
  defaultLanguage: string;
};

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  aiGenerationEnabled: true,
  inboundEmailEnabled: false,
  dailySendingLimitPerAgent: 100,
  maxAttachmentSizeMb: 10,
};

const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  defaultTone: "PROFESSIONAL",
  defaultLanguage: "ENGLISH",
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "email_settings" } });
  return { ...DEFAULT_EMAIL_SETTINGS, ...(row?.value as object) };
}

export async function setEmailSettings(patch: Partial<EmailSettings>): Promise<EmailSettings> {
  const current = await getEmailSettings();
  const next = { ...current, ...patch };
  await prisma.setting.upsert({
    where: { key: "email_settings" },
    create: { key: "email_settings", value: next as any },
    update: { value: next as any },
  });
  return next;
}

export async function getAISettings(): Promise<AISettings> {
  const row = await prisma.setting.findUnique({ where: { key: "ai_settings" } });
  return { ...DEFAULT_AI_SETTINGS, ...(row?.value as object) };
}

export async function setAISettings(patch: Partial<AISettings>): Promise<AISettings> {
  const current = await getAISettings();
  const next = { ...current, ...patch };
  await prisma.setting.upsert({
    where: { key: "ai_settings" },
    create: { key: "ai_settings", value: next as any },
    update: { value: next as any },
  });
  return next;
}

/** Reports which env-based secrets are configured, WITHOUT exposing their values. */
export function getProviderConfigStatus() {
  return {
    resendConfigured: !!process.env.RESEND_API_KEY,
    proposalSenderConfigured: !!process.env.EMAIL_FROM_PROPOSAL,
    salesSenderConfigured: !!process.env.EMAIL_FROM_SALES,
    webhookSecretConfigured: !!process.env.EMAIL_WEBHOOK_SECRET,
    aiConfigured: !!process.env.AI_API_KEY,
    aiModel: process.env.AI_MODEL || null,
    aiBaseUrl: process.env.AI_BASE_URL || null,
    storageProvider: process.env.STORAGE_PROVIDER || "local",
  };
}
