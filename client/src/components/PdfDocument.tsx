import { forwardRef, type ElementRef } from "react";
import { Document } from "react-pdf";
import { usePdfWorkerReady } from "@/lib/pdfWorker";

type DocumentProps = React.ComponentPropsWithoutRef<typeof Document>;
type DocumentRef = ElementRef<typeof Document>;

function render(node: DocumentProps["loading"]) {
  return typeof node === "function" ? node() : node ?? null;
}

/**
 * react-pdf's <Document> with the worker-registration race closed.
 *
 * Registering the pdf.js worker needs two dynamic imports, so it cannot finish
 * during the render that first mounts a document. Rendering <Document> before
 * it lands lets pdf.js fall back to its "fake worker", which dies trying to
 * resolve the bare specifier 'pdf.worker.mjs' — see lib/pdfWorker.ts.
 *
 * This holds the document back until the worker is registered, reusing the
 * `loading` and `error` the call site already supplies so the wait looks like
 * any other part of loading the file.
 */
export const PdfDocument = forwardRef<DocumentRef, DocumentProps>(function PdfDocument(props, ref) {
  const workerState = usePdfWorkerReady();
  if (workerState === "loading") return <>{render(props.loading)}</>;
  if (workerState === "error") return <>{render(props.error)}</>;
  return <Document ref={ref} {...props} />;
});
