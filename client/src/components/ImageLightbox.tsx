import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxImage {
  src: string;
  alt?: string | null;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  /** Index of the image to show, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}

/**
 * Full-screen viewer for the whole, uncropped image. Arrow keys / swipe /
 * buttons step through `images`; Escape, the close button or the backdrop
 * close it. Controlled: the caller owns `index`.
 */
export function ImageLightbox({ images, index, onIndexChange }: ImageLightboxProps) {
  const touchStart = useRef<number | null>(null);
  const open = index !== null && images.length > 0;
  const current = open ? Math.min(index!, images.length - 1) : 0;
  const many = images.length > 1;

  useEffect(() => {
    if (!open) return;
    const step = (d: number) => onIndexChange((current + d + images.length) % images.length);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onIndexChange(null); }
      else if (e.key === "ArrowRight" && many) step(1);
      else if (e.key === "ArrowLeft" && many) step(-1);
    };
    // Capture: a Radix dialog underneath would otherwise take the Escape and
    // close itself instead of the photo.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, current, images.length, many, onIndexChange]);

  if (!open) return null;
  const image = images[current];
  const step = (d: number) => onIndexChange((current + d + images.length) % images.length);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4 sm:p-10 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={() => onIndexChange(null)}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (start === null || !many) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
      data-testid="image-lightbox"
    >
      <img
        src={image.src}
        alt={image.alt ?? ""}
        className="max-w-full max-h-full object-contain rounded-md select-none"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
        onClick={(e) => { e.stopPropagation(); onIndexChange(null); }}
        aria-label="Close image"
        data-testid="button-lightbox-close"
      >
        <X className="w-5 h-5" />
      </button>
      {many && (
        <>
          <button
            type="button"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); step(-1); }}
            aria-label="Previous image"
            data-testid="button-lightbox-prev"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); step(1); }}
            aria-label="Next image"
            data-testid="button-lightbox-next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/60 rounded-full px-2.5 py-1 tabular-nums">
            {current + 1} / {images.length}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
