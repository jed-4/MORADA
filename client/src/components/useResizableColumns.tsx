import React, { useCallback, useState, useSyncExternalStore } from "react";

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

/**
 * The column currently being dragged. Module-level rather than React state
 * because the dragover handler needs it synchronously on every pointer move,
 * and because only one column can be dragged at a time anywhere on the page.
 */
let draggingKey: string | null = null;

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
   * DEPRECATED, now ignored. It made the column soak up leftover width
   * (`minmax(width, 1fr)`), which made resizing feel backwards: widening a
   * column to its right shrank this one instead, so the dragged column grew
   * LEFTWARD under a stationary edge, and dragging this column's own edge did
   * nothing until it passed the stretched width. Columns now behave like
   * Google Sheets (see gridTemplate below). Kept so old call sites compile.
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
  // Purely for the "this one is moving" style. It cannot ride on the stores
  // above: useSyncExternalStore only re-renders when the SNAPSHOT changes, and
  // starting a drag changes neither widths nor order, so notifying its
  // listeners did nothing at all.
  const [dragVisual, setDragVisual] = useState<string | null>(null);

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
        draggingKey = key;
        setDragVisual(key);
        e.dataTransfer.setData("text/x-morada-col", key);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: React.DragEvent) => {
        if (!draggingKey) return;
        e.preventDefault();                        // required or the drag is rejected
        e.dataTransfer.dropEffect = "move";
        // Reorder AS YOU DRAG rather than on drop. Waiting for the drop meant
        // nothing moved until you let go, so there was no sign the column was
        // going anywhere. Committing here also stops the whole interaction
        // depending on a `drop` event firing, which is the least reliable part
        // of HTML5 drag-and-drop.
        if (draggingKey !== key) moveColumn(draggingKey, key);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();                       // don't let a row DnD see it
        draggingKey = null;
        setDragVisual(null);
      },
      onDragEnd: () => {
        // Fires even when the drop lands outside a header, so the dragging
        // style can never get stuck on.
        draggingKey = null;
        setDragVisual(null);
      },
      "data-dragging": dragVisual === key ? "true" : undefined,
    };
  };

  // Google Sheets behaviour: every column is exactly its own width, so dragging
  // an edge moves only that edge and everything to its right slides along.
  // Leftover space is an EMPTY track at the very end — nothing stretches. Rows
  // never put a cell in it. Wider than the screen → the grid scrolls sideways
  // (callers give the grid `minWidth`).
  const gridTemplate =
    cols.map((c) => `${c.width}px`).join(" ") +
    (trailingPx ? ` ${trailingPx}px` : "") +
    " minmax(0, 1fr)";
  const minWidth = cols.reduce((s, c) => s + c.width, 0) + trailingPx;

  /** Set a column's width outright (double-click to fit). */
  const setWidth = useCallback(
    (key: string, width: number) => setStoredWidth(`${namespace}:${key}`, width),
    [namespace],
  );

  return { widthFor, startResize, setWidth, gridTemplate, minWidth, cols, moveColumn, resetOrder, headerDragProps, draggingKey: dragVisual };
}

/**
 * Double-click a column edge to fit it to its contents, like Google Sheets.
 * Given the resize handle, finds its header cell, then the same column's cell
 * in every row drawn with the SAME grid template, and measures the widest
 * text / control in them. Generic over the bespoke grids because they all
 * render header and rows as CSS grids with one child per column.
 */
export function fitWidthFromHandle(handle: HTMLElement, maxPx = 640): number | null {
  const headCell = handle.parentElement;
  const grid = headCell?.parentElement;
  if (!headCell || !grid) return null;
  const index = Array.prototype.indexOf.call(grid.children, headCell);
  const template = grid.style.gridTemplateColumns;
  if (index < 0 || !template) return null;
  const cells: Element[] = [headCell];
  document.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    if (el !== grid && el.style.gridTemplateColumns === template && el.children[index]) cells.push(el.children[index]);
  });
  // Text is measured at its natural one-line width with its own font, so a
  // truncated ("…") or wrapped (line-clamp) cell still reports how wide its
  // text really is, not how wide the column happens to be now.
  const ctx = document.createElement("canvas").getContext("2d");
  let widest = 0;
  for (const cell of cells) {
    const left = cell.getBoundingClientRect().left;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      const parent = n.parentElement;
      if (!text.trim() || !parent || !ctx) continue;
      const cs = getComputedStyle(parent);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const spacing = parseFloat(cs.letterSpacing) || 0;
      const lineWidth = Math.max(
        ...text.split("\n").map((line) => {
          const shown = cs.textTransform === "uppercase" ? line.toUpperCase() : line;
          return ctx.measureText(shown).width + spacing * shown.length;
        }),
      );
      const start = parent.getBoundingClientRect().left - left + (parseFloat(cs.paddingLeft) || 0);
      widest = Math.max(widest, start + lineWidth);
    }
    // Icons, checkboxes, pills — but not full-width text inputs, which are
    // as wide as the column whatever is in them.
    cell.querySelectorAll("svg, button, [role=checkbox], input[type=checkbox]").forEach((el) => {
      widest = Math.max(widest, el.getBoundingClientRect().right - left);
    });
  }
  if (widest <= 0) return null;
  return Math.min(maxPx, Math.max(MIN_COL_WIDTH, Math.ceil(widest + 14)));
}

/** The draggable divider drawn on a header cell's right edge. */
export function ColResizeHandle({
  onStart,
  onFit,
  testId,
}: {
  onStart: (e: React.MouseEvent) => void;
  /** Double-click: fit the column to its contents. */
  onFit?: (width: number) => void;
  testId?: string;
}) {
  return (
    <span
      onMouseDown={(e) => {
        e.preventDefault();
        onStart(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!onFit) return;
        const w = fitWidthFromHandle(e.currentTarget);
        if (w) onFit(w);
      }}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1/2 -translate-y-1/2 -right-[5px] h-4 w-[9px] cursor-col-resize flex items-center justify-center group/resize z-10"
      title={onFit ? "Drag to resize · double-click to fit" : "Drag to resize"}
      data-testid={testId}
    >
      <span className="h-3.5 w-px bg-border group-hover/resize:bg-primary transition-colors" />
    </span>
  );
}
