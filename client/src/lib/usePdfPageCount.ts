import { useState } from "react";

/**
 * Ties a pdf.js document's page count to the document it came from.
 *
 * When a `<Document>`'s `file` prop changes, react-pdf destroys the old
 * `PDFDocumentProxy`, which nulls its worker transport's `messageHandler`. A
 * `numPages` held in plain state survives that swap, so the previous
 * document's `<Page>` children stay mounted and keep asking a destroyed proxy
 * for pages: `Cannot read properties of null (reading 'sendWithPromise')`.
 *
 * The count is reset during RENDER — React's documented way to adjust state
 * when a prop changes — so there is never a commit in which stale pages exist.
 * Waiting for an effect is not equivalent: the browser can paint, and react-pdf
 * can start fetching, in between. The epoch is a key for the `<Document>`, which
 * makes the swap a clean unmount rather than a transition in place.
 *
 * Latent for years because previews only rebuilt on an explicit Save. It became
 * constant once proposal sections started autosaving, and the same shape exists
 * in every viewer that swaps its source while mounted — hence a hook rather
 * than a third copy of the same eight lines.
 */
export function usePdfPageCount<T>(file: T): {
  /** Use as the `key` on `<Document>`. */
  epoch: number;
  /** Pages in the document currently loaded — 0 until it reports. */
  numPages: number;
  /** Pass straight to `<Document onLoadSuccess>`. */
  onLoadSuccess: (info: { numPages: number }) => void;
} {
  const [numPages, setNumPages] = useState(0);
  const [rendered, setRendered] = useState<T>(file);
  const [epoch, setEpoch] = useState(0);

  if (rendered !== file) {
    setRendered(file);
    setEpoch((n) => n + 1);
    setNumPages(0);
  }

  return {
    epoch,
    numPages,
    onLoadSuccess: ({ numPages: n }) => setNumPages(n),
  };
}
