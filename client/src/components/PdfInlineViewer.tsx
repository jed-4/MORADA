import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfInlineViewerProps {
  url: string;
}

export default function PdfInlineViewer({ url }: PdfInlineViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);

  return (
    <div
      className="w-full max-h-[60vh] overflow-auto bg-muted/30 p-2 flex flex-col items-center gap-3"
      data-testid="pdf-inline-viewer"
    >
      <Document
        file={{ url, withCredentials: true }}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={
          <div className="p-8 text-sm text-muted-foreground">Loading PDF…</div>
        }
        error={
          <div className="p-8 text-sm text-destructive">Failed to load PDF</div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            width={680}
            className="shadow-sm"
          />
        ))}
      </Document>
    </div>
  );
}
