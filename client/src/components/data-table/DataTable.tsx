import { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  ExpandedState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ArrowUp, ArrowDown, EyeOff, ArrowUpDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Per-column metadata stored in ColumnDef.meta
export interface DataTableColumnMeta {
  /** Default width in px when no persisted width exists. */
  defaultWidth?: number;
  /** Right-aligned cell (numbers, totals). */
  align?: "left" | "right" | "center";
  /** Fixed (non-draggable, non-resizable, non-hideable) — e.g. checkbox col. */
  pinned?: boolean;
  /** Display label shown in context menu / column picker. */
  headerLabel?: string;
  /** Hidden by default on first load (when no persisted state exists). */
  defaultHidden?: boolean;
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** Stable storage scope, e.g. "bills". Becomes `buildpro_table_<scope>_*`. */
  storageKey: string;
  rowKey: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
  /** Rendered when data is empty. */
  emptyState?: React.ReactNode;
  /** Optional class on the outer scroll container. */
  className?: string;
  /** Row min-height in px (default 36). */
  rowHeight?: number;
  /**
   * Legacy local-storage key whose value is `[{id,visible,order}]`. If found
   * and the new keys aren't populated yet, the layout is imported once and
   * the legacy key is removed. Use to carry over saved layouts after migrating
   * a page from a bespoke table to this shared component.
   */
  legacyConfigKey?: string;
  /**
   * Return the child rows for a given row, or `undefined` if the row has no
   * children. Enables the expander column. Mutually exclusive with
   * `renderExpandedPanel` (panel mode).
   */
  getSubRows?: (row: TData) => TData[] | undefined;
  /**
   * Render a custom panel below the row when expanded. Enables the expander
   * column. Mutually exclusive with `getSubRows` (nested-rows mode).
   */
  renderExpandedPanel?: (row: TData) => React.ReactNode;
  /**
   * Optionally hide the expander chevron for rows that should not be
   * expandable (e.g. rows with no children). Defaults to `true` for any row
   * if not provided; in nested-row mode the chevron is auto-hidden when the
   * row has no sub-rows regardless.
   */
  isRowExpandable?: (row: TData) => boolean;
}

interface LegacyColumnConfigEntry { id: string; visible: boolean; order: number }

function migrateLegacyConfig(scope: string, legacyKey: string | undefined) {
  if (!legacyKey || typeof window === "undefined") return;
  const orderKey = lsKey(scope, "order");
  const hiddenKey = lsKey(scope, "hidden");
  if (localStorage.getItem(orderKey) || localStorage.getItem(hiddenKey)) return;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const entries = parsed as LegacyColumnConfigEntry[];
    const sorted = [...entries].sort((a, b) => a.order - b.order);
    const order = sorted.map((c) => c.id);
    const hidden: VisibilityState = {};
    entries.forEach((c) => { if (c.visible === false) hidden[c.id] = false; });
    saveJSON(orderKey, order);
    saveJSON(hiddenKey, hidden);
    localStorage.removeItem(legacyKey);
  } catch {}
}

const MIN_COL_WIDTH = 60;
const STICKY_SHADOW = "2px 0 4px rgba(0,0,0,0.06)";

function lsKey(scope: string, kind: "widths" | "order" | "hidden" | "sort" | "expanded") {
  return `buildpro_table_${kind}_${scope}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

interface DraggableHeaderProps {
  id: string;
  children: React.ReactNode;
  width: number;
  pinned: boolean;
  sticky: boolean;
  align?: "left" | "right" | "center";
  onContextMenu?: (e: React.MouseEvent) => void;
}

function DraggableHeader({ id, children, width, pinned, sticky, align, onContextMenu }: DraggableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, over, active } =
    useSortable({ id, disabled: pinned });

  const style: React.CSSProperties = {
    width,
    minWidth: width,
    maxWidth: width,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: sticky ? "sticky" : "relative",
    left: sticky ? 0 : undefined,
    zIndex: sticky ? 3 : isDragging ? 2 : 1,
    background: sticky ? "hsl(var(--muted) / 0.5)" : undefined,
    boxShadow: sticky ? STICKY_SHADOW : undefined,
  };

  const dragProps = pinned ? {} : { ...attributes, ...listeners };

  // Drop-insertion indicator: show a vertical accent bar on the side of this
  // header that the dragged column would be inserted at.
  const showInsertionLine = isOver && active && over && active.id !== over.id && !pinned;
  const insertSide: "left" | "right" =
    showInsertionLine && (active.data?.current?.sortable?.index ?? 0) <
      (over.data?.current?.sortable?.index ?? 0)
      ? "right"
      : "left";

  return (
    <th
      ref={setNodeRef}
      style={style}
      onContextMenu={onContextMenu}
      className={cn(
        "h-7 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 border-b border-border bg-muted/50 select-none relative",
        align === "right" && "text-right",
        align === "center" && "text-center",
        !pinned && "cursor-grab active:cursor-grabbing",
      )}
      {...dragProps}
    >
      {children}
      {showInsertionLine && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#A890D4] z-20"
          style={{ [insertSide]: -1 } as React.CSSProperties}
        />
      )}
    </th>
  );
}

export function DataTable<TData>({
  data,
  columns,
  storageKey,
  rowKey,
  onRowClick,
  rowClassName,
  emptyState,
  className,
  rowHeight = 36,
  legacyConfigKey,
  getSubRows,
  renderExpandedPanel,
  isRowExpandable,
}: DataTableProps<TData>) {
  // One-time migration of legacy `[{id,visible,order}]` storage into the new keys.
  useMemo(() => migrateLegacyConfig(storageKey, legacyConfigKey), [storageKey, legacyConfigKey]);

  const expansionEnabled = !!getSubRows || !!renderExpandedPanel;
  const expanderColId = "__expander";

  // Build the effective column list: auto-inject the expander as the first
  // pinned column when expansion is enabled. The user-provided `columns` is
  // never mutated.
  const effectiveColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!expansionEnabled) return columns;
    const expanderCol: ColumnDef<TData, unknown> = {
      id: expanderColId,
      header: "",
      enableSorting: false,
      enableResizing: false,
      cell: () => null, // rendered specially in the row
      size: 28,
      meta: { defaultWidth: 28, pinned: true, align: "center", headerLabel: "" },
    };
    return [expanderCol, ...columns];
  }, [columns, expansionEnabled]);

  // ── Persistent state ───────────────────────────────────────────────────────
  const initialOrder = useMemo<ColumnOrderState>(
    () => {
      const saved = loadJSON<string[] | null>(lsKey(storageKey, "order"), null);
      // Always force the auto-injected expander column to be the very first
      // entry so it cannot be reordered out of position by stale persisted state.
      const base = saved ?? effectiveColumns.map((c) => c.id as string);
      const filtered = base.filter((id) => id !== expanderColId);
      return expansionEnabled ? [expanderColId, ...filtered] : filtered;
    },
    [storageKey], // intentionally only on mount per scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );
  const initialHidden = useMemo<VisibilityState>(
    () => {
      const stored = loadJSON<VisibilityState | null>(lsKey(storageKey, "hidden"), null);
      if (stored && Object.keys(stored).length > 0) return stored;
      // No persisted state — seed from column meta `defaultHidden`.
      const seeded: VisibilityState = {};
      effectiveColumns.forEach((c) => {
        const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
        if (meta.defaultHidden && c.id) seeded[c.id as string] = false;
      });
      return seeded;
    },
    [storageKey],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );
  const initialSorting = useMemo<SortingState>(
    () => loadJSON(lsKey(storageKey, "sort"), []),
    [storageKey],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );
  const initialSizing = useMemo<ColumnSizingState>(() => {
    const saved = loadJSON<ColumnSizingState>(lsKey(storageKey, "widths"), {});
    const sizing: ColumnSizingState = {};
    effectiveColumns.forEach((c) => {
      const id = c.id as string;
      const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
      sizing[id] = saved[id] ?? meta.defaultWidth ?? 120;
    });
    return sizing;
  }, [storageKey, effectiveColumns]);
  const initialExpanded = useMemo<ExpandedState>(
    () => (expansionEnabled ? loadJSON(lsKey(storageKey, "expanded"), {}) : {}),
    [storageKey, expansionEnabled],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    // Reconcile saved order against current column ids (add new, drop removed).
    const known = new Set(effectiveColumns.map((c) => c.id as string));
    const ordered = initialOrder.filter((id) => known.has(id));
    effectiveColumns.forEach((c) => {
      const id = c.id as string;
      if (!ordered.includes(id)) ordered.push(id);
    });
    // Pinned expander always stays at index 0.
    if (expansionEnabled) {
      const idx = ordered.indexOf(expanderColId);
      if (idx > 0) {
        ordered.splice(idx, 1);
        ordered.unshift(expanderColId);
      }
    }
    return ordered;
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialHidden);
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialSizing);
  const [expanded, setExpanded] = useState<ExpandedState>(initialExpanded);

  // Persist on change
  useEffect(() => saveJSON(lsKey(storageKey, "order"), columnOrder), [columnOrder, storageKey]);
  useEffect(() => saveJSON(lsKey(storageKey, "hidden"), columnVisibility), [columnVisibility, storageKey]);
  useEffect(() => saveJSON(lsKey(storageKey, "sort"), sorting), [sorting, storageKey]);
  useEffect(() => saveJSON(lsKey(storageKey, "widths"), columnSizing), [columnSizing, storageKey]);
  useEffect(() => {
    if (expansionEnabled) saveJSON(lsKey(storageKey, "expanded"), expanded);
  }, [expanded, storageKey, expansionEnabled]);

  // Listen for picker-driven visibility updates from the same tab.
  useEffect(() => {
    const evt = `buildpro-table-${storageKey}-hidden`;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as VisibilityState | undefined;
      if (detail) setColumnVisibility(detail);
    };
    window.addEventListener(evt, handler);
    return () => window.removeEventListener(evt, handler);
  }, [storageKey]);

  // ── TanStack table ────────────────────────────────────────────────────────
  const table = useReactTable({
    data,
    columns: effectiveColumns,
    state: { columnOrder, columnVisibility, sorting, columnSizing, expanded },
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: expansionEnabled ? getExpandedRowModel() : undefined,
    getSubRows: getSubRows
      ? (row) => getSubRows(row as TData) ?? undefined
      : undefined,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: MIN_COL_WIDTH, size: 120 },
    getRowId: (row, index, parent) =>
      parent ? `${parent.id}.${rowKey(row)}` : rowKey(row),
  });

  // ── Custom 3-state sort cycle (asc → desc → cleared) ──────────────────────
  const handleSortClick = (columnId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSorting((prev) => {
      const cur = prev.find((s) => s.id === columnId);
      if (!cur) return [{ id: columnId, desc: false }];
      if (!cur.desc) return [{ id: columnId, desc: true }];
      return [];
    });
  };

  // ── DnD sensors / handler ─────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const pinnedIds = useMemo(() => {
    const set = new Set<string>();
    effectiveColumns.forEach((c) => {
      const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
      if (meta.pinned) set.add(c.id as string);
    });
    // Expander is always treated as pinned even if a caller forgets to set it.
    if (expansionEnabled) set.add(expanderColId);
    return set;
  }, [effectiveColumns, expansionEnabled]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Never allow a column to be dropped on top of a pinned column —
    // pinned columns must keep their slot at the start/end.
    if (pinnedIds.has(active.id as string) || pinnedIds.has(over.id as string)) return;
    setColumnOrder((prev) => {
      const oldIdx = prev.indexOf(active.id as string);
      const newIdx = prev.indexOf(over.id as string);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const headerGroup = table.getHeaderGroups()[0];
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const totalWidth = visibleLeafColumns.reduce((s, c) => s + c.getSize(), 0);
  const firstVisibleId = visibleLeafColumns[0]?.id;
  // The first user-defined (non-expander) column is the one that should carry
  // depth-based indentation for nested child rows.
  const firstNonExpanderId = visibleLeafColumns.find((c) => c.id !== expanderColId)?.id;

  return (
    <div className={cn("relative w-full h-full overflow-auto", className)} data-testid={`datatable-${storageKey}`}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ width: totalWidth, minWidth: "100%", tableLayout: "fixed" }}
        >
          <colgroup>
            {visibleLeafColumns.map((c) => (
              <col key={c.id} style={{ width: c.getSize() }} />
            ))}
          </colgroup>

          <thead className="sticky top-0 z-20">
            <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
              <tr>
                {headerGroup.headers.map((header) => {
                  const meta = (header.column.columnDef.meta as DataTableColumnMeta | undefined) ?? {};
                  const id = header.column.id;
                  const sortDir = header.column.getIsSorted(); // false | "asc" | "desc"
                  const canSort = header.column.getCanSort();
                  const sticky = id === firstVisibleId && !meta.pinned ? false : id === firstVisibleId;
                  // Treat the first visible column as sticky (per spec). pinned columns (e.g. checkbox)
                  // are usually the very first column anyway; keep them sticky too.
                  const isSticky = id === firstVisibleId;

                  return (
                    <ContextMenu key={id}>
                      <ContextMenuTrigger asChild>
                        <DraggableHeader
                          id={id}
                          width={header.getSize()}
                          pinned={!!meta.pinned}
                          sticky={isSticky}
                          align={meta.align}
                        >
                          <div
                            className={cn(
                              "group flex items-center gap-1 truncate",
                              meta.align === "right" && "justify-end",
                              meta.align === "center" && "justify-center",
                              canSort && !meta.pinned && "cursor-pointer",
                            )}
                            onClick={canSort && !meta.pinned ? (e) => handleSortClick(id, e) : undefined}
                          >
                            <span className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {canSort && !meta.pinned && (
                              <span className="flex-shrink-0">
                                {sortDir === "asc" && <ArrowUp className="w-3 h-3 text-[#A890D4]" />}
                                {sortDir === "desc" && <ArrowDown className="w-3 h-3 text-[#A890D4]" />}
                                {!sortDir && <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-30" />}
                              </span>
                            )}
                          </div>

                          {/* Resize handle */}
                          {!meta.pinned && (
                            <div
                              role="separator"
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none group/resize"
                              style={{ userSelect: "none" }}
                            >
                              <div
                                className={cn(
                                  "absolute right-0 top-0 h-full w-0.5 transition-colors",
                                  header.column.getIsResizing()
                                    ? "bg-[#A890D4]"
                                    : "bg-transparent group-hover/resize:bg-[#A890D4]",
                                )}
                              />
                            </div>
                          )}
                        </DraggableHeader>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="text-xs">
                        {canSort && !meta.pinned && (
                          <>
                            <ContextMenuItem
                              onClick={() => setSorting([{ id, desc: false }])}
                              data-testid={`ctx-sort-asc-${id}`}
                            >
                              <ArrowUp className="w-3 h-3 mr-2" /> Sort A → Z
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => setSorting([{ id, desc: true }])}
                              data-testid={`ctx-sort-desc-${id}`}
                            >
                              <ArrowDown className="w-3 h-3 mr-2" /> Sort Z → A
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                          </>
                        )}
                        <ContextMenuItem
                          disabled={!!meta.pinned}
                          onClick={() => header.column.toggleVisibility(false)}
                          data-testid={`ctx-hide-${id}`}
                        >
                          <EyeOff className="w-3 h-3 mr-2" /> Hide column
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </tr>
            </SortableContext>
          </thead>

          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={visibleLeafColumns.length} className="py-12 text-center text-muted-foreground text-sm">
                  {emptyState ?? "No data"}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.flatMap((row) => {
                const nodes: React.ReactNode[] = [
                  <DataTableRow
                    key={row.id}
                    row={row}
                    rowHeight={rowHeight}
                    firstVisibleId={firstVisibleId}
                    firstNonExpanderId={firstNonExpanderId}
                    expanderColId={expanderColId}
                    expansionEnabled={expansionEnabled}
                    nestedMode={!!getSubRows}
                    isRowExpandable={isRowExpandable}
                    onRowClick={onRowClick}
                    className={rowClassName?.(row.original)}
                  />,
                ];
                // Panel mode: render the custom panel beneath an expanded row.
                if (renderExpandedPanel && row.depth === 0 && row.getIsExpanded()) {
                  nodes.push(
                    <tr key={`${row.id}__panel`} data-testid={`row-${row.id}-panel`}>
                      <td colSpan={visibleLeafColumns.length} className="p-0 border-b border-border/40 bg-muted/30">
                        {renderExpandedPanel(row.original)}
                      </td>
                    </tr>,
                  );
                }
                return nodes;
              })
            )}
          </tbody>
        </table>
      </DndContext>
    </div>
  );
}

function DataTableRow<TData>({
  row,
  rowHeight,
  firstVisibleId,
  firstNonExpanderId,
  expanderColId,
  expansionEnabled,
  nestedMode,
  isRowExpandable,
  onRowClick,
  className,
}: {
  row: Row<TData>;
  rowHeight: number;
  firstVisibleId: string | undefined;
  firstNonExpanderId?: string;
  expanderColId?: string;
  expansionEnabled?: boolean;
  nestedMode?: boolean;
  isRowExpandable?: (row: TData) => boolean;
  onRowClick?: (row: TData) => void;
  className?: string;
}) {
  // Determine if this row can be expanded (chevron visible).
  let canExpand = false;
  if (expansionEnabled) {
    if (nestedMode) {
      canExpand = row.subRows.length > 0;
    } else {
      // Panel mode: parent rows only (depth 0). Defer to caller predicate.
      canExpand = row.depth === 0 && (isRowExpandable ? isRowExpandable(row.original) : true);
    }
  }
  const isExpanded = expansionEnabled && row.getIsExpanded();

  return (
    <tr
      className={cn("border-b border-border/40 hover-elevate", onRowClick && "cursor-pointer", className)}
      style={{ height: rowHeight }}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      data-testid={`row-${row.id}`}
      data-depth={row.depth}
    >
      {row.getVisibleCells().map((cell) => {
        const meta = (cell.column.columnDef.meta as DataTableColumnMeta | undefined) ?? {};
        const isSticky = cell.column.id === firstVisibleId;
        const isExpanderCell = expansionEnabled && cell.column.id === expanderColId;
        const isFirstNonExpander = cell.column.id === firstNonExpanderId;
        // 16px indent per nesting level for the leftmost user column.
        const indentPx = isFirstNonExpander && row.depth > 0 ? row.depth * 16 : 0;
        return (
          <td
            key={cell.id}
            className={cn(
              "px-2 text-xs align-middle overflow-hidden text-ellipsis whitespace-nowrap",
              meta.align === "right" && "text-right",
              meta.align === "center" && "text-center",
            )}
            style={{
              width: cell.column.getSize(),
              minWidth: cell.column.getSize(),
              maxWidth: cell.column.getSize(),
              position: isSticky ? "sticky" : undefined,
              left: isSticky ? 0 : undefined,
              zIndex: isSticky ? 1 : undefined,
              background: isSticky ? "hsl(var(--background))" : undefined,
              boxShadow: isSticky ? STICKY_SHADOW : undefined,
              paddingLeft: indentPx ? `calc(0.5rem + ${indentPx}px)` : undefined,
            }}
          >
            {isExpanderCell ? (
              canExpand ? (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center h-5 w-5 rounded hover-elevate active-elevate-2 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  }}
                  aria-label={isExpanded ? "Collapse row" : "Expand row"}
                  data-testid={`expander-${row.id}`}
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              ) : null
            ) : (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Column-picker UI for showing/hiding columns. Pass any DataTable column-defs
 * + a paired `[hidden, setHidden]` from your page state, OR use the `tableRef`
 * pattern. For simplicity this exports a minimal stand-alone control bound to
 * the same localStorage scope as the DataTable.
 */
export function DataTableColumnPicker({
  storageKey,
  columns,
}: {
  storageKey: string;
  columns: { id: string; label: string; pinned?: boolean }[];
}) {
  const [hidden, setHidden] = useState<VisibilityState>(() =>
    loadJSON(lsKey(storageKey, "hidden"), {}),
  );

  // Two-way sync via storage event so picker + table stay aligned.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === lsKey(storageKey, "hidden")) {
        try {
          setHidden(e.newValue ? JSON.parse(e.newValue) : {});
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  // TanStack VisibilityState semantics: `false` = hidden, `true` (or absent) = visible.
  const toggle = (id: string) => {
    setHidden((prev) => {
      const isCurrentlyHidden = prev[id] === false;
      const next = { ...prev, [id]: isCurrentlyHidden ? true : false };
      saveJSON(lsKey(storageKey, "hidden"), next);
      window.dispatchEvent(new CustomEvent(`buildpro-table-${storageKey}-hidden`, { detail: next }));
      return next;
    });
  };

  return (
    <div className="space-y-1 p-2 min-w-[180px]">
      <p className="text-xs font-medium text-muted-foreground mb-1">Columns</p>
      {columns.map((c) => {
        const isHidden = hidden[c.id] === false;
        return (
          <label
            key={c.id}
            className={cn(
              "flex items-center gap-2 px-1.5 py-1 rounded text-xs",
              c.pinned ? "opacity-50" : "hover-elevate cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              checked={!isHidden}
              disabled={c.pinned}
              onChange={() => !c.pinned && toggle(c.id)}
              className="h-3 w-3"
            />
            <span className="truncate">{c.label}</span>
          </label>
        );
      })}
    </div>
  );
}
