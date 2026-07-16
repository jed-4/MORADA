import DOMPurify from "dompurify";

/**
 * Sanitise note HTML before rendering with dangerouslySetInnerHTML.
 *
 * Note content is authored by colleagues and rendered into the current user's
 * browser, so unsanitised markup is a stored-XSS vector. The server already
 * sanitises on write, but this is defence-in-depth for legacy rows and any path
 * that bypasses the API. USE_PROFILES.html strips scripts, event handlers and
 * javascript: URLs while keeping standard formatting tags.
 */
export function sanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
