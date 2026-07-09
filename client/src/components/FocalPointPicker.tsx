import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crosshair } from "lucide-react";

/**
 * FocalPointPicker — pure UI component.
 *
 * Props:
 *  - imageUrl      URL of the image to set the focal point on
 *  - initialX/Y    Starting position in 0–100 percent (default 50)
 *  - onSave(x, y)  Called with the chosen position; caller handles persistence
 *  - isSaving      When true, the Save button shows a loading state
 *
 * The caller owns the API mutation and query invalidation.
 * This keeps the component reusable across all attachment table types.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (open) setPos({ x: initialX, y: initialY });
  }, [open, initialX, initialY]);

  const getPositionFromEvent = useCallback((e: MouseEvent | TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const p = getPositionFromEvent(e.nativeEvent);
    if (p) setPos(p);
  }, [getPositionFromEvent]);

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const p = getPositionFromEvent(e);
      if (p) setPos(p);
    };
    const handleUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [getPositionFromEvent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-muted-foreground" />
            Set thumbnail focal point
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click or drag to set which part of the image appears in square thumbnails.
          </p>
        </DialogHeader>

        <div className="flex gap-4 p-4">
          {/* Main image with crosshair overlay */}
          <div
            ref={containerRef}
            className="relative flex-1 rounded-md overflow-hidden cursor-crosshair select-none bg-muted"
            style={{ minHeight: 320 }}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
          >
            <img
              src={imageUrl}
              alt="Focal point picker"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            <div className="absolute inset-0 pointer-events-none">
              {/* Horizontal line */}
              <div
                className="absolute w-full"
                style={{
                  top: `${pos.y}%`,
                  height: 1,
                  background: "rgba(255,255,255,0.7)",
                  boxShadow: "0 0 2px rgba(0,0,0,0.8)",
                  transform: "translateY(-50%)",
                }}
              />
              {/* Vertical line */}
              <div
                className="absolute h-full"
                style={{
                  left: `${pos.x}%`,
                  width: 1,
                  background: "rgba(255,255,255,0.7)",
                  boxShadow: "0 0 2px rgba(0,0,0,0.8)",
                  transform: "translateX(-50%)",
                }}
              />
              {/* Dot */}
              <div
                className="absolute rounded-full border-2 border-white"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: 20,
                  height: 20,
                  transform: "translate(-50%, -50%)",
                  background: "rgba(255,255,255,0.25)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.4)",
                }}
              />
            </div>
          </div>

          {/* Live preview */}
          <div className="flex flex-col gap-2 items-center">
            <p className="text-xs text-muted-foreground font-medium">Preview</p>
            <div className="w-32 h-32 rounded-md overflow-hidden border border-border bg-muted shrink-0">
              <img
                src={imageUrl}
                alt="Preview"
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                draggable={false}
              />
            </div>
            <div className="w-16 h-16 rounded-md overflow-hidden border border-border bg-muted shrink-0">
              <img
                src={imageUrl}
                alt="Preview small"
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
                draggable={false}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {pos.x}% / {pos.y}%
            </p>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(pos.x, pos.y)} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save focal point"}
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
