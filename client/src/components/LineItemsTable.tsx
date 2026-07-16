// Reusable costed line-item table — the "secondary table" used anywhere a list
// of costed lines needs full pricing columns (allowance custom lines and PC cost
// entries now; variations / estimate sub-tables later).
//
// All money is integer CENTS (see shared/money.ts). Derived columns follow
// shared/pricing.ts semantics: builder cost = qty × unit cost ex tax, markup
// applies to builder cost, GST (10%) on top of the marked-up amount.
//
// Editing model: rows edit INLINE — click a row (or the + Add line row) and its
// cells become inputs aligned to the same grid columns; ✓ commits, Esc cancels.

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Plus, Settings2, X } from "lucide-react";
import { formatCents, incGstFromEx, exGstFromInc, dollarsToCents, centsToDollars, type Cents } from "@shared/money";

export type LineItemRow = {
  id: string;
  itemName?: string | null;
  description: string;
  costCode?: string | null;
  quantity: number;
  unitType?: string | null;
  /** Builder unit cost EX GST in cents. Null on legacy rows (unitPrice/total only). */
  unitCostExTaxCents?: number | null;
  markupPercent?: number | null;
  /** Charge per unit in cents INC GST. */
  unitPrice: Cents;
  /** Line total in cents INC GST — authoritative. */
  total: Cents;
  /** Pending (not yet saved) rows render highlighted. */
  pending?: boolean;
  /** Rows synced from elsewhere (e.g. a linked selection) can't be deleted here. */
  deletable?: boolean;
  /** Editable inline (default true when onUpdate provided). */
  editable?: boolean;
};

export type NewLineItem = {
  itemName: string;
  description: string;
  costCode: string | null;
  quantity: number;
  unitType: string;
  unitCostExTaxCents: Cents;
  markupPercent: number | null;
  unitPrice: Cents;
  totalPrice: Cents;
};

type ColumnKey =
  | "item" | "description" | "costCode" | "qty" | "unit"
  | "unitCostEx" | "unitCostInc" | "builderEx" | "builderInc"
  | "markupPct" | "markupAmt" | "amountEx" | "amountInc";

// Columns are fixed-PIXEL width so they can be dragged to resize. The table
// scrolls horizontally (overflow-x-auto) when the total exceeds the container,
// which is the standard spreadsheet behaviour.
const ALL_COLUMNS: { key: ColumnKey; label: string; defaultWidth: number; align?: "right"; input?: boolean }[] = [
  { key: "item", label: "Item", defaultWidth: 130, input: true },
  { key: "description", label: "Description", defaultWidth: 190, input: true },
  { key: "costCode", label: "Cost Code", defaultWidth: 140, input: true },
  { key: "qty", label: "Qty", defaultWidth: 64, align: "right", input: true },
  { key: "unit", label: "Unit", defaultWidth: 64, input: true },
  { key: "unitCostEx", label: "Unit Cost Ex", defaultWidth: 110, align: "right", input: true },
  { key: "unitCostInc", label: "Unit Cost Inc", defaultWidth: 110, align: "right" },
  { key: "builderEx", label: "Builder's Ex", defaultWidth: 100, align: "right" },
  { key: "builderInc", label: "Builder's Inc", defaultWidth: 100, align: "right" },
  { key: "markupPct", label: "Markup %", defaultWidth: 76, align: "right", input: true },
  { key: "markupAmt", label: "Markup $", defaultWidth: 96, align: "right" },
  { key: "amountEx", label: "Amount Ex", defaultWidth: 110, align: "right" },
  { key: "amountInc", label: "Amount Inc", defaultWidth: 110, align: "right" },
];

const MIN_COL_WIDTH = 48;

// ─── Global column-width store ────────────────────────────────────────────────
// Widths are shared across EVERY LineItemsTable in the app (custom lines, PC cost
// entries, and any future table using this component) and persisted to one
// localStorage key. useSyncExternalStore keeps all mounted instances in sync so a
// drag in one place updates the others live.
const WIDTHS_KEY = "line-items-col-widths-v1";
type WidthMap = Partial<Record<ColumnKey, number>>;

let widthStore: WidthMap = (() => {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) || "{}") as WidthMap;
  } catch {
    return {};
  }
})();
const widthListeners = new Set<() => void>();

function setColumnWidth(key: ColumnKey, width: number) {
  widthStore = { ...widthStore, [key]: Math.max(MIN_COL_WIDTH, Math.round(width)) };
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widthStore)); } catch { /* ignore */ }
  widthListeners.forEach((l) => l());
}

function useColumnWidths(): WidthMap {
  return useSyncExternalStore(
    (l) => { widthListeners.add(l); return () => { widthListeners.delete(l); }; },
    () => widthStore,
    () => widthStore,
  );
}

const DEFAULT_VISIBLE: ColumnKey[] = [
  "item", "description", "costCode", "qty", "unit", "unitCostEx", "markupPct", "amountEx", "amountInc",
];

type Draft = {
  itemName: string;
  description: string;
  costCode: string;
  quantity: string;
  unitType: string;
  unitCostEx: string; // dollars
  markupPercent: string;
};

const EMPTY_DRAFT: Draft = {
  itemName: "", description: "", costCode: "", quantity: "1", unitType: "each", unitCostEx: "", markupPercent: "",
};

/** Derived pricing for one row, all cents. Legacy rows (no unit cost) fall back to their stored totals. */
function deriveRow(row: LineItemRow) {
  const qty = Number(row.quantity) || 0;
  const markup = Number(row.markupPercent) || 0;
  const hasCosting = row.unitCostExTaxCents !== null && row.unitCostExTaxCents !== undefined;
  const unitCostEx: Cents = hasCosting ? (row.unitCostExTaxCents as number) : exGstFromInc(row.unitPrice);
  const builderEx = Math.round(qty * unitCostEx);
  const markupAmt = Math.round((builderEx * markup) / 100);
  const amountExDerived = builderEx + markupAmt;
  const amountInc = hasCosting ? incGstFromEx(amountExDerived) : row.total;
  const amountEx = hasCosting ? amountExDerived : exGstFromInc(amountInc);
  return {
    unitCostEx,
    unitCostInc: incGstFromEx(unitCostEx),
    builderEx,
    builderInc: incGstFromEx(builderEx),
    markupAmt,
    amountEx,
    amountInc,
  };
}

function draftToLine(draft: Draft): NewLineItem | null {
  const qty = parseFloat(draft.quantity) || 0;
  const unitCostEx = dollarsToCents(draft.unitCostEx);
  const markup = parseFloat(draft.markupPercent) || 0;
  if ((!draft.description.trim() && !draft.itemName.trim()) || qty <= 0 || unitCostEx <= 0) return null;
  const builderEx = Math.round(qty * unitCostEx);
  const amountEx = builderEx + Math.round((builderEx * markup) / 100);
  const amountInc = incGstFromEx(amountEx);
  return {
    itemName: draft.itemName.trim(),
    description: draft.description.trim() || draft.itemName.trim(),
    costCode: draft.costCode.trim() || null,
    quantity: qty,
    unitType: draft.unitType || "each",
    unitCostExTaxCents: unitCostEx,
    markupPercent: draft.markupPercent === "" ? null : markup,
    unitPrice: qty > 0 ? Math.round(amountInc / qty) : amountInc,
    totalPrice: amountInc,
  };
}

/**
 * Column visibility state, lifted out of the table so the picker can be rendered
 * anywhere — in practice the section header, above the header divider, rather
 * than floating inside the table body.
 */
export function useLineItemColumns(tableId: string) {
  const storageKey = `line-items-cols-${tableId}`;
  const [visible, setVisible] = useState<Set<ColumnKey>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return new Set(JSON.parse(saved) as ColumnKey[]);
    } catch { /* fall through to defaults */ }
    return new Set(DEFAULT_VISIBLE);
  });
  const toggleColumn = (key: ColumnKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };
  return { visible, toggleColumn };
}

export type LineItemColumns = ReturnType<typeof useLineItemColumns>;

/** Icon-only column picker. Render in the section header. */
export function LineItemColumnsButton({ columns }: { columns: LineItemColumns }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Columns"
          aria-label="Columns"
          data-testid="button-line-items-columns"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Visible columns</DropdownMenuLabel>
        {ALL_COLUMNS.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={columns.visible.has(c.key)}
            onCheckedChange={() => columns.toggleColumn(c.key)}
            className="text-xs"
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LineItemsTable({
  columns: columnState,
  rows,
  costCodes = [],
  onAdd,
  onUpdate,
  onDelete,
  addLabel = "Add line",
}: {
  /** From useLineItemColumns — shared with the header's LineItemColumnsButton. */
  columns: LineItemColumns;
  rows: LineItemRow[];
  costCodes?: { id: string; code: string; title: string }[];
  onAdd?: (line: NewLineItem) => void;
  /** Enables inline editing of existing rows. Receives the full recomputed line. */
  onUpdate?: (id: string, line: NewLineItem) => void;
  onDelete?: (id: string) => void;
  addLabel?: string;
}) {
  const { visible } = columnState;
  const widths = useColumnWidths();

  // editingId: "new" for the add row, or an existing row id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const columns = ALL_COLUMNS.filter((c) => visible.has(c.key));
  const gridTemplate = [...columns.map((c) => `${widths[c.key] ?? c.defaultWidth}px`), "56px"].join(" ");
  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.key] ?? c.defaultWidth), 0) + 56;

  // Drag-to-resize a column header. Live-updates the shared store so every
  // instance and both the header + rows track the width during the drag.
  const startResize = useCallback((key: ColumnKey, startX: number, startWidth: number) => {
    const onMove = (e: MouseEvent) => setColumnWidth(key, startWidth + (e.clientX - startX));
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
  }, []);

  const draftDerived = useMemo(() => {
    const qty = parseFloat(draft.quantity) || 0;
    const unitCostEx = dollarsToCents(draft.unitCostEx);
    const markup = parseFloat(draft.markupPercent) || 0;
    const builderEx = Math.round(qty * unitCostEx);
    const markupAmt = Math.round((builderEx * markup) / 100);
    const amountEx = builderEx + markupAmt;
    return {
      unitCostEx, builderEx, markupAmt, amountEx,
      unitCostInc: incGstFromEx(unitCostEx),
      builderInc: incGstFromEx(builderEx),
      amountInc: incGstFromEx(amountEx),
    };
  }, [draft]);

  const startAdd = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  };

  const startEdit = (row: LineItemRow) => {
    if (!onUpdate || row.editable === false) return;
    const d = deriveRow(row);
    setDraft({
      itemName: row.itemName || "",
      description: row.description || "",
      costCode: row.costCode || "",
      quantity: String(row.quantity),
      unitType: row.unitType || "each",
      unitCostEx: centsToDollars(d.unitCostEx).toFixed(2),
      markupPercent: row.markupPercent != null ? String(row.markupPercent) : "",
    });
    setEditingId(row.id);
  };

  const commit = () => {
    const line = draftToLine(draft);
    if (!line) return;
    if (editingId === "new") onAdd?.(line);
    else if (editingId) onUpdate?.(editingId, line);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const cancel = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  };

  const cellValue = (row: LineItemRow, key: ColumnKey): string => {
    const d = deriveRow(row);
    switch (key) {
      case "item": return row.itemName || "—";
      case "description": return row.description || "—";
      case "costCode": {
        if (!row.costCode) return "—";
        const cc = costCodes.find((c) => c.code === row.costCode);
        return cc ? `${cc.code} · ${cc.title}` : row.costCode;
      }
      case "qty": return String(row.quantity);
      case "unit": return row.unitType || "each";
      case "unitCostEx": return formatCents(d.unitCostEx);
      case "unitCostInc": return formatCents(d.unitCostInc);
      case "builderEx": return formatCents(d.builderEx);
      case "builderInc": return formatCents(d.builderInc);
      case "markupPct": return row.markupPercent != null ? `${row.markupPercent}%` : "—";
      case "markupAmt": return formatCents(d.markupAmt);
      case "amountEx": return formatCents(d.amountEx);
      case "amountInc": return formatCents(d.amountInc);
    }
  };

  // Input cell for the edit/add row.
  //
  // The input must be visually INDISTINGUISHABLE from the rendered cell — same
  // type size, same weight, same alignment, no box of its own. Editing should
  // feel like typing directly onto the row, with only the caret to show for it.
  // Any border/ring/background makes a dense table look like it has form
  // controls floating on top of it.
  const compact =
    "h-6 text-[11px] px-0 py-0 border-0 bg-transparent shadow-none rounded-none " +
    "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none " +
    "placeholder:text-muted-foreground/40";

  const inputCell = (key: ColumnKey) => {
    switch (key) {
      case "item":
        return <Input className={compact} placeholder="Item" value={draft.itemName} onChange={(e) => setDraft({ ...draft, itemName: e.target.value })} onKeyDown={handleKeyDown} autoFocus data-testid="input-line-item-name" />;
      case "description":
        return <Input className={compact} placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onKeyDown={handleKeyDown} data-testid="input-line-description" />;
      case "costCode":
        return (
          <Select value={draft.costCode || "__none__"} onValueChange={(v) => setDraft({ ...draft, costCode: v === "__none__" ? "" : v })}>
            {/* Chevron hidden until hover so the closed state reads as plain text */}
            <SelectTrigger
              className={`${compact} justify-start gap-1 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-0 hover:[&>svg]:opacity-40 focus:[&>svg]:opacity-40`}
              data-testid="select-line-cost-code"
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">— none —</SelectItem>
              {costCodes.map((cc) => (
                <SelectItem key={cc.id} value={cc.code} className="text-xs">
                  {cc.code} · {cc.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "qty":
        return <Input className={`${compact} text-right`} type="number" step="0.01" min="0" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} onKeyDown={handleKeyDown} data-testid="input-line-qty" />;
      case "unit":
        return <Input className={compact} placeholder="each" value={draft.unitType} onChange={(e) => setDraft({ ...draft, unitType: e.target.value })} onKeyDown={handleKeyDown} data-testid="input-line-unit" />;
      case "unitCostEx":
        return <Input className={`${compact} text-right`} type="number" step="0.01" min="0" placeholder="0.00" value={draft.unitCostEx} onChange={(e) => setDraft({ ...draft, unitCostEx: e.target.value })} onKeyDown={handleKeyDown} data-testid="input-line-unit-cost" />;
      case "markupPct":
        return <Input className={`${compact} text-right`} type="number" step="0.1" min="0" placeholder="0" value={draft.markupPercent} onChange={(e) => setDraft({ ...draft, markupPercent: e.target.value })} onKeyDown={handleKeyDown} data-testid="input-line-markup" />;
      // Derived columns show live-computed values while editing
      case "unitCostInc": return <span className="text-[11px] text-muted-foreground text-right">{formatCents(draftDerived.unitCostInc)}</span>;
      case "builderEx": return <span className="text-[11px] text-muted-foreground text-right">{formatCents(draftDerived.builderEx)}</span>;
      case "builderInc": return <span className="text-[11px] text-muted-foreground text-right">{formatCents(draftDerived.builderInc)}</span>;
      case "markupAmt": return <span className="text-[11px] text-muted-foreground text-right">{formatCents(draftDerived.markupAmt)}</span>;
      case "amountEx": return <span className="text-[11px] font-semibold text-right">{formatCents(draftDerived.amountEx)}</span>;
      case "amountInc": return <span className="text-[11px] font-semibold text-right">{formatCents(draftDerived.amountInc)}</span>;
    }
  };

  const editRow = (
    // No background tint: the row being edited should sit flush with the rest of
    // the table, same as when it is rendered read-only.
    <div
      className="grid items-center py-2 border-b border-border gap-2"
      style={{ gridTemplateColumns: gridTemplate }}
      data-testid="line-item-edit-row"
    >
      {columns.map((c) => (
        <div key={c.key} className={c.align === "right" ? "flex justify-end" : ""}>{inputCell(c.key)}</div>
      ))}
      <span className="flex justify-end gap-0.5">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={commit} data-testid="button-confirm-line">
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancel} data-testid="button-cancel-line">
          <X className="h-3 w-3" />
        </Button>
      </span>
    </div>
  );

  const totals = useMemo(() => {
    let ex = 0, inc = 0;
    for (const row of rows) {
      const d = deriveRow(row);
      ex += d.amountEx;
      inc += d.amountInc;
    }
    return { ex, inc };
  }, [rows]);

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${totalWidth}px` }}>
          {/* Header — each cell carries a drag handle on its right edge to resize */}
          <div
            className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((c) => (
              <span key={c.key} className={`relative ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startResize(c.key, e.clientX, widths[c.key] ?? c.defaultWidth);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-1/2 -translate-y-1/2 -right-[5px] h-4 w-[9px] cursor-col-resize flex items-center justify-center group/resize z-10"
                  title="Drag to resize"
                  data-testid={`resize-${c.key}`}
                >
                  <span className="h-3.5 w-px bg-border group-hover/resize:bg-primary transition-colors" />
                </span>
              </span>
            ))}
            <span />
          </div>

          {/* Rows */}
          {rows.map((row) =>
            editingId === row.id ? (
              <div key={row.id}>{editRow}</div>
            ) : (
              <div
                key={row.id}
                className={`grid items-center py-2 border-b border-border gap-2 ${onUpdate && row.editable !== false ? "cursor-pointer hover:bg-muted/40" : ""}`}
                style={{
                  gridTemplateColumns: gridTemplate,
                  background: row.pending ? "hsl(var(--sage-light) / 0.35)" : undefined,
                }}
                onClick={() => startEdit(row)}
                data-testid={`line-item-row-${row.id}`}
              >
                {columns.map((c) => (
                  <span
                    key={c.key}
                    className={`text-[11px] ${c.align === "right" ? "text-right font-medium" : ""} ${c.key === "item" || c.key === "amountInc" ? "font-semibold text-foreground" : "text-foreground"} truncate`}
                    title={cellValue(row, c.key)}
                  >
                    {cellValue(row, c.key)}
                  </span>
                ))}
                <span className="flex justify-end">
                  {onDelete && row.deletable !== false && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); onDelete(row.id); }}
                      data-testid={`button-delete-line-${row.id}`}
                    >
                      <Plus className="h-3 w-3 rotate-45" />
                    </Button>
                  )}
                </span>
              </div>
            )
          )}

          {/* Add row: inline, aligned to columns */}
          {onAdd && (editingId === "new" ? (
            editRow
          ) : (
            <div
              className="grid items-center py-2 border-b border-border gap-2 cursor-pointer hover:bg-muted/40"
              style={{ gridTemplateColumns: gridTemplate }}
              onClick={startAdd}
              data-testid="button-add-line-item"
            >
              <span className="text-xs font-medium col-span-full flex items-center gap-1.5" style={{ color: "hsl(var(--primary))", gridColumn: `1 / span ${columns.length + 1}` }}>
                <Plus className="h-3.5 w-3.5" /> {addLabel}
              </span>
            </div>
          ))}

          {/* Footer totals */}
          {rows.length > 0 && (
            <div className="flex justify-end items-center pt-2">
              <p className="text-xs font-semibold text-foreground">
                Subtotal: {formatCents(totals.ex)} ex / {formatCents(totals.inc)} inc
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
