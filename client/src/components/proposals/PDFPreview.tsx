import { Document, Page } from 'react-pdf';
import { usePdfWorkerReady } from '@/lib/pdfWorker';
import { usePdfPageCount } from '@/lib/usePdfPageCount';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFPreviewProps {
  /**
   * A newer document is being built.
   *
   * Shown here rather than by the caller so it can never coincide with this
   * component's own "Loading PDF…": there is exactly one wait on screen at a
   * time, and which message it is depends on what this component knows.
   */
  busy?: boolean;
  /**
   * The document to render: a Blob in the builder, where the PDF is generated
   * in-page, or a URL in the client portal, which fetches the stored copy the
   * client was emailed.
   */
  pdfBlob: Blob | string;
}

export function PDFPreview({ pdfBlob, busy }: PDFPreviewProps) {
  // Wait for the pdf.js worker before rendering <Document>; see lib/pdfWorker.
  const workerState = usePdfWorkerReady();
  // The page count belongs to the document that produced it — see the hook.
  const { epoch, numPages, onLoadSuccess: onDocumentLoadSuccess } = usePdfPageCount(pdfBlob);

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
  }

  if (workerState !== "ready") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          {workerState === "error" ? "Could not start the PDF viewer." : "Preparing preview…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* The badge only appears once there are pages to sit over. Before that
          the <Document> below is already saying "Loading PDF…", and saying
          both is how the preview ended up with two spinners for one wait. */}
      {busy && numPages > 0 && (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 shadow-sm"
          data-testid="indicator-pdf-regenerating"
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs text-muted-foreground">Updating…</span>
        </div>
      )}
      {/* PDF Document - All pages scrollable */}
      <div className="flex-1 overflow-auto bg-muted flex flex-col items-center p-4 gap-4">
        <Document
          key={epoch}
          file={pdfBlob}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading PDF...</p>
            </div>
          }
          error={
            <div className="flex items-center justify-center p-8">
              <p className="text-destructive">Failed to load PDF</p>
            </div>
          }
        >
          {Array.from(new Array(numPages), (el, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg mb-4"
            />
          ))}
        </Document>
      </div>
    </div>
  );
}
