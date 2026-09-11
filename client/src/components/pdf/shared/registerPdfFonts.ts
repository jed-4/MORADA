import { Font } from "@react-pdf/renderer";

/**
 * Give the PDFs the same typeface as the rest of the app.
 *
 * Every document in Morada rendered in **Helvetica** — @react-pdf's built-in
 * PDF core font — because nothing ever called `Font.register`. Next to the
 * client portal, which is Inter, the attachment read as a different and older
 * product. That single difference did more damage than the colours.
 *
 * ── Why these files, served from our own origin ─────────────────────────────
 * The fonts are vendored into client/public/fonts rather than fetched from a
 * CDN at render time. @react-pdf resolves `src` by fetching it, so a CDN that
 * is slow, blocked or moved would not degrade the typeface — it would throw,
 * and **sending a variation would fail**. Same-origin means the font is as
 * available as the page asking for it.
 *
 * ── Why .woff and not .ttf ──────────────────────────────────────────────────
 * fontkit (which @react-pdf bundles) reads TTF, OTF and WOFF, but not WOFF2.
 * Inter is no longer published as static per-weight TTF — the current releases
 * are variable fonts, and fontkit renders only a variable font's default
 * instance, so every weight would come out identical. The @fontsource static
 * per-weight WOFF builds are the format that actually gives us four weights.
 * Latin subset: 4 files, ~89KB total.
 *
 * ── Registering twice ───────────────────────────────────────────────────────
 * `Font.register` is global and idempotent per family in practice, but this is
 * imported by several document components, so the guard keeps it to one call.
 */

const INTER = "Inter";

/**
 * Where the font files live.
 *
 * In the browser these are same-origin absolute paths and the default is
 * right. Under Node — a render test, or a future server-side render — fontkit
 * resolves "/fonts/Inter-400.woff" against the FILESYSTEM root and throws
 * ENOENT, so the base has to be a real directory instead. Set
 * PDF_FONT_DIR for that case.
 */
const FONT_BASE =
  (typeof process !== "undefined" && process.env?.PDF_FONT_DIR) || "/fonts";

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: INTER,
    fonts: [
      { src: `${FONT_BASE}/Inter-400.woff`, fontWeight: 400 },
      { src: `${FONT_BASE}/Inter-500.woff`, fontWeight: 500 },
      { src: `${FONT_BASE}/Inter-600.woff`, fontWeight: 600 },
      { src: `${FONT_BASE}/Inter-700.woff`, fontWeight: 700 },
    ],
  });

  // @react-pdf hyphenates aggressively by default, which chops supplier names
  // and cost-code titles mid-word in narrow table columns. Documents are read,
  // not justified — no hyphenation reads better here.
  Font.registerHyphenationCallback((word) => [word]);
}

/** The family name to use in styles. Falls back to Helvetica if a face fails
 *  to load, which is @react-pdf's own behaviour — the document still renders. */
export const PDF_FONT_FAMILY = INTER;
