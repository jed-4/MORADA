import { useState } from "react";
import { FileText, Download, AlertTriangle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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

export function DocumentPreview({ src, mimeType, filename, className, height = 300 }: Props) {
  const kind = detectKind(src, mimeType);
  const displayName = filename || decodeURIComponent(src.split("/").pop() || "document");
  const heightStyle = typeof height === "number" ? `${height}px` : height;
  const [imgError, setImgError] = useState(false);
  const [zoom, setZoom] = useState(1.0);

  const zoomOut = () => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))));
  const zoomIn  = () => setZoom(z => Math.min(4.0, parseFloat((z + 0.25).toFixed(2))));
  const zoomReset = () => setZoom(1.0);

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

  if (kind === "pdf") {
    return (
      <div
        className="flex flex-col w-full"
        style={{ height: heightStyle }}
        data-testid="document-preview-pdf"
      >
        <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0 bg-muted/20">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="p-1 rounded hover-elevate disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= 4.0}
            className="p-1 rounded hover-elevate disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={zoomReset}
            className="p-1 rounded hover-elevate"
            aria-label="Reset zoom"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <div className="flex-1" />
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground px-1"
          >
            <Download className="h-3 w-3" /> Open
          </a>
        </div>
        <div className="flex-1 overflow-auto">
          <object
            data={src}
            type="application/pdf"
            className="block w-full h-full"
            style={{ zoom: zoom } as React.CSSProperties}
          >
            <div className="flex flex-col items-center justify-center gap-2 p-6 h-full">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground text-center">PDF preview unavailable</span>
              <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
                <Download className="h-3 w-3" /> Open PDF
              </a>
            </div>
          </object>
        </div>
      </div>
    );
  }

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
