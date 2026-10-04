import dns from "dns/promises";
import net from "net";

export class AuditSecurityError extends Error {}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB cap on downloaded HTML
const FETCH_TIMEOUT_MS = 8000;

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    return false;
  }
  return false;
}

/** Resolves the hostname and rejects if ANY resolved address is private/reserved — blocks DNS rebinding too. */
async function assertPublicHostname(hostname: string): Promise<void> {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new AuditSecurityError("This hostname is not allowed for audit");
  }
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new AuditSecurityError("Private/reserved IP addresses cannot be audited");
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new AuditSecurityError("Could not resolve hostname");
  for (const r of records) {
    if (isPrivateOrReservedIp(r.address)) {
      throw new AuditSecurityError("This domain resolves to a private/internal address and cannot be audited");
    }
  }
}

export type AuditFindings = {
  url: string;
  finalUrl: string;
  httpStatus: number;
  responseTimeMs: number;
  https: boolean;
  redirected: boolean;
  securityHeaders: { header: string; present: boolean }[];
  hasViewportMeta: boolean;
  hasTitle: boolean;
  titleLength: number;
  hasMetaDescription: boolean;
  htmlSizeBytes: number;
  score: number;
  recommendations: string[];
};

/**
 * Runs a small set of real, fetch-based checks — no headless browser, no
 * script execution on the target page, hard timeout, response-size cap, and
 * every hostname (including after redirects) is re-validated against
 * private/reserved IP ranges before being fetched. This intentionally does
 * NOT do full Lighthouse-grade performance/accessibility auditing — that
 * needs a headless browser, which is out of scope here for both safety and
 * infra-cost reasons.
 */
export async function runWebsiteAudit(inputUrl: string): Promise<AuditFindings> {
  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new AuditSecurityError("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AuditSecurityError("Only http/https URLs are supported");
  }
  if (url.port && !["", "80", "443"].includes(url.port)) {
    throw new AuditSecurityError("Only default ports (80/443) are allowed");
  }

  await assertPublicHostname(url.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "ABYVORAWebsiteAuditBot/1.0" },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") throw new Error("Website did not respond within 8 seconds");
    throw new Error(`Could not reach the site: ${err?.message ?? "network error"}`);
  }
  clearTimeout(timeout);

  // Re-validate the FINAL url's hostname too — a redirect could otherwise be
  // used to pivot from a public URL to an internal one.
  const finalUrl = new URL(res.url);
  await assertPublicHostname(finalUrl.hostname);

  const responseTimeMs = Date.now() - start;

  const reader = res.body?.getReader();
  let html = "";
  let totalBytes = 0;
  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
      html += decoder.decode(value, { stream: true });
    }
  }

  const headers = res.headers;
  const securityHeaderNames = [
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "content-security-policy",
    "referrer-policy",
  ];
  const securityHeaders = securityHeaderNames.map((h) => ({ header: h, present: headers.has(h) }));

  const hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const hasTitle = !!titleMatch;
  const titleLength = titleMatch ? titleMatch[1].trim().length : 0;
  const hasMetaDescription = /<meta[^>]+name=["']description["']/i.test(html);

  const recommendations: string[] = [];
  if (finalUrl.protocol !== "https:") recommendations.push("Site is not served over HTTPS.");
  for (const h of securityHeaders) {
    if (!h.present) recommendations.push(`Missing security header: ${h.header}`);
  }
  if (!hasViewportMeta) recommendations.push("Missing responsive viewport meta tag.");
  if (!hasTitle || titleLength === 0) recommendations.push("Missing or empty <title> tag.");
  if (titleLength > 60) recommendations.push("Title tag is longer than the recommended 60 characters.");
  if (!hasMetaDescription) recommendations.push("Missing meta description tag.");
  if (responseTimeMs > 3000) recommendations.push(`Initial response took ${responseTimeMs}ms — consider performance optimization.`);

  // Simple, transparent scoring — one point per check, no invented weighting.
  const checks = [
    finalUrl.protocol === "https:",
    ...securityHeaders.map((h) => h.present),
    hasViewportMeta,
    hasTitle && titleLength > 0 && titleLength <= 60,
    hasMetaDescription,
    responseTimeMs <= 3000,
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return {
    url: inputUrl,
    finalUrl: finalUrl.toString(),
    httpStatus: res.status,
    responseTimeMs,
    https: finalUrl.protocol === "https:",
    redirected: res.redirected,
    securityHeaders,
    hasViewportMeta,
    hasTitle,
    titleLength,
    hasMetaDescription,
    htmlSizeBytes: totalBytes,
    score,
    recommendations,
  };
}
