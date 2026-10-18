import { cropLayout } from "@/components/CroppedImage";
import { getApiBaseUrl } from "@shared/api";
import type { PdfImageRef } from "@shared/selectionsPdfModel";

/**
 * Crop a selection photo to its saved thumbnail square (focal point + zoom) and
 * return it as a JPEG data URI for the PDF.
 *
 * Done in the browser with a canvas because @react-pdf cannot crop or position
 * an image. It also keeps the PDF small: a 300px square instead of the full
 * original for every option. The fetch is same-origin, so the canvas is never
 * tainted. Returns null when the image can't be loaded; the tile then says "No
 * image" rather than the export failing.
 */
export async function cropImageForPdf(ref: PdfImageRef, size = 300): Promise<string | null> {
  try {
    const url = ref.filePath.startsWith("http") ? ref.filePath : `${getApiBaseUrl()}${ref.filePath}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const box = cropLayout(
      bitmap.width / bitmap.height,
      ref.thumbnailX ?? 50,
      ref.thumbnailY ?? 50,
      ref.thumbnailZoom ?? 100,
    );
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Zoomed out, the photo doesn't fill the square: white, as in the app.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bitmap, box.left * size, box.top * size, box.width * size, box.height * size);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}
