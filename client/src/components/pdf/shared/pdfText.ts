/**
 * Turning stored rich text into something a PDF cell can print.
 *
 * Several description fields are written by a rich-text editor and stored as
 * HTML — `estimate_items.description` is the one that bit: a line whose
 * description had been opened and left empty held the literal string
 * `<p></p>`, and the estimate table printed those five characters to the
 * client under the item name.
 *
 * Line breaks are KEPT. Every caller prints the result as its own text block
 * — a description under an item name, a group's note, an allowance's
 * description — and @react-pdf honours "\n". This used to flatten everything
 * to one line, but only on the markup path: a plain-text description kept its
 * breaks, and the same description with a single "&" in it ("internally &
 * externally") went through the HTML branch and came out as one run-on
 * paragraph. A builder's line-per-task scope note turned into a wall of text
 * depending on whether they had used an ampersand.
 *
 * Regex, not the DOM: this runs under Node in the PDF render tests, where
 * there is no `document`.
 */

const BLOCK_BOUNDARY = /<\/(p|div|li|h[1-6]|tr)\s*>|<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/**
 * Plain text for a PDF text block: no markup, no entities, line breaks kept.
 *
 * Block boundaries become line breaks, so "<p>One</p><p>Two</p>" prints on two
 * lines rather than as "OneTwo" or "One Two". Spaces within a line collapse;
 * blank lines collapse to at most one, since an editor's empty paragraphs are
 * spacing the author did not really ask for.
 */
export function pdfPlainText(value: string | null | undefined): string {
  if (!value) return '';
  const text =
    value.indexOf('<') === -1 && value.indexOf('&') === -1
      ? value
      : value
          .replace(BLOCK_BOUNDARY, '\n')
          .replace(TAG, '')
          .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * True when there is nothing worth printing.
 *
 * `<p></p>`, `<p><br></p>` and `&nbsp;` are all what an editor leaves behind
 * when someone opens a field and types nothing. Testing the raw string for
 * truthiness treats every one of them as content.
 */
export function pdfHasText(value: string | null | undefined): boolean {
  return pdfPlainText(value).length > 0;
}
