/**
 * The app's public base URL — one resolver, used by every OAuth callback.
 *
 * Before this existed each integration derived its own redirect URI, and each
 * one was pinned to Replit in a different way:
 *
 *   - Xero read REPLIT_DOMAINS and fell through to http://localhost:5000,
 *     so off Replit it sent users to localhost and the connect flow died.
 *   - The Gmail bill inbox hardcoded https://buildpro4.replit.app with no
 *     override at all.
 *   - Google Calendar hardcoded the same host, with an env escape hatch.
 *
 * Resolution order is deliberate. The explicit env vars come first so the new
 * host is authoritative, and the Replit variables stay in the chain below them
 * so the current deployment keeps working unchanged until cutover.
 */

/** Strips any trailing slash so callers can concatenate a path safely. */
function trim(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Public base URL, e.g. `https://app.moradaco.com.au`. Never ends in a slash.
 *
 * 1. APP_BASE_URL          — the new host. Set this on Render.
 * 2. APP_URL               — the existing variable, already used for Stripe
 *                            redirects and onboarding email links.
 * 3. REPLIT_DOMAINS        — preferring the stable `.replit.app` entry, which
 *                            is what the Xero redirect used to pick.
 * 4. REPLIT_DEV_DOMAIN     — the Replit workspace preview host.
 * 5. http://localhost:PORT — local development.
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL || process.env.APP_URL;
  if (explicit && explicit.trim()) return trim(explicit.trim());

  const domains = (process.env.REPLIT_DOMAINS || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length) {
    const canonical = domains.find((d) => d.endsWith(".replit.app")) || domains[0];
    return `https://${canonical}`;
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN.trim()}`;
  }

  return `http://localhost:${process.env.PORT || "5000"}`;
}

/**
 * Absolute URL for an app path, e.g.
 * `buildAppUrl("/api/xero/callback")` → `https://app.moradaco.com.au/api/xero/callback`.
 */
export function buildAppUrl(path: string): string {
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
