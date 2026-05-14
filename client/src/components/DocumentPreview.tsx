import { useState, useEffect, useRef } from "react";
import { FileText, Download, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

  // Fetch + blob state (used for PDFs)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // PDF.js render state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Step 1: fetch the PDF bytes and create a blob URL
  useEffect(() => {
    if (kind !== "pdf" || !isSameOrigin(src)) return;

    let objectUrl: string | null = null;
    setPdfLoading(true);
    setPdfError(null);
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
        setPdfError(err.message);
        setPdfLoading(false);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, kind]);

  // Step 2: render a page via PDF.js onto the canvas
  useEffect(() => {
    if (!pdfBlobUrl) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfBlobUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        setNumPages(pdf.numPages);

        const page = await pdf.getPage(currentPage);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const container = canvas.parentElement;
        const containerWidth = container?.clientWidth || 680;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        if (cancelled) return;

        setPdfLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setPdfError(err.message || "Failed to render PDF");
          setPdfLoading(false);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfBlobUrl, currentPage]);

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

    if (pdfLoading) {
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

    if (pdfError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"
          style={{ minHeight: heightStyle }}
          data-testid="document-preview-pdf-error"
        >
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center">
            Could not load PDF: {pdfError}
          </span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
            <Download className="h-3 w-3" /> Open PDF
          </a>
        </div>
      );
    }

    return (
      <div
        className="flex flex-col w-full overflow-y-auto"
        style={{ height: heightStyle }}
        data-testid="document-preview-pdf"
      >
        <div className="flex flex-col items-center bg-muted/30 p-3 flex-1">
          <canvas ref={canvasRef} className="shadow-md max-w-full" />
        </div>

        {numPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 border-t shrink-0">
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
