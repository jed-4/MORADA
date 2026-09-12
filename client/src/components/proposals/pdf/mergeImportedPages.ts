import { PDFDocument } from "pdf-lib";
import type { ProposalSection } from "@shared/schema";

/**
 * Splices imported PDF pages into the generated proposal.
 *
 * Two renderers, one document. @react-pdf builds the pages we lay out; a page
 * a builder designed in Canva arrives as a finished PDF and cannot be
 * re-flowed, re-paginated or re-priced — so it is never re-rendered, only
 * carried through.
 *
 * The join is by PLACEHOLDER PAGE. For each imported section, ProposalDocument
 * renders one bare 10x10pt page per imported page. That does two jobs at once:
 *
 *  - it reserves the position, so the import lands exactly where its section
 *    sits in the order, not merely at the front or the back;
 *  - it makes @react-pdf count those pages, so "Page 3 of 12" in the footer is
 *    right. Splicing pages in afterwards could not fix a total that had
 *    already been printed on every page.
 *
 * Placeholders are found by size rather than by reading page content: a real
 * page is A4 or Letter, so anything under 20pt wide is unambiguous, and it
 * needs no text extraction pass over the document we just made.
 */

/** A page narrower than this is a reserved slot, never real content. */
const PLACEHOLDER_MAX_WIDTH = 20;

export interface ImportedPdfContent {
  objectPath?: string;
  fileName?: string;
  pageCount?: number;
}

export function importedPdfContent(section: ProposalSection): ImportedPdfContent | null {
  if (section.sectionType !== "imported_pdf") return null;
  const c = (section.content as Record<string, unknown> | null) ?? {};
  const objectPath = typeof c.objectPath === "string" ? c.objectPath : undefined;
  if (!objectPath) return null;
  return {
    objectPath,
    fileName: typeof c.fileName === "string" ? c.fileName : undefined,
    pageCount: Math.max(1, Number(c.pageCount) || 1),
  };
}

/** Imported sections in document order — the order placeholders appear in. */
export function importedSectionsInOrder(sections: ProposalSection[]): ImportedPdfContent[] {
  return [...sections]
    .filter((s) => s.isEnabled !== false)
    .sort((a, b) => a.order - b.order)
    .map(importedPdfContent)
    .filter((c): c is ImportedPdfContent => c !== null);
}

async function fetchPdfBytes(objectPath: string): Promise<ArrayBuffer> {
  const res = await fetch(objectPath, { credentials: "include" });
  if (!res.ok) throw new Error(`Could not load the imported PDF (${res.status})`);
  return res.arrayBuffer();
}

/**
 * Returns the merged document, or the original bytes unchanged when there is
 * nothing to merge.
 *
 * A failed import must not cost the builder the rest of their document, so a
 * fetch or parse failure leaves that slot as the placeholder removed and the
 * remaining pages intact, and reports which file failed.
 */
export async function mergeImportedPages(
  baseBytes: ArrayBuffer,
  imports: ImportedPdfContent[],
): Promise<{ bytes: Uint8Array; failures: string[] }> {
  // No early return for an empty `imports`: a document can still carry a slot
  // nobody claimed, and returning the bytes untouched would print it. The
  // caller skips this function entirely when there is nothing imported, so the
  // common path never pays for the load and save.

  const doc = await PDFDocument.load(baseBytes);
  const failures: string[] = [];

  /*
   * Everything is READ before anything is written.
   *
   * pdf-lib's getPages()/getPage() serve a cache that removePage does not
   * refresh: after removing two pages from a four-page document, getPageCount()
   * correctly says 2 while getPage(1) still hands back the page that used to be
   * there. Checking a page's size after a mutation therefore reads the old
   * document, and acting on that removes the wrong page. So the plan is built
   * from one clean scan, and the mutations run afterwards in one descending
   * pass — descending because every index below the one being spliced stays
   * valid.
   */
  const slots: number[] = [];
  doc.getPages().forEach((page, i) => {
    if (page.getWidth() <= PLACEHOLDER_MAX_WIDTH) slots.push(i);
  });

  interface Splice {
    start: number;
    count: number;
    pages: Awaited<ReturnType<typeof doc.copyPages>>;
  }
  const splices: Splice[] = [];
  let cursor = 0;

  for (const item of imports) {
    const count = Math.min(item.pageCount ?? 1, slots.length - cursor);
    if (count <= 0) break;
    const startIndex = slots[cursor];

    let pages: Splice["pages"] = [];
    try {
      const bytes = await fetchPdfBytes(item.objectPath!);
      const src = await PDFDocument.load(bytes);
      pages = await doc.copyPages(src, src.getPageIndices().slice(0, count));
    } catch {
      // The slot still gets removed: a reserved page the import never filled
      // would reach the client as a blank sheet.
      failures.push(item.fileName || item.objectPath || "imported PDF");
    }

    splices.push({ start: startIndex, count, pages });
    cursor += count;
  }

  // Any slot no import claimed — a section edited mid-render, or a file
  // removed — is dropped rather than printed.
  for (const orphan of slots.slice(cursor)) {
    splices.push({ start: orphan, count: 1, pages: [] });
  }

  for (const splice of splices.sort((a, b) => b.start - a.start)) {
    for (let i = splice.count - 1; i >= 0; i--) doc.removePage(splice.start + i);
    splice.pages.forEach((page, i) => doc.insertPage(splice.start + i, page));
  }

  return { bytes: await doc.save(), failures };
}
