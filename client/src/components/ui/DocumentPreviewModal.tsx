import { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Send, Loader2 } from "lucide-react";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: React.ReactElement;
  filename: string;
  onSend?: () => void;
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  document: pdfElement,
  filename,
  onSend,
}: DocumentPreviewModalProps) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCurrentPage(1);
    let url: string | null = null;

    pdf(pdfElement)
      .toBlob()
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => {
      if (url) URL.revokeObjectURL(url);
      setBlobUrl(null);
    };
  }, [open]);

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
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
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
