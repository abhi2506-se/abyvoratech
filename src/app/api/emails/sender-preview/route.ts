import { NextRequest, NextResponse } from "next/server";
import { requireSession, toApiError, AuthzError } from "@/lib/authz";
import { resolveSenderIdentity, EmailConfigError } from "@/lib/email/senders";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role === "CLIENT") throw new AuthzError("Not permitted", 403);

    const type = new URL(req.url).searchParams.get("type");
    if (type !== "PROPOSAL" && type !== "SALES" && type !== "GENERAL") {
      return NextResponse.json({ error: "type must be PROPOSAL, SALES or GENERAL" }, { status: 400 });
    }

    const sender = resolveSenderIdentity(type as any);
    return NextResponse.json({ sender, configured: true });
  } catch (err) {
    if (err instanceof EmailConfigError) {
      return NextResponse.json({ configured: false, error: err.message }, { status: 200 });
    }
    const { status, message } = toApiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
