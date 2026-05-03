import type { TakeoffPlanPage } from "@shared/schema";

export type Point = { x: number; y: number };

export function pixelsToFractions(pts: Point[], w: number, h: number): Point[] {
  if (w <= 0 || h <= 0) return pts.map(() => ({ x: 0, y: 0 }));
  return pts.map((p) => ({ x: p.x / w, y: p.y / h }));
}

export function fractionsToPixels(pts: Point[], w: number, h: number): Point[] {
  return pts.map((p) => ({ x: p.x * w, y: p.y * h }));
}

function shoelaceArea(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function getPixelsPerMm(
  page: TakeoffPlanPage | undefined,
  renderedWidth: number,
): number | null {
  if (!page || !page.isScaled) return null;
  if (page.scaleRatio) {
    const paperWidthMm = 420; // A3 assumption — Phase 2 will derive from PDF
    const pxPerPaperMm = renderedWidth / paperWidthMm;
    return pxPerPaperMm / page.scaleRatio;
  }
  if (page.calibrationPixelLength && page.calibrationRealDistance) {
    let realMm = page.calibrationRealDistance;
    if (page.calibrationUnit === "cm") realMm *= 10;
    if (page.calibrationUnit === "m") realMm *= 1000;
    if (realMm <= 0) return null;
    // calibrationPixelLength is stored as a fraction of rendered page width
    // so it stays valid at any zoom level.
    const pxAtCurrentZoom = page.calibrationPixelLength * renderedWidth;
    return pxAtCurrentZoom / realMm;
  }
  return null;
}

export function computeQuantity(
  geometry: Point[],
  type: string,
  page: TakeoffPlanPage | undefined,
  renderedWidth: number,
  renderedHeight: number,
): { quantity: number; unit: string } {
  if (type === "count") return { quantity: geometry.length, unit: "each" };
  if (type === "manual") return { quantity: 0, unit: "" };

  const pixelsPerMm = getPixelsPerMm(page, renderedWidth);
  if (pixelsPerMm === null || pixelsPerMm <= 0) return { quantity: 0, unit: "" };

  const pxPts = geometry.map((p) => ({
    x: p.x * renderedWidth,
    y: p.y * renderedHeight,
  }));
  const mmPerPx = 1 / pixelsPerMm;

  if (type === "area") {
    const areaPx2 = shoelaceArea(pxPts);
    const areaMm2 = areaPx2 * mmPerPx * mmPerPx;
    const areaM2 = areaMm2 / 1_000_000;
    return { quantity: Math.round(areaM2 * 100) / 100, unit: "m²" };
  }
  if (type === "linear") {
    const lengthPx = polylineLength(pxPts);
    const lengthM = (lengthPx * mmPerPx) / 1000;
    return { quantity: Math.round(lengthM * 100) / 100, unit: "lm" };
  }
  return { quantity: 0, unit: "" };
}

export function defaultUnitForType(type: string): string {
  if (type === "area") return "m²";
  if (type === "linear") return "lm";
  if (type === "count") return "each";
  return "";
}
