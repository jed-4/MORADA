import { useEffect, useRef, useState } from "react";
import type { TakeoffMeasurement } from "@shared/schema";
import type { Point } from "./useTakeoffGeometry";

export type DrawMode = "select" | "pan" | "area" | "linear" | "count" | "calibrate";

interface Props {
  width: number;
  height: number;
  drawMode: DrawMode;
  selectedColor: string;
  measurements: TakeoffMeasurement[];
  highlightedId?: string | null;
  /** Called when a polygon (area) or polyline (linear) drawing finishes (double-click). */
  onAreaComplete?: (points: Point[]) => void;
  onLinearComplete?: (points: Point[]) => void;
  /** Single click for count. */
  onCountClick?: (point: Point) => void;
  /** Calibration: two points → save pixel length. */
  onCalibrateComplete?: (a: Point, b: Point) => void;
}

export default function TakeoffDrawingCanvas({
  width,
  height,
  drawMode,
  selectedColor,
  measurements,
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
    setInProgressPoints((prev) => [...prev, p]);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (drawMode !== "area" && drawMode !== "linear" && drawMode !== "calibrate") return;
    const p = localPoint(e);
    const finalPoints = [...inProgressPoints, p];
    setInProgressPoints([]);
    setCursor(null);
    if (drawMode === "area" && finalPoints.length >= 3) {
      onAreaComplete?.(finalPoints);
    } else if (drawMode === "linear" && finalPoints.length >= 2) {
      onLinearComplete?.(finalPoints);
    } else if (drawMode === "calibrate" && finalPoints.length >= 2) {
      onCalibrateComplete?.(finalPoints[0], finalPoints[finalPoints.length - 1]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (inProgressPoints.length === 0) return;
    setCursor(localPoint(e));
  };

  const interactive =
    drawMode === "area" ||
    drawMode === "linear" ||
    drawMode === "count" ||
    drawMode === "calibrate";

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      className="absolute top-0 left-0"
      style={{
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "crosshair" : "default",
      }}
      data-testid="takeoff-svg-overlay"
    >
      {measurements
        .filter((m) => m.isVisible)
        .map((m) => {
          const geo = (m.geometry as Point[] | null) ?? [];
          if (!Array.isArray(geo) || geo.length === 0) return null;
          const pts = geo.map((p) => ({ x: p.x * width, y: p.y * height }));
          const isHighlighted = m.id === highlightedId;
          const strokeWidth = isHighlighted ? 3 : 1.5;

          if (m.measurementType === "area") {
            return (
              <polygon
                key={m.id}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={m.color + "33"}
                stroke={m.color}
                strokeWidth={strokeWidth}
              />
            );
          }
          if (m.measurementType === "linear") {
            return (
              <polyline
                key={m.id}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={m.color}
                strokeWidth={isHighlighted ? 3 : 2}
              />
            );
          }
          if (m.measurementType === "count") {
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
          return null;
        })}

      {inProgressPoints.length > 0 && (
        <g>
          <polyline
            points={inProgressPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={selectedColor}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          {inProgressPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={selectedColor} />
          ))}
          {cursor && (
            <line
              x1={inProgressPoints[inProgressPoints.length - 1].x}
              y1={inProgressPoints[inProgressPoints.length - 1].y}
              x2={cursor.x}
              y2={cursor.y}
              stroke={selectedColor}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          )}
        </g>
      )}
    </svg>
  );
}
