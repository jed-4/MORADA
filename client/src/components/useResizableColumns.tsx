import React, { useCallback, useSyncExternalStore } from "react";

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
//
// ORDER is opt-in via `{ reorderable: true }`, stored the same way in its own key.
// It is opt-in because a table only reorders correctly if it renders its cells by
// MAPPING over `cols` — a grid that lists its cells positionally in JSX (as the
// allowance and price-list tables do) would keep drawing them in source order
// while the headers moved. Those tables are untouched until they map.
//
// Header reordering uses native HTML5 drag, deliberately, NOT dnd-kit: grids that
// want this often already sit inside a dnd-kit DndContext for dragging ROWS, and
// nesting a second context for columns inside it fights over the same pointer.

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

const ORDER_KEY = "grid-col-order-v1";
type OrderMap = Record<string, string[]>;

let orderStore: OrderMap = (() => {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) || "{}") as OrderMap;
  } catch {
    return {};
  }
})();

function setStoredOrder(namespace: string, keys: string[]) {
  orderStore = { ...orderStore, [namespace]: keys };
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(orderStore)); } catch { /* ignore */ }
  widthListeners.forEach((l) => l());
}

function clearStoredOrder(namespace: string) {
  const { [namespace]: _drop, ...rest } = orderStore;
  orderStore = rest;
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(orderStore)); } catch { /* ignore */ }
  widthListeners.forEach((l) => l());
}

/**
 * Saved order, reconciled against the columns the table actually declares now.
 * Unknown keys (a column since removed) are dropped and new ones are appended,
 * so a stale saved layout degrades instead of hiding a column forever.
 */
function resolveOrder(namespace: string, columns: ResizableColumn[]): ResizableColumn[] {
  const saved = orderStore[namespace];
  if (!saved?.length) return columns;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const ordered: ResizableColumn[] = [];
  for (const k of saved) {
    const c = byKey.get(k);
    if (c && !c.fixed) { ordered.push(c); byKey.delete(k); }
  }
  // anything not mentioned by the saved order keeps its declared position
  const remaining = columns.filter((c) => byKey.has(c.key));
  const out: ResizableColumn[] = [];
  const movable = ordered.concat(remaining.filter((c) => !c.fixed));
  let i = 0;
  for (const c of columns) {
    if (c.fixed) out.push(c);          // fixed columns never move
    else out.push(movable[i++]);
  }
  return out;
}

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
  /**
   * Soaks up leftover horizontal space so the table reaches the right edge
   * instead of trailing off into a gap. Sized `minmax(width, 1fr)`; dragging it
   * still works because the drag sets the minimum. At most one column should
   * set this — the first that does wins.
   */
  flex?: boolean;
  /** Never moves and never resizes — e.g. a drag-handle or checkbox column. */
  fixed?: boolean;
};

/**
 * Drag-to-resize columns for a bespoke grid, widths persisted per `namespace`.
 * Returns helpers to read a column's current width, start a drag, and build the
 * grid-template + min-width for the scroll container.
 */
export function useResizableColumns(
  namespace: string,
  columns: ResizableColumn[],
  trailingPx = 0,
  options: { reorderable?: boolean } = {},
) {
  const widths = useSyncExternalStore(subscribe, () => widthStore, () => widthStore);
  const order = useSyncExternalStore(subscribe, () => orderStore, () => orderStore);

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

  const ordered = options.reorderable ? resolveOrder(namespace, columns) : columns;
  const cols = ordered.map((c) => ({ ...c, width: widthFor(c.key, c.defaultWidth) }));

  /** Move `key` so it sits where `beforeKey` currently is. */
  const moveColumn = useCallback(
    (key: string, beforeKey: string) => {
      if (key === beforeKey) return;
      const movable = (options.reorderable ? resolveOrder(namespace, columns) : columns)
        .filter((c) => !c.fixed)
        .map((c) => c.key);
      const from = movable.indexOf(key);
      const to = movable.indexOf(beforeKey);
      if (from < 0 || to < 0) return;
      movable.splice(to, 0, movable.splice(from, 1)[0]);
      setStoredOrder(namespace, movable);
    },
    [namespace, columns, options.reorderable],
  );

  const resetOrder = useCallback(() => clearStoredOrder(namespace), [namespace]);

  /**
   * Spread onto a header cell to make it draggable. Native HTML5 drag — see the
   * note at the top of this file for why not dnd-kit.
   */
  const headerDragProps = (key: string) => {
    const col = cols.find((c) => c.key === key);
    if (!options.reorderable || col?.fixed) return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/x-morada-col", key);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("text/x-morada-col")) return;
        e.preventDefault();                       // required or drop never fires
        e.dataTransfer.dropEffect = "move";
      },
      onDrop: (e: React.DragEvent) => {
        const from = e.dataTransfer.getData("text/x-morada-col");
        if (!from) return;
        e.preventDefault();
        e.stopPropagation();                      // don't let a row DnD see it
        moveColumn(from, key);
      },
    };
  };

  // A flex column is sized minmax(px, 1fr) so the table still reaches the right
  // edge; every other column keeps its exact saved width.
  const flexKey = cols.find((c) => c.flex)?.key;
  const gridTemplate =
    cols
      .map((c) => (c.key === flexKey ? `minmax(${c.width}px, 1fr)` : `${c.width}px`))
      .join(" ") + (trailingPx ? ` ${trailingPx}px` : "");
  const minWidth = cols.reduce((s, c) => s + c.width, 0) + trailingPx;

  return { widthFor, startResize, gridTemplate, minWidth, cols, moveColumn, resetOrder, headerDragProps };
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
