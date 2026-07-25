import { useCallback, useSyncExternalStore } from "react";

// ─── Shared, generalised column-resize mechanism ──────────────────────────────
// Extracted from LineItemsTable so any bespoke grid (allowance timesheets, bills,
// …) can have drag-to-resize columns whose widths persist and stay in sync across
// every mounted instance. Each table passes a `namespace` so its widths live in
// their own slot and never collide with another table's.
//
// Widths are fixed PIXELS (a grid can only be dragged if its columns are pixel
// sized, not `fr`). Persisted to one localStorage key, keyed `${namespace}:${col}`.
// useSyncExternalStore keeps all instances live during a drag.
//
// NOTE: LineItemsTable keeps its own older store (key "line-items-col-widths-v1")
// so its already-saved widths aren't reset; it can be migrated onto this later.

const MIN_COL_WIDTH = 48;
const WIDTHS_KEY = "grid-col-widths-v1";
type WidthMap = Record<string, number>;

let widthStore: WidthMap = (() => {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) || "{}") as WidthMap;
  } catch {
    return {};
  }
})();
const widthListeners = new Set<() => void>();

function setStoredWidth(fullKey: string, width: number) {
  widthStore = { ...widthStore, [fullKey]: Math.max(MIN_COL_WIDTH, Math.round(width)) };
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widthStore)); } catch { /* ignore */ }
  widthListeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  widthListeners.add(l);
  return () => { widthListeners.delete(l); };
}

export type ResizableColumn = {
  key: string;
  defaultWidth: number; // px
};

/**
 * Drag-to-resize columns for a bespoke grid, widths persisted per `namespace`.
 * Returns helpers to read a column's current width, start a drag, and build the
 * grid-template + min-width for the scroll container.
 */
export function useResizableColumns(namespace: string, columns: ResizableColumn[], trailingPx = 0) {
  const widths = useSyncExternalStore(subscribe, () => widthStore, () => widthStore);

  const widthFor = (key: string, defaultWidth: number) =>
    widths[`${namespace}:${key}`] ?? defaultWidth;

  const startResize = useCallback(
    (key: string, startX: number, startWidth: number) => {
      const fullKey = `${namespace}:${key}`;
      const onMove = (e: MouseEvent) => setStoredWidth(fullKey, startWidth + (e.clientX - startX));
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [namespace],
  );

  const cols = columns.map((c) => ({ ...c, width: widthFor(c.key, c.defaultWidth) }));
  const gridTemplate =
    cols.map((c) => `${c.width}px`).join(" ") + (trailingPx ? ` ${trailingPx}px` : "");
  const minWidth = cols.reduce((s, c) => s + c.width, 0) + trailingPx;

  return { widthFor, startResize, gridTemplate, minWidth, cols };
}

/** The draggable divider drawn on a header cell's right edge. */
export function ColResizeHandle({
  onStart,
  testId,
}: {
  onStart: (e: React.MouseEvent) => void;
  testId?: string;
}) {
  return (
    <span
      onMouseDown={(e) => {
        e.preventDefault();
        onStart(e);
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1/2 -translate-y-1/2 -right-[5px] h-4 w-[9px] cursor-col-resize flex items-center justify-center group/resize z-10"
      title="Drag to resize"
      data-testid={testId}
    >
      <span className="h-3.5 w-px bg-border group-hover/resize:bg-primary transition-colors" />
    </span>
  );
}
