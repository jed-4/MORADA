import { useState } from 'react';
import { Document, Page } from 'react-pdf';
import { usePdfWorkerReady } from '@/lib/pdfWorker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFPreviewProps {
  /**
   * The document to render: a Blob in the builder, where the PDF is generated
   * in-page, or a URL in the client portal, which fetches the stored copy the
   * client was emailed.
   */
  pdfBlob: Blob | string;
}

export function PDFPreview({ pdfBlob }: PDFPreviewProps) {
  // Wait for the pdf.js worker before rendering <Document>; see lib/pdfWorker.
  const workerState = usePdfWorkerReady();
  const [numPages, setNumPages] = useState<number>(0);

  /**
   * numPages belongs to the document that produced it.
   *
   * When `file` changes, react-pdf destroys the old PDFDocumentProxy — which
   * nulls its worker transport's messageHandler — and starts loading the new
   * one. numPages used to survive that, so the previous document's <Page>
   * children stayed mounted and kept asking the destroyed proxy for pages:
   * `Cannot read properties of null (reading 'sendWithPromise')`.
   *
   * It went unnoticed while the preview only rebuilt on an explicit Save. Now
   * that sections autosave, the blob is replaced a beat after you stop typing,
   * so the race runs constantly.
   *
   * Resetting during render (React's documented way to adjust state when a prop
   * changes) means there is never a commit where stale pages exist. The key
   * makes the swap a clean unmount rather than a transition in place.
   */
  const [renderedFile, setRenderedFile] = useState<Blob | string>(pdfBlob);
  const [epoch, setEpoch] = useState(0);
  if (renderedFile !== pdfBlob) {
    setRenderedFile(pdfBlob);
    setEpoch((n) => n + 1);
    setNumPages(0);
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

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
    <div className="flex flex-col h-full">
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
