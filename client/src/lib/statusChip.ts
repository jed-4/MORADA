/**
 * One place to resolve a status into a chip.
 *
 * Two callers drew status chips independently — `estimateGridRow` for line
 * items and `EstimateGroupCard` for the group above them — and they drifted:
 * the line forced a tone, the group let tone auto-detection run, and the same
 * status key rendered amber on a line and grey on its own group. Both also read
 * `option.color` from Field Settings and neither used it.
 *
 * Everything that needs a status chip resolves it here instead.
 *
 * ── On using the configured colour ──────────────────────────────────────────
 * PR #57 removed `color={option.color}` after it made board, list, header and
 * line-item chips look wrong in four separate incidents. That was a *rendering*
 * failure, not a sourcing one: `StatusBadge`'s colour path paints `${hex}20` as
 * the fill and the raw hex as the label, and a mid-tone picker colour on a 12%
 * tint of itself routinely lands under 3:1.
 *
 * So the colour still comes from Field Settings, but never raw. `deriveChipPaint`
 * builds a fill and a label colour from the hue and checks the contrast, the way
 * the `--status-*` pairs were designed by hand. A colour that cannot be made to
 * work returns null and the caller falls back to a tone.
 */

import type { StatusTone } from "@/components/StatusBadge";

export interface FieldStatusOption {
  key: string;
  name?: string | null;
  color?: string | null;
  isActive?: boolean | null;
}

export interface ChipPaint {
  /** Chip fill. */
  background: string;
  /** Label colour. Contrast against `background` is >= MIN_CONTRAST. */
  foreground: string;
}

export interface ResolvedStatusChip {
  /** The status key, normalised the way the caller stored it. */
  key: string;
  /** What the chip reads. */
  label: string;
  /** Set when Field Settings supplied a usable colour. Takes precedence. */
  paint?: ChipPaint;
  /** Fallback when there is no usable colour. */
  tone?: StatusTone;
}

/** WCAG AA for normal text. Chips are small, so this is a floor, not a target. */
const MIN_CONTRAST = 4.5;

// ── Colour maths ───────────────────────────────────────────────────────────

interface Rgb { r: number; g: number; b: number }
interface Hsl { h: number; s: number; l: number }

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

function channelLuminance(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Build a legible chip pair from one configured colour.
 *
 * The hue is what carries the meaning — "the blue one", "the green one" — so the
 * hue is preserved exactly and only saturation and lightness move. The fill is a
 * pale wash of that hue; the label is the same hue darkened until it clears
 * MIN_CONTRAST against that wash.
 *
 * Returns null for an unparseable colour, or for the rare hue that cannot reach
 * the threshold even at near-black, so the caller can fall back to a tone.
 */
export function deriveChipPaint(hex: string | null | undefined): ChipPaint | null {
  if (!hex) return null;
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const { h, s } = rgbToHsl(rgb);

  // A near-grey configured colour has no hue worth preserving — let it fall
  // through to the neutral tone rather than inventing a tint.
  if (s < 0.08) return null;

  const backgroundRgb = hslToRgb({ h, s: Math.min(s, 0.55), l: 0.94 });

  // Walk the label down in lightness until it clears the threshold. 2% steps
  // keep the result close to the configured colour rather than jumping to black.
  const labelSaturation = Math.max(s, 0.35);
  for (let l = 0.42; l >= 0.12; l -= 0.02) {
    const candidate = hslToRgb({ h, s: labelSaturation, l });
    if (contrastRatio(candidate, backgroundRgb) >= MIN_CONTRAST) {
      return { background: toHex(backgroundRgb), foreground: toHex(candidate) };
    }
  }
  return null;
}

// ── Resolution ─────────────────────────────────────────────────────────────

function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Active options only, in configured order. Empty when nothing is set up. */
export function activeStatusOptions(
  options: FieldStatusOption[] | null | undefined,
): FieldStatusOption[] {
  return (options ?? []).filter((o) => o.isActive !== false);
}

/**
 * Resolve one status into everything a chip needs.
 *
 * `fallbackTone` is for keys that predate Field Settings and still carry meaning
 * — an estimate line's `done` / `incomplete` — so removing a configured option
 * does not silently turn a meaningful status grey.
 */
export function resolveStatusChip(
  status: string | null | undefined,
  options: FieldStatusOption[] | null | undefined,
  fallbackTone?: StatusTone,
): ResolvedStatusChip {
  const active = activeStatusOptions(options);
  const key = status ?? active[0]?.key ?? "";
  const option = active.find((o) => o.key === key);

  // A status removed from Field Settings after the fact still has to render.
  const label = option?.name?.trim() || humanize(key || "—");

  const paint = deriveChipPaint(option?.color);
  if (paint) return { key, label, paint };

  return { key, label, tone: fallbackTone };
}

/**
 * The next status in the configured order — the left-click cycle both the group
 * header and the line items use. Returns null when there is nothing to cycle to.
 */
export function nextStatusKey(
  current: string | null | undefined,
  options: FieldStatusOption[] | null | undefined,
): string | null {
  const active = activeStatusOptions(options);
  if (active.length === 0) return null;
  const i = active.findIndex((o) => o.key === current);
  // An unrecognised current status (e.g. a group still on the legacy
  // `not_started` default) starts the cycle at the first configured option
  // rather than skipping one.
  return active[(i + 1) % active.length]?.key ?? null;
}
