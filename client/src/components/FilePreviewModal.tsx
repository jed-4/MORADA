import { lazy, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";

const DocumentPreview = lazy(() => import("@/components/DocumentPreview"));

export type PreviewFile = {
  url: string;
  filename?: string;
  mimeType?: string;
};

type Props = {
  file: PreviewFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FilePreviewModal({ file, open, onOpenChange }: Props) {
  const displayName =
    file?.filename ||
    (file
      ? decodeURIComponent(file.url.split("/").pop()?.split("?")[0] || "Document")
      : "Document");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[92vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden"
        aria-describedby={undefined}
        data-testid="dialog-file-preview"
      >
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 px-4 py-2.5 border-b pr-12">
          <DialogTitle className="text-sm font-medium truncate text-left">
            {displayName}
          </DialogTitle>
          {file && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.open(file.url, "_blank", "noopener,noreferrer")}
              title="Open in new tab"
              aria-label="Open in new tab"
              data-testid="button-preview-open-tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-muted/20">
          {file && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <DocumentPreview
                src={file.url}
                mimeType={file.mimeType}
                filename={displayName}
                height="100%"
              />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FilePreviewModal;
