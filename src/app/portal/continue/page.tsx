import { redirect } from "next/navigation";
import { verifyHandoffToken, HandoffError } from "@/lib/handoff";

// This is the ONLY page the portfolio site ever links to. It verifies the
// signed token server-side and redirects to one of a fixed, hardcoded set of
// internal destinations — the token's `purpose` field is never used to build
// an arbitrary redirect URL, which is what makes this safe from open-redirect
// / SSRF-via-redirect abuse (spec section 17: "secure redirect allowlist").
export default async function PortalContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-24 p-6 text-center">
        <h1 className="text-lg font-semibold mb-2" style={{ color: "#b3261e" }}>Missing link</h1>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          This page must be reached via a link from theabhisheksingh.in.
        </p>
      </div>
    );
  }

  let payload;
  try {
    payload = verifyHandoffToken(token);
  } catch (err) {
    const message = err instanceof HandoffError ? err.message : "This link is invalid.";
    return (
      <div className="max-w-md mx-auto mt-24 p-6 text-center">
        <h1 className="text-lg font-semibold mb-2" style={{ color: "#b3261e" }}>Link expired or invalid</h1>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{message}</p>
      </div>
    );
  }

  // Fixed allowlist — one internal path per purpose, nothing derived from
  // attacker-controlled input.
  const prefill = new URLSearchParams({ email: payload.email, ...(payload.name ? { name: payload.name } : {}) });

  switch (payload.purpose) {
    case "CLIENT_REGISTER":
      redirect(`/register?${prefill.toString()}`);
    case "PROJECT_REQUEST":
      redirect(`/register?intent=project&${prefill.toString()}`);
    case "WEBSITE_AUDIT":
      redirect(`/register?intent=audit&url=${encodeURIComponent(payload.websiteUrl ?? "")}&${prefill.toString()}`);
    default:
      redirect("/register");
  }
}
