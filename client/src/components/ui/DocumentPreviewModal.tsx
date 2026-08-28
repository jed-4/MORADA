import { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import { Document as PdfDocument, Page as PdfPage } from "react-pdf";
import { ensurePdfWorker } from "@/lib/pdfWorker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Send, Loader2 } from "lucide-react";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: React.ReactElement;
  filename: string;
  onSend?: () => void;
  /** Optional panel down the left of the preview (e.g. column visibility).
   *  Callers that don't pass one get exactly the previous layout. */
  sidebar?: React.ReactNode;
  /** Changes to this value re-render the PDF while the modal stays open.
   *  Without it the preview is generated once on open and a sidebar toggle
   *  appears to do nothing until the modal is closed and reopened. */
  documentKey?: string;
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  document: pdfElement,
  filename,
  onSend,
  sidebar,
  documentKey,
}: DocumentPreviewModalProps) {
  ensurePdfWorker();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Rendering a PDF is expensive, so a re-render is debounced: toggling three
  // checkboxes in quick succession should produce one render, not three.
  // `cancelled` guards against a slow earlier render resolving after a later
  // one and putting a stale document on screen.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCurrentPage(1);
    let url: string | null = null;
    let cancelled = false;

    const timer = setTimeout(() => {
      pdf(pdfElement)
        .toBlob()
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, documentKey === undefined ? 0 : 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
      setBlobUrl(null);
    };
    // pdfElement is a fresh element every render, so it cannot be a dependency
    // — callers signal "the document actually changed" via documentKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentKey]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${sidebar ? "max-w-6xl" : "max-w-4xl"} w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <p className="text-sm text-muted-foreground">
            This is what your client will receive
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={loading || !blobUrl}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
            {onSend && (
              <Button
                size="sm"
                onClick={onSend}
                style={{ backgroundColor: "#a890d4", borderColor: "#a890d4", color: "#fff" }}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send to client
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* PDF canvas area */}
          <div className="flex-1 overflow-y-auto bg-muted/50 flex flex-col items-center py-6 px-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Generating preview…</span>
            </div>
          ) : blobUrl ? (
            <PdfDocument
              file={blobUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              className="flex flex-col items-center gap-4"
            >
              <PdfPage
                pageNumber={currentPage}
                width={720}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </PdfDocument>
          ) : null}
          </div>
          {/* Controls sit to the RIGHT of the document: the page itself is what
              the builder is reading, so it keeps the left edge and a stable
              position when the panel opens. */}
          {sidebar && (
            <aside className="w-64 shrink-0 border-l bg-background flex flex-col min-h-0">
              {sidebar}
            </aside>
          )}
        </div>

        {/* Page navigation */}
        {numPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-3 border-t text-sm text-muted-foreground shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            Page {currentPage} of {numPages}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage === numPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
