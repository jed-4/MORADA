import { useState } from "react";
import { FileText, Download, AlertTriangle } from "lucide-react";

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
  // Strip query string + fragment so signed URLs (with ?token=...) still match
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
  const [pdfError, setPdfError] = useState(false);

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
    if (pdfError) {
      return (
        <div
          className={className || "flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"}
          style={{ minHeight: heightStyle }}
          data-testid="document-preview-pdf-error"
        >
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground text-center">PDF preview unavailable</span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
            <Download className="h-3 w-3" /> Open PDF
          </a>
        </div>
      );
    }
    return (
      <div className="relative" style={{ height: heightStyle }} data-testid="document-preview-pdf">
        <iframe
          src={src}
          title={displayName}
          className={className || "w-full h-full border-0"}
          onError={() => setPdfError(true)}
        />
        <div className="absolute bottom-1 right-1">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-data inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background/80 border text-muted-foreground hover:text-foreground"
          >
            <Download className="h-2.5 w-2.5" /> Open
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={className || "flex flex-col items-center justify-center gap-2 p-6 bg-muted/20 border rounded-md"} style={{ minHeight: heightStyle }} data-testid="document-preview-other">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <span className="text-xs text-muted-foreground truncate max-w-full">{displayName}</span>
      <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 underline">
        <Download className="h-3 w-3" /> Download
      </a>
    </div>
  );
}

export default DocumentPreview;
