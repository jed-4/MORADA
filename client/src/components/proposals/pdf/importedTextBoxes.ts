/**
 * Text boxes stamped onto an imported page.
 *
 * An imported PDF (a Canva cover, a designer's brochure page) is never
 * re-rendered — see mergeImportedPages. That is what keeps its fonts and
 * artwork intact, but it also means the design is frozen: the project name and
 * the date are whatever the builder typed in Canva, so every proposal needs
 * the file re-exported.
 *
 * A text box is the escape hatch. The builder leaves a gap in the design and
 * drops a box over it holding `{{project.name}}`, and the same file then
 * serves every proposal.
 *
 * ── Why fractions of the page, from the top-left ────────────────────────────
 * Coordinates are stored as fractions (0-1) of the page's VISUAL size, with
 * the origin top-left — the frame the editor works in, since that is how CSS
 * and how pdf.js's rendered canvas are laid out.
 *
 * Neither of the two obvious alternatives works. Pixels would bind the stored
 * position to whatever width the editor happened to render at, so the same box
 * would land somewhere else on a different screen. PDF points with a
 * bottom-left origin would match pdf-lib, but then every read and write in the
 * editor is a conversion, and a page swapped for a differently-sized re-export
 * silently moves every box.
 *
 * Fractions survive both: a re-export at a different size keeps the design's
 * proportions, so a box pinned a third of the way down stays a third of the
 * way down. stampTextBoxes.ts owns the single conversion into PDF space,
 * including page rotation.
 */

/** Families a stamped box can use. Inter is the app's own face. */
export type StampFontKey = 'inter' | 'helvetica' | 'times' | 'courier';

export type StampWeight = 400 | 600 | 700;

export interface ImportedTextBox {
  id: string;
  /** 0-based page within THIS import, not within the proposal. */
  page: number;
  /** Top-left corner, as a fraction of the visual page. */
  x: number;
  y: number;
  /** Wrapping width, as a fraction of the visual page width. */
  width: number;
  /** May contain {{tokens}}; substituted at render time. */
  text: string;
  /** Points, in the imported page's own coordinate space. */
  fontSize: number;
  font: StampFontKey;
  weight: StampWeight;
  italic: boolean;
  /** #rrggbb. */
  color: string;
  align: 'left' | 'center' | 'right';
  /** Multiplier of the font size. */
  lineHeight: number;
}

export const STAMP_FONT_LABELS: Record<StampFontKey, string> = {
  inter: 'Inter',
  helvetica: 'Helvetica',
  times: 'Times',
  courier: 'Courier',
};

/** CSS stack for the editor preview, so the on-screen box matches the print. */
export const STAMP_FONT_CSS: Record<StampFontKey, string> = {
  inter: "'Inter', system-ui, sans-serif",
  helvetica: 'Helvetica, Arial, sans-serif',
  times: "'Times New Roman', Times, serif",
  courier: "'Courier New', Courier, monospace",
};

export const DEFAULT_TEXT_BOX: Omit<ImportedTextBox, 'id' | 'page'> = {
  x: 0.1,
  y: 0.45,
  width: 0.5,
  text: '{{project.name}}',
  fontSize: 24,
  font: 'inter',
  weight: 600,
  italic: false,
  color: '#111111',
  align: 'left',
  lineHeight: 1.25,
};

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value as T) ? (value as T) : fallback;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Reads boxes back out of jsonb.
 *
 * Everything here arrived as `content` on a section — user-editable JSON that
 * has been through older versions of this feature — so nothing is trusted.
 * A box with a missing or nonsensical field is repaired to a usable default
 * rather than dropped: losing the builder's text because a colour was stored
 * as `null` would be a worse outcome than printing it in near-black.
 */
export function normaliseTextBoxes(raw: unknown): ImportedTextBox[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedTextBox[] = [];
  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    const b = entry as Record<string, unknown>;
    const text = typeof b.text === 'string' ? b.text : '';
    out.push({
      id: typeof b.id === 'string' && b.id ? b.id : `box-${i}`,
      page: Math.max(0, Math.floor(Number(b.page) || 0)),
      // 0.98 rather than 1: a box pinned exactly at the edge has no room to
      // print anything, so it would read as having vanished.
      x: clamp(Number(b.x), 0, 0.98),
      y: clamp(Number(b.y), 0, 0.98),
      width: clamp(Number(b.width), 0.02, 1),
      text,
      fontSize: clamp(Number(b.fontSize), 4, 200) || DEFAULT_TEXT_BOX.fontSize,
      font: oneOf<StampFontKey>(b.font, ['inter', 'helvetica', 'times', 'courier'], 'inter'),
      weight: oneOf<StampWeight>(Number(b.weight) as StampWeight, [400, 600, 700], 400),
      italic: b.italic === true,
      color: typeof b.color === 'string' && HEX.test(b.color) ? b.color : '#111111',
      align: oneOf(b.align, ['left', 'center', 'right'] as const, 'left'),
      lineHeight: clamp(Number(b.lineHeight), 0.8, 3) || DEFAULT_TEXT_BOX.lineHeight,
    });
  });
  return out;
}

export function newTextBox(page: number): ImportedTextBox {
  return {
    ...DEFAULT_TEXT_BOX,
    // crypto.randomUUID is unavailable on insecure origins other than
    // localhost, which includes a phone hitting the dev server over the LAN.
    id: globalThis.crypto?.randomUUID?.() ?? `box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    page,
  };
}
