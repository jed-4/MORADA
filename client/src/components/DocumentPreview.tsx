import { useState, useEffect, useRef } from "react";
import { FileText, Download, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Props = {
  src: string;
  mimeType?: string;
  filename?: string;
  className?: string;
  height?: number | string;
};

function detectKind(src: string, mimeType?: string): "image" | "pdf" | "other" {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
  }
  const path = src.split("?")[0].split("#")[0];
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(path)) return "image";
  if (/\.pdf$/i.test(path)) return "pdf";
  return "other";
}

function isSameOrigin(url: string): boolean {
  return url.startsWith("/") || url.startsWith(window.location.origin + "/");
}

export function DocumentPreview({ src, mimeType, filename, className, height = 300 }: Props) {
  const kind = detectKind(src, mimeType);
  const displayName = filename || decodeURIComponent(src.split("/").pop() || "document");
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  const [imgError, setImgError] = useState(false);

  // Fetch + blob state (keeps auth cookies working)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // react-pdf render state
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageWidth, setPageWidth] = useState<number>(600);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container width for page scaling
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setPageWidth(Math.floor(width) - 32);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdfBlobUrl]);

  // Fetch the PDF with auth cookies → blob URL
  useEffect(() => {
    if (kind !== "pdf" || !isSameOrigin(src)) return;

    let objectUrl: string | null = null;
    setFetchLoading(true);
    setFetchError(null);
    setPdfBlobUrl(null);
    setNumPages(0);
    setCurrentPage(1);

    fetch(src, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((err) => {
        setFetchError(err.message);
      })
      .finally(() => {
        setFetchLoading(false);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, kind]);

  // --- IMAGE ---
  if (kind === "image") {
    if (imgError) {
      return (
        <div
          className={className || "flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"}
          style={{ minHeight: heightStyle }}
          data-testid="document-preview-image-error"
        >
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Image could not be loaded</span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
            <Download className="h-3 w-3" /> Download
          </a>
        </div>
      );
    }
    return (
      <img
        src={src}
        alt={displayName}
        className={className || "w-full object-contain bg-white"}
        style={{ maxHeight: heightStyle }}
        onError={() => setImgError(true)}
        data-testid="document-preview-image"
      />
    );
  }

  // --- PDF ---
  if (kind === "pdf") {
    if (!isSameOrigin(src)) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"
          style={{ minHeight: heightStyle }}
          data-testid="document-preview-pdf-fallback"
        >
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center">PDF preview unavailable</span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
            <Download className="h-3 w-3" /> Open PDF
          </a>
        </div>
      );
    }

    if (fetchLoading) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-2 bg-muted/20"
          style={{ height: heightStyle }}
          data-testid="document-preview-pdf-loading"
        >
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          <span className="text-xs text-muted-foreground">Loading PDF...</span>
        </div>
      );
    }

    if (fetchError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"
          style={{ minHeight: heightStyle }}
          data-testid="document-preview-pdf-error"
        >
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center">
            Could not load PDF: {fetchError}
          </span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
            <Download className="h-3 w-3" /> Open PDF
          </a>
        </div>
      );
    }

    if (!pdfBlobUrl) return null;

    return (
      <div
        className="flex flex-col w-full"
        style={{ height: heightStyle }}
        data-testid="document-preview-pdf"
      >
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto flex flex-col items-center bg-muted/30 p-4"
        >
          <Document
            file={pdfBlobUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={(err) => setFetchError(err.message)}
            loading={
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                <span className="text-xs text-muted-foreground">Rendering...</span>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          </Document>
        </div>

        {numPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 border-t shrink-0 bg-background">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center justify-center h-7 w-7 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {numPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage === numPages}
              className="flex items-center justify-center h-7 w-7 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- OTHER ---
  return (
    <div
      className={className || "flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"}
      style={{ minHeight: heightStyle }}
      data-testid="document-preview-other"
    >
      <FileText className="h-8 w-8 text-muted-foreground" />
      <span className="text-xs text-muted-foreground truncate max-w-full">{displayName}</span>
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
        <Download className="h-3 w-3" /> Download
      </a>
    </div>
  );
}

export default DocumentPreview;
