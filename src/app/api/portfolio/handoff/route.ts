import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHandoffToken, HandoffError } from "@/lib/handoff";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  purpose: z.enum(["WEBSITE_AUDIT", "CLIENT_REGISTER", "PROJECT_REQUEST"]),
  email: z.string().email(),
  name: z.string().max(200).optional(),
  websiteUrl: z.string().url().optional(),
});

/**
 * Called SERVER-SIDE by the portfolio site's own backend (never directly
 * from the visitor's browser) after it has already collected/validated the
 * visitor's details in its own form. Requires a shared API key so a random
 * caller can't mint handoff tokens or spam Lead creation.
 *
 * Returns a one-time signed URL the portfolio site redirects the visitor to;
 * ABYVORA never receives a permanent access token, and nothing sensitive
 * ever appears in a query parameter beyond the opaque signed token itself.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-portfolio-api-key");
    if (!process.env.PORTFOLIO_API_KEY) {
      return NextResponse.json({ error: "Portfolio integration is not configured (PORTFOLIO_API_KEY missing)" }, { status: 503 });
    }
    if (apiKey !== process.env.PORTFOLIO_API_KEY) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = checkRateLimit(`portfolio-handoff:${ip}`, 30, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const data = schema.parse(await req.json());
    if (data.purpose === "WEBSITE_AUDIT" && !data.websiteUrl) {
      return NextResponse.json({ error: "websiteUrl is required for WEBSITE_AUDIT" }, { status: 400 });
    }

    const token = createHandoffToken(data);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUrl = `${appUrl}/portal/continue?token=${token}`;

    // Pre-authentication event — there is no real User row to attach an
    // AuditLog to yet (actorId is a hard foreign key), so we log to server
    // logs here rather than claiming a DB audit entry that would silently
    // fail its FK constraint. Once the visitor actually registers/logs in,
    // all subsequent actions go through the normal writeAuditLog path.
    console.info("[portfolio-handoff]", { purpose: data.purpose, email: data.email, ip });

    return NextResponse.json({ redirectUrl, expiresInSeconds: 600 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.flatten() }, { status: 400 });
    }
    if (err instanceof HandoffError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to create handoff" }, { status: 500 });
  }
}
