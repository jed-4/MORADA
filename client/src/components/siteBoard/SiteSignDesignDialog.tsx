import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Page } from "react-pdf";
import { ExternalLink, FileUp, Loader2, QrCode, Trash2 } from "lucide-react";
import {
  DEFAULT_SITE_SIGN_LAYOUT,
  SITE_SIGN_TEMPLATE_MIMES,
  type SiteSignLayout,
  type SiteSignSettings,
  type SiteSignTemplateMime,
} from "@shared/siteBoard";
import { PdfDocument } from "@/components/PdfDocument";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const SIGN_KEY = ["/api/company/site-sign"];
const PREVIEW_WIDTH = 360;
const MIN = 0.08;

interface PendingTemplate {
  objectPath: string;
  uploadGrant: string;
  name: string;
  mimeType: SiteSignTemplateMime;
  localUrl: string;
}

type DragMode = "move" | "nw" | "ne" | "sw" | "se";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drag the box around / resize it from a corner, in page fractions. */
function moveBox(start: SiteSignLayout, mode: DragMode, dx: number, dy: number): SiteSignLayout {
  let { x, y, w, h } = start;
  if (mode === "move") {
    x = clamp(x + dx, 0, 1 - w);
    y = clamp(y + dy, 0, 1 - h);
    return { ...start, x, y };
  }
  if (mode.includes("w")) {
    const nx = clamp(x + dx, 0, x + w - MIN);
    w = w + (x - nx);
    x = nx;
  } else {
    w = clamp(w + dx, MIN, 1 - x);
  }
  if (mode.includes("n")) {
    const ny = clamp(y + dy, 0, y + h - MIN);
    h = h + (y - ny);
    y = ny;
  } else {
    h = clamp(h + dy, MIN, 1 - y);
  }
  return { ...start, x, y, w, h };
}

/**
 * The company's branded site sign: upload an A4 design once (PDF, PNG or
 * JPG), drag a box over the blank space for the QR, and every job's
 * "Print sign" comes out as that design with its own QR, name and address.
 */
export function SiteSignDesignDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets "Preview" make the sign for this job. */
  projectId?: string;
}) {
  const { toast } = useToast();
  const { data: saved, isLoading } = useQuery<SiteSignSettings>({ queryKey: SIGN_KEY, enabled: open });
  const [layout, setLayout] = useState<SiteSignLayout>(DEFAULT_SITE_SIGN_LAYOUT);
  const [pending, setPending] = useState<PendingTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [previewBust, setPreviewBust] = useState(() => Date.now());
  const [pageError, setPageError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; sx: number; sy: number; start: SiteSignLayout } | null>(null);
  const { uploadFile, isUploading } = useUpload();

  // Load the saved layout each time the dialog opens; drop an unsaved upload.
  useEffect(() => {
    if (!open) return;
    if (saved) setLayout(saved.layout);
    setPending(null);
    setDirty(false);
    setPageError(false);
  }, [open, saved]);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.localUrl); }, [pending]);

  const source = pending
    ? { url: pending.localUrl, mime: pending.mimeType, name: pending.name }
    : saved?.hasTemplate && saved.templateMime
      ? { url: `/api/company/site-sign/template?v=${previewBust}`, mime: saved.templateMime, name: saved.templateName ?? "Sign design" }
      : null;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        layout,
        ...(pending ? { template: { objectPath: pending.objectPath, uploadGrant: pending.uploadGrant, name: pending.name, mimeType: pending.mimeType } } : {}),
      };
      const res = await fetch("/api/company/site-sign", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(res.status === 403 && !json.error?.includes("upload")
          ? "Only an admin can change the company's sign design."
          : json.error || "Couldn't save the sign design");
      }
      return json as SiteSignSettings;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(SIGN_KEY, next);
      setPending(null);
      setDirty(false);
      setPreviewBust(Date.now());
    },
  });

  const remove = useMutation({
    mutationFn: () => apiRequest("/api/company/site-sign", "DELETE"),
    onSuccess: (next) => {
      queryClient.setQueryData(SIGN_KEY, next);
      setPending(null);
      toast({ title: "Sign design removed", description: "Signs use Morada's plain layout again." });
    },
    onError: () => toast({ title: "Only an admin can remove the sign design", variant: "destructive" }),
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const mime = (file.type === "image/jpg" ? "image/jpeg" : file.type) as SiteSignTemplateMime;
    if (!(SITE_SIGN_TEMPLATE_MIMES as readonly string[]).includes(mime)) {
      toast({ title: "Use a PDF, PNG or JPG", description: "Export your design from Canva, InDesign or Word as one of those.", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "That file is over 25 MB", description: "Export it at a smaller size and try again.", variant: "destructive" });
      return;
    }
    const uploaded = await uploadFile(file);
    if (!uploaded?.uploadGrant) {
      toast({ title: "The upload didn't work", variant: "destructive" });
      return;
    }
    setPageError(false);
    setPending({ objectPath: uploaded.objectPath, uploadGrant: uploaded.uploadGrant, name: file.name, mimeType: mime, localUrl: URL.createObjectURL(file) });
    setDirty(true);
  };

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: layout };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || !rect) return;
    setLayout(moveBox(d.start, d.mode, (e.clientX - d.sx) / rect.width, (e.clientY - d.sy) / rect.height));
    setDirty(true);
  };
  const onPointerUp = () => { drag.current = null; };

  const setOpt = (patch: Partial<SiteSignLayout>) => { setLayout((l) => ({ ...l, ...patch })); setDirty(true); };

  const preview = async () => {
    if (!projectId) return;
    // Open the tab first (inside the click) so pop-up blockers allow it.
    const tab = window.open("about:blank", "_blank");
    try {
      if (dirty) await save.mutateAsync();
      const url = `/api/projects/${projectId}/site-sign.pdf?v=${Date.now()}`;
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (err: any) {
      tab?.close();
      toast({ title: err?.message || "Couldn't save the sign design", variant: "destructive" });
    }
  };

  const doSave = async () => {
    try {
      await save.mutateAsync();
      toast({ title: "Sign design saved", description: "Every job's Print sign now uses it." });
    } catch (err: any) {
      toast({ title: err?.message || "Couldn't save the sign design", variant: "destructive" });
    }
  };

  const ink = layout.textColor === "light" ? "text-white" : "text-[#2C2825]";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl" data-testid="site-sign-design-dialog">
          <DialogHeader>
            <DialogTitle>Sign design</DialogTitle>
            <DialogDescription>
              Your own A4 design for the site QR sign, used for every job. Make it in Canva, InDesign or Word
              with a blank space for the code, then drag the box over that space.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-5">
              {/* the page with the box */}
              <div className="shrink-0 mx-auto" style={{ width: PREVIEW_WIDTH }}>
                {!source ? (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={isUploading}
                    className="w-full aspect-[210/297] rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-center px-6 hover:bg-muted/40"
                    data-testid="button-upload-sign-design"
                  >
                    {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <FileUp className="w-6 h-6 text-muted-foreground" />}
                    <span className="text-sm font-medium">{isUploading ? "Uploading…" : "Upload your design"}</span>
                    <span className="text-xs text-muted-foreground">A4 PDF, PNG or JPG. Only page 1 gets the QR.</span>
                  </button>
                ) : (
                  <div
                    ref={frame}
                    className="relative w-full shadow-sm border border-border bg-white select-none touch-none"
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    data-testid="sign-preview-frame"
                  >
                    {source.mime === "application/pdf" ? (
                      <PdfDocument
                        file={source.url}
                        loading={<div className="aspect-[210/297] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
                        error={<div className="aspect-[210/297] flex items-center justify-center text-xs text-muted-foreground p-6 text-center">This PDF couldn't be shown. Try exporting it again.</div>}
                        onLoadError={() => setPageError(true)}
                      >
                        <Page pageNumber={1} width={PREVIEW_WIDTH - 2} renderTextLayer={false} renderAnnotationLayer={false} />
                      </PdfDocument>
                    ) : (
                      <img src={source.url} alt={source.name} className="block w-full" draggable={false} onError={() => setPageError(true)} />
                    )}

                    {!pageError && (
                      <div
                        className="absolute border-2 border-primary bg-primary/10 cursor-move flex flex-col items-center justify-center gap-1 overflow-hidden"
                        style={{ left: `${layout.x * 100}%`, top: `${layout.y * 100}%`, width: `${layout.w * 100}%`, height: `${layout.h * 100}%` }}
                        onPointerDown={onPointerDown("move")}
                        data-testid="sign-qr-box"
                      >
                        <div className="bg-white border border-border/60 flex items-center justify-center" style={{ height: layout.showName || layout.showAddress ? "62%" : "85%", aspectRatio: "1", maxWidth: "92%" }}>
                          <QrCode className="w-1/2 h-1/2 text-[#2C2825]" />
                        </div>
                        {layout.showName && <span className={cn("text-[10px] font-bold leading-none truncate max-w-full px-1", ink)}>Job name</span>}
                        {layout.showAddress && <span className={cn("text-[8px] leading-none truncate max-w-full px-1", ink)}>Job address</span>}
                        {(["nw", "ne", "sw", "se"] as const).map((c) => (
                          <span
                            key={c}
                            onPointerDown={onPointerDown(c)}
                            className={cn(
                              "absolute w-3 h-3 bg-white border-2 border-primary rounded-sm",
                              c.includes("n") ? "-top-1.5" : "-bottom-1.5",
                              c.includes("w") ? "-left-1.5" : "-right-1.5",
                              c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* options */}
              <div className="flex-1 min-w-0 space-y-4 text-xs">
                {source && (
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">Design</p>
                    <p className="text-muted-foreground truncate" title={source.name}>{source.name}{pending && " (not saved yet)"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={isUploading} data-testid="button-replace-sign-design">
                        {isUploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5 mr-1.5" />}
                        Replace
                      </Button>
                      {saved?.hasTemplate && !pending && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)} data-testid="button-remove-sign-design">
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="font-medium text-foreground">Under the QR</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={layout.showName} onCheckedChange={(v) => setOpt({ showName: v === true })} data-testid="checkbox-sign-name" />
                    Job name
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={layout.showAddress} onCheckedChange={(v) => setOpt({ showAddress: v === true })} data-testid="checkbox-sign-address" />
                    Job address
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-muted-foreground">Text colour</span>
                    <div className="flex items-center border rounded-md overflow-hidden h-6">
                      {(["dark", "light"] as const).map((c, i) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setOpt({ textColor: c })}
                          className={cn("px-2 h-full", i > 0 && "border-l", layout.textColor === c ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground")}
                          data-testid={`button-sign-text-${c}`}
                        >
                          {c === "dark" ? "Dark" : "White"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-muted/50 p-2.5 text-muted-foreground space-y-1">
                  <p>Drag the box to move it; drag a corner to resize. The QR fills as much of the box as it can, with the text under it.</p>
                  <p>No design? Print sign uses Morada's plain layout with your logo.</p>
                </div>
              </div>
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
            data-testid="input-sign-design"
          />

          <DialogFooter className="gap-2 sm:gap-2">
            {projectId && source && (
              <Button variant="outline" onClick={preview} disabled={save.isPending} data-testid="button-preview-sign">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                {dirty ? "Save & preview this job" : "Preview this job's sign"}
              </Button>
            )}
            <Button onClick={doSave} disabled={!source || !dirty || save.isPending} data-testid="button-save-sign-design">
              {save.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the sign design?"
        description="Print sign goes back to Morada's plain layout for every job. QR codes already printed keep working."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { setConfirmRemove(false); remove.mutate(); }}
      />
    </>
  );
}
