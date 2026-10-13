import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Crop geometry shared by CroppedImage and FocalPointPicker, so the picker is
 * exactly what the thumbnails show.
 *
 * Everything is in units of the (square) frame's side. `zoom` is a percentage
 * of "cover": 100 fills the frame with the image's short side, below 100 shows
 * more of the image (down to the whole image, letterboxed), above 100 crops in.
 * `x`/`y` are 0–100 and follow CSS object-position: x% of the image sits at x%
 * of the frame, so 0 pins the left edges together and 100 the right.
 */
export function cropLayout(aspect: number, x: number, y: number, zoom: number) {
  const z = zoom / 100;
  const width = (aspect >= 1 ? aspect : 1) * z;
  const height = (aspect >= 1 ? 1 : 1 / aspect) * z;
  return {
    width,
    height,
    left: (1 - width) * (x / 100),
    top: (1 - height) * (y / 100),
  };
}

/** Zoom (percent of cover) at which the whole image fits inside the frame. */
export function containZoom(aspect: number) {
  return Math.ceil(Math.min(aspect, 1 / aspect) * 100);
}

interface CroppedImageProps {
  src: string;
  alt?: string;
  /** Focal point, 0–100. Stored as thumbnailX / thumbnailY. */
  x?: number | null;
  y?: number | null;
  /** Percent of cover. Stored as thumbnailZoom; 100 (the default) is a plain cover crop. */
  zoom?: number | null;
  className?: string;
  loading?: "lazy" | "eager";
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * An image cropped to its frame by a saved focal point and zoom. Fills its
 * parent; the parent sets the size and shape (square for selections).
 */
export function CroppedImage({ src, alt = "", x, y, zoom, className, loading, onError }: CroppedImageProps) {
  const fx = x ?? 50;
  const fy = y ?? 50;
  const fz = zoom ?? 100;
  const [aspect, setAspect] = useState<number | null>(null);

  const measure = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth && img.naturalHeight) {
      setAspect(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  // At 100% the browser's own cover crop is exact for any frame shape, and
  // needs no measuring — the path every un-zoomed image takes.
  if (fz === 100) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        onError={onError}
        draggable={false}
        className={cn("w-full h-full object-cover", className)}
        style={{ objectPosition: `${fx}% ${fy}%` }}
      />
    );
  }

  const box = aspect ? cropLayout(aspect, fx, fy, fz) : null;
  return (
    <div className={cn("relative w-full h-full overflow-hidden", fz < 100 && "bg-white", className)}>
      <img
        ref={measure}
        src={src}
        alt={alt}
        loading={loading}
        onError={onError}
        onLoad={(e) => measure(e.currentTarget)}
        draggable={false}
        className="absolute max-w-none"
        style={
          box
            ? {
                left: `${box.left * 100}%`,
                top: `${box.top * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }
            : { inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${fx}% ${fy}%`, opacity: 0 }
        }
      />
    </div>
  );
}
