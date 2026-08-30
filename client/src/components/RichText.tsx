import { sanitizeNoteHtml } from "@/lib/sanitize";

/**
 * Render HTML authored in a RichTextEditor / TipTap field.
 *
 * Two things go wrong when this markup is dropped straight into a div:
 * Tailwind's preflight has stripped list markers and block margins, so bullets
 * and paragraph breaks disappear and everything reads as one long paragraph;
 * and the HTML is user-authored, so it needs sanitising before it reaches
 * dangerouslySetInnerHTML. The .rich-text class in index.css restores the block
 * structure while inheriting font size and colour from the parent, so the same
 * content works in a 12px table cell and in a full-width panel.
 */
export function RichText({
  html,
  className = "",
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = sanitizeNoteHtml(html);
  if (!clean) return null;
  return (
    <div
      className={`rich-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/**
 * Flatten the same HTML to a single line for truncated previews.
 * Block-level tags become spaces so "<p>a</p><p>b</p>" reads "a b", not "ab".
 */
export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote|pre|tr)\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
