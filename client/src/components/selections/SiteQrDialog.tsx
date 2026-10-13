import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Loader2, Printer, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * The project's site view: a public, read-only page of its selections, and the
 * QR code that opens it. Print the code and put it up on site.
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

  const print = () => {
    if (!qrSrc) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const title = (projectName || "Selections").replace(/[<>&]/g, "");
    w.document.write(
      `<html><head><title>${title} selections QR</title></head>` +
      `<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">` +
      `<h1 style="font-size:28px;margin:0 0 4px">${title}</h1>` +
      `<p style="font-size:18px;margin:0 0 24px;color:#555">Scan for the current selections</p>` +
      `<img src="${window.location.origin}${qrSrc}" style="width:420px;height:420px" onload="window.print()" />` +
      `</body></html>`,
    );
    w.document.close();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="site-qr-dialog">
          <DialogHeader>
            <DialogTitle>Site QR code</DialogTitle>
            <DialogDescription>
              Anyone who scans this sees the project's current selections: photos, specs and what's
              been chosen. It never shows prices, internal notes or options hidden from the client.
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
              <Button size="sm" variant="outline" onClick={print} disabled={!qrSrc} data-testid="button-print-qr">
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!qrSrc}>
                <a href={qrSrc ?? "#"} download="selections-qr.png" data-testid="link-download-qr">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download
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
