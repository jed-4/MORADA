import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Move } from "lucide-react";

/**
 * FocalPointPicker — pure UI component.
 *
 * Shows a draggable square over the image that represents the exact area
 * that will appear in square-cropped thumbnails. Supports pinch/zoom.
 *
 * Props:
 *  - imageUrl      URL of the image to set the focal point on
 *  - initialX/Y    Starting position in 0–100 percent (default 50)
 *  - onSave(x, y)  Called with the chosen position; caller handles persistence
 *  - isSaving      When true, the Save button shows a loading state
 *
 * The caller owns the API mutation and query invalidation.
 */
interface FocalPointPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  initialX?: number;
  initialY?: number;
  onSave: (x: number, y: number) => void;
  isSaving?: boolean;
}

const CONTAINER_H = 380;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function FocalPointPicker({
  open,
  onOpenChange,
  imageUrl,
  initialX = 50,
  initialY = 50,
  onSave,
  isSaving = false,
}: FocalPointPickerProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natSize, setNatSize] = useState({ w: 0, h: 0 });
  const [containerW, setContainerW] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<{
    mode: "square" | "pan" | null;
    startMouse: { x: number; y: number };
    startPan: { x: number; y: number };
    startPos: { x: number; y: number };
    imgLeft: number;
    imgTop: number;
    renderedW: number;
    renderedH: number;
    squareSize: number;
  }>({ mode: null, startMouse: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, startPos: { x: 0, y: 0 }, imgLeft: 0, imgTop: 0, renderedW: 0, renderedH: 0, squareSize: 0 });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPos({ x: initialX, y: initialY });
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open, initialX, initialY]);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, [open]);

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setNatSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  }, []);

  // Derived layout calculations
  const getLayout = useCallback(() => {
    const cW = containerW || 600;
    const cH = CONTAINER_H;
    const { w: natW, h: natH } = natSize;
    if (!natW || !natH) return null;

    const baseScale = Math.min(cW / natW, cH / natH);
    const renderedW = natW * baseScale * zoom;
    const renderedH = natH * baseScale * zoom;

    // Clamp pan so image always covers as much of the container as possible
    const maxPanX = Math.max(0, (renderedW - cW) / 2);
    const maxPanY = Math.max(0, (renderedH - cH) / 2);
    const clampedPanX = clamp(pan.x, -maxPanX, maxPanX);
    const clampedPanY = clamp(pan.y, -maxPanY, maxPanY);

    const imgLeft = cW / 2 - renderedW / 2 + clampedPanX;
    const imgTop = cH / 2 - renderedH / 2 + clampedPanY;

    // Square size = min(natW, natH) mapped to screen
    const squareSize = Math.min(natW, natH) * baseScale * zoom;

    // Focal point constraints (keep square within image bounds)
    const halfFracX = (squareSize / 2) / renderedW * 100;
    const halfFracY = (squareSize / 2) / renderedH * 100;

    return { cW, cH, renderedW, renderedH, imgLeft, imgTop, squareSize, halfFracX, halfFracY };
  }, [containerW, natSize, zoom, pan]);

  const getClampedPos = useCallback((x: number, y: number, layout: ReturnType<typeof getLayout>) => {
    if (!layout) return { x, y };
    return {
      x: clamp(x, layout.halfFracX, 100 - layout.halfFracX),
      y: clamp(y, layout.halfFracY, 100 - layout.halfFracY),
    };
  }, []);

  const getClientCoords = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ("clientX" in e) return { x: e.clientX, y: e.clientY };
    return null;
  };

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const layout = getLayout();
    if (!layout) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const client = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    const mouseX = client.x - rect.left;
    const mouseY = client.y - rect.top;

    // Is the mouse inside the square?
    const { imgLeft, imgTop, renderedW, renderedH, squareSize } = layout;
    const focalScreenX = imgLeft + (pos.x / 100) * renderedW;
    const focalScreenY = imgTop + (pos.y / 100) * renderedH;
    const sqLeft = focalScreenX - squareSize / 2;
    const sqTop = focalScreenY - squareSize / 2;

    const inSquare =
      mouseX >= sqLeft && mouseX <= sqLeft + squareSize &&
      mouseY >= sqTop && mouseY <= sqTop + squareSize;

    interactionRef.current = {
      mode: inSquare ? "square" : "pan",
      startMouse: { x: mouseX, y: mouseY },
      startPan: { ...pan },
      startPos: { ...pos },
      imgLeft, imgTop, renderedW, renderedH, squareSize,
    };
  }, [getLayout, pos, pan]);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const ref = interactionRef.current;
      if (!ref.mode) return;
      e.preventDefault();

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const coords = getClientCoords(e);
      if (!coords) return;

      const mouseX = coords.x - rect.left;
      const mouseY = coords.y - rect.top;
      const dx = mouseX - ref.startMouse.x;
      const dy = mouseY - ref.startMouse.y;

      if (ref.mode === "square") {
        // Move focal point
        const newFocalScreenX = ref.imgLeft + (ref.startPos.x / 100) * ref.renderedW + dx;
        const newFocalScreenY = ref.imgTop + (ref.startPos.y / 100) * ref.renderedH + dy;
        const newX = (newFocalScreenX - ref.imgLeft) / ref.renderedW * 100;
        const newY = (newFocalScreenY - ref.imgTop) / ref.renderedH * 100;
        const layout = getLayout();
        setPos(getClampedPos(newX, newY, layout));
      } else {
        // Pan the image
        setPan(prev => {
          const layout = getLayout();
          if (!layout) return prev;
          const maxPanX = Math.max(0, (layout.renderedW - layout.cW) / 2);
          const maxPanY = Math.max(0, (layout.renderedH - layout.cH) / 2);
          return {
            x: clamp(ref.startPan.x + dx, -maxPanX, maxPanX),
            y: clamp(ref.startPan.y + dy, -maxPanY, maxPanY),
          };
        });
      }
    };

    const handleUp = () => {
      interactionRef.current.mode = null;
    };

    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [getLayout, getClampedPos]);

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    // Keep pan within bounds for new zoom
    setPan({ x: 0, y: 0 });
  };

  // Render
  const layout = getLayout();
  let squareStyle: React.CSSProperties = { display: "none" };
  let cursor = "grab";
  if (layout) {
    const { imgLeft, imgTop, renderedW, renderedH, squareSize } = layout;
    const focalScreenX = imgLeft + (pos.x / 100) * renderedW;
    const focalScreenY = imgTop + (pos.y / 100) * renderedH;
    const sqLeft = focalScreenX - squareSize / 2;
    const sqTop = focalScreenY - squareSize / 2;
    squareStyle = {
      position: "absolute",
      left: sqLeft,
      top: sqTop,
      width: squareSize,
      height: squareSize,
    };
    cursor = zoom > 1 ? "grab" : "default";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            Set thumbnail crop
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag the square to choose which part of the image appears in thumbnails. Zoom in for precise positioning.
          </p>
        </DialogHeader>

        <div className="flex gap-0">
          {/* Main picker area */}
          <div
            ref={containerRef}
            className="relative flex-1 overflow-hidden bg-black/80 select-none"
            style={{ height: CONTAINER_H, cursor }}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
          >
            {/* Image */}
            {layout && (
              <img
                src={imageUrl}
                alt="Focal point picker"
                onLoad={handleImgLoad}
                className="pointer-events-none absolute"
                draggable={false}
                style={{
                  left: layout.imgLeft,
                  top: layout.imgTop,
                  width: layout.renderedW,
                  height: layout.renderedH,
                }}
              />
            )}
            {!natSize.w && (
              <img
                src={imageUrl}
                alt=""
                onLoad={handleImgLoad}
                className="opacity-0 pointer-events-none absolute"
                draggable={false}
              />
            )}

            {/* Darkened overlay outside the square */}
            {layout && (
              <div className="absolute inset-0 pointer-events-none" style={{ mixBlendMode: "normal" }}>
                <svg
                  className="absolute inset-0"
                  width="100%"
                  height="100%"
                  style={{ position: "absolute", top: 0, left: 0 }}
                >
                  <defs>
                    <mask id="focal-mask">
                      <rect width="100%" height="100%" fill="white" />
                      <rect
                        x={squareStyle.left as number}
                        y={squareStyle.top as number}
                        width={squareStyle.width as number}
                        height={squareStyle.height as number}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#focal-mask)" />
                </svg>
              </div>
            )}

            {/* Draggable crop square */}
            {layout && (
              <div
                className="absolute pointer-events-none"
                style={squareStyle}
              >
                {/* Outer border */}
                <div
                  className="absolute inset-0"
                  style={{
                    border: "2px solid rgba(255,255,255,0.9)",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.2)",
                    borderRadius: 2,
                  }}
                />
                {/* Rule-of-thirds grid lines */}
                {[1, 2].map(i => (
                  <div key={`v${i}`} className="absolute top-0 bottom-0" style={{ left: `${(i / 3) * 100}%`, width: 1, background: "rgba(255,255,255,0.3)" }} />
                ))}
                {[1, 2].map(i => (
                  <div key={`h${i}`} className="absolute left-0 right-0" style={{ top: `${(i / 3) * 100}%`, height: 1, background: "rgba(255,255,255,0.3)" }} />
                ))}
                {/* Corner handles */}
                {[
                  { top: -4, left: -4 }, { top: -4, right: -4 },
                  { bottom: -4, left: -4 }, { bottom: -4, right: -4 },
                ].map((style, i) => (
                  <div
                    key={i}
                    className="absolute"
                    style={{
                      ...style,
                      width: 10,
                      height: 10,
                      background: "white",
                      border: "1.5px solid rgba(0,0,0,0.4)",
                      borderRadius: 2,
                    }}
                  />
                ))}
                {/* Center drag indicator */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "2px 4px" }}>
                    <Move className="w-4 h-4 text-white/80" />
                  </div>
                </div>
              </div>
            )}

            {/* Pan hint when zoomed */}
            {zoom > 1 && (
              <div className="absolute bottom-2 left-2 text-[10px] text-white/60 pointer-events-none select-none">
                Drag outside square to pan
              </div>
            )}
          </div>

          {/* Right panel: preview + zoom */}
          <div className="flex flex-col gap-3 px-4 py-4 border-l border-border bg-background" style={{ width: 140 }}>
            <div className="flex flex-col gap-1 items-center">
              <p className="text-[11px] text-muted-foreground font-medium">Preview</p>
              <div className="w-24 h-24 rounded-md overflow-hidden border border-border bg-muted shrink-0">
                <img
                  src={imageUrl}
                  alt="Preview large"
                  className="w-full h-full object-cover pointer-events-none"
                  style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                  draggable={false}
                />
              </div>
              <div className="w-12 h-12 rounded-md overflow-hidden border border-border bg-muted shrink-0 mt-1">
                <img
                  src={imageUrl}
                  alt="Preview small"
                  className="w-full h-full object-cover pointer-events-none"
                  style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                  draggable={false}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {Math.round(pos.x)}% / {Math.round(pos.y)}%
              </p>
            </div>

            {/* Zoom controls */}
            <div className="flex flex-col gap-2 mt-auto">
              <p className="text-[11px] text-muted-foreground font-medium text-center">Zoom</p>
              <div className="flex flex-col items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => handleZoomChange(Math.min(MAX_ZOOM, parseFloat((zoom + 0.5).toFixed(1))))}
                  disabled={zoom >= MAX_ZOOM}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <div className="h-20 flex items-center justify-center">
                  <Slider
                    orientation="vertical"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.1}
                    value={[zoom]}
                    onValueChange={([v]) => handleZoomChange(v)}
                    className="h-full"
                  />
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => handleZoomChange(Math.max(MIN_ZOOM, parseFloat((zoom - 0.5).toFixed(1))))}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <p className="text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(Math.round(pos.x), Math.round(pos.y))} disabled={isSaving}>
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
 */
export async function saveFocalPoint(
  table: string,
  id: string,
  x: number,
  y: number,
): Promise<void> {
  const { apiRequest } = await import("@/lib/queryClient");
  await apiRequest(
    `/api/attachments/${table}/${id}/focal-point`,
    "PATCH",
    { thumbnailX: x, thumbnailY: y },
  );
}
