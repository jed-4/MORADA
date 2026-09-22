import { useEffect, useRef, useState } from "react";
import type { TakeoffMeasurement } from "@shared/schema";
import { normalizeEntries, entriesForPage, type Point } from "./useTakeoffGeometry";
import {
  PatternDef, lineDashArray,
  type FillPattern, type LineType,
} from "./TakeoffMeasurementFormModal";

export type DrawMode = "select" | "pan" | "area" | "linear" | "count" | "calibrate";

interface Props {
  width: number;
  height: number;
  drawMode: DrawMode;
  selectedColor: string;
  selectedFillPattern?: FillPattern;
  selectedLineType?: LineType;
  selectedLineSize?: number;
  /** Every measurement on the plan; only this page's shapes are drawn. */
  measurements: TakeoffMeasurement[];
  /** The takeoff_plan_pages id of the page on screen. */
  pageId: string | null;
  highlightedId?: string | null;
  /** Called when a polygon (area) or polyline (linear) drawing finishes (double-click). */
  onAreaComplete?: (points: Point[]) => void;
  onLinearComplete?: (points: Point[]) => void;
  /** Single click for count. */
  onCountClick?: (point: Point) => void;
  /** Calibration: two points → save pixel length. */
  onCalibrateComplete?: (a: Point, b: Point) => void;
}

/** Mid-grey at 45% — readable over white paper and over a dark plan alike. */
const CROSSHAIR = "rgba(90, 90, 90, 0.45)";

const svgPoints = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

export default function TakeoffDrawingCanvas({
  width,
  height,
  drawMode,
  selectedColor,
  selectedFillPattern = "solid",
  selectedLineType = "solid",
  selectedLineSize = 2,
  measurements,
  pageId,
  highlightedId,
  onAreaComplete,
  onLinearComplete,
  onCountClick,
  onCalibrateComplete,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [inProgressPoints, setInProgressPoints] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);

  // Reset in-progress drawing when mode changes.
  useEffect(() => {
    setInProgressPoints([]);
    setCursor(null);
  }, [drawMode]);

  // Esc cancels drawing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInProgressPoints([]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const localPoint = (e: React.MouseEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (drawMode === "select" || drawMode === "pan") return;
    const p = localPoint(e);
    if (drawMode === "count") {
      onCountClick?.(p);
      return;
    }
    if (drawMode === "calibrate") {
      if (inProgressPoints.length === 0) {
        setInProgressPoints([p]);
      } else {
        onCalibrateComplete?.(inProgressPoints[0], p);
        setInProgressPoints([]);
        setCursor(null);
      }
      return;
    }
    setInProgressPoints((prev) => [...prev, p]);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (drawMode !== "area" && drawMode !== "linear") return;
    const p = localPoint(e);
    const finalPoints = [...inProgressPoints, p];
    setInProgressPoints([]);
    setCursor(null);
    if (drawMode === "area" && finalPoints.length >= 3) {
      onAreaComplete?.(finalPoints);
    } else if (drawMode === "linear" && finalPoints.length >= 2) {
      onLinearComplete?.(finalPoints);
    }
  };

  // The cursor is tracked whenever a drawing tool is live, not just mid-shape:
  // it draws the crosshair, and it is the shape's provisional next corner.
  const handleMouseMove = (e: React.MouseEvent) => {
    setCursor(localPoint(e));
  };

  // The shape as it stands including the cursor — the corner the next click
  // would place.
  const preview = cursor ? [...inProgressPoints, cursor] : inProgressPoints;

  const interactive =
    drawMode === "area" ||
    drawMode === "linear" ||
    drawMode === "count" ||
    drawMode === "calibrate";

  // Build the list of visible area measurements that need pattern defs.
  const visibleAreaMeasurements = measurements.filter(
    (m) => m.isVisible && m.measurementType === "area",
  );

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCursor(null)}
      className="absolute top-0 left-0"
      style={{
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "crosshair" : "default",
      }}
      data-testid="takeoff-svg-overlay"
    >
      <defs>
        {visibleAreaMeasurements.map((m) => (
          <PatternDef
            key={m.id}
            id={`tk-pat-${m.id}`}
            pattern={(m.fillPattern as FillPattern) || "solid"}
            color={m.color}
          />
        ))}
        <PatternDef id="tk-pat-inprogress" pattern={selectedFillPattern} color={selectedColor} />
      </defs>

      {measurements
        .filter((m) => m.isVisible)
        .map((m) => {
          const isHighlighted = m.id === highlightedId;
          // An item spans the plan; this canvas is one page of it.
          const shapes = entriesForPage(
            normalizeEntries(m.geometry, m.pageId),
            pageId,
          ).map((e) => e.points);
          if (shapes.length === 0) return null;

          if (m.measurementType === "count") {
            const pts = shapes.flat().map((p) => ({ x: p.x * width, y: p.y * height }));
            return (
              <g key={m.id}>
                {pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={isHighlighted ? 7 : 5}
                    fill={m.color}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                ))}
              </g>
            );
          }

          const lineType = (m.lineType as LineType) || "solid";
          const baseStrokeWidth = m.lineSize ?? 2;
          const strokeWidth = isHighlighted ? baseStrokeWidth + 1 : baseStrokeWidth;
          const strokeDash = lineDashArray(lineType);

          if (m.measurementType === "area") {
            const fillPattern = (m.fillPattern as FillPattern) || "solid";
            const fill = fillPattern === "none" ? "transparent" : `url(#tk-pat-${m.id})`;
            return (
              <g key={m.id}>
                {shapes.map((shape, idx) => {
                  const pts = shape.map((p) => ({ x: p.x * width, y: p.y * height }));
                  if (pts.length < 2) return null;
                  return (
                    <polygon
                      key={idx}
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={fill}
                      stroke={m.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                    />
                  );
                })}
              </g>
            );
          }
          if (m.measurementType === "linear") {
            return (
              <g key={m.id}>
                {shapes.map((shape, idx) => {
                  const pts = shape.map((p) => ({ x: p.x * width, y: p.y * height }));
                  if (pts.length < 2) return null;
                  return (
                    <polyline
                      key={idx}
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={m.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDash}
                    />
                  );
                })}
              </g>
            );
          }
          return null;
        })}

      {/* The shape being drawn, with the cursor as its provisional last corner
          — so an area fills and closes as the mouse moves rather than only
          redrawing on each click. Committed corners keep their dots; the
          moving edge back to the first corner is dashed, because it is not
          placed yet. */}
      {inProgressPoints.length > 0 && (
        <g>
          {drawMode === "area" && preview.length >= 3 ? (
            <polygon
              points={svgPoints(preview)}
              fill={selectedFillPattern === "none" ? "transparent" : "url(#tk-pat-inprogress)"}
              stroke={selectedColor}
              strokeWidth={selectedLineSize}
              strokeDasharray={lineDashArray(selectedLineType)}
              opacity={0.85}
            />
          ) : (
            <polyline
              points={svgPoints(preview)}
              fill="none"
              stroke={selectedColor}
              strokeWidth={drawMode === "linear" ? selectedLineSize : 1.5}
              strokeDasharray={drawMode === "linear" ? lineDashArray(selectedLineType) : undefined}
            />
          )}
          {drawMode === "area" && preview.length >= 3 && cursor && (
            <line
              x1={cursor.x}
              y1={cursor.y}
              x2={inProgressPoints[0].x}
              y2={inProgressPoints[0].y}
              stroke={selectedColor}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          )}
          {inProgressPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={selectedColor} />
          ))}
        </g>
      )}

      {/* Crosshair: full-width and full-height guides through the cursor, so a
          corner can be lined up with something across the page. */}
      {interactive && cursor && (
        <g pointerEvents="none" data-testid="takeoff-crosshair">
          <line x1={0} y1={cursor.y} x2={width} y2={cursor.y} stroke={CROSSHAIR} strokeWidth={1} />
          <line x1={cursor.x} y1={0} x2={cursor.x} y2={height} stroke={CROSSHAIR} strokeWidth={1} />
        </g>
      )}
    </svg>
  );
}
