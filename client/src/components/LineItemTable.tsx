import { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * LineItemTable — shared primitive for detail-page line-item tables.
 *
 * Wraps the shadcn `<Table>` with a column-descriptor API so all detail pages
 * (Bill, PO, Selection, Variation, Estimate/Schedule template, Settings sub-tables)
 * share the same typography, padding, alignment and totals-row treatment.
 *
 * Owns: header styling, padding, right-align for numeric columns, ellipsis
 * truncation, totals row styling, optional selection checkbox + actions slot.
 *
 * Does NOT own: inline-edit logic, drag-row reorder, data fetching, column
 * resize/persistence (those belong in pages or the heavier DataTable primitive).
 */

export interface LineItemColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  truncate?: boolean;
  className?: string;
  headerClassName?: string;
  cell: (row: T, index: number) => ReactNode;
}

export interface LineItemTableProps<T> {
  data: T[];
  columns: LineItemColumn<T>[];
  rowKey: (row: T, index: number) => string | number;
  size?: "xs" | "sm";
  selection?: {
    selectedKeys: Set<string | number>;
    onChange: (next: Set<string | number>) => void;
    isRowSelectable?: (row: T, index: number) => boolean;
  };
  totalsRow?: ReactNode;
  rowClassName?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  emptyState?: ReactNode;
  actions?: (row: T, index: number) => ReactNode;
  actionsHeader?: ReactNode;
  className?: string;
  tableClassName?: string;
  testId?: string;
  /** Per-row data-testid generator (e.g. `(row, i) => `row-line-item-${i}`). */
  rowTestId?: (row: T, index: number) => string;
  /** Per-row checkbox data-testid (e.g. `(row, i) => `checkbox-line-${i}`). Falls back to `checkbox-row-${key}`. */
  rowCheckboxTestId?: (row: T, index: number) => string;
  /** Header select-all checkbox data-testid. Defaults to `checkbox-select-all`. */
  selectAllTestId?: string;
  /** When true, applies `table-fixed` so per-column `width` styles are honoured strictly. Defaults to false (auto layout, matches the original ad-hoc tables on template/settings pages). Inline-edit grids (BillDetail, VariationDetail) opt in. */
  fixedLayout?: boolean;
}

const alignClass = (align: LineItemColumn<unknown>["align"]) =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

const widthStyle = (w: LineItemColumn<unknown>["width"]) =>
  w === undefined ? undefined : { width: typeof w === "number" ? `${w}px` : w };

export function LineItemTable<T>({
  data,
  columns,
  rowKey,
  size = "xs",
  selection,
  totalsRow,
  rowClassName,
  onRowClick,
  emptyState,
  actions,
  actionsHeader,
  className,
  tableClassName,
  testId,
  rowTestId,
  rowCheckboxTestId,
  selectAllTestId,
  fixedLayout = false,
}: LineItemTableProps<T>) {
  const textSize = size === "sm" ? "text-xs" : "text-table";
  const cellPad = "px-2 py-1";

  const allSelectableKeys = selection
    ? data
        .map((row, idx) =>
          selection.isRowSelectable && !selection.isRowSelectable(row, idx)
            ? null
            : rowKey(row, idx),
        )
        .filter((k): k is string | number => k !== null)
    : [];
  const allSelected =
    selection !== undefined &&
    allSelectableKeys.length > 0 &&
    allSelectableKeys.every((k) => selection.selectedKeys.has(k));
  const someSelected =
    selection !== undefined &&
    !allSelected &&
    allSelectableKeys.some((k) => selection.selectedKeys.has(k));

  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) {
      const next = new Set(selection.selectedKeys);
      allSelectableKeys.forEach((k) => next.delete(k));
      selection.onChange(next);
    } else {
      const next = new Set(selection.selectedKeys);
      allSelectableKeys.forEach((k) => next.add(k));
      selection.onChange(next);
    }
  };

  const toggleRow = (key: string | number) => {
    if (!selection) return;
    const next = new Set(selection.selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  };

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <Table className={cn(textSize, fixedLayout && "table-fixed", tableClassName)}>
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead className="w-8 px-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all rows"
                  data-testid={selectAllTestId ?? "checkbox-select-all"}
                />
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead
                key={col.key}
                style={widthStyle(col.width)}
                className={cn(cellPad, alignClass(col.align), col.headerClassName)}
              >
                {col.header}
              </TableHead>
            ))}
            {actions && (
              <TableHead className={cn("w-10 text-right", cellPad)}>
                {actionsHeader}
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && emptyState ? (
            <TableRow>
              <TableCell
                colSpan={
                  columns.length + (selection ? 1 : 0) + (actions ? 1 : 0)
                }
                className={cn(cellPad, "text-center text-muted-foreground")}
              >
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, idx) => {
              const key = rowKey(row, idx);
              const selected = selection?.selectedKeys.has(key) ?? false;
              const selectable = selection?.isRowSelectable
                ? selection.isRowSelectable(row, idx)
                : true;
              return (
                <TableRow
                  key={key}
                  data-state={selected ? "selected" : undefined}
                  data-testid={rowTestId?.(row, idx)}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row, idx),
                  )}
                  onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                >
                  {selection && (
                    <TableCell className="w-8 px-2 py-1">
                      {selectable && (
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleRow(key)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select row"
                          data-testid={rowCheckboxTestId?.(row, idx) ?? `checkbox-row-${key}`}
                        />
                      )}
                    </TableCell>
                  )}
                  {columns.map((col) => {
                    const content = col.cell(row, idx);
                    const truncate = col.truncate ?? true;
                    return (
                      <TableCell
                        key={col.key}
                        style={widthStyle(col.width)}
                        className={cn(
                          cellPad,
                          alignClass(col.align),
                          truncate && "max-w-0",
                          col.className,
                        )}
                      >
                        {truncate ? (
                          <div
                            className="truncate"
                            title={typeof content === "string" ? content : undefined}
                          >
                            {content}
                          </div>
                        ) : (
                          content
                        )}
                      </TableCell>
                    );
                  })}
                  {actions && (
                    <TableCell
                      className={cn(cellPad, "w-10 text-right")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions(row, idx)}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
          {totalsRow && (
            <TableRow className="bg-muted/40 font-semibold border-t-2 border-[hsl(var(--table-row-divider))] hover:bg-muted/40">
              {totalsRow}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default LineItemTable;
