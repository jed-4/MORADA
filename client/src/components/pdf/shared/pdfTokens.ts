import { tintOnWhite } from "./pdfColor";

/**
 * The design tokens, for documents that render outside the DOM.
 *
 * @react-pdf cannot read CSS custom properties — it has no DOM, no cascade and
 * no stylesheet. So every colour in every PDF has been a hand-copied hex
 * literal, and they drifted exactly as you would expect: the shared chrome is
 * still on Tailwind's cool grey ramp (#111827 / #6b7280 / #e5e7eb) while the
 * app moved to warm ink years ago, which is why the attachment reads blue-grey
 * beside the portal it is supposed to match.
 *
 * This module is the one place those literals live. It mirrors `:root` in
 * client/src/index.css — the hex values below are that file's HSL tokens
 * converted, and the comment on each names the token it came from so a change
 * there can be traced here. It is a mirror, not a second source of truth: if
 * the two ever disagree, index.css wins.
 */

/* ── Ink and surface ─────────────────────────────────────────────────────── */

export const PDF_COLORS = {
  /** --foreground, 26 9% 16%. Body copy, headings, figures. */
  ink: "#2C2825",
  /** --muted-foreground, 27 5% 40%. Labels, secondary copy. */
  inkMuted: "#6B6561",
  /** Lighter still — captions, units, "Inc. GST" style annotations. Not a
   *  token in index.css; it is muted-foreground lifted toward the page. */
  inkFaint: "#A39C94",

  /** --card. Documents print on white, never on the app's cream page colour. */
  surface: "#FFFFFF",
  /** A hair off white, for zebra rows and inset panels. */
  surfaceSubtle: "#FAF9F7",
  /** --secondary-ish wash, for group header rows inside a table. */
  surfaceMuted: "#F2F1EE",

  /** --border, 60 5% 91%. */
  border: "#E9E9E7",
  /** For a rule that needs to read as a division rather than a hairline. */
  borderStrong: "#DCDAD6",

  /** --primary, 270 16% 53%. Only a fallback: documents are branded with the
   *  company's own colour, and this stands in when they have not set one. */
  brandFallback: "#87749A",
} as const;

/** Status and semantic accents — --sage / --coral / --amber / --teal. */
export const PDF_ACCENTS = {
  positive: "#83C9A2",
  positiveWash: "#EAF6EF",
  negative: "#DA998B",
  negativeWash: "#F9EFEC",
  caution: "#D5B772",
  cautionWash: "#F8F3E8",
  info: "#71CAD1",
  infoWash: "#E8F6F8",
} as const;

/* ── Type ────────────────────────────────────────────────────────────────── */

/**
 * Point sizes. A4 is 595pt wide with 40pt margins, so the usable measure is
 * 515pt — these are sized for that, not for a screen.
 *
 * `sectionLabel` is the uppercase tracked muted heading the app uses to open a
 * section ("VARIATION DETAILS", "COST LINES"). It carries letterSpacing because
 * at 8pt uppercase without tracking reads as a smudge.
 */
export const PDF_TYPE = {
  heroTitle: 16,
  heroFigure: 20,
  heroMeta: 9,

  docTitle: 13,
  sectionLabel: 8,
  sectionLabelTracking: 0.6,

  body: 9.5,
  bodySmall: 8.5,
  fieldLabel: 8,
  fieldValue: 10,

  tableHeader: 8,
  tableCell: 8.5,

  totalLabel: 10,
  totalFigure: 14,

  caption: 7,
} as const;

export const PDF_WEIGHT = {
  regular: 400 as const,
  medium: 500 as const,
  semibold: 600 as const,
  bold: 700 as const,
};

/** Unitless multipliers, as @react-pdf expects for lineHeight. */
export const PDF_LEADING = {
  tight: 1.25,
  body: 1.5,
  relaxed: 1.6,
} as const;

/* ── Space and shape ─────────────────────────────────────────────────────── */

/** Page margin. Everything that spans the page uses this, so the hero band and
 *  the table below it share one left edge. */
export const PDF_PAGE_MARGIN = 40;

export const PDF_SPACE = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  section: 18,
} as const;

/**
 * Corner radii, in points.
 *
 * `lg` is the document block — Jed picked 12pt by eye against the live portal,
 * which is rounder than the portal's own 9px panels because a PDF has no outer
 * card to carry that softness for it. `md` is for small square elements like
 * the logo tile, where 12pt on a 46pt box reads as a blob.
 */
export const PDF_RADIUS = {
  sm: 3,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/* ── Brand ───────────────────────────────────────────────────────────────── */

export interface PdfBrandRamp {
  /** The company's colour, as given. */
  base: string;
  /** The far end of the hero gradient — the portal runs 135° from the brand
   *  colour to itself at 70% over white. */
  gradientTo: string;
  /** Readable ink for text sitting ON the brand colour. Plenty of builders
   *  pick a pale brand, and white on pale yellow is unreadable. */
  onBrand: string;
  /** Same, for secondary copy on the band. */
  onBrandMuted: string;
  /** A wash of the brand for panel backgrounds — opaque, because a border or
   *  fill with an alpha channel renders GREEN in @react-pdf (see pdfColor.ts). */
  wash: string;
  /** A rule in the brand colour that does not shout. */
  rule: string;
  /**
   * The brand colour darkened until it is legible as TEXT ON WHITE.
   *
   * `base` is chosen to be a good ground, which says nothing about whether it
   * works as ink: a pale brand prints the document total in near-invisible
   * yellow on a white page. Same idea as deriveChipPaint() in lib/statusChip.ts
   * — keep the hue, move the lightness until the contrast is there.
   */
  onWhite: string;
}

/**
 * Relative luminance, the WCAG formula. Used to decide whether text on the
 * brand colour should be white or the document's ink.
 */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Blend toward white by `amount` (0–1) and return an opaque hex. */
function lighten(hex: string, amount: number): string {
  return tintOnWhite(hex, 1 - amount);
}

/** WCAG contrast ratio against white. */
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Multiply toward black by `amount` (0–1). */
function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = 1 - amount;
  const parts = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c * f).toString(16).padStart(2, "0"),
  );
  return `#${parts.join("")}`;
}

/**
 * Darken until text on white clears 4.5:1, in 8% steps.
 *
 * Steps rather than solving directly because multiplying each channel keeps
 * the hue: a yellow brand stays yellow, just a darker one, instead of sliding
 * toward brown the way a luminance-only correction would.
 */
function inkOnWhite(hex: string): string {
  let out = hex;
  for (let i = 0; i < 12 && contrastOnWhite(out) < 4.5; i++) {
    out = darken(out, 0.08);
  }
  return out;
}

/**
 * Everything a document needs from the company's brand colour, derived once.
 *
 * Deriving rather than storing means a builder changing their colour in
 * Settings restyles every document, and no document can be left holding a
 * hard-coded accent — which is how the variation PDF ended up showing its
 * money in the *bills* amber on a page branded green.
 */
export function brandRamp(brandColor?: string | null): PdfBrandRamp {
  const base = (brandColor || PDF_COLORS.brandFallback).trim();
  const isLight = luminance(base) > 0.5;
  return {
    base,
    gradientTo: lighten(base, 0.3),
    onBrand: isLight ? PDF_COLORS.ink : "#FFFFFF",
    onBrandMuted: isLight ? PDF_COLORS.inkMuted : "rgba(255,255,255,0.78)",
    wash: tintOnWhite(base, 0.08),
    rule: tintOnWhite(base, 0.25),
    onWhite: inkOnWhite(base),
  };
}

/**
 * Initials for the logo tile when a company has not uploaded a logo.
 *
 * The shared header used to draw the tile and then put nothing in it, so a
 * builder with no logo got an empty grey rectangle in the corner of every
 * document they sent a client. Two letters is never worse than that.
 */
export function companyInitials(name?: string | null): string {
  // Deliberately not \p{L} — unicode property escapes need an es6+ target and
  // this project compiles below that. Stripping the punctuation we actually
  // see in company names ("Smith & Sons Pty. Ltd.") is enough.
  const words = (name || "")
    .replace(/[.,/#!$%^*;:{}=\-_`~()'"]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "and" && w !== "&");
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
