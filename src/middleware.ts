import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_ONLY_PREFIXES = [
  "/dashboard/agents",
  "/dashboard/commission-rules",
  "/dashboard/audit-logs",
  "/dashboard/settings",
  "/dashboard/support/personnel",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isITPanel = pathname.startsWith("/IT/secretme");
  const isAdminConsole = pathname.startsWith("/admin");

  if (!isDashboard && !isITPanel && !isAdminConsole) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });
  const isLoggedIn = !!token;

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token.status === "DISABLED") {
    return NextResponse.redirect(new URL("/login?error=disabled", req.nextUrl.origin));
  }

  // The Platform Owner control plane is a completely separate boundary from
  // the organization/ABYVORA-internal dashboard: wrong role, or right role
  // but MFA not yet verified *this session*, both bounce out. This is edge
  // defense only — requirePlatformOwner() in lib/authz.ts is the check that
  // actually matters, since every API route calls it independently and a
  // direct API call never passes through this middleware's UI redirects.
  if (isAdminConsole) {
    if (token.role !== "PLATFORM_OWNER") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
    }
    // The MFA page itself is always reachable (it's both the enrollment and
    // the verification screen) — every other /admin/* route requires MFA to
    // be both enabled AND verified this session. No Platform Owner route
    // except this one is reachable without a second factor, full stop.
    if (pathname === "/admin/mfa") return NextResponse.next();
    if (!token.mfaEnabled || !token.mfaVerified) {
      const mfaUrl = new URL("/admin/mfa", req.nextUrl.origin);
      mfaUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(mfaUrl);
    }
    return NextResponse.next();
  }

  // A Platform Owner has no business in the organization-scoped dashboard —
  // the admin console is their whole surface.
  if (token.role === "PLATFORM_OWNER") {
    return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  }

  // The IT Support panel is a completely separate, protected area. Hidden
  // URL is not authentication — this server-side role check is the actual
  // gate; the obscure path just avoids advertising the route.
  if (isITPanel) {
    if (token.role !== "IT_SUPPORT") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  // IT_SUPPORT accounts have no business in the normal dashboard — send them
  // to their own panel instead of showing an empty/broken sidebar.
  if (token.role === "IT_SUPPORT") {
    return NextResponse.redirect(new URL("/IT/secretme", req.nextUrl.origin));
  }

  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/IT/secretme/:path*", "/admin/:path*"],
};
