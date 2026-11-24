/**
 * The column-heading row over an estimate grid.
 *
 * Shared by the estimate page and the estimate-template page. They used to
 * draw their own, and drifted: the template's stretched its Item column to the
 * window width while the group cards beneath stayed at the table width, so
 * every heading sat to the right of its column by however much wider the
 * window was than the table.
 *
 * The rule that keeps headings over their columns: the header uses the SAME
 * `gridTemplate` and the SAME fixed `tableWidth` as the rows. Never give a
 * column `1fr` here — the cards beneath can't follow it.
 */
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ColumnConfig } from "@/components/estimates/estimateGridRow";

interface Props {
  visibleCols: ColumnConfig[];
  gridTemplate: string;
  tableWidth: number;
  allSelected: boolean;
  onSelectAll: () => void;
  selectAllDisabled?: boolean;
  /** Starts a drag on a column's right edge. */
  onResizeStart: (columnId: string, e: React.MouseEvent) => void;
  /** The column being resized right now, if any — its handle stays lit. */
  resizingColumn?: string | null;
  /**
   * Extra props for a heading cell — the template page passes drag-to-reorder
   * handlers here. Optional: the estimate page reorders from its column menu.
   */
  columnHeaderProps?: (column: ColumnConfig) => React.HTMLAttributes<HTMLDivElement>;
}

const CENTRED = new Set(["status", "shownAs", "allowance", "type"]);

export function EstimateGridHeader({
  visibleCols,
  gridTemplate,
  tableWidth,
  allSelected,
  onSelectAll,
  selectAllDisabled,
  onResizeStart,
  resizingColumn,
  columnHeaderProps,
}: Props) {
  return (
    <div
      className="bg-card border-b border-border sticky top-0 z-30 pl-px"
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        width: `${tableWidth}px`,
        minWidth: `${tableWidth}px`,
      }}
    >
      {/* Checkbox column — pl-5 aligns with the handle-lane-shifted row checkboxes */}
      <div className="h-9 pl-5 pr-1 flex items-center" role="columnheader">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          aria-label="Select all items"
          data-testid="checkbox-select-all"
          disabled={selectAllDisabled}
        />
      </div>
      {visibleCols.map((column, index) => {
        const extra = columnHeaderProps?.(column) ?? {};
        return (
          <div
            key={column.id}
            role="columnheader"
            {...extra}
            className={`h-9 px-2 flex items-center relative group/header${
              CENTRED.has(column.id) ? " justify-center" : ""
            }${extra.className ? ` ${extra.className}` : ""}`}
            data-testid={`col-header-${column.id}`}
          >
            <span className="truncate text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {column.label}
            </span>
            {/* Resize handle — hidden only on the last column */}
            {index < visibleCols.length - 1 && (
              <div
                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize transition-all z-10 ${
                  resizingColumn === column.id
                    ? "opacity-100 bg-primary w-[3px]"
                    : "opacity-0 group-hover/header:opacity-100 hover:bg-primary bg-muted"
                }`}
                style={{ pointerEvents: "auto", touchAction: "none" }}
                // Stop the press reaching a draggable heading: a resize must not
                // also start a column move.
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  // preventDefault stops a draggable heading starting an HTML
                  // drag (a column move) from the same press.
                  e.preventDefault();
                  e.stopPropagation();
                  onResizeStart(column.id, e);
                }}
                data-testid={`resize-handle-${column.id}`}
              />
            )}
          </div>
        );
      })}
      {/* Actions column */}
      <div className="h-9 px-2 flex items-center justify-center border-l border-border/50" role="columnheader">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</span>
      </div>
    </div>
  );
}
