import { degrees, rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ImportedTextBox, StampFontKey, StampWeight } from './importedTextBoxes';
import { parseStampHtml, runWeight, stampLineHeight, type StampRun } from './stampRichText';

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
 * A run, measured and placed.
 *
 * Each carries its own font because a line can mix them: "Prepared for :" in
 * 9pt regular and the client's name in 18pt bold belong to one block of
 * information, and splitting them across boxes means re-aligning two things by
 * eye every time the wording changes.
 */
export interface PlacedRun {
  text: string;
  /** Left edge, in the visual frame. */
  u: number;
  /** Baseline, in the visual frame. */
  v: number;
  font: PDFFont;
  size: number;
  underline?: boolean;
  /** Advance width, so the caller can draw an underline without re-measuring. */
  width: number;
}

/**
 * Lays a box out, run by run.
 *
 * Wrapping happens ACROSS runs, not within them: a line that starts in 9pt and
 * continues in 18pt has to break where the combined width runs out, so the
 * measurement is per-word against that word's own font rather than per-line
 * against one.
 *
 * The baseline is the line's tallest ascent, not the box's. Mixed sizes on one
 * line otherwise sit on different baselines and the big text appears to float.
 *
 * The half-leading rule is CSS's: a line box is `lineHeight * size` tall and
 * the glyphs are centred in it. Matching it is what makes the boxes the builder
 * drags land where the editor showed them — the editor is CSS, so any other
 * rule would drift, and the drift would grow with the line height they chose.
 */
export async function layoutRichBox(
  box: ImportedTextBox,
  page: VisualPage,
  book: FontBook,
  resolveText: (raw: string) => string,
): Promise<PlacedRun[]> {
  const boxWidth = box.width * page.width;
  const left = box.x * page.width;
  const top = box.y * page.height;

  const source = box.html && box.html.trim() ? box.html : box.text;
  const lines = parseStampHtml(source);

  /* Fonts are resolved up front: layout needs metrics before it can decide
     where anything goes, and awaiting inside the measuring loop would serialise
     a font load per word. */
  const fontFor = new Map<string, PDFFont>();
  for (const line of lines) {
    for (const run of line) {
      const key = `${run.font ?? box.font}-${runWeight(run, box.weight)}-${run.italic ?? box.italic}`;
      if (!fontFor.has(key)) {
        fontFor.set(key, await book.get(run.font ?? box.font, runWeight(run, box.weight), run.italic ?? box.italic));
      }
    }
  }
  const metricsOf = (run: StampRun) => ({
    font: fontFor.get(`${run.font ?? box.font}-${runWeight(run, box.weight)}-${run.italic ?? box.italic}`)!,
    size: run.size ?? box.fontSize,
  });

  interface Piece { text: string; run: StampRun; font: PDFFont; size: number; width: number }

  const placed: PlacedRun[] = [];
  let v = top;

  for (const line of lines) {
    // An authored blank line still takes its height.
    if (line.length === 0) {
      v += stampLineHeight(line, box.fontSize, box.lineHeight);
      continue;
    }

    // Split every run into words, keeping each word with its own metrics.
    const pieces: Piece[] = [];
    for (const run of line) {
      const { font, size } = metricsOf(run);
      const text = resolveText(run.text);
      // Split on spaces but KEEP them: a space between two runs is real, and
      // dropping it joins "Prepared for :" to the name that follows.
      for (const word of text.split(/(\s+)/)) {
        if (!word) continue;
        pieces.push({ text: word, run, font, size, width: font.widthOfTextAtSize(word, size) });
      }
    }

    // Wrap into visual rows.
    const rows: Piece[][] = [];
    let row: Piece[] = [];
    let used = 0;
    for (const piece of pieces) {
      const isSpace = /^\s+$/.test(piece.text);
      if (!isSpace && used + piece.width > boxWidth && row.length > 0) {
        // Trailing spaces do not belong at the end of a wrapped row.
        while (row.length > 0 && /^\s+$/.test(row[row.length - 1].text)) row.pop();
        rows.push(row);
        row = [];
        used = 0;
      }
      if (isSpace && row.length === 0) continue;
      row.push(piece);
      used += piece.width;
    }
    if (row.length > 0) rows.push(row);

    for (const r of rows) {
      const tallest = r.reduce((best, p) =>
        p.font.heightAtSize(p.size, { descender: false }) > best.font.heightAtSize(best.size, { descender: false }) ? p : best);
      const ascent = tallest.font.heightAtSize(tallest.size, { descender: false });
      const contentHeight = tallest.font.heightAtSize(tallest.size);
      const lineBox = stampLineHeight(r.map((p) => p.run), box.fontSize, box.lineHeight);
      const baseline = v + (lineBox - contentHeight) / 2 + ascent;

      const rowWidth = r.reduce((sum, p) => sum + p.width, 0);
      let u = left + (box.align === 'center' ? (boxWidth - rowWidth) / 2
        : box.align === 'right' ? boxWidth - rowWidth : 0);

      /* Adjacent words in the same style become ONE drawn run.
         Wrapping has to measure word by word, but drawing that way would emit
         a text operator per word: a fatter content stream, and a reader that
         selects and copies the line as disconnected fragments. Only a genuine
         style change should start a new run. */
      for (const piece of r) {
        const last = placed[placed.length - 1];
        const continues =
          last !== undefined &&
          last.v === baseline &&
          last.font === piece.font &&
          last.size === piece.size &&
          !!last.underline === !!piece.run.underline &&
          Math.abs(last.u + last.width - u) < 0.01;

        if (continues) {
          last.text += piece.text;
          last.width += piece.width;
        } else if (piece.text.trim()) {
          placed.push({
            text: piece.text, u, v: baseline, font: piece.font,
            size: piece.size, underline: piece.run.underline, width: piece.width,
          });
        }
        u += piece.width;
      }
      // A row that ended on a space should not carry it into the underline.
      const tail = placed[placed.length - 1];
      if (tail && tail.v === baseline) {
        const trimmed = tail.text.replace(/\s+$/, '');
        if (trimmed !== tail.text) {
          tail.width -= tail.font.widthOfTextAtSize(tail.text.slice(trimmed.length), tail.size);
          tail.text = trimmed;
        }
      }
      v += lineBox;
    }
  }

  return placed;
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
  resolveText: (raw: string) => string = (t) => t,
): Promise<StampResult> {
  const { width, height } = page.getSize();
  const view = visualPage(width, height, page.getRotation().angle);
  const angle = degrees(view.textAngle);
  const result: StampResult = { drawn: 0, failures: [] };

  for (const box of boxes) {
    try {
      const placed = await layoutRichBox(box, view, book, resolveText);
      if (placed.length === 0) continue;
      const color = hexToRgb(box.color);
      for (const run of placed) {
        const { x, y } = view.toUserSpace(run.u, run.v);
        page.drawText(run.text, { x, y, size: run.size, font: run.font, color, rotate: angle });
        if (run.underline) {
          /* pdf-lib has no underline, so it is drawn. One tenth of the size,
             a tenth below the baseline — the proportions a typeface would use,
             so it tracks a mixed-size line instead of sitting at one depth. */
          const start = view.toUserSpace(run.u, run.v + run.size * 0.1);
          const end = view.toUserSpace(run.u + run.width, run.v + run.size * 0.1);
          page.drawLine({
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
            thickness: Math.max(0.4, run.size * 0.06),
            color,
          });
        }
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
