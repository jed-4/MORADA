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
  const [loading, setLoading] = useState<boolean>(true);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    setLoading(false);
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
