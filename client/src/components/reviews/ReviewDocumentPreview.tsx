import { useEffect, useState } from "react";
import { FileText, ImageOff, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The documents, shown rather than listed.
 *
 * A review IS its drawings. Rendering them as a row of filenames made the page
 * all text with nothing to look at and no visual anchor — the reader had to
 * open a file in a new tab to learn anything. So the current revision's first
 * previewable document becomes a hero, and the rest become tiles that swap into
 * it.
 *
 * No new dependency: browsers render PDFs natively in an iframe and images in
 * an img. react-pdf is in the tree, but wiring its worker to draw a canvas
 * thumbnail buys a nicer still at the cost of a moving part that fails
 * silently. An iframe also gives the client something they can actually scroll,
 * which for a set of plans is the point.
 *
 * Everything degrades: a file that will not load falls back to a glyph card
 * with a working "open" link, so a broken preview never hides the document.
 */

export interface PreviewableDocument {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  /** Whatever URL this viewer can actually fetch — object path or token route. */
  url: string;
}

const isImage = (d: PreviewableDocument) =>
  (d.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(d.fileName);

const isPdf = (d: PreviewableDocument) =>
  (d.mimeType ?? "") === "application/pdf" || /\.pdf$/i.test(d.fileName);

export const isPreviewable = (d: PreviewableDocument) => isImage(d) || isPdf(d);

export const formatBytes = (n: number | null) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/** The large preview. Falls back to a glyph card when it cannot render. */
function Hero({ doc }: { doc: PreviewableDocument }) {
  const [failed, setFailed] = useState(false);

  // A new document gets a fresh chance to load; without this, one failure
  // would poison every subsequent selection.
  useEffect(() => setFailed(false), [doc.id]);

  if (!failed && isImage(doc)) {
    return (
      <img
        src={doc.url}
        alt={doc.fileName}
        onError={() => setFailed(true)}
        className="w-full max-h-[420px] object-contain bg-muted/30"
        data-testid="review-hero-image"
      />
    );
  }

  if (!failed && isPdf(doc)) {
    return (
      <iframe
        // FitH so a plan lands at readable width rather than page-fit.
        src={`${doc.url}#toolbar=0&navpanes=0&view=FitH`}
        title={doc.fileName}
        onError={() => setFailed(true)}
        className="w-full h-[420px] bg-muted/30"
        data-testid="review-hero-pdf"
      />
    );
  }

  return (
    <div
      className="w-full h-[220px] bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground"
      data-testid="review-hero-fallback"
    >
      {isImage(doc) || isPdf(doc) ? <ImageOff className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
      <p className="text-xs">
        {isImage(doc) || isPdf(doc) ? "Preview unavailable" : "No preview for this file type"}
      </p>
      <a
        href={doc.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        <ExternalLink className="h-3 w-3" />
        Open {doc.fileName}
      </a>
    </div>
  );
}

export function ReviewDocumentPreview({ documents }: { documents: PreviewableDocument[] }) {
  // Lead with something that can actually be shown, so the hero is not a
  // fallback card while a perfectly good drawing sits in the strip below.
  const [activeId, setActiveId] = useState<string | null>(null);
  const lead = documents.find(isPreviewable) ?? documents[0];
  const active = documents.find((d) => d.id === activeId) ?? lead;

  if (documents.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="review-document-preview">
      <div className="rounded-lg border overflow-hidden">
        <Hero doc={active} />
        <div className="flex items-center gap-2 px-3 py-2 border-t bg-card">
          <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm truncate flex-1">{active.fileName}</span>
          <span className="text-xs text-muted-foreground">{formatBytes(active.fileSize)}</span>
          <a
            href={active.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 flex-shrink-0"
            data-testid="link-open-document"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        </div>
      </div>

      {/* The strip only earns its space once there is a choice to make. */}
      {documents.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {documents.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={cn(
                "flex-shrink-0 w-32 rounded-md border px-2 py-1.5 text-left hover-elevate active-elevate-2",
                d.id === active.id && "border-primary bg-primary/5",
              )}
              title={d.fileName}
              data-testid={`review-doc-tile-${d.id}`}
            >
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs truncate">{d.fileName}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{formatBytes(d.fileSize)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
