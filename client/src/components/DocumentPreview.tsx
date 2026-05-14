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
  const path = src.split("?")[0].split("#")[0];
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(path)) return "image";
  if (/\.pdf$/i.test(path)) return "pdf";
  return "other";
}

/** Returns true for same-origin URLs (relative paths or matching origin). */
function isSameOrigin(url: string): boolean {
  return url.startsWith("/") || url.startsWith(window.location.origin + "/");
}

export function DocumentPreview({ src, mimeType, filename, className, height = 300 }: Props) {
  const kind = detectKind(src, mimeType);
  const displayName = filename || decodeURIComponent(src.split("/").pop() || "document");
  const heightStyle = typeof height === "number" ? `${height}px` : height;
  const [imgError, setImgError] = useState(false);

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
    const sameOrigin = isSameOrigin(src);

    if (sameOrigin) {
      return (
        <div
          className="flex flex-col w-full"
          style={{ height: heightStyle }}
          data-testid="document-preview-pdf"
        >
          <iframe
            src={src}
            title={displayName}
            className="flex-1 w-full border-0"
            style={{ height: "100%" }}
          />
        </div>
      );
    }

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
