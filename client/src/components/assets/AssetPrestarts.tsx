import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, Printer, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Asset, AssetPrestart } from "@shared/schema";
import { PRESTART_TEMPLATES, type PrestartAnswer, type PrestartTemplateKey } from "@shared/assets";
import { CHIP_BUTTON, DueChip, SectionHeader, errorText, invalidateAssets, meter } from "./assetsShared";

function itemLabel(templateKey: string, key: string): string {
  return PRESTART_TEMPLATES[templateKey as PrestartTemplateKey]?.items.find((i) => i.key === key)?.label ?? key;
}

function faultsOf(p: AssetPrestart): PrestartAnswer[] {
  return ((p.results as PrestartAnswer[]) ?? []).filter((r) => r.result === "fault");
}

function when(d: Date | string): string {
  return new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Red banner for every open defect, with the way to clear it. */
export function PrestartDefectBanner({ asset, prestarts, canEdit }: { asset: Asset; prestarts: AssetPrestart[]; canEdit: boolean }) {
  const open = prestarts.filter((p) => p.defectStatus === "open");
  const [fixing, setFixing] = useState<AssetPrestart | null>(null);
  if (!open.length) return null;

  return (
    <>
      {open.map((p) => {
        const faults = faultsOf(p);
        return (
          <div
            key={p.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2",
              p.unsafe
                ? "border-[hsl(var(--status-danger-fg))]/30 bg-[hsl(var(--status-danger-bg))]"
                : "border-[hsl(var(--status-warning-fg))]/30 bg-[hsl(var(--status-warning-bg))]",
            )}
            data-testid={`banner-defect-${p.id}`}
          >
            <TriangleAlert className={cn("w-4 h-4 mt-0.5 shrink-0", p.unsafe ? "text-[hsl(var(--status-danger-fg))]" : "text-[hsl(var(--status-warning-fg))]")} />
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-semibold">
                {p.unsafe ? "Do not use — " : "Defect reported — "}
                {faults.length ? faults.map((f) => itemLabel(p.templateKey, f.key)).join(", ") : "marked not safe"}
              </div>
              <div className="text-muted-foreground">
                {p.signedName} · pre-start {when(p.checkedAt)}
                {faults.some((f) => f.note) && ` · ${faults.filter((f) => f.note).map((f) => f.note).join("; ")}`}
              </div>
            </div>
            {canEdit && (
              <button type="button" className={CHIP_BUTTON} onClick={() => setFixing(p)} data-testid={`button-fix-defect-${p.id}`}>
                Mark fixed
              </button>
            )}
          </div>
        );
      })}
      <FixDefectDialog asset={asset} prestart={fixing} openUnsafeCount={open.filter((p) => p.unsafe).length} onClose={() => setFixing(null)} />
    </>
  );
}

function FixDefectDialog({
  asset,
  prestart,
  openUnsafeCount,
  onClose,
}: {
  asset: Asset;
  prestart: AssetPrestart | null;
  openUnsafeCount: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [returnToService, setReturnToService] = useState(true);
  // Only offered when this is the last unsafe defect holding it off the road.
  const canReturn = asset.status === "off_road" && (openUnsafeCount <= 1 || !prestart?.unsafe);

  useEffect(() => {
    if (prestart) {
      setNotes("");
      setReturnToService(true);
    }
  }, [prestart]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/assets/${asset.id}/prestarts/${prestart!.id}/defect`, "PATCH", {
        notes: notes.trim() || null,
        returnToService: canReturn && returnToService,
      }),
    onSuccess: (r: { backOnRoad?: boolean }) => {
      invalidateAssets(asset.id);
      onClose();
      toast({ title: r?.backOnRoad ? "Fixed — back on the road" : "Defect marked fixed" });
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't save that"), variant: "destructive" }),
  });

  return (
    <Dialog open={!!prestart} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark defect fixed</DialogTitle>
          <DialogDescription>Closes the defect task and logs the repair in the history.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">What was done</Label>
            <Textarea className="text-xs min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced front brake pads" />
          </div>
          {canReturn && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={returnToService} onCheckedChange={(v) => setReturnToService(v === true)} data-testid="checkbox-return-to-service" />
              Put {asset.name} back on the road
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-confirm-fix">
            {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Mark fixed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Recent pre-starts: who, when, the reading, and what failed. */
export function PrestartsSection({ asset, prestarts }: { asset: Asset; prestarts: AssetPrestart[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden min-w-0" data-testid="card-asset-prestarts">
      <SectionHeader icon={ClipboardCheck} title="Pre-starts" hint="On the phone: More → Pre-start, or scan the sticker">
        <QrStickerButton asset={asset} />
      </SectionHeader>
      {prestarts.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No pre-starts yet.</p>
      ) : (
        <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
          {prestarts.map((p) => {
            const faults = faultsOf(p);
            const isOpen = openId === p.id;
            const photos = (p.photos as string[]) ?? [];
            return (
              <li key={p.id} data-testid={`row-prestart-${p.id}`}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : p.id)}
                  className="w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/40"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.signedName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {when(p.checkedAt)}{p.meter != null ? ` · ${meter(p.meter, asset.meterType)}` : ""}
                    </div>
                  </div>
                  {p.unsafe ? (
                    <DueChip state="overdue">{p.defectStatus === "fixed" ? "Not safe · fixed" : "Not safe"}</DueChip>
                  ) : p.hasDefect ? (
                    <DueChip state="due_soon">{p.defectStatus === "fixed" ? `${faults.length} fault${faults.length === 1 ? "" : "s"} · fixed` : `${faults.length} fault${faults.length === 1 ? "" : "s"}`}</DueChip>
                  ) : (
                    <DueChip state="ok">Passed</DueChip>
                  )}
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10 text-xs flex flex-col gap-1.5">
                    {faults.length > 0 ? (
                      faults.map((f) => (
                        <div key={f.key}>
                          <span className="font-medium">{itemLabel(p.templateKey, f.key)}</span>
                          {f.note && <span className="text-muted-foreground"> — {f.note}</span>}
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">Every item OK or not applicable.</div>
                    )}
                    {p.notes && <div className="text-muted-foreground whitespace-pre-wrap">{p.notes}</div>}
                    {p.defectStatus === "fixed" && (
                      <div className="text-muted-foreground">
                        Fixed {p.defectFixedAt ? when(p.defectFixedAt) : ""}{p.defectFixNotes ? ` — ${p.defectFixNotes}` : ""}
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="flex gap-2 flex-wrap pt-1">
                        {photos.map((src) => (
                          <a key={src} href={src} target="_blank" rel="noreferrer">
                            <img src={src} alt="Pre-start photo" className="h-16 w-16 rounded-md object-cover border border-border" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The dash sticker: scanning it with the phone camera opens this asset's pre-start in the app. */
function QrStickerButton({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false);
  const src = `/api/assets/${asset.id}/qr.png`;

  const print = () => {
    const w = window.open("", "_blank", "width=420,height=560");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(asset.name)} pre-start</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;margin:24px}img{width:260px;height:260px}
      h1{font-size:18px;margin:8px 0 2px}p{margin:2px 0;font-size:13px;color:#555}</style></head>
      <body><img src="${location.origin}${src}" onload="window.print()"><h1>${esc(asset.name)}</h1>
      <p>${esc(asset.rego ?? "")}</p><p>Scan with your phone camera for the pre-start check</p></body></html>`);
    w.document.close();
  };

  return (
    <>
      <button type="button" className={CHIP_BUTTON} onClick={() => setOpen(true)} data-testid="button-qr-sticker">
        <QrCode className="w-3 h-3" />Sticker
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pre-start QR sticker</DialogTitle>
            <DialogDescription>Stick it on the dash. Scanning it with the phone camera opens this vehicle's pre-start in the Morada app.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-1">
            <img src={src} alt={`QR code for ${asset.name}`} className="w-56 h-56" />
            <div className="text-sm font-semibold">{asset.name}</div>
            {asset.rego && <div className="text-xs text-muted-foreground font-mono">{asset.rego}</div>}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={print} data-testid="button-print-qr">
              <Printer className="w-3.5 h-3.5 mr-1" />Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
