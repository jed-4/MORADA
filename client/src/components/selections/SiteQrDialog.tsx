import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FileDown, Loader2, Palette, Printer, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SiteSignSettings } from "@shared/siteBoard";
import { SiteSignDesignDialog } from "@/components/siteBoard/SiteSignDesignDialog";

/**
 * The project's site QR: one code per job that opens a public, read-only page
 * of its selections and on-site files (Site board). Print it and put it up.
 */
export function SiteQrDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const linkKey = [`/api/projects/${projectId}/trades-portal-token`];

  const { data, isLoading } = useQuery<{ token: string; url: string }>({ queryKey: linkKey, enabled: open });
  // The token in the query string only busts the browser cache after a regenerate.
  const qrSrc = data ? `/api/projects/${projectId}/trades-qr?t=${data.token.slice(0, 8)}` : null;

  const regenerate = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/trades-portal-token/regenerate`, "POST"),
    onSuccess: (next) => {
      queryClient.setQueryData(linkKey, next);
      toast({ title: "New link created", description: "The old QR code and link no longer work." });
    },
    onError: () => toast({ title: "Couldn't create a new link", variant: "destructive" }),
  });

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  };

  // The sign is a real PDF from the server: the company's own design with the
  // QR stamped in (Site board → Sign design), or Morada's plain layout.
  const { data: sign } = useQuery<SiteSignSettings>({ queryKey: ["/api/company/site-sign"], enabled: open });
  const signUrl = `/api/projects/${projectId}/site-sign.pdf`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="site-qr-dialog">
          <DialogHeader>
            <DialogTitle>Site QR code</DialogTitle>
            <DialogDescription>
              One code for the job. Anyone who scans it sees the project's selections and the files
              you've switched on in Site board. It never shows prices, internal notes or options hidden
              from the client.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3">
            <div className="w-56 h-56 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
              {isLoading || !qrSrc ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <img src={qrSrc} alt="QR code for the site view" className="w-full h-full" data-testid="img-site-qr" />
              )}
            </div>
            {data && (
              <p className="text-[11px] text-muted-foreground break-all text-center px-2" data-testid="text-site-url">{data.url}</p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" asChild disabled={!data}>
                <a href={signUrl} target="_blank" rel="noopener noreferrer" data-testid="button-print-qr">
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print sign
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!data}>
                <a href={`${signUrl}?download=1`} data-testid="link-download-sign">
                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                  Sign PDF
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!qrSrc}>
                <a href={qrSrc ?? "#"} download="site-qr.png" data-testid="link-download-qr">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  QR image
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={copy} disabled={!data} data-testid="button-copy-site-link">
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy link
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!data}>
                <a href={data?.url ?? "#"} target="_blank" rel="noopener noreferrer" data-testid="link-open-site-view">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open
                </a>
              </Button>
            </div>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => setDesignOpen(true)}
              data-testid="button-edit-sign-design"
            >
              <Palette className="w-3 h-3" />
              {sign?.hasTemplate ? `Sign uses your design (${sign.templateName ?? "uploaded"}) · Change` : "Sign uses Morada's plain layout · Use your own design"}
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setConfirmRegenerate(true)}
              disabled={!data || regenerate.isPending}
              data-testid="button-regenerate-site-link"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Replace with a new code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SiteSignDesignDialog open={designOpen} onOpenChange={setDesignOpen} projectId={projectId} />

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Replace the QR code?"
        description="Every printed QR code and shared link for this project will stop working. You'll need to print and put up the new one."
        confirmLabel="Replace code"
        destructive
        onConfirm={() => { setConfirmRegenerate(false); regenerate.mutate(); }}
      />
    </>
  );
}
