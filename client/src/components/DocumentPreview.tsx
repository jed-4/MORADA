import { useState, useEffect, useRef } from "react";
import { FileText, Download, AlertTriangle, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Document, Page } from "react-pdf";
// Positions the selectable text spans over the rendered page. Without this the
// text layer is mis-aligned and shows as ghost text, so it must stay imported
// alongside renderTextLayer.
import "react-pdf/dist/Page/TextLayer.css";
import { ensurePdfWorker } from "@/lib/pdfWorker";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

/** Zoom out / reset / in cluster, shared by the image and PDF viewers. */
function ZoomControls({ zoom, setZoom }: { zoom: number; setZoom: (fn: (z: number) => number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
        disabled={zoom <= MIN_ZOOM}
        className="flex items-center justify-center h-6 w-6 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
        title="Zoom out"
        data-testid="button-zoom-out"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setZoom(() => 1.0)}
        className="text-xs text-muted-foreground tabular-nums hover:text-foreground px-1 min-w-[3rem] text-center"
        title="Reset to fit width"
        data-testid="button-zoom-reset"
      >
        {zoom === 1.0 ? <Maximize2 className="h-3 w-3 mx-auto" /> : `${Math.round(zoom * 100)}%`}
      </button>
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
        disabled={zoom >= MAX_ZOOM}
        className="flex items-center justify-center h-6 w-6 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
        title="Zoom in"
        data-testid="button-zoom-in"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

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
  ensurePdfWorker();
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
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const [zoom, setZoom] = useState<number>(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const pageWidth = Math.floor(containerWidth * zoom);

  // Measure container width for page scaling
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setContainerWidth(Math.floor(width));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdfBlobUrl]);

  // Opening a different image starts at fit-width (the PDF path resets zoom in
  // its own fetch effect below).
  useEffect(() => {
    if (kind === "image") {
      setZoom(1.0);
      setImgError(false);
    }
  }, [src, kind]);

  // Fetch the PDF with auth cookies → blob URL
  useEffect(() => {
    if (kind !== "pdf" || !isSameOrigin(src)) return;

    let objectUrl: string | null = null;
    setFetchLoading(true);
    setFetchError(null);
    setPdfBlobUrl(null);
    setNumPages(0);
    setCurrentPage(1);
    setZoom(1.0);

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
    // Zoomable image viewer. At 1.0 the image fits the container width; above
    // that it overflows and the wrapper scrolls, so a photographed invoice can
    // be read without opening it in another tab.
    return (
      <div
        className={className || "flex flex-col w-full"}
        style={{ height: heightStyle }}
        data-testid="document-preview-image"
      >
        <div className="flex-1 overflow-auto bg-muted/30">
          <img
            src={src}
            alt={displayName}
            className="bg-white"
            style={{ width: `${zoom * 100}%`, maxWidth: "none", objectFit: "contain" }}
            onError={() => setImgError(true)}
            data-testid="document-preview-image-el"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t shrink-0 bg-background">
          <ZoomControls zoom={zoom} setZoom={setZoom} />
        </div>
      </div>
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
              // Text layer on: lets the user select and copy text straight out
              // of a digital invoice (reference numbers, ABNs) instead of
              // retyping it. Scanned/photographed PDFs have no text to select.
              renderTextLayer
            />
          </Document>
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t shrink-0 bg-background">
          <div className="flex items-center gap-1">
            {numPages > 1 && (
              <>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center justify-center h-6 w-6 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground px-1 tabular-nums">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  disabled={currentPage === numPages}
                  className="flex items-center justify-center h-6 w-6 rounded border border-border disabled:opacity-40 hover:bg-muted/50"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          <ZoomControls zoom={zoom} setZoom={setZoom} />
        </div>
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
