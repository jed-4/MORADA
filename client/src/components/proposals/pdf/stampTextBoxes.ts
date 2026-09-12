import { degrees, rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ImportedTextBox, StampFontKey, StampWeight } from './importedTextBoxes';

/**
 * Draws a builder's text boxes onto an imported page.
 *
 * The page itself is untouched — this only adds a content stream on top, so
 * the design underneath keeps its own fonts and artwork exactly as exported.
 *
 * Two conversions live here and nowhere else: the editor's visual frame
 * (fractions of the page, origin top-left) into PDF user space (points,
 * origin bottom-left), and the page's own /Rotate into the angle the text has
 * to be drawn at. Keeping both in one place is why importedTextBoxes.ts can
 * store one honest set of numbers that the editor reads back unchanged.
 */

/* ── Fonts ──────────────────────────────────────────────────────────────────
 *
 * The four standard families cost nothing: every PDF reader already has them,
 * so they are referenced rather than embedded. Inter is the app's own face and
 * has to be embedded, which means fontkit, which is a large dependency — so it
 * and the font files are fetched lazily, the first time a document actually
 * stamps something in Inter. A proposal with no imported pages never pays for
 * any of this.
 */

const INTER_FILES: Record<string, string> = {
  '400': '/fonts/Inter-400.woff',
  '400i': '/fonts/Inter-400i.woff',
  '600': '/fonts/Inter-600.woff',
  '600i': '/fonts/Inter-600i.woff',
  '700': '/fonts/Inter-700.woff',
  '700i': '/fonts/Inter-700i.woff',
};

const STANDARD: Record<Exclude<StampFontKey, 'inter'>, Record<string, StandardFonts>> = {
  helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  },
  times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
  },
  courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
  },
};

export interface FontBook {
  get(font: StampFontKey, weight: StampWeight, italic: boolean): Promise<PDFFont>;
}

/**
 * How the Inter files are read. The browser fetches them from our own origin;
 * the tests read them off disk, which is also what keeps the test honest —
 * it embeds the same bytes the client ships.
 */
export type FontFetcher = (url: string) => Promise<ArrayBuffer | Uint8Array>;

const fetchFromOrigin: FontFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.arrayBuffer();
};

export function createFontBook(doc: PDFDocument, fetchFont: FontFetcher = fetchFromOrigin): FontBook {
  const cache = new Map<string, Promise<PDFFont>>();
  let fontkitReady: Promise<void> | null = null;

  const ensureFontkit = () => {
    if (!fontkitReady) {
      fontkitReady = import('@pdf-lib/fontkit').then((mod) => {
        doc.registerFontkit(mod.default ?? mod);
      });
    }
    return fontkitReady;
  };

  return {
    get(font, weight, italic) {
      const key = `${font}-${weight}-${italic ? 'i' : 'n'}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = (async () => {
          if (font === 'inter') {
            await ensureFontkit();
            const file = INTER_FILES[`${weight}${italic ? 'i' : ''}`] ?? INTER_FILES['400'];
            const bytes = await fetchFont(file);
            // Subset: a cover carries a dozen words, and the whole Latin face
            // would be ~90KB of every proposal PDF for no benefit.
            return doc.embedFont(new Uint8Array(bytes as ArrayBuffer), { subset: true });
          }
          const bold = weight >= 600;
          const variant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
          return doc.embedFont(STANDARD[font][variant]);
        })();
        cache.set(key, pending);
      }
      return pending;
    },
  };
}

/* ── Geometry ───────────────────────────────────────────────────────────── */

/** The page as the reader sees it: /Rotate applied, origin top-left. */
export interface VisualPage {
  width: number;
  height: number;
  /** Visual point (u from left, v from top) to PDF user space. */
  toUserSpace(u: number, v: number): { x: number; y: number };
  /** Angle text must be drawn at to read horizontally, degrees CCW. */
  textAngle: number;
}

export function visualPage(mediaWidth: number, mediaHeight: number, rotation: number): VisualPage {
  const rot = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  return {
    width: swap ? mediaHeight : mediaWidth,
    height: swap ? mediaWidth : mediaHeight,
    textAngle: rot,
    toUserSpace(u, v) {
      switch (rot) {
        case 90:
          return { x: v, y: u };
        case 180:
          return { x: mediaWidth - u, y: v };
        case 270:
          return { x: mediaWidth - v, y: mediaHeight - u };
        default:
          return { x: u, y: mediaHeight - v };
      }
    },
  };
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/**
 * Breaks text to a width, the way the editor's textarea does: explicit
 * newlines are kept, and a word longer than the box is split rather than
 * allowed to run off the edge of someone's cover page.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  // A single word wider than the box is broken on character boundaries, so the
  // overflow reads as a wrap rather than as text running off the page edge.
  return splitOverlongLines(lines, font, size, maxWidth);
}

function splitOverlongLines(lines: string[], font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line === '' || font.widthOfTextAtSize(line, size) <= maxWidth) {
      out.push(line);
      continue;
    }
    let chunk = '';
    for (const char of line) {
      if (chunk && font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
        out.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    if (chunk) out.push(chunk);
  }
  return out;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Where each line's baseline sits, in the visual frame.
 *
 * The half-leading rule is CSS's: a line box is `lineHeight * fontSize` tall
 * and the glyphs are centred in it. Matching it here is what makes the boxes
 * the builder drags land where the editor showed them — the editor is plain
 * CSS, so any other rule would drift, and the drift would grow with the line
 * height they chose.
 */
export function layoutBox(
  box: ImportedTextBox,
  font: PDFFont,
  page: VisualPage,
): Array<{ text: string; u: number; v: number }> {
  const boxWidth = box.width * page.width;
  const lines = wrapText(box.text, font, box.fontSize, boxWidth);
  const lineBox = box.fontSize * box.lineHeight;
  const ascent = font.heightAtSize(box.fontSize, { descender: false });
  const contentHeight = font.heightAtSize(box.fontSize);
  const firstBaseline = (lineBox - contentHeight) / 2 + ascent;

  const left = box.x * page.width;
  const top = box.y * page.height;

  return lines.map((text, i) => {
    const width = font.widthOfTextAtSize(text, box.fontSize);
    const offset =
      box.align === 'center' ? (boxWidth - width) / 2 : box.align === 'right' ? boxWidth - width : 0;
    return { text, u: left + offset, v: top + firstBaseline + i * lineBox };
  });
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

export interface StampResult {
  drawn: number;
  /** Text that could not be encoded in the chosen font, by box id. */
  failures: Array<{ id: string; reason: string }>;
}

export async function stampTextBoxes(
  page: PDFPage,
  boxes: ImportedTextBox[],
  book: FontBook,
): Promise<StampResult> {
  const { width, height } = page.getSize();
  const view = visualPage(width, height, page.getRotation().angle);
  const angle = degrees(view.textAngle);
  const result: StampResult = { drawn: 0, failures: [] };

  for (const box of boxes) {
    if (!box.text.trim()) continue;
    try {
      const font = await book.get(box.font, box.weight, box.italic);
      const color = hexToRgb(box.color);
      for (const line of layoutBox(box, font, view)) {
        if (!line.text) continue;
        const { x, y } = view.toUserSpace(line.u, line.v);
        page.drawText(line.text, { x, y, size: box.fontSize, font, color, rotate: angle });
      }
      result.drawn += 1;
    } catch (err) {
      /* One box that cannot be drawn — a standard font asked to encode a
         character it has no room for — must not cost the builder the page it
         sits on, let alone the proposal. */
      result.failures.push({ id: box.id, reason: err instanceof Error ? err.message : 'could not be drawn' });
    }
  }

  return result;
}
