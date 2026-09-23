import type { TakeoffPlanPage } from "@shared/schema";

export type Point = { x: number; y: number };

export function pixelsToFractions(pts: Point[], w: number, h: number): Point[] {
  if (w <= 0 || h <= 0) return pts.map(() => ({ x: 0, y: 0 }));
  return pts.map((p) => ({ x: p.x / w, y: p.y / h }));
}

export function fractionsToPixels(pts: Point[], w: number, h: number): Point[] {
  return pts.map((p) => ({ x: p.x * w, y: p.y * h }));
}

/**
 * One drawn shape, and the plan page it was drawn on.
 *
 * A measurement is one item in the take-off list — "Wall tiles" — and it is
 * measured across the whole plan, not per page: mark it on the ground floor
 * and again on the first floor and both add to the one row. So each shape
 * carries its own page, and `qty` carries what that shape measured on that
 * page. The quantity has to be kept per shape because each page has its own
 * scale: 1:100 on one sheet and 1:50 on the next give different metres for the
 * same number of pixels, and there is no way to re-derive a shape's size once
 * you are looking at a different page.
 */
export type Shape = {
  /** The takeoff_plan_pages id this shape was drawn on. */
  pageId: string | null;
  points: Point[];
  /** m² / lm / count for this shape alone, at its own page's scale. */
  qty: number;
};

/**
 * Read any of the three geometry shapes that exist in the wild:
 *   - `[{pageId, points, qty}]`  — current
 *   - `[[{x,y}, …], …]`          — sub-shapes, all on the measurement's own page
 *   - `[{x,y}, …]`               — one shape (and how count markers were stored)
 *
 * `homePageId` is the measurement's `pageId` column, which is where everything
 * drawn before pages were tracked per shape must have been.
 */
export function normalizeEntries(geometry: unknown, homePageId: string | null): Shape[] {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];
  const first: any = geometry[0];
  if (first && typeof first === "object" && Array.isArray(first.points)) {
    return (geometry as any[])
      .filter((e) => e && Array.isArray(e.points) && e.points.length > 0)
      .map((e) => ({
        pageId: e.pageId ?? homePageId,
        points: e.points as Point[],
        qty: Number(e.qty) || 0,
      }));
  }
  return normalizeShapes(geometry).map((points) => ({ pageId: homePageId, points, qty: 0 }));
}

/** The shapes drawn on one page — what that page's canvas draws and hit-tests. */
export function entriesForPage(entries: Shape[], pageId: string | null | undefined): Shape[] {
  if (!pageId) return [];
  return entries.filter((e) => e.pageId === pageId);
}

/**
 * The item's quantity across every page.
 *
 * Count is the number of markers. Everything else sums the per-shape
 * quantities, then applies a height if the item has one (a wall run measured
 * as a line: metres x height = m²).
 */
export function totalQuantity(
  entries: Shape[],
  type: string,
  heightMm?: number | null,
): number {
  if (type === "count") return entries.reduce((n, e) => n + e.points.length, 0);
  const base = entries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
  const scaled = type === "linear" && heightMm ? base * (heightMm / 1000) : base;
  return Math.round(scaled * 100) / 100;
}

/** The unit a linear item reports: m² once it has a height, lm without one. */
export function unitForLinear(heightMm?: number | null, fallback = "lm"): string {
  return heightMm ? "m²" : fallback;
}

/**
 * Normalize a measurement's geometry to an array of shapes (Point[][]).
 * Supports legacy single-shape geometry (Point[]) and multi-shape (Point[][]).
 * Used by area/linear measurements which can have multiple sub-shapes.
 */
export function normalizeShapes(geometry: unknown): Point[][] {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];
  // Multi-shape: first item is itself an array of points.
  if (Array.isArray((geometry as any[])[0])) {
    return (geometry as Point[][]).filter((s) => Array.isArray(s) && s.length > 0);
  }
  // Legacy single-shape: wrap.
  return [geometry as Point[]];
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
  pageWidthMm: number,
): number | null {
  if (!page || !page.isScaled) return null;
  if (page.scaleRatio) {
    const paperWidthMm = pageWidthMm > 0 ? pageWidthMm : 420;
    const pxPerPaperMm = renderedWidth / paperWidthMm;
    return pxPerPaperMm / page.scaleRatio;
  }
  if (page.calibrationPixelLength && page.calibrationRealDistance) {
    let realMm = page.calibrationRealDistance;
    if (page.calibrationUnit === "cm") realMm *= 10;
    if (page.calibrationUnit === "m") realMm *= 1000;
    if (realMm <= 0) return null;
    const pxAtCurrentZoom = page.calibrationPixelLength * renderedWidth;
    return pxAtCurrentZoom / realMm;
  }
  return null;
}

export function computeQuantity(
  geometry: Point[] | Point[][],
  type: string,
  page: TakeoffPlanPage | undefined,
  renderedWidth: number,
  renderedHeight: number,
  pageWidthMm: number = 420,
): { quantity: number; unit: string } {
  // For count + manual + dimension, geometry is always a flat Point[].
  if (type === "count") {
    const flat = Array.isArray(geometry) && Array.isArray((geometry as any[])[0])
      ? (geometry as Point[][]).flat()
      : (geometry as Point[]);
    return { quantity: flat.length, unit: "each" };
  }
  if (type === "manual") return { quantity: 0, unit: "" };

  const pixelsPerMm = getPixelsPerMm(page, renderedWidth, pageWidthMm);
  if (pixelsPerMm === null || pixelsPerMm <= 0) return { quantity: 0, unit: "" };

  const mmPerPx = 1 / pixelsPerMm;
  const shapes: Point[][] =
    type === "dimension"
      ? [geometry as Point[]]
      : (Array.isArray(geometry) && Array.isArray((geometry as any[])[0])
          ? (geometry as Point[][])
          : [geometry as Point[]]);

  const toPx = (pts: Point[]) =>
    pts.map((p) => ({ x: p.x * renderedWidth, y: p.y * renderedHeight }));

  if (type === "area") {
    let totalM2 = 0;
    for (const s of shapes) {
      const areaPx2 = shoelaceArea(toPx(s));
      totalM2 += (areaPx2 * mmPerPx * mmPerPx) / 1_000_000;
    }
    return { quantity: Math.round(totalM2 * 100) / 100, unit: "m²" };
  }
  if (type === "linear" || type === "dimension") {
    let totalM = 0;
    for (const s of shapes) {
      totalM += (polylineLength(toPx(s)) * mmPerPx) / 1000;
    }
    return { quantity: Math.round(totalM * 100) / 100, unit: "lm" };
  }
  return { quantity: 0, unit: "" };
}

export function defaultUnitForType(type: string): string {
  if (type === "area") return "m²";
  if (type === "linear") return "lm";
  if (type === "count") return "each";
  return "";
}

// Hit-testing helpers (operate in pixel coordinates).
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function distanceToPolyline(p: Point, pts: Point[]): number {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceToSegment(p, pts[i - 1], pts[i]);
    if (d < min) min = d;
  }
  return min;
}
