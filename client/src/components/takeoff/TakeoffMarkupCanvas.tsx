import { useEffect, useRef, useState } from "react";
import type { TakeoffMarkup } from "@shared/schema";
import type { Point } from "./useTakeoffGeometry";

export type MarkupMode = null | "dimension" | "cloud" | "text" | "brush";

interface Props {
  width: number;
  height: number;
  markupMode: MarkupMode;
  selectedColor: string;
  brushSize?: number;
  brushOpacity?: number;
  /** True when the parent's drawMode is "select" and no markup tool is
   *  active — enables click-to-select / drag / delete on existing markups. */
  selectMode?: boolean;
  /** Controlled selection — id of the currently-selected markup (or null). */
  selectedMarkupId?: string | null;
  /** Called when the selected markup changes (or background clears it). */
  onSelectMarkup?: (id: string | null) => void;
  markups: TakeoffMarkup[];
  visible: boolean;
  formatDimensionLabel: (a: Point, b: Point) => string;
  onCreate: (data: {
    markupType: "dimension" | "cloud" | "text" | "brush";
    color: string;
    geometry: Point[];
    label?: string | null;
    strokeWidth?: number;
  }) => void;
  onUpdate: (id: string, data: Partial<TakeoffMarkup>) => void;
  onDelete: (id: string) => void;
}

function stripAlpha(hex: string): string {
  if (typeof hex !== "string") return "#000000";
  if (/^#[0-9A-Fa-f]{8}$/.test(hex)) return hex.slice(0, 7);
  return hex;
}

function withAlpha(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  const a = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  return hex + a.toString(16).padStart(2, "0").toUpperCase();
}

export default function TakeoffMarkupCanvas({
  width,
  height,
  markupMode,
  selectedColor,
  brushSize = 4,
  brushOpacity = 1,
  selectMode = false,
  selectedMarkupId: selectedMarkupIdProp,
  onSelectMarkup,
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
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [internalSelectedMarkupId, setInternalSelectedMarkupId] = useState<string | null>(null);
  const selectedMarkupId = selectedMarkupIdProp !== undefined ? selectedMarkupIdProp : internalSelectedMarkupId;
  const setSelectedMarkupId = (id: string | null) => {
    if (onSelectMarkup) onSelectMarkup(id);
    if (selectedMarkupIdProp === undefined) setInternalSelectedMarkupId(id);
  };
  const [dragState, setDragState] = useState<{
    id: string; startX: number; startY: number; moved: boolean;
  } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Reset transient state when the active mode changes.
  useEffect(() => {
    setInProgress([]);
    setCursor(null);
    setPendingText(null);
    setEditingTextId(null);
    if (markupMode) setSelectedMarkupId(null);
  }, [markupMode]);

  // Global keyboard handler — Escape clears, Delete/Backspace removes selection.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInProgress([]);
        setCursor(null);
        setBrushDrawing(false);
        setPendingText(null);
        setEditingTextId(null);
        setSelectedMarkupId(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement | null;
        const inField = !!target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as any).isContentEditable
        );
        if (inField) return;
        if (selectedMarkupId) {
          e.preventDefault();
          onDelete(selectedMarkupId);
          setSelectedMarkupId(null);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedMarkupId, onDelete]);

  // Window-level drag tracking so dragging works even when the SVG has
  // pointer-events: none in select mode.
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      setDragDelta({ dx, dy });
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 3) {
        setDragState({ ...dragState, moved: true });
      }
    };
    const onUp = (e: MouseEvent) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      const moved = dragState.moved || Math.abs(dx) + Math.abs(dy) > 3;
      const m = markups.find((mm) => mm.id === dragState.id);
      if (moved && m) {
        const geo = (m.geometry as Point[] | null) ?? [];
        if (Array.isArray(geo) && geo.length >= 1) {
          const newPt = {
            x: Math.max(0, Math.min(1, geo[0].x + dx / width)),
            y: Math.max(0, Math.min(1, geo[0].y + dy / height)),
          };
          onUpdate(dragState.id, { geometry: [newPt] as any });
        }
      } else if (m && m.markupType === "text") {
        // Treat a no-movement mouse-up as a click → enter edit mode.
        setEditingTextId(m.id);
        setEditingTextValue(m.label ?? "");
      }
      setDragState(null);
      setDragDelta({ dx: 0, dy: 0 });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, markups, onUpdate, width, height]);

  const localPoint = (e: React.MouseEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const toFractions = (pts: Point[]): Point[] =>
    pts.map((p) => ({ x: p.x / width, y: p.y / height }));

  const commitPendingText = () => {
    if (!pendingText) return;
    const trimmed = pendingText.value.trim();
    if (trimmed.length > 0) {
      onCreate({
        markupType: "text",
        color: selectedColor,
        geometry: toFractions([{ x: pendingText.x, y: pendingText.y }]),
        label: trimmed,
      });
    }
    setPendingText(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!markupMode) {
      // Background click in select mode clears any current selection.
      if (selectMode) setSelectedMarkupId(null);
      return;
    }
    const p = localPoint(e);
    if (markupMode === "text") {
      // First commit any pending text from a previous click before opening a
      // new one at the new position.
      commitPendingText();
      setPendingText({ x: p.x, y: p.y, value: "" });
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
        color: withAlpha(selectedColor, brushOpacity),
        geometry: toFractions(inProgress),
        strokeWidth: brushSize,
      });
    }
    setInProgress([]);
  };

  // SVG captures background events when actively creating a markup. In
  // select mode the background is non-interactive but individual markup
  // elements re-enable pointer-events on themselves.
  const svgInteractive = !!markupMode;

  // When a text element is being dragged, its rendered position picks up
  // the live drag delta so it follows the cursor smoothly.
  const liveOffset = (id: string) =>
    dragState && dragState.id === id && dragState.moved
      ? { dx: dragDelta.dx, dy: dragDelta.dy }
      : { dx: 0, dy: 0 };

  const startDrag = (id: string, e: React.MouseEvent) => {
    if (!selectMode) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedMarkupId(id);
    setDragState({ id, startX: e.clientX, startY: e.clientY, moved: false });
  };

  const selectMarkup = (id: string, e: React.MouseEvent) => {
    if (!selectMode) return;
    e.stopPropagation();
    if (selectedMarkupId !== id) setSelectedMarkupId(id);
  };

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
        pointerEvents: svgInteractive ? "auto" : "none",
        cursor: svgInteractive ? "crosshair" : "default",
        display: visible ? "block" : "none",
      }}
      data-testid="takeoff-markup-overlay"
    >
      {markups.map((m) => {
        const geo = (m.geometry as Point[] | null) ?? [];
        if (!Array.isArray(geo) || geo.length === 0) return null;
        const pts = geo.map((p) => ({ x: p.x * width, y: p.y * height }));
        const isSelected = selectedMarkupId === m.id;
        const baseStroke = m.strokeWidth ?? 2;
        const strokeWidth = isSelected ? baseStroke + 1 : baseStroke;
        const interactiveStyle = {
          pointerEvents: "auto" as const,
          cursor: selectMode ? "pointer" as const : "default" as const,
        };

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
              style={interactiveStyle}
              onClick={(e) => selectMarkup(m.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTextId(m.id);
                setEditingTextValue(m.label ?? "");
              }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={m.color} strokeWidth={strokeWidth} />
              <line x1={a.x + nx * cap} y1={a.y + ny * cap} x2={a.x - nx * cap} y2={a.y - ny * cap} stroke={m.color} strokeWidth={strokeWidth} />
              <line x1={b.x + nx * cap} y1={b.y + ny * cap} x2={b.x - nx * cap} y2={b.y - ny * cap} stroke={m.color} strokeWidth={strokeWidth} />
              {isSelected && (
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={m.color} strokeWidth={strokeWidth + 4}
                  strokeOpacity={0.2}
                />
              )}
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
            <g key={m.id} style={interactiveStyle} onClick={(e) => selectMarkup(m.id, e)}>
              <path
                d={cloudPath(pts)}
                fill={stripAlpha(m.color) + "1A"}
                stroke={m.color}
                strokeWidth={strokeWidth}
                onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
              />
              {isSelected && (
                <path
                  d={cloudPath(pts)}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={strokeWidth + 4}
                  strokeOpacity={0.2}
                />
              )}
            </g>
          );
        }

        if (m.markupType === "text" && pts.length >= 1) {
          const baseP = pts[0];
          const off = liveOffset(m.id);
          const p = { x: baseP.x + off.dx, y: baseP.y + off.dy };
          const labelText = m.label ?? "";
          const isEditing = editingTextId === m.id;
          return (
            <g
              key={m.id}
              style={interactiveStyle}
              onClick={(e) => {
                // Stop the synthesized click after mousedown from bubbling up
                // to the parent (which would re-run measurement hit-testing).
                if (selectMode) e.stopPropagation();
              }}
              onMouseDown={(e) => {
                if (isEditing) return;
                startDrag(m.id, e);
              }}
              onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
            >
              {isSelected && !isEditing && (
                <rect
                  x={p.x - 6}
                  y={p.y - 16}
                  rx={3}
                  width={Math.max(40, labelText.length * 8 + 14)}
                  height={24}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              )}
              {isEditing ? (
                <foreignObject x={p.x - 4} y={p.y - 16} width={Math.max(140, labelText.length * 9 + 30)} height={26}>
                  <input
                    autoFocus
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={() => {
                      const trimmed = editingTextValue.trim();
                      if (trimmed.length === 0) {
                        // Empty text → delete the markup.
                        onDelete(m.id);
                      } else if (trimmed !== labelText) {
                        onUpdate(m.id, { label: trimmed });
                      }
                      setEditingTextId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") {
                        setEditingTextValue(labelText);
                        setEditingTextId(null);
                      }
                      if ((e.key === "Backspace" || e.key === "Delete") && editingTextValue.length === 0) {
                        e.preventDefault();
                        setEditingTextId(null);
                        onDelete(m.id);
                      }
                    }}
                    className="text-xs px-1 w-full border border-border rounded-sm bg-background"
                  />
                </foreignObject>
              ) : (
                <>
                  <rect
                    x={p.x - 4}
                    y={p.y - 14}
                    rx={2}
                    width={Math.max(20, labelText.length * 7 + 10)}
                    height={20}
                    fill="white"
                    fillOpacity={0.85}
                    stroke={m.color}
                    strokeWidth={1}
                  />
                  <text x={p.x + 2} y={p.y} fontSize={m.fontSize ?? 14} fill={m.color}>
                    {labelText || "Text"}
                  </text>
                </>
              )}
            </g>
          );
        }

        if (m.markupType === "brush" && pts.length >= 2) {
          return (
            <g key={m.id} style={interactiveStyle} onClick={(e) => selectMarkup(m.id, e)}>
              <polyline
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={m.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                onContextMenu={(e) => { e.preventDefault(); onDelete(m.id); }}
              />
              {isSelected && (
                <polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={strokeWidth + 4}
                  strokeOpacity={0.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          );
        }
        return null;
      })}

      {/* In-progress drawing for dimension/cloud/brush */}
      {inProgress.length > 0 && (
        <g style={{ pointerEvents: "none" }}>
          {markupMode === "brush" ? (
            <polyline
              points={inProgress.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={withAlpha(selectedColor, brushOpacity)}
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
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

      {/* Pending text input — drops a text label exactly at the click position */}
      {pendingText && (
        <foreignObject
          x={pendingText.x - 4}
          y={pendingText.y - 16}
          width={200}
          height={28}
          style={{ pointerEvents: "auto" }}
        >
          <input
            autoFocus
            value={pendingText.value}
            onChange={(e) =>
              setPendingText({ ...pendingText, value: e.target.value })
            }
            onBlur={commitPendingText}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                e.preventDefault();
                setPendingText(null);
              }
            }}
            placeholder="Type text…"
            className="text-xs px-1 w-full border rounded-sm bg-background"
            style={{ borderColor: selectedColor }}
          />
        </foreignObject>
      )}
    </svg>
  );
}
