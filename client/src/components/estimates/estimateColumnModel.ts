/**
 * The column list for an estimate grid, and the pure helpers around it.
 * No React here, so it can be tested with `npx tsx`. The picker and resize
 * hook live in estimateColumns.tsx, which re-exports all of this.
 */
import type { ColumnConfig } from "./estimateGridRow";

export const ESTIMATE_DEFAULT_COLUMNS: ColumnConfig[] = [
  // Item leads. The leftmost column is the most valuable space on the row and
  // it was holding a cost code that is often blank; the thing that identifies
  // the line belongs there.
  { id: "item", label: "Item", visible: true, widthPx: 200 },
  { id: "costCode", label: "Cost Code", visible: true, widthPx: 90 },
  { id: "type", label: "Type", visible: true, widthPx: 80 },
  { id: "description", label: "Description", visible: true, widthPx: 160 },
  { id: "status", label: "Status", visible: true, widthPx: 85 },
  { id: "proposalVisible", label: "Proposal", visible: true, widthPx: 70 },
  { id: "shownAs", label: "Shown As", visible: true, widthPx: 85 },
  { id: "allowance", label: "Allowance", visible: true, widthPx: 70 },
  { id: "quantity", label: "Qty", visible: true, widthPx: 60 },
  { id: "wastage", label: "Waste", visible: true, widthPx: 55 },
  { id: "unitType", label: "Unit", visible: true, widthPx: 55 },
  { id: "unitCostExTax", label: "Unit Cost ex", visible: true, widthPx: 90 },
  { id: "unitCostIncTax", label: "Unit Cost inc", visible: false, widthPx: 85 },
  { id: "builderCost", label: "Builder Cost", visible: false, widthPx: 100 },
  { id: "builderCostIncTax", label: "Builder Inc", visible: false, widthPx: 95 },
  { id: "markup", label: "Markup", visible: true, widthPx: 65 },
  { id: "markupDollarAmount", label: "Markup $", visible: false, widthPx: 90 },
  { id: "clientPriceExTax", label: "Amount", visible: true, widthPx: 90 },
  { id: "clientTax", label: "Tax", visible: false, widthPx: 70 },
  { id: "clientPriceIncTax", label: "Amount Inc", visible: true, widthPx: 95 },
  { id: "notes", label: "Notes", visible: true, widthPx: 60 },
];

/**
 * A template has no per-line workflow (Status) and no per-line notes thread
 * (Notes); every other column is the estimate's, in the estimate's order.
 */
const ESTIMATE_ONLY_COLUMNS = new Set(["status", "notes"]);
export const TEMPLATE_DEFAULT_COLUMNS: ColumnConfig[] = ESTIMATE_DEFAULT_COLUMNS.filter(
  (c) => !ESTIMATE_ONLY_COLUMNS.has(c.id),
);

/**
 * Lay a saved column list over the defaults.
 *
 * A saved list is a snapshot of the columns that existed when it was saved.
 * Taken as-is, a column added later never appears and its toggle seems dead.
 * So: saved columns keep their order, width and visibility; columns the save
 * doesn't know are appended with their defaults; columns that no longer exist
 * are dropped.
 */
export function mergeSavedColumns(saved: unknown, defaults: ColumnConfig[]): ColumnConfig[] {
  if (!Array.isArray(saved)) return defaults.map((c) => ({ ...c }));
  const byId = new Map(defaults.map((c) => [c.id, c]));
  const out: ColumnConfig[] = [];
  const seen = new Set<string>();
  for (const s of saved as Partial<ColumnConfig>[]) {
    const def = s && typeof s.id === "string" ? byId.get(s.id) : undefined;
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    out.push({
      ...def,
      visible: typeof s.visible === "boolean" ? s.visible : def.visible,
      widthPx: typeof s.widthPx === "number" && s.widthPx > 0 ? s.widthPx : def.widthPx,
    });
  }
  for (const def of defaults) if (!seen.has(def.id)) out.push({ ...def });
  return out;
}

/** The grid template and table width every row and the heading share. */
export function gridLayout(columns: ColumnConfig[]) {
  const visibleCols = columns.filter((c) => c.visible);
  return {
    visibleCols,
    gridTemplate: `40px ${visibleCols.map((c) => `${c.widthPx}px`).join(" ")} 80px`,
    tableWidth: visibleCols.reduce((sum, c) => sum + c.widthPx, 0) + 40 + 80,
  };
}

