import type { StampFontKey, StampWeight } from './importedTextBoxes';

/**
 * The rich text inside a merge-field box, as runs.
 *
 * A box used to be one string in one style. That is enough for a heading and
 * nothing else: Jed's cover wants "Prepared for :" small, the client's name
 * large and bold, and the address small again — one block of information, three
 * treatments. Splitting it across three boxes means aligning three things by
 * eye and re-aligning them whenever the wording changes.
 *
 * So a box holds HTML now, and this turns that HTML into lines of runs. It is
 * parsed ONCE and handed to both renderers — the editor's overlay and the PDF
 * stamper — because the whole promise of that overlay is that what you drag is
 * what prints. Two parsers would eventually disagree.
 *
 * ── Why not reuse RichTextBlocks.parseInline ────────────────────────────────
 * That one renders proposal prose and knows bold/italic/underline only. It has
 * no concept of a run carrying its own family or size, which is the entire
 * point here, and widening it would put PDF-stamp concerns into the path that
 * renders every cover letter and terms page in the product.
 */

export interface StampRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Overrides the box's font for this run. */
  font?: StampFontKey;
  /** Overrides the box's size for this run, in points. */
  size?: number;
}

/** One visual line as authored — before wrapping, which happens at layout. */
export type StampLine = StampRun[];

const FONT_BY_CSS: Array<[RegExp, StampFontKey]> = [
  [/inter/i, 'inter'],
  [/helvetica|arial/i, 'helvetica'],
  [/times|serif/i, 'times'],
  [/courier|mono/i, 'courier'],
];

function fontFromCss(value: string | undefined): StampFontKey | undefined {
  if (!value) return undefined;
  for (const [pattern, key] of FONT_BY_CSS) if (pattern.test(value)) return key;
  return undefined;
}

/**
 * Points from a CSS length.
 *
 * The editor writes `pt` because that is what a PDF measures in and a round
 * trip through px would quietly re-round every size. `px` is still read, since
 * TipTap defaults to it and pasted content carries it.
 */
function sizeFromCss(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.match(/([\d.]+)\s*(pt|px)?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return m[2] === 'px' ? n * 0.75 : n;
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

const decode = (s: string) => s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);

interface Style {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  font?: StampFontKey;
  size?: number;
}

/** Tags that end a line. A box is small; these are the only ones that matter. */
const LINE_BREAK = /^(p|div|li|h[1-6]|br)$/i;

/**
 * HTML to lines of runs.
 *
 * A hand-rolled scanner rather than the DOM: this runs under Node in the PDF
 * render tests, where there is no `document`, and the stamper must produce the
 * same bytes on a server as in a browser.
 */
export function parseStampHtml(html: string | null | undefined): StampLine[] {
  if (!html) return [];
  // Plain text, from a box authored before rich text existed.
  if (html.indexOf('<') === -1) {
    return html.split(/\r?\n/).map((line) => (line ? [{ text: decode(line) }] : []));
  }

  const lines: StampLine[] = [];
  let current: StampLine = [];
  const stack: Style[] = [{}];
  const top = () => stack[stack.length - 1];

  const pushText = (raw: string) => {
    const text = decode(raw);
    if (!text) return;
    const s = top();
    current.push({ text, ...s });
  };
  const endLine = () => {
    lines.push(current);
    current = [];
  };

  const TOKEN = /<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html)) !== null) {
    const [full, tag, attrs, text] = m;
    if (text !== undefined) {
      pushText(text);
      continue;
    }
    const closing = full.startsWith('</');
    const name = tag.toLowerCase();

    if (name === 'br') {
      endLine();
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      if (LINE_BREAK.test(name)) endLine();
      continue;
    }
    // Self-closing or void: nothing to push.
    if (full.endsWith('/>')) continue;

    const style: Style = { ...top() };
    if (name === 'strong' || name === 'b') style.bold = true;
    if (name === 'em' || name === 'i') style.italic = true;
    if (name === 'u') style.underline = true;
    const styleAttr = attrs?.match(/style\s*=\s*"([^"]*)"/i)?.[1];
    if (styleAttr) {
      const font = fontFromCss(styleAttr.match(/font-family\s*:\s*([^;]+)/i)?.[1]);
      const size = sizeFromCss(styleAttr.match(/font-size\s*:\s*([^;]+)/i)?.[1]);
      if (font) style.font = font;
      if (size) style.size = size;
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr)) style.bold = true;
      if (/font-style\s*:\s*italic/i.test(styleAttr)) style.italic = true;
    }
    stack.push(style);
  }
  if (current.length > 0) lines.push(current);

  // A trailing empty paragraph is what an editor leaves behind; it is not a
  // blank line the author asked for.
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

/** Everything the runs say, as one string — for empty checks and fallbacks. */
export function stampPlainText(html: string | null | undefined): string {
  return parseStampHtml(html)
    .map((line) => line.map((r) => r.text).join(''))
    .join('\n')
    .trim();
}

/**
 * How tall one line is, in points.
 *
 * THE single rule, because two of them is what this function exists to stop.
 * The stamper sized each line by its largest run while the editor's overlay
 * sized every line by the BOX — so a 12pt run inside a 24pt box was drawn a
 * line apart on the page and two lines apart on screen. You position against
 * one rhythm and get the other, which is precisely the promise the overlay is
 * there to keep.
 *
 * Largest run, not the box: a line with one big word has to clear that word,
 * and a line of small text should not inherit space it does not need.
 */
export function stampLineHeight(
  line: StampLine,
  boxFontSize: number,
  lineHeight: number,
): number {
  const sizes = line.map((run) => run.size ?? boxFontSize);
  const maxSize = sizes.length > 0 ? Math.max(...sizes) : boxFontSize;
  return maxSize * lineHeight;
}

/** The weight a run prints at, given the box's own weight. */
export function runWeight(run: StampRun, boxWeight: StampWeight): StampWeight {
  return run.bold ? 700 : boxWeight;
}
