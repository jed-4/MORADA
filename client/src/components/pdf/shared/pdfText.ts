/**
 * Turning stored rich text into something a PDF cell can print.
 *
 * Several description fields are written by a rich-text editor and stored as
 * HTML — `estimate_items.description` is the one that bit: a line whose
 * description had been opened and left empty held the literal string
 * `<p></p>`, and the estimate table printed those five characters to the
 * client under the item name.
 *
 * A table cell is one line of text, so this flattens rather than rendering
 * blocks: RichTextBlocks already exists for the places that want real
 * paragraphs. What matters here is that markup never reaches the page and
 * that "empty" is recognised as empty.
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
 * Plain text for a single-line context.
 *
 * Block boundaries become spaces rather than vanishing, so "<p>One</p><p>Two</p>"
 * reads "One Two" and not "OneTwo".
 */
export function pdfPlainText(value: string | null | undefined): string {
  if (!value) return '';
  if (value.indexOf('<') === -1 && value.indexOf('&') === -1) return value.trim();
  return value
    .replace(BLOCK_BOUNDARY, ' ')
    .replace(TAG, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, ' ')
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
