import { FileText, Download } from "lucide-react";

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

  if (kind === "image") {
    return (
      <img
        src={src}
        alt={displayName}
        className={className || "w-full object-contain bg-white"}
        style={{ maxHeight: heightStyle }}
        data-testid="document-preview-image"
      />
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={src}
        title={displayName}
        className={className || "w-full border-0"}
        style={{ height: heightStyle }}
        data-testid="document-preview-pdf"
      />
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
