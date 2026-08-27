// Pre-blended tints for PDF borders.
//
// @react-pdf/renderer does not handle a transparent BORDER colour. Give it an
// 8-digit hex (#87749A26) or an rgba() and it draws bright green — not the
// tint, not the base colour, green. Background colours accept the same values
// and render correctly, which is why this went unnoticed: the tinted panels
// looked right while the hairlines beside them did not.
//
// Every "style2" document was affected — Variations, Invoices, Purchase
// Orders, Proposals and RFQs all built their rules as `brandColor + "26"`.
//
// The fix is to never hand a border an alpha channel. Blend the tint against
// white here and pass an opaque 6-digit hex, which on a white page is visually
// identical to what the alpha was meant to produce.

const WHITE = 255;

/** #abc -> #aabbcc. Returns null for anything not a hex colour. */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * An opaque hex equivalent to `color` at `alpha` over white.
 *
 * @param color base colour, 6- or 3-digit hex
 * @param alpha either the two-hex-digit suffix these documents already use
 *              ("26", "33", "60") or a 0–1 number
 *
 * Falls back to the untouched input if the colour cannot be parsed, so a bad
 * value degrades to a visible line rather than to green or to nothing.
 */
export function tintOnWhite(color: string, alpha: string | number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const a =
    typeof alpha === "number"
      ? alpha
      : (parseInt(alpha, 16) || 0) / 255;
  const clamped = Math.min(1, Math.max(0, a));
  const mix = (c: number) => Math.round(c * clamped + WHITE * (1 - clamped));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(rgb.r))}${toHex(mix(rgb.g))}${toHex(mix(rgb.b))}`;
}
