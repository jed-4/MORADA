import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import { CroppedImage, cropLayout, containZoom } from "@/components/CroppedImage";

/**
 * FocalPointPicker — pure UI component.
 *
 * A fixed square frame with the image underneath it: drag the image to
 * position it, zoom in to crop tighter or out to fit more of it in. The frame
 * is exactly what square thumbnails show (same maths as CroppedImage).
 *
 * Props:
 *  - imageUrl            URL of the image to crop
 *  - initialX/Y          Starting position in 0–100 percent (default 50)
 *  - initialZoom         Starting zoom, percent of cover (default 100)
 *  - allowZoom           Offer zoom. Leave off for tables that don't store one.
 *  - onSave(x, y, zoom)  Called with the chosen crop; caller handles persistence
 *  - isSaving            When true, the Save button shows a loading state
 *
 * The caller owns the API mutation and query invalidation.
 */
interface FocalPointPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  initialX?: number;
  initialY?: number;
  initialZoom?: number;
  allowZoom?: boolean;
  onSave: (x: number, y: number, zoom: number) => void;
  isSaving?: boolean;
}

const FRAME = 380;
export const MAX_THUMBNAIL_ZOOM = 400;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function FocalPointPicker({
  open,
  onOpenChange,
  imageUrl,
  initialX = 50,
  initialY = 50,
  initialZoom = 100,
  allowZoom = false,
  onSave,
  isSaving = false,
}: FocalPointPickerProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [zoom, setZoom] = useState(initialZoom);
  const [aspect, setAspect] = useState<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPos({ x: initialX, y: initialY });
      setZoom(allowZoom ? initialZoom : 100);
    }
  }, [open, initialX, initialY, initialZoom, allowZoom]);

  // Ref + onLoad, not onLoad alone: an already-cached image can finish loading
  // before React attaches the handler, which left the frame blank.
  const measure = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth && img.naturalHeight) {
      setAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  const minZoom = aspect ? Math.min(100, containZoom(aspect)) : 100;
  const box = aspect ? cropLayout(aspect, pos.x, pos.y, zoom) : null;

  const changeZoom = useCallback((next: number) => {
    setZoom(clamp(Math.round(next), minZoom, MAX_THUMBNAIL_ZOOM));
  }, [minZoom]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!box) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, left: box.left, top: box.top };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !box) return;
    const side = frameRef.current?.clientWidth || FRAME;
    // Invert cropLayout: left = (1 - width) * x/100. When the image exactly
    // spans the frame on an axis there is no slack, so that axis can't move.
    const slackX = 1 - box.width;
    const slackY = 1 - box.height;
    const left = drag.left + (e.clientX - drag.startX) / side;
    const top = drag.top + (e.clientY - drag.startY) / side;
    setPos((prev) => ({
      x: Math.abs(slackX) < 0.001 ? prev.x : clamp((left / slackX) * 100, 0, 100),
      y: Math.abs(slackY) < 0.001 ? prev.y : clamp((top / slackY) * 100, 0, 100),
    }));
  };

  const handlePointerUp = () => { dragRef.current = null; };

  // Wheel / trackpad pinch zooms. Bound natively: React's onWheel is passive,
  // so it can't stop the dialog scrolling underneath.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !allowZoom || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(Math.round(z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)), minZoom, MAX_THUMBNAIL_ZOOM));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [allowZoom, open, minZoom, aspect]);

  const x = Math.round(pos.x);
  const y = Math.round(pos.y);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            Set thumbnail crop
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allowZoom
              ? "The square is what shows in thumbnails. Drag the image to position it, and zoom in or out to fit."
              : "The square is what shows in thumbnails. Drag the image to position it."}
          </p>
        </DialogHeader>

        <div className="flex gap-0">
          {/* Crop frame */}
          <div className="flex-1 flex items-center justify-center bg-muted/60 p-4">
            <div
              ref={frameRef}
              className="relative overflow-hidden bg-white select-none touch-none rounded-sm ring-1 ring-border"
              style={{ width: FRAME, height: FRAME, maxWidth: "100%", aspectRatio: "1 / 1", cursor: box ? "grab" : "default" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              data-testid="focal-frame"
            >
              <img
                key={imageUrl}
                ref={measure}
                src={imageUrl}
                alt="Thumbnail crop"
                onLoad={(e) => measure(e.currentTarget)}
                className="pointer-events-none absolute max-w-none"
                draggable={false}
                style={
                  box
                    ? { left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }
                    : { opacity: 0 }
                }
              />
              {/* Rule-of-thirds guides */}
              {[1, 2].map((i) => (
                <div key={`v${i}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${(i / 3) * 100}%`, width: 1, background: "rgba(255,255,255,0.35)", mixBlendMode: "difference" }} />
              ))}
              {[1, 2].map((i) => (
                <div key={`h${i}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: `${(i / 3) * 100}%`, height: 1, background: "rgba(255,255,255,0.35)", mixBlendMode: "difference" }} />
              ))}
            </div>
          </div>

          {/* Right panel: preview + zoom */}
          <div className="flex flex-col gap-3 px-4 py-4 border-l border-border bg-background" style={{ width: 172 }}>
            <div className="flex flex-col gap-1 items-center">
              <p className="text-[11px] text-muted-foreground font-medium">Preview</p>
              <div className="w-24 h-24 rounded-md overflow-hidden border border-border bg-muted shrink-0">
                <CroppedImage src={imageUrl} x={x} y={y} zoom={zoom} />
              </div>
              <div className="w-12 h-12 rounded-md overflow-hidden border border-border bg-muted shrink-0 mt-1">
                <CroppedImage src={imageUrl} x={x} y={y} zoom={zoom} />
              </div>
            </div>

            {allowZoom && (
              <div className="flex flex-col gap-2 mt-auto">
                <p className="text-[11px] text-muted-foreground font-medium text-center">Zoom</p>
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1.5 w-full">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      onClick={() => changeZoom(zoom - 10)}
                      disabled={zoom <= minZoom}
                      aria-label="Zoom out"
                      data-testid="button-zoom-out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </Button>
                    <Slider
                      min={minZoom}
                      max={MAX_THUMBNAIL_ZOOM}
                      step={1}
                      value={[zoom]}
                      onValueChange={([v]) => changeZoom(v)}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      onClick={() => changeZoom(zoom + 10)}
                      disabled={zoom >= MAX_THUMBNAIL_ZOOM}
                      aria-label="Zoom in"
                      data-testid="button-zoom-in"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground" data-testid="text-zoom">{zoom}%</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => { changeZoom(minZoom); setPos({ x: 50, y: 50 }); }}
                      disabled={minZoom >= 100}
                      title="Show the whole image"
                      data-testid="button-zoom-fit"
                    >
                      <Minimize2 className="w-3 h-3 mr-0.5" />
                      Fit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => changeZoom(100)}
                      title="Fill the square"
                      data-testid="button-zoom-fill"
                    >
                      <Maximize2 className="w-3 h-3 mr-0.5" />
                      Fill
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(x, y, zoom)} disabled={isSaving} data-testid="button-save-crop">
            {isSaving ? "Saving…" : "Save crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * saveFocalPoint — shared helper for any caller to persist a focal point.
 * Callers import this alongside FocalPointPicker and handle query invalidation.
 * `zoom` is only stored for tables that have a thumbnail_zoom column.
 */
export async function saveFocalPoint(
  table: string,
  id: string,
  x: number,
  y: number,
  zoom?: number,
): Promise<void> {
  const { apiRequest } = await import("@/lib/queryClient");
  await apiRequest(
    `/api/attachments/${table}/${id}/focal-point`,
    "PATCH",
    { thumbnailX: x, thumbnailY: y, ...(zoom !== undefined ? { thumbnailZoom: zoom } : {}) },
  );
}
