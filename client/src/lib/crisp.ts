// Crisp support chat — single source of truth for whether it's enabled and how
// it's shown.
//
// LAZY BY DESIGN: the Crisp script is not loaded until the user picks "Chat with
// Support" from the user menu. Previously it was configured at startup and then
// immediately hidden with chat.hide(), which has two problems:
//   1. Crisp's error states (e.g. "Invalid website", when the configured ID is
//      not a live Crisp site) IGNORE chat.hide() — so a wrong or stale ID paints
//      an undismissable red bubble on every page, for users and customers alike.
//   2. It loads a third-party script, and starts a Crisp session, for every
//      visitor — including the vast majority who never contact support.
// Deferring configure() to the click makes the bubble impossible to show unbidden
// and keeps the script off the critical path.
//
// The website ID is also validated as a UUID before use. That only checks the
// SHAPE — Crisp can still reject a well-formed UUID that isn't a registered
// website, which is why the lazy load above is the real guard.

import { Crisp } from "crisp-sdk-web";

const CRISP_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rawWebsiteId = (import.meta.env.VITE_CRISP_WEBSITE_ID as string | undefined)?.trim();

/** True only when a well-formed Crisp website ID is configured. */
export const isCrispEnabled = !!rawWebsiteId && CRISP_UUID_RE.test(rawWebsiteId);

if (rawWebsiteId && !isCrispEnabled && import.meta.env.DEV) {
  console.warn(
    "[crisp] VITE_CRISP_WEBSITE_ID is set but is not a valid UUID — support chat disabled. " +
      "Unset it or use the real website ID from the Crisp dashboard.",
  );
}

let configured = false;

type CrispIdentity = {
  id: string | number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
  companyNickname?: string | null;
  planStatus?: string | null;
  roleName?: string | null;
};

// Held until the user actually opens the chat, then applied on configure.
let pendingIdentity: CrispIdentity | null = null;

function applyIdentity(user: CrispIdentity): void {
  if (user.email) Crisp.user.setEmail(user.email);
  const nickname = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";
  if (nickname) Crisp.user.setNickname(nickname);
  Crisp.session.setData({
    user_id: String(user.id),
    company_id: String(user.companyId ?? ""),
    company_name: user.companyNickname ?? "",
    plan_status: user.planStatus ?? "unknown",
    role: user.roleName ?? "",
  });
}

/** Configure Crisp on first use. Returns false when disabled. */
function ensureConfigured(): boolean {
  if (!isCrispEnabled) return false;
  if (configured) return true;
  Crisp.configure(rawWebsiteId!);
  // Re-hide once the user closes the chat, so the bubble stays opt-in for the
  // rest of the session rather than lingering.
  Crisp.chat.onChatClosed(() => Crisp.chat.hide());
  configured = true;
  if (pendingIdentity) {
    applyIdentity(pendingIdentity);
    pendingIdentity = null;
  }
  return true;
}

/** Hide the bubble if Crisp has been loaded. No-op before first use. */
export function hideCrispChat(): void {
  if (!configured) return;
  Crisp.chat.hide();
}

/** Show + open the chat, loading Crisp on first call. False when unavailable. */
export function openCrispChat(): boolean {
  if (!ensureConfigured()) return false;
  Crisp.chat.show();
  Crisp.chat.open();
  return true;
}

/** Clear the Crisp identity on logout. Also drops any un-applied identity. */
export function resetCrispSession(): void {
  pendingIdentity = null;
  if (!configured) return;
  Crisp.session.reset();
}

/**
 * Attach account metadata for support context. Never pass financial figures,
 * client names, or bill amounts here. Stored until the user opens the chat,
 * so signing in does not by itself load Crisp or start a session.
 */
export function identifyCrispUser(user: CrispIdentity): void {
  if (!isCrispEnabled) return;
  if (configured) applyIdentity(user);
  else pendingIdentity = user;
}
