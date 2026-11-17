import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Loader2, Printer, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

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

  // Name, address and company for the print sheet (the logo route is public).
  const { data: project } = useQuery<Project>({ queryKey: [`/api/projects/${projectId}`], enabled: open });

  const print = () => {
    if (!qrSrc || !data) return;
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) {
      toast({ title: "Allow pop-ups to print the sign", variant: "destructive" });
      return;
    }
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const name = esc(project?.name || projectName || "This project");
    const address = project?.location ? esc(project.location) : "";
    const origin = window.location.origin;
    const logo = project?.companyId
      ? `<img class="logo" src="${origin}/api/public/company/${encodeURIComponent(project.companyId)}/logo" onerror="this.remove();ready()" onload="ready()" />`
      : "";
    const images = project?.companyId ? 2 : 1;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${name} — site QR</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #2C2825; }
  .sheet { min-height: 265mm; display: flex; flex-direction: column; align-items: center; text-align: center;
           border: 3px solid #2C2825; border-radius: 10mm; padding: 14mm 12mm 10mm; }
  .logo { max-height: 22mm; max-width: 70mm; object-fit: contain; margin-bottom: 8mm; }
  .eyebrow { font-size: 13pt; letter-spacing: .18em; text-transform: uppercase; color: #6B6561; margin: 0 0 3mm; }
  h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 2mm; }
  .addr { font-size: 14pt; color: #6B6561; margin: 0; }
  .qr { width: 125mm; height: 125mm; margin: 10mm 0 6mm; }
  .scan { font-size: 20pt; font-weight: 700; margin: 0 0 2mm; }
  .what { font-size: 13pt; color: #6B6561; margin: 0 0 auto; }
  .how { margin-top: 8mm; font-size: 10.5pt; color: #6B6561; }
  .url { font-family: ui-monospace, Menlo, monospace; font-size: 8.5pt; color: #6B6561; word-break: break-all; margin-top: 2mm; }
</style></head><body>
<div class="sheet">
  ${logo}
  <p class="eyebrow">On site</p>
  <h1>${name}</h1>
  ${address ? `<p class="addr">${address}</p>` : ""}
  <img class="qr" src="${origin}${qrSrc}" onload="ready()" />
  <p class="scan">Scan for plans &amp; selections</p>
  <p class="what">Always the current version — check here before ordering, building or installing.</p>
  <p class="how">Open your phone's camera and point it at the code. No app or login needed.</p>
  <p class="url">${esc(data.url)}</p>
</div>
<script>
  var left = ${images};
  function ready() { if (--left <= 0) setTimeout(function () { window.focus(); window.print(); }, 150); }
</script>
</body></html>`);
    w.document.close();
  };

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
              <Button size="sm" variant="outline" onClick={print} disabled={!qrSrc} data-testid="button-print-qr">
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print sign
              </Button>
              <Button size="sm" variant="outline" asChild disabled={!qrSrc}>
                <a href={qrSrc ?? "#"} download="site-qr.png" data-testid="link-download-qr">
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
