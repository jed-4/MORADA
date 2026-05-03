import { useEffect, useRef, useState } from "react";
import type { TakeoffMarkup } from "@shared/schema";
import type { Point } from "./useTakeoffGeometry";

export type MarkupMode = null | "dimension" | "cloud" | "text" | "brush";

interface Props {
  width: number;
  height: number;
  markupMode: MarkupMode;
  selectedColor: string;
  markups: TakeoffMarkup[];
  visible: boolean;
  formatDimensionLabel: (a: Point, b: Point) => string;
  onCreate: (data: {
    markupType: "dimension" | "cloud" | "text" | "brush";
    color: string;
    geometry: Point[];
    label?: string | null;
  }) => void;
  onUpdate: (id: string, data: Partial<TakeoffMarkup>) => void;
  onDelete: (id: string) => void;
}

export default function TakeoffMarkupCanvas({
  width,
  height,
  markupMode,
  selectedColor,
  markups,
  visible,
  formatDimensionLabel,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [inProgress, setInProgress] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [brushDrawing, setBrushDrawing] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");

  useEffect(() => {
    setInProgress([]);
    setCursor(null);
  }, [markupMode]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInProgress([]);
        setCursor(null);
        setBrushDrawing(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const localPoint = (e: React.MouseEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const toFractions = (pts: Point[]): Point[] =>
    pts.map((p) => ({ x: p.x / width, y: p.y / height }));

  const handleClick = (e: React.MouseEvent) => {
    if (!markupMode) return;
    const p = localPoint(e);
    if (markupMode === "text") {
      onCreate({
        markupType: "text",
        color: selectedColor,
        geometry: toFractions([p]),
        label: "Text",
      });
      return;
    }
    if (markupMode === "dimension" || markupMode === "cloud") {
      setInProgress((prev) => [...prev, p]);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (markupMode !== "dimension" && markupMode !== "cloud") return;
    const p = localPoint(e);
    const final = [...inProgress, p];
    setInProgress([]);
    setCursor(null);
    if (markupMode === "dimension" && final.length >= 2) {
      const a = final[0];
      const b = final[final.length - 1];
      const label = formatDimensionLabel(a, b);
      onCreate({
        markupType: "dimension",
        color: selectedColor,
        geometry: toFractions([a, b]),
        label,
      });
    } else if (markupMode === "cloud" && final.length >= 3) {
      onCreate({
        markupType: "cloud",
        color: selectedColor,
        geometry: toFractions(final),
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (markupMode !== "brush") return;
    const p = localPoint(e);
    setBrushDrawing(true);
    setInProgress([p]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (markupMode === "brush" && brushDrawing) {
      setInProgress((prev) => [...prev, localPoint(e)]);
      return;
    }
    if (inProgress.length > 0) setCursor(localPoint(e));
  };

  const handleMouseUp = () => {
    if (markupMode !== "brush" || !brushDrawing) return;
    setBrushDrawing(false);
    if (inProgress.length > 1) {
      onCreate({
        markupType: "brush",
        color: selectedColor,
        geometry: toFractions(inProgress),
      });
    }
    setInProgress([]);
  };

  const interactive = !!markupMode;

  // Build SVG path for a "revision cloud" along polygon edges.
  const cloudPath = (pts: Point[]): string => {
    if (pts.length < 2) return "";
    const arcRadius = 8;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    const ring = [...pts, pts[0]];
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1];
      const b = ring[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const segs = Math.max(1, Math.round(len / (arcRadius * 2)));
      for (let s = 1; s <= segs; s++) {
        const tx = a.x + (dx * s) / segs;
        const ty = a.y + (dy * s) / segs;
        d += ` A ${arcRadius} ${arcRadius} 0 0 1 ${tx} ${ty}`;
      }
    }
    return d + " Z";
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="absolute top-0 left-0"
      style={{
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "crosshair" : "default",
        display: visible ? "block" : "none",
      }}
      data-testid="takeoff-markup-overlay"
    >
      {markups.map((m) => {
        const geo = (m.geometry as Point[] | null) ?? [];
        if (!Array.isArray(geo) || geo.length === 0) return null;
        const pts = geo.map((p) => ({ x: p.x * width, y: p.y * height }));

        if (m.markupType === "dimension" && pts.length >= 2) {
          const a = pts[0];
          const b = pts[pts.length - 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const cap = 6;
          const mx = (a.x + b.x) / 2 + nx * 12;
          const my = (a.y + b.y) / 2 + ny * 12;
          return (
            <g
              key={m.id}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTextId(m.id);
                setEditingTextValue(m.label ?? "");
              }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={m.color} strokeWidth={m.strokeWidth ?? 2} />
              <line x1={a.x + nx * cap} y1={a.y + ny * cap} x2={a.x - nx * cap} y2={a.y - ny * cap} stroke={m.color} strokeWidth={m.strokeWidth ?? 2} />
              <line x1={b.x + nx * cap} y1={b.y + ny * cap} x2={b.x - nx * cap} y2={b.y - ny * cap} stroke={m.color} strokeWidth={m.strokeWidth ?? 2} />
              {editingTextId === m.id ? (
                <foreignObject x={mx - 50} y={my - 12} width={100} height={24}>
                  <input
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={() => {
                      onUpdate(m.id, { label: editingTextValue });
                      setEditingTextId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="text-xs px-1 w-full border border-border rounded-sm"
                  />
                </foreignObject>
              ) : (
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  fontSize={12}
                  fill={m.color}
                  style={{ paintOrder: "stroke" }}
                  stroke="white"
                  strokeWidth={3}
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        }

        if (m.markupType === "cloud" && pts.length >= 3) {
          return (
            <path
              key={m.id}
              d={cloudPath(pts)}
              fill={m.color + "1A"}
              stroke={m.color}
              strokeWidth={m.strokeWidth ?? 2}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            />
          );
        }

        if (m.markupType === "text" && pts.length >= 1) {
          const p = pts[0];
          return (
            <g
              key={m.id}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTextId(m.id);
                setEditingTextValue(m.label ?? "");
              }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            >
              {editingTextId === m.id ? (
                <foreignObject x={p.x - 60} y={p.y - 12} width={140} height={26}>
                  <input
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={() => {
                      onUpdate(m.id, { label: editingTextValue });
                      setEditingTextId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="text-xs px-1 w-full border border-border rounded-sm bg-background"
                  />
                </foreignObject>
              ) : (
                <>
                  <rect x={p.x - 4} y={p.y - 14} rx={2} width={(m.label?.length ?? 4) * 7 + 10} height={20} fill="white" fillOpacity={0.85} stroke={m.color} strokeWidth={1} />
                  <text x={p.x + 2} y={p.y} fontSize={m.fontSize ?? 14} fill={m.color}>
                    {m.label || "Text"}
                  </text>
                </>
              )}
            </g>
          );
        }

        if (m.markupType === "brush" && pts.length >= 2) {
          return (
            <polyline
              key={m.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={m.color}
              strokeWidth={m.strokeWidth ?? 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            />
          );
        }
        return null;
      })}

      {inProgress.length > 0 && (
        <g>
          {markupMode === "brush" ? (
            <polyline
              points={inProgress.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={selectedColor}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : (
            <>
              <polyline
                points={inProgress.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={selectedColor}
                strokeWidth={1.5}
                strokeDasharray="6 3"
              />
              {inProgress.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={selectedColor} />
              ))}
              {cursor && (
                <line
                  x1={inProgress[inProgress.length - 1].x}
                  y1={inProgress[inProgress.length - 1].y}
                  x2={cursor.x}
                  y2={cursor.y}
                  stroke={selectedColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.6}
                />
              )}
            </>
          )}
        </g>
      )}
    </svg>
  );
}
