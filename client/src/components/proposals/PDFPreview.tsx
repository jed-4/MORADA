import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Configure PDF.js worker - use local bundled version
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PDFPreviewProps {
  pdfBlob: Blob;
}

export function PDFPreview({ pdfBlob }: PDFPreviewProps) {
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

  return (
    <div className="flex flex-col h-full">
      {/* PDF Document - All pages scrollable */}
      <div className="flex-1 overflow-auto bg-gray-100 flex flex-col items-center p-4 gap-4">
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
