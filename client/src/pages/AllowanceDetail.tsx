import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, ChevronDown, ChevronRight, CheckCircle, RotateCcw, Loader2, Link2, RefreshCw, MoreVertical, Ban } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/EmptyState";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useRef, useState } from "react";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";
import { Users, CalendarDays, Hash } from "lucide-react";
import { useResizableColumns, ColResizeHandle } from "@/components/useResizableColumns";
import {
  LineItemsTable,
  LineItemColumnsButton,
  useLineItemColumns,
  type LineItemRow,
  type NewLineItem,
} from "@/components/LineItemsTable";
import {
  formatCents,
  exGstFromInc,
  incGstFromEx,
  dollarsToCents,
  toNumber,
  timesheetHours,
  timesheetTotalExGstCents,
} from "@shared/money";

// ─── Types ────────────────────────────────────────────────────────────────────

type EstimateItem = {
  id: string;
  estimateId: string;
  name: string;
  allowance: string;
  allowanceStatus: string;
  /** "This item is not included" — the allowance is excluded and prices at $0. */
  notIncluded?: boolean | null;
  /** The line's price at the moment it was excluded, in dollars inc GST. */
  notIncludedOriginalPriceIncTax?: number | null;
  markupPercent: number | null;
  unitCostExTax: number;
  quantity: number;
  priceIncTax: number; // cents inc GST (recomputed server-side, never the raw cache)
  priceExTax?: number; // cents ex GST
  estimateName: string;
  estimateVersion: number;
  /** "draft" | "approved" | "contract" | "archived" — gates the header actions. */
  estimateStatus?: string;
};

type AllowanceWithCosts = {
  item: EstimateItem;
  actualCost: number; // cents inc GST (back-compat alias of actualCostIncGst)
  actualCostIncGst?: number;
  actualCostExGst?: number;
  variance: number;
};

type Bill = {
  id: string;
  billNumber: string;
  billDate: string;
  supplierId: string;
  supplierName?: string | null;
  billReference?: string;
  status: string; // draft | needs_review | awaiting_approval | awaiting_payment | paid
  total: number; // cents inc GST
};

/**
 * A line's raw `total` is ex- OR inc-GST depending on the bill's taxMode, so the
 * server derives explicit `totalExGst`/`totalIncGst` — always use those, never
 * `total`, for money in the allowance UI.
 */
type BillLineItem = {
  id: string;
  billId: string;
  description: string;
  quantity: number;
  unitPrice: number; // cents, basis depends on bill taxMode
  total: number; // cents, basis depends on bill taxMode — do not use directly
  totalExGst: number; // cents ex GST (server-computed, taxMode-aware)
  totalIncGst: number; // cents inc GST (server-computed, taxMode-aware)
  costCodeId?: string | null;
};

/** Bills approved for payment (or paid) are allocatable; earlier statuses show but can't be selected. */
const isBillApproved = (bill: Bill | undefined) =>
  !!bill && (bill.status === "awaiting_payment" || bill.status === "paid");

const billStatusLabel: Record<string, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  awaiting_approval: "Awaiting approval",
  awaiting_payment: "Approved",
  paid: "Paid",
};

type TimesheetCostCodeSplit = {
  id: string;
  costCodeId: string;
  duration: string | number;
  total: string | number;
};

type Timesheet = {
  id: string;
  projectId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string | number; // numeric(10,2) → string over the wire
  description: string;
  status: string;
  total: string | number; // dollars EX GST (hours × rate), numeric string
  costCodeId?: string | null;
  costCodeSplits?: TimesheetCostCodeSplit[];
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  chargeRate?: string | number | null; // numeric(10,2) → string over the wire; $/hr ex GST
};

type CostCode = {
  id: string;
  code: string;
  title: string;
};

type AllocatedBill = {
  id: string;
  billId: string;
  billNumber: string;
  billDate: string;
  supplierName: string;
  supplierId: string;
  lineItemDescription: string;
  amountIncGst: number;
  amountExGst: number;
};

type AllocatedTimesheet = {
  id: string;
  timesheetId: string;
  timesheetCostCodeId?: string | null;
  date: string;
  userId: string;
  staffName: string;
  description?: string;
  costCodeId?: string | null;
  costCodeLabel?: string | null;
  durationHours: number;
  hourlyRateCents: number;
  chargeRateCents?: number;
  costRateCents?: number;
  amountIncGst: number;
  amountExGst: number;
};

type AllocatedItem = {
  id: string;
  itemName?: string | null;
  description: string;
  costCode?: string | null;
  quantity: number;
  unitType?: string | null;
  unitCostExTaxCents?: number | null;
  markupPercent?: number | null;
  unitPrice: number;
  total: number;
  sortOrder?: number;
};

type LinkedSelection = {
  id: string;
  name: string;
  status: string;
  category?: string | null;
  room?: string | null;
  optionCount: number;
  selectedOption: {
    id: string;
    name: string;
    quantity: number;
    unitType: string;
    unitCostCents: number;
    unitCostExCents: number;
    gstInclusive: boolean;
    markupPercent: number | null;
    totalExCents: number;
    totalIncCents: number;
  } | null;
};

type AllowanceDetailData = {
  allocatedBills: AllocatedBill[];
  allocatedTimesheets: AllocatedTimesheet[];
  allocatedItems: AllocatedItem[];
  linkedSelection?: LinkedSelection | null;
};

type SelectionLite = {
  id: string;
  name: string;
  status: string;
  estimateItemId?: string | null;
};

/** One selectable row in the Add Timesheets modal — a whole timesheet, or one cost-code split of it. */
type TimesheetDisplayRow = {
  key: string;
  timesheetId: string;
  splitId: string | null;
  date: string;
  userId: string;
  startTime?: string;
  endTime?: string;
  status: string;
  description: string;
  hours: number;
  amountExCents: number; // labour is EX GST — here = hours × default charge rate
  chargeRateCents: number; // auto-filled from the user's charge rate; editable before save
  costRateCents: number;   // the timesheet's own cost rate, ex GST cents
  costCodeId: string | null;
  isSplit: boolean;
};

type PendingLine = NewLineItem & { id: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = formatCents;

// Shown wherever an allowance action is unavailable because the estimate isn't
// the contract yet. Says what to do instead, not just that it's blocked.
const NOT_CONTRACTED_HINT =
  "Available once this estimate is contracted. Until then, set the allowance to $0 in the estimate itself (unlock the estimate first if it is locked).";

/**
 * Pull the most specific message out of an apiRequest failure.
 * throwIfResNotOk (shared/api.ts) attaches the parsed response body as
 * `.payload`, so the server's `details` survives the round trip — swallowing it
 * behind "Please try again" leaves nobody able to diagnose a failed save.
 */
const errorMessage = (err: any): string =>
  err?.payload?.details ?? err?.payload?.error ?? err?.message ?? "Unknown error";

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const avatarColors = [
  { bg: "hsl(var(--amber-light))", text: "hsl(var(--amber))" },
  { bg: "hsl(var(--teal-light))", text: "hsl(var(--teal))" },
  { bg: "hsl(var(--sage-light))", text: "hsl(var(--sage))" },
  { bg: "hsl(var(--coral-light))", text: "hsl(var(--coral))" },
  { bg: "hsl(var(--primary) / 0.12)", text: "hsl(var(--primary))" },
];
const avatarColor = (index: number) => avatarColors[Math.abs(index) % avatarColors.length];

/** "07:00:00" → "07:00". Timesheet times carry seconds we never need to show. */
const hm = (t: string | undefined | null) => (t ? t.slice(0, 5) : "");

const formatDayMonth = (date: string) =>
  new Date(date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

const formatFullDate = (date: string) =>
  new Date(date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Bill picker. Two ways to select, because both are natural:
 *   - tick the BILL row to take every line on it in one go
 *   - expand a bill and tick individual lines when only part of it belongs here
 * Selection is always stored as line-item ids — a bill tick just selects all of
 * its lines — because the allocation itself is line-item level.
 */
function BillsPickerModal({
  open,
  onOpenChange,
  title,
  description,
  bills,
  billLineItems,
  costCodeLabel,
  isLoading,
  selected,
  setSelected,
  expanded,
  setExpanded,
  displayMode,
  setDisplayMode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  bills: Bill[];
  billLineItems: BillLineItem[];
  costCodeLabel: (id: string | null | undefined) => string;
  isLoading: boolean;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  displayMode?: "bill" | "line";
  setDisplayMode?: (m: "bill" | "line") => void;
}) {
  type SortKey = "date" | "supplier" | "costcode";
  const [sortBy, setSortBy] = useState<SortKey>("date");

  const linesFor = (billId: string) => billLineItems.filter((li) => li.billId === billId);

  // A bill's cost code, for sorting/among columns: the first line's code.
  // Bills spanning several codes show the first and a count.
  const billCostCodes = (billId: string) => {
    const codes = Array.from(new Set(linesFor(billId).map((li) => li.costCodeId).filter(Boolean))) as string[];
    return codes;
  };

  const sortedBills = useMemo(() => {
    const copy = [...bills];
    copy.sort((a, b) => {
      if (sortBy === "supplier") {
        return (a.supplierName || "").localeCompare(b.supplierName || "") ||
          new Date(b.billDate).getTime() - new Date(a.billDate).getTime();
      }
      if (sortBy === "costcode") {
        const ca = costCodeLabel(billCostCodes(a.id)[0]);
        const cb = costCodeLabel(billCostCodes(b.id)[0]);
        return ca.localeCompare(cb) || new Date(b.billDate).getTime() - new Date(a.billDate).getTime();
      }
      return new Date(b.billDate).getTime() - new Date(a.billDate).getTime();
    });
    return copy;
  }, [bills, sortBy, billLineItems]);

  const toggleExpanded = (billId: string) => {
    const s = new Set(expanded);
    s.has(billId) ? s.delete(billId) : s.add(billId);
    setExpanded(s);
  };

  const toggleLine = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const toggleBill = (billId: string) => {
    const lines = linesFor(billId);
    const all = lines.length > 0 && lines.every((li) => selected.has(li.id));
    const s = new Set(selected);
    if (all) lines.forEach((li) => s.delete(li.id));
    else lines.forEach((li) => s.add(li.id));
    setSelected(s);
  };

  const selectedLines = billLineItems.filter((li) => selected.has(li.id));
  const grid = "24px 20px 1.6fr 1fr 1fr 1.1fr 90px 1fr 1fr";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Sort toggle */}
        <div className="flex items-center gap-1 px-1 py-1 bg-muted rounded-lg self-start">
          {([
            ["date", "By Date", CalendarDays],
            ["supplier", "By Supplier", Users],
            ["costcode", "By Cost Code", Hash],
          ] as [SortKey, string, typeof Hash][]).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${sortBy === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid={`button-sort-bills-${key}`}
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && bills.length === 0 ? (
            <ModalLoading label="Loading bills…" />
          ) : bills.length === 0 ? (
            <EmptyState variant="inline" title="No bills found for this project" className="py-8" />
          ) : (
            <div>
              {/* Column header */}
              <div
                className="grid items-center text-[9px] font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border gap-2 px-1"
                style={{ gridTemplateColumns: grid }}
              >
                <span />
                <span />
                <span>Supplier</span>
                <span>Invoice #</span>
                <span>Date</span>
                <span>Cost Code</span>
                <span>Status</span>
                <span className="text-right">Ex GST</span>
                <span className="text-right">Inc GST</span>
              </div>

              {sortedBills.map((bill, idx) => {
                const lines = linesFor(bill.id);
                const isExpanded = expanded.has(bill.id);
                const approved = isBillApproved(bill);
                const allSelected = lines.length > 0 && lines.every((li) => selected.has(li.id));
                const someSelected = lines.some((li) => selected.has(li.id));
                const codes = billCostCodes(bill.id);
                const exTotal = lines.reduce((s, li) => s + li.totalExGst, 0);
                return (
                  <div key={bill.id}>
                    {/* Bill row */}
                    <div
                      className={`grid items-center px-1 py-2 border-b border-border gap-2 ${!approved ? "opacity-60" : ""}`}
                      style={{ gridTemplateColumns: grid }}
                      data-testid={`bill-row-${bill.id}`}
                    >
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        disabled={!approved || lines.length === 0}
                        onCheckedChange={() => approved && toggleBill(bill.id)}
                        data-testid={`checkbox-bill-${bill.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpanded(bill.id)}
                        className="flex items-center justify-center"
                        data-testid={`expand-bill-${bill.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                        >
                          {initials(bill.supplierName || bill.billNumber)}
                        </div>
                        <p className="text-xs font-semibold text-foreground truncate">{bill.supplierName || "—"}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{bill.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDayMonth(bill.billDate)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {codes.length === 0
                          ? "—"
                          : codes.length === 1
                            ? costCodeLabel(codes[0])
                            : `${costCodeLabel(codes[0])} +${codes.length - 1}`}
                      </p>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                        style={{
                          background: approved ? "hsl(var(--sage-light))" : "hsl(var(--amber-light))",
                          color: approved ? "hsl(var(--sage))" : "hsl(var(--amber))",
                        }}
                      >
                        {billStatusLabel[bill.status] ?? bill.status}
                      </span>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(exTotal)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.total)}</p>
                    </div>

                    {/* Line items */}
                    {isExpanded &&
                      lines.map((li) => (
                        <div
                          key={li.id}
                          className={`grid items-center px-1 py-1.5 border-b border-border gap-2 ${!approved ? "opacity-60" : ""}`}
                          style={{ gridTemplateColumns: grid, background: "hsl(var(--muted) / 0.35)" }}
                          data-testid={`bill-line-${li.id}`}
                        >
                          <span />
                          <Checkbox
                            checked={selected.has(li.id)}
                            disabled={!approved}
                            onCheckedChange={() => approved && toggleLine(li.id)}
                            data-testid={`checkbox-ps-line-item-${li.id}`}
                          />
                          <p className="text-[11px] text-foreground truncate pl-1">{li.description}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {li.quantity} × {formatCurrency(li.unitPrice)}
                          </p>
                          <span />
                          <p className="text-[10px] text-muted-foreground truncate">{costCodeLabel(li.costCodeId)}</p>
                          <span />
                          <p className="text-[11px] text-foreground text-right">{formatCurrency(li.totalExGst)}</p>
                          <p className="text-[11px] text-foreground text-right">{formatCurrency(li.totalIncGst)}</p>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {setDisplayMode && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Display in allowance:</Label>
                <Select value={displayMode} onValueChange={(v) => setDisplayMode(v as "bill" | "line")}>
                  <SelectTrigger className="h-7 text-xs w-36" data-testid="select-bill-display">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bill" className="text-xs">By Bill</SelectItem>
                    <SelectItem value="line" className="text-xs">By Line Item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedLines.length > 0
                ? `${selectedLines.length} line${selectedLines.length === 1 ? "" : "s"} selected · ${formatCurrency(selectedLines.reduce((s, li) => s + li.totalIncGst, 0))} inc GST`
                : "No lines selected"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setSelected(new Set()); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button onClick={() => onOpenChange(false)} disabled={selectedLines.length === 0} data-testid="button-save-ps-bills">
              Add {selectedLines.length > 0 ? `(${selectedLines.length})` : ""} Selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Editable charge-rate cell for a timesheet allocation. Reads as plain "$X/hr"
 * text but is a number input — click and type to change the rate. Commits on
 * blur or Enter (Esc reverts). Value is dollars/hr ex GST.
 */
function RateCell({ rateCents, onCommit }: { rateCents: number; onCommit: (dollars: string) => void }) {
  const [val, setVal] = useState((rateCents / 100).toFixed(2));
  // Keep in sync when the underlying rate changes (e.g. after a save/refetch).
  const lastRef = useRef(rateCents);
  if (lastRef.current !== rateCents) {
    lastRef.current = rateCents;
    setVal((rateCents / 100).toFixed(2));
  }
  return (
    <div className="flex items-center justify-end gap-0.5 text-[11px] text-foreground">
      <span className="text-muted-foreground">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => onCommit(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setVal((rateCents / 100).toFixed(2)); (e.target as HTMLInputElement).blur(); }
        }}
        className="w-12 bg-transparent p-0 text-right text-[11px] tabular-nums rounded-sm cursor-text border-x-0 border-t-0 border-b border-dashed border-muted-foreground/50 hover:border-solid hover:border-primary/70 focus:border-solid focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        title="Charge rate — click to edit"
        data-testid="input-charge-rate"
      />
      <span className="text-muted-foreground">/hr</span>
    </div>
  );
}

/** Shown while a modal's data is in flight, so an empty list never reads as "none exist". */
function ModalLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="modal-loading">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionCard({
  accentColor,
  iconBg,
  iconText,
  title,
  subtitle,
  actionLabel,
  onAction,
  headerExtra,
  children,
}: {
  accentColor: string;
  iconBg: string;
  iconText: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Rendered in the header row, above the divider (e.g. a column picker). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative bg-card rounded-xl border border-border overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accentColor }} />
      <div className="px-5 py-4 pl-6">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: iconBg, color: accentColor }}
            >
              {iconText}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerExtra}
            {actionLabel && onAction && (
              <Button size="sm" onClick={onAction} className="text-xs h-7 px-3">
                {actionLabel}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 border-t border-border" />
        {children}
      </div>
    </div>
  );
}

// Resizable-column configs (pixel default widths) for the bespoke timesheet and
// bills grids. Widths persist per namespace via useResizableColumns; the trailing
// 28px action column is fixed (not draggable).
const TS_COLUMNS = [
  { key: "name", defaultWidth: 190 },
  { key: "hours", defaultWidth: 70 },
  { key: "rate", defaultWidth: 90 },
  { key: "costCode", defaultWidth: 140 },
  { key: "ex", defaultWidth: 100 },
  { key: "inc", defaultWidth: 100 },
];
const BILL_COLUMNS = [
  { key: "supplier", defaultWidth: 200 },
  { key: "invoice", defaultWidth: 110 },
  { key: "date", defaultWidth: 100 },
  { key: "ex", defaultWidth: 100 },
  { key: "inc", defaultWidth: 100 },
  { key: "status", defaultWidth: 80 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AllowanceDetail() {
  const { projectId, allowanceId } = useParams<{ projectId: string; allowanceId: string }>();
  const [, setLocation] = useLocation();
  const { getStatusInfo } = useAllowanceStatusOptions();

  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  const [confirmNotIncludedOpen, setConfirmNotIncludedOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPsBillModalOpen, setIsPsBillModalOpen] = useState(false);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
  // How the modal LIST is grouped while picking (browsing aid only)
  const [timesheetGroupMode, setTimesheetGroupMode] = useState<"date" | "person" | "costcode">("person");
  const [showTsDescriptions, setShowTsDescriptions] = useState(true);
  // Groups the user has TOGGLED away from their default open/closed state.
  // Cleared on mode change so a label can't carry meaning between modes.
  // Default per mode: cost-code groups start COLLAPSED (there can be many);
  // date/person start expanded.
  const [toggledTsGroups, setToggledTsGroups] = useState<Set<string>>(new Set());
  const isTsGroupCollapsed = (label: string) =>
    timesheetGroupMode === "costcode"
      ? !toggledTsGroups.has(label) // default collapsed
      : toggledTsGroups.has(label); // default expanded
  const toggleTsGroup = (label: string) => {
    setToggledTsGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };
  const setGroupMode = (mode: "date" | "person" | "costcode") => {
    setTimesheetGroupMode(mode);
    setToggledTsGroups(new Set());
  };
  // How allocated timesheets are displayed in the allowance — persisted per allowance.
  // "person-summary" collapses each person to a single row (name + total hours + total).
  type TsDisplayPref = "person" | "person-summary" | "date";
  const displayPrefKey = `morada-allowance-ts-display-${allowanceId}`;
  const [timesheetDisplayPref, setTimesheetDisplayPrefState] = useState<TsDisplayPref>(() => {
    try {
      const saved = localStorage.getItem(displayPrefKey);
      return saved === "date" || saved === "person-summary" ? saved : "person";
    } catch {
      return "person";
    }
  });
  const setTimesheetDisplayPref = (v: TsDisplayPref) => {
    setTimesheetDisplayPrefState(v);
    try { localStorage.setItem(displayPrefKey, v); } catch { /* ignore */ }
  };

  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [expandedPsBills, setExpandedPsBills] = useState<Set<string>>(new Set());
  // Which people are expanded in the "By Person (totals)" view to reveal their
  // individual entries (each with its own editable rate + delete).
  const [expandedTsPersons, setExpandedTsPersons] = useState<Set<string>>(new Set());
  const toggleTsPerson = (name: string) =>
    setExpandedTsPersons((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
  const [selectedPsLineItems, setSelectedPsLineItems] = useState<Set<string>>(new Set());
  const [selectedTimesheetKeys, setSelectedTimesheetKeys] = useState<Set<string>>(new Set());
  const [pendingLines, setPendingLines] = useState<PendingLine[]>([]);
  const [pcPendingLines, setPcPendingLines] = useState<PendingLine[]>([]);
  const [isSavingPc, setIsSavingPc] = useState(false);
  const [isSavingPs, setIsSavingPs] = useState(false);
  const [selectionToLink, setSelectionToLink] = useState<string>("");

  // Column visibility lives here so the picker can sit in the section header.
  const customLineColumns = useLineItemColumns("allowance-custom-lines");
  const pcEntryColumns = useLineItemColumns("pc-cost-entries");

  // ── Queries ──
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  const { data: bills = [], isFetching: isFetchingBills } = useQuery<Bill[]>({
    queryKey: ["/api/projects", projectId, "bills"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/bills`);
      if (!res.ok) throw new Error("Failed to fetch bills");
      return res.json();
    },
    enabled: isBillModalOpen || isPsBillModalOpen,
  });

  const { data: billLineItems = [], isFetching: isFetchingBillLines } = useQuery<BillLineItem[]>({
    queryKey: ["/api/projects", projectId, "bill-line-items"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/bill-line-items`);
      if (!res.ok) throw new Error("Failed to fetch bill line items");
      return res.json();
    },
    enabled: isBillModalOpen || isPsBillModalOpen,
  });

  // These modals fetch on open. Until the response lands the arrays are empty,
  // and showing the "nothing here" empty state during that window reads as a
  // bug ("No bills found") rather than as loading — especially against a remote
  // database where the round trip is seconds, not milliseconds.
  const isLoadingBills = isFetchingBills || isFetchingBillLines;

  // context=allowance: financial workflow — server returns ALL project
  // timesheets (not just the requester's view scope) for permitted users.
  const { data: timesheets = [], isFetching: isLoadingTimesheets } = useQuery<Timesheet[]>({
    queryKey: ["/api/projects", projectId, "timesheets", "allowance-context"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/timesheets?context=allowance`);
      if (!res.ok) throw new Error("Failed to fetch timesheets");
      return res.json();
    },
    enabled: isTimesheetModalOpen,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: allocatedDetail, refetch: refetchDetail } = useQuery<AllowanceDetailData>({
    queryKey: ["/api/projects", projectId, "allowances", allowanceId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/allowances/${allowanceId}/detail`);
      if (!res.ok) return { allocatedBills: [], allocatedTimesheets: [], allocatedItems: [], linkedSelection: null };
      return res.json();
    },
    enabled: !!projectId && !!allowanceId,
  });

  const allocatedBills = allocatedDetail?.allocatedBills ?? [];
  const allocatedTimesheets = allocatedDetail?.allocatedTimesheets ?? [];
  const allocatedItems = allocatedDetail?.allocatedItems ?? [];
  const linkedSelection = allocatedDetail?.linkedSelection ?? null;

  const allowance = allowances.find((a) => a.item.id === allowanceId);
  const isPrimeCost = allowance?.item.allowance === "Prime Cost";

  // Allowance operations are contract-reconciliation actions — see
  // requireContractedEstimate on the server. Before the estimate is the
  // contract it is unlocked, so an unwanted allowance is edited to $0 in the
  // estimate itself. Restoring an excluded allowance is exempt (below), so a
  // reverted estimate can never be stuck at $0.
  const isContracted = allowance?.item.estimateStatus === "contract";

  // What "Include this item again" would put back. The stash is dollars inc GST
  // (estimate_items price fields are dollars); everything on this page is cents.
  const originalNotIncludedCents = dollarsToCents(
    allowance?.item.notIncludedOriginalPriceIncTax ?? 0,
  );

  // Selections picker (PC only, when nothing linked yet)
  const { data: projectSelections = [] } = useQuery<SelectionLite[]>({
    queryKey: ["/api/selections", projectId],
    queryFn: () => apiRequest(`/api/selections?projectId=${projectId}`, "GET"),
    enabled: !!projectId && !!isPrimeCost && !linkedSelection,
  });

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return userId.slice(0, 8) + "…";
    return `${user.firstName} ${user.lastName}`.trim() || userId.slice(0, 8);
  };

  // The user's charge rate (what we bill the client), ex GST cents. 0 when unset.
  const userChargeRateCents = (userId: string): number => {
    const user = users.find((u) => u.id === userId);
    return user ? dollarsToCents(user.chargeRate) : 0;
  };

  // Per-row charge-rate edits for PENDING (unsaved) timesheet allocations,
  // keyed by row key. Empty = use the auto-filled default.
  const [pendingRateOverrides, setPendingRateOverrides] = useState<Record<string, number>>({});

  const costCodeMap = useMemo(() => {
    const m = new Map<string, CostCode>();
    for (const cc of costCodes) m.set(cc.id, cc);
    return m;
  }, [costCodes]);

  const costCodeLabel = (costCodeId: string | null | undefined): string => {
    if (!costCodeId) return "—";
    const cc = costCodeMap.get(costCodeId);
    return cc ? `${cc.code} · ${cc.title}` : "—";
  };

  // Resizable columns for the timesheet + bills grids (widths persist per table).
  const tsCols = useResizableColumns("allowance-timesheets", TS_COLUMNS, 28);
  const billCols = useResizableColumns("allowance-bills", BILL_COLUMNS, 28);

  // Bills display mode: one row per bill (grouped, expandable) or a flat list of
  // every line-item allocation. Persisted; set from the bills modal footer.
  const [billDisplayMode, setBillDisplayModeState] = useState<"bill" | "line">(() => {
    try { return localStorage.getItem("allowance-bill-display") === "line" ? "line" : "bill"; } catch { return "bill"; }
  });
  const setBillDisplayMode = (m: "bill" | "line") => {
    setBillDisplayModeState(m);
    try { localStorage.setItem("allowance-bill-display", m); } catch { /* ignore */ }
  };
  const [expandedBillGroups, setExpandedBillGroups] = useState<Set<string>>(new Set());
  const toggleBillGroup = (billId: string) =>
    setExpandedBillGroups((prev) => {
      const next = new Set(prev);
      next.has(billId) ? next.delete(billId) : next.add(billId);
      return next;
    });

  // Saved bill allocations grouped by their parent bill (several line-item
  // allocations can share one bill).
  const billGroups = (() => {
    const m = new Map<string, AllocatedBill[]>();
    for (const b of allocatedBills) {
      if (!m.has(b.billId)) m.set(b.billId, []);
      m.get(b.billId)!.push(b);
    }
    return Array.from(m.entries());
  })();

  // "By Bill" render: one summary row per bill (amounts summed), expandable into
  // its individual line-item allocations, each removable. Used by both the PC and
  // PS bills sections so their markup stays identical.
  const renderBillGroups = () =>
    billGroups.map(([billId, group], idx) => {
      const first = group[0];
      const ex = group.reduce((s, b) => s + b.amountExGst, 0);
      const inc = group.reduce((s, b) => s + b.amountIncGst, 0);
      const expanded = expandedBillGroups.has(billId);
      return (
        <div key={billId}>
          <div
            className="grid items-center py-2.5 border-b border-border gap-2 cursor-pointer hover:bg-muted/30 rounded-sm"
            style={{ gridTemplateColumns: billCols.gridTemplate }}
            onClick={() => toggleBillGroup(billId)}
            data-testid={`bill-group-${billId}`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
              >
                {initials(first.supplierName || first.billNumber)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{first.supplierName || "—"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{group.length} line{group.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{first.billNumber}</p>
            <p className="text-[11px] text-muted-foreground">{formatFullDate(first.billDate)}</p>
            <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(ex)}</p>
            <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(inc)}</p>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
              style={{ background: "hsl(var(--sage-light))", color: "hsl(var(--sage))" }}
            >
              Saved
            </span>
            <span />
          </div>
          {expanded && group.map((bill) => (
            <div
              key={bill.id}
              className="grid items-center py-2 border-b border-border gap-2"
              style={{ gridTemplateColumns: billCols.gridTemplate, background: "hsl(var(--muted) / 0.15)" }}
            >
              <p className="text-[11px] text-foreground pl-8 truncate">{bill.lineItemDescription || "—"}</p>
              <p className="text-[11px] text-muted-foreground">{bill.billNumber}</p>
              <p className="text-[11px] text-muted-foreground">{formatFullDate(bill.billDate)}</p>
              <p className="text-[11px] font-semibold text-foreground text-right">{formatCurrency(bill.amountExGst)}</p>
              <p className="text-[11px] font-semibold text-foreground text-right">{formatCurrency(bill.amountIncGst)}</p>
              <span />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => deleteBillAllocationMutation.mutate(bill.id)}
                data-testid={`button-remove-bill-${bill.id}`}
              >
                <Plus className="h-3 w-3 rotate-45" />
              </Button>
            </div>
          ))}
        </div>
      );
    });

  const { toast } = useToast();

  // ── Timesheet display rows (one per cost-code split, so each coded portion
  //    can be allocated to its own allowance) ──
  const timesheetRows = useMemo<TimesheetDisplayRow[]>(() => {
    // Charge rate auto-fills from the user's charge rate; if they have none,
    // fall back to the timesheet's own (cost) rate as a starting number rather
    // than $0. Either way it's editable per row before saving. amountExCents is
    // the CHARGE (what we bill) = hours × charge rate.
    const build = (
      key: string, timesheetId: string, splitId: string | null, ts: Timesheet,
      hours: number, costTotalCents: number, costCodeId: string | null, isSplit: boolean,
    ): TimesheetDisplayRow => {
      const costRateCents = hours > 0 ? Math.round(costTotalCents / hours) : 0;
      const chargeRateCents = userChargeRateCents(ts.userId) || costRateCents;
      return {
        key, timesheetId, splitId,
        date: ts.date, userId: ts.userId, startTime: ts.startTime, endTime: ts.endTime,
        status: ts.status, description: ts.description || "",
        hours,
        chargeRateCents,
        costRateCents,
        amountExCents: Math.round(hours * chargeRateCents),
        costCodeId, isSplit,
      };
    };

    const rows: TimesheetDisplayRow[] = [];
    for (const ts of timesheets) {
      const splits = ts.costCodeSplits ?? [];
      if (splits.length > 1) {
        for (const split of splits) {
          rows.push(build(`${ts.id}|${split.id}`, ts.id, split.id, ts,
            toNumber(split.duration), dollarsToCents(split.total), split.costCodeId ?? null, true));
        }
      } else {
        rows.push(build(`${ts.id}|full`, ts.id, null, ts,
          timesheetHours(ts), timesheetTotalExGstCents(ts), ts.costCodeId ?? splits[0]?.costCodeId ?? null, false));
      }
    }
    return rows;
  }, [timesheets, users]);

  // Rows already allocated to THIS allowance can't be double-added
  const alreadyAllocatedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of allocatedTimesheets) {
      s.add(`${a.timesheetId}|${a.timesheetCostCodeId ?? "full"}`);
    }
    return s;
  }, [allocatedTimesheets]);

  const pendingTimesheetRows = timesheetRows
    .filter((r) => selectedTimesheetKeys.has(r.key))
    .map((r) => {
      const override = pendingRateOverrides[r.key];
      if (override === undefined) return r;
      return { ...r, chargeRateCents: override, amountExCents: Math.round(r.hours * override) };
    });

  // ── Mutations ──
  const createBillLineItemAllowanceMutation = useMutation({
    mutationFn: async ({ billLineItemId, amount }: { billLineItemId: string; amount: number }) => {
      return apiRequest("/api/bill-line-item-allowances", "POST", {
        billLineItemId,
        estimateItemId: allowanceId,
        amount,
      });
    },
  });

  const createTimesheetAllowanceMutation = useMutation({
    mutationFn: async (payload: { timesheetId: string; timesheetCostCodeId: string | null; amount: number; hours: number; chargeRateCents: number; costRateCents: number }) => {
      return apiRequest("/api/timesheet-allowances", "POST", {
        timesheetId: payload.timesheetId,
        timesheetCostCodeId: payload.timesheetCostCodeId,
        estimateItemId: allowanceId,
        amount: payload.amount, // EX GST cents — labour carries no GST; = hours × chargeRate (the charge)
        hours: String(payload.hours),
        chargeRateCents: payload.chargeRateCents,
        costRateCents: payload.costRateCents,
      });
    },
  });

  // Edit the charge rate on an already-SAVED allocation. amount = hours × rate.
  const updateTimesheetRateMutation = useMutation({
    mutationFn: async (payload: { id: string; chargeRateCents: number; hours: number }) =>
      apiRequest(`/api/timesheet-allowances/${payload.id}`, "PATCH", {
        chargeRateCents: payload.chargeRateCents,
        amount: Math.round(payload.hours * payload.chargeRateCents),
      }),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    },
    onError: (err: any) => toast({ title: "Couldn't update rate", description: errorMessage(err), variant: "destructive" }),
  });

  const createAllowanceItemMutation = useMutation({
    mutationFn: async (item: Partial<NewLineItem> & { description: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }) => {
      return apiRequest("/api/allowance-items", "POST", {
        estimateItemId: allowanceId,
        ...item,
      });
    },
  });

  const updateAllowanceItemMutation = useMutation({
    mutationFn: async ({ id, line }: { id: string; line: NewLineItem }) =>
      apiRequest(`/api/allowance-items/${id}`, "PATCH", {
        itemName: line.itemName || null,
        description: line.description,
        costCode: line.costCode,
        quantity: line.quantity,
        unitType: line.unitType,
        unitCostExTaxCents: line.unitCostExTaxCents,
        markupPercent: line.markupPercent,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
      }),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update line", variant: "destructive" }),
  });

  const deleteAllowanceItemMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/allowance-items/${id}`, "DELETE"),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove line", variant: "destructive" }),
  });

  const deleteBillAllocationMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/bill-line-item-allowances/${id}`, "DELETE"),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove bill allocation", variant: "destructive" }),
  });

  const deleteTimesheetAllocationMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/timesheet-allowances/${id}`, "DELETE"),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove timesheet allocation", variant: "destructive" }),
  });

  const updateAllowanceStatusMutation = useMutation({
    mutationFn: async (allowanceStatus: string) => {
      return apiRequest(`/api/estimate-items/${allowanceId}/allowance-status`, "PATCH", { allowanceStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  // "This item is not included" — excludes the allowance so it prices at $0.
  // Hits its own endpoint because a contracted estimate is locked, and the
  // ordinary item PATCH refuses to touch a locked estimate.
  const notIncludedMutation = useMutation({
    mutationFn: async (notIncluded: boolean) =>
      apiRequest(`/api/estimate-items/${allowanceId}/not-included`, "PATCH", { notIncluded }),
    onSuccess: async (_data, notIncluded) => {
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      // The estimate total moved, so anything showing it is now stale.
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: notIncluded ? "Marked not included" : "Allowance restored",
        description: notIncluded
          ? "This allowance is now $0. Raise a variation to credit the client."
          : "The original allowance amount has been restored.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: errorMessage(err) || "Failed to update", variant: "destructive" }),
  });

  const linkSelectionMutation = useMutation({
    mutationFn: async (selectionId: string) =>
      apiRequest(`/api/selections/${selectionId}`, "PATCH", { estimateItemId: allowanceId }),
    onSuccess: async () => {
      setSelectionToLink("");
      await refetchDetail();
      toast({ title: "Selection linked" });
    },
    onError: () => toast({ title: "Error", description: "Failed to link selection", variant: "destructive" }),
  });

  const syncSelectionMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/projects/${projectId}/allowances/${allowanceId}/sync-selection`, "POST", {}),
    onSuccess: async () => {
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Selection costing applied" });
    },
    onError: () => toast({ title: "Error", description: "Failed to apply selection costing", variant: "destructive" }),
  });

  // ── Handlers ──
  const saveLine = async (line: PendingLine, sortOrder: number) => {
    await createAllowanceItemMutation.mutateAsync({
      itemName: line.itemName || (null as any),
      description: line.description,
      costCode: line.costCode,
      quantity: line.quantity,
      unitType: line.unitType,
      unitCostExTaxCents: line.unitCostExTaxCents,
      markupPercent: line.markupPercent,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
      sortOrder,
    });
  };

  const handleSavePcItem = async () => {
    if (isSavingPc) return;
    if (selectedLineItems.size === 0 && pcPendingLines.length === 0) return;
    setIsSavingPc(true);
    try {
      const billItems = billLineItems.filter((item) => selectedLineItems.has(item.id));
      const lines = [...pcPendingLines];
      for (const item of billItems) {
        // Bill line items are stored EX GST; allocations are inc-GST cents
        await createBillLineItemAllowanceMutation.mutateAsync({ billLineItemId: item.id, amount: item.totalIncGst });
      }
      for (let i = 0; i < lines.length; i++) await saveLine(lines[i], i);
      // Clear pending state BEFORE refetching — clearing after lets the saved
      // copy and the pending copy render together for a moment (or persist if
      // a refetch throws), which read as duplicated rows.
      setSelectedLineItems(new Set());
      setPcPendingLines([]);
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    } catch (err: any) {
      console.error("[allowance] PC save failed:", err);
      toast({
        title: "Couldn't save PC allowance",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsSavingPc(false);
    }
  };

  const handleSavePsItem = async () => {
    if (selectedPsLineItems.size === 0 && pendingTimesheetRows.length === 0 && pendingLines.length === 0) return;
    if (isSavingPs) return;
    setIsSavingPs(true);
    try {
      const billItems = billLineItems.filter((item) => selectedPsLineItems.has(item.id));
      const tsRows = [...pendingTimesheetRows];
      const lines = [...pendingLines];
      for (const item of billItems) {
        await createBillLineItemAllowanceMutation.mutateAsync({ billLineItemId: item.id, amount: item.totalIncGst });
      }
      for (const row of tsRows) {
        await createTimesheetAllowanceMutation.mutateAsync({
          timesheetId: row.timesheetId,
          timesheetCostCodeId: row.splitId,
          amount: row.amountExCents, // = hours × charge rate
          hours: row.hours,
          chargeRateCents: row.chargeRateCents,
          costRateCents: row.costRateCents,
        });
      }
      for (let i = 0; i < lines.length; i++) await saveLine(lines[i], i);
      // Clear pending BEFORE refetch (see handleSavePcItem)
      setSelectedPsLineItems(new Set());
      setSelectedTimesheetKeys(new Set());
      setPendingRateOverrides({});
      setPendingLines([]);
      await refetchDetail();
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
    } catch (err: any) {
      console.error("[allowance] PS save failed:", err);
      toast({
        title: "Couldn't save PS allowance",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsSavingPs(false);
    }
  };

  const toggleBillExpanded = (billId: string) => {
    const s = new Set(expandedBills);
    s.has(billId) ? s.delete(billId) : s.add(billId);
    setExpandedBills(s);
  };
  const toggleLineItemSelection = (id: string) => {
    const s = new Set(selectedLineItems);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedLineItems(s);
  };
  const togglePsBillExpanded = (billId: string) => {
    const s = new Set(expandedPsBills);
    s.has(billId) ? s.delete(billId) : s.add(billId);
    setExpandedPsBills(s);
  };
  const togglePsLineItemSelection = (id: string) => {
    const s = new Set(selectedPsLineItems);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedPsLineItems(s);
  };
  const toggleTimesheetSelection = (key: string) => {
    const s = new Set(selectedTimesheetKeys);
    s.has(key) ? s.delete(key) : s.add(key);
    setSelectedTimesheetKeys(s);
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!allowance) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Button variant="ghost" onClick={() => setLocation(`/projects/${projectId}/allowances`)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allowances
        </Button>
        <EmptyState
          variant="card"
          title="Allowance Not Found"
          description="The requested allowance could not be found."
        />
      </div>
    );
  }

  const { item, variance } = allowance;
  const statusInfo = getStatusInfo(item.allowanceStatus);

  const estimateIncGst = item.priceIncTax;
  // Prefer the server's exact ex-GST figure (priceIncTax − taxAmount) over
  // re-deriving by division, which can land a cent off.
  const estimateExGst = item.priceExTax ?? exGstFromInc(estimateIncGst);
  const actualIncGst = allowance.actualCostIncGst ?? allowance.actualCost;
  const actualExGst = allowance.actualCostExGst ?? exGstFromInc(actualIncGst);
  const varianceIncGst = Math.abs(variance);
  const varianceExGst = exGstFromInc(varianceIncGst);
  const isOverBudget = variance > 0;
  const percentUsed = estimateIncGst > 0 ? Math.min(Math.round((actualIncGst / estimateIncGst) * 100), 100) : 0;

  const statusBgColor = statusInfo.color ? `${statusInfo.color}18` : "hsl(var(--muted))";
  const statusTextColor = statusInfo.color || "hsl(var(--muted-foreground))";

  const pendingPsBillItems = billLineItems.filter((li) => selectedPsLineItems.has(li.id));
  const pendingPcBillItems = billLineItems.filter((li) => selectedLineItems.has(li.id));
  const hasPendingItems = pendingPsBillItems.length > 0 || pendingTimesheetRows.length > 0 || pendingLines.length > 0;
  const hasPcPendingItems = pendingPcBillItems.length > 0 || pcPendingLines.length > 0;

  // Live (unsaved) additions, for the running totals in the summary bar
  const psPendingExCents =
    pendingPsBillItems.reduce((s, li) => s + li.totalExGst, 0) +
    pendingTimesheetRows.reduce((s, r) => s + r.amountExCents, 0) +
    pendingLines.reduce((s, l) => s + exGstFromInc(l.totalPrice), 0);
  const psPendingIncCents =
    pendingPsBillItems.reduce((s, li) => s + li.totalIncGst, 0) +
    pendingTimesheetRows.reduce((s, r) => s + incGstFromEx(r.amountExCents), 0) +
    pendingLines.reduce((s, l) => s + l.totalPrice, 0);
  const pcPendingExCents =
    pendingPcBillItems.reduce((s, li) => s + li.totalExGst, 0) +
    pcPendingLines.reduce((s, l) => s + exGstFromInc(l.totalPrice), 0);
  const pcPendingIncCents =
    pendingPcBillItems.reduce((s, li) => s + li.totalIncGst, 0) +
    pcPendingLines.reduce((s, l) => s + l.totalPrice, 0);
  const pendingExCents = isPrimeCost ? pcPendingExCents : psPendingExCents;
  const pendingIncCents = isPrimeCost ? pcPendingIncCents : psPendingIncCents;

  // Custom lines table rows: saved + pending
  const customLineRows: LineItemRow[] = [
    ...allocatedItems.map((i) => ({
      id: i.id,
      itemName: i.itemName,
      description: i.description,
      costCode: i.costCode,
      quantity: i.quantity,
      unitType: i.unitType,
      unitCostExTaxCents: i.unitCostExTaxCents,
      markupPercent: i.markupPercent,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    ...pendingLines.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      description: l.description,
      costCode: l.costCode,
      quantity: l.quantity,
      unitType: l.unitType,
      unitCostExTaxCents: l.unitCostExTaxCents,
      markupPercent: l.markupPercent,
      unitPrice: l.unitPrice,
      total: l.totalPrice,
      pending: true,
    })),
  ];

  const handleDeleteCustomLine = (id: string) => {
    if (pendingLines.some((l) => l.id === id)) {
      setPendingLines(pendingLines.filter((l) => l.id !== id));
    } else {
      deleteAllowanceItemMutation.mutate(id);
    }
  };

  // Allowance-section timesheet groups (saved + pending), grouped per the
  // per-allowance display preference (By Person / By Date)
  type SectionTimesheetRow = {
    id: string;        // allocation id (saved) or row key (pending)
    saved: boolean;
    pendingKey?: string; // pending-row key, for editing the override
    staffName: string;
    date: string;
    hours: number;
    rateCents: number;   // the CHARGE rate — editable
    costRateCents: number;
    costCode: string;
    exCents: number;
    incCents: number;
  };
  const sectionTimesheetRows: SectionTimesheetRow[] = [
    ...allocatedTimesheets.map((ts) => ({
      id: ts.id,
      saved: true,
      staffName: ts.staffName || "Team member",
      date: ts.date,
      hours: ts.durationHours,
      rateCents: ts.chargeRateCents ?? ts.hourlyRateCents,
      costRateCents: ts.costRateCents ?? 0,
      costCode: ts.costCodeLabel || costCodeLabel(ts.costCodeId),
      exCents: ts.amountExGst,
      incCents: ts.amountIncGst,
    })),
    ...pendingTimesheetRows.map((row) => ({
      id: row.key,
      saved: false,
      pendingKey: row.key,
      staffName: getUserName(row.userId),
      date: row.date,
      hours: row.hours,
      rateCents: row.chargeRateCents,
      costRateCents: row.costRateCents,
      costCode: costCodeLabel(row.costCodeId),
      exCents: row.amountExCents,
      incCents: incGstFromEx(row.amountExCents),
    })),
  ];

  // Commit a charge-rate edit for a section row. Pending → local override;
  // saved → PATCH the allocation. Value is dollars/hr (ex GST).
  const commitRateEdit = (row: SectionTimesheetRow, dollarsPerHour: string) => {
    const cents = dollarsToCents(dollarsPerHour);
    if (row.saved) {
      if (cents !== row.rateCents) updateTimesheetRateMutation.mutate({ id: row.id, chargeRateCents: cents, hours: row.hours });
    } else if (row.pendingKey) {
      setPendingRateOverrides((prev) => ({ ...prev, [row.pendingKey!]: cents }));
    }
  };
  const sectionTimesheetGroups = (() => {
    const groups = new Map<string, SectionTimesheetRow[]>();
    for (const row of sectionTimesheetRows) {
      const key = timesheetDisplayPref === "date" ? formatFullDate(row.date) : row.staffName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries());
  })();

  // "By Person (totals)": one collapsed row per person — name, summed hours, summed amounts
  const personSummaryRows = sectionTimesheetGroups.map(([staffName, rows]) => {
    const hours = rows.reduce((s, r) => s + r.hours, 0);
    const exCents = rows.reduce((s, r) => s + r.exCents, 0);
    // Keep the FULL "code · title" labels (not just the number). One code → show
    // it in full; several → "N cost codes" (the individual codes show on expand).
    const codeLabels = Array.from(new Set(rows.map((r) => r.costCode).filter((c) => c !== "—")));
    return {
      staffName,
      hours: Math.round(hours * 100) / 100,
      rateCents: hours > 0 ? Math.round(exCents / hours) : 0,
      costCode: codeLabels.length === 0 ? "—" : codeLabels.length === 1 ? codeLabels[0] : `${codeLabels.length} cost codes`,
      exCents,
      incCents: rows.reduce((s, r) => s + r.incCents, 0),
      allSaved: rows.every((r) => r.saved),
      rows, // the underlying entries, revealed when the Totals row is expanded
    };
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-4 max-w-5xl mx-auto">

        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(`/projects/${projectId}/allowances`)}
          className="mb-1 -ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Allowances
        </Button>

        {/* ── HEADER CARD ─────────────────────────────────────────────────── */}
        <div className="relative bg-card rounded-xl border border-border overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
          <div className="px-5 py-4 pl-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate mb-2" data-testid="allowance-name">
                  {item.name}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-primary">
                    {isPrimeCost ? "Prime Cost" : "Provisional Sum"}
                  </span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground">
                    {item.estimateName} (v{item.estimateVersion})
                  </span>
                  {item.notIncluded && (
                    <>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]"
                        data-testid="badge-not-included"
                      >
                        <Ban className="h-3 w-3" />
                        Not included · $0
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: statusBgColor, color: statusTextColor }}
                  data-testid="badge-status"
                >
                  ● {statusInfo.name}
                </span>
                {item.allowanceStatus !== "finalized" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateAllowanceStatusMutation.isPending || !isContracted}
                    title={isContracted ? undefined : NOT_CONTRACTED_HINT}
                    onClick={() => updateAllowanceStatusMutation.mutate("finalized")}
                    data-testid="button-finalise-allowance"
                  >
                    {updateAllowanceStatusMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Finalise
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={updateAllowanceStatusMutation.isPending || !isContracted}
                    title={isContracted ? undefined : NOT_CONTRACTED_HINT}
                    onClick={() => updateAllowanceStatusMutation.mutate("in_progress")}
                    data-testid="button-reopen-allowance"
                  >
                    {updateAllowanceStatusMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Reopen
                  </Button>
                )}

                {/* Overflow menu — exclusion lives here rather than as a primary
                    action: it zeroes the line and is rare, but it must be
                    reachable AFTER the estimate is contracted (and locked). */}
                <Popover open={itemMenuOpen} onOpenChange={setItemMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      data-testid="button-allowance-menu"
                      aria-label="More allowance actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-1">
                    {!item.notIncluded ? (
                      <button
                        type="button"
                        disabled={notIncludedMutation.isPending || !isContracted}
                        onClick={() => {
                          setItemMenuOpen(false);
                          setConfirmNotIncludedOpen(true);
                        }}
                        className="w-full flex items-start gap-2.5 rounded px-2 py-2 text-left hover-elevate active-elevate-2 disabled:opacity-50 disabled:hover:bg-transparent"
                        data-testid="button-mark-not-included"
                      >
                        <Ban className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">This item is not included</span>
                          <span className="block text-[11px] text-muted-foreground leading-snug">
                            {isContracted
                              ? "Sets the allowance to $0. The original amount is kept so you can undo it."
                              : NOT_CONTRACTED_HINT}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={notIncludedMutation.isPending}
                        onClick={() => {
                          setItemMenuOpen(false);
                          notIncludedMutation.mutate(false);
                        }}
                        className="w-full flex items-start gap-2.5 rounded px-2 py-2 text-left hover-elevate active-elevate-2 disabled:opacity-50"
                        data-testid="button-mark-included"
                      >
                        <RotateCcw className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">Include this item again</span>
                          <span className="block text-[11px] text-muted-foreground leading-snug">
                            Restores {formatCurrency(originalNotIncludedCents)} to the estimate.
                          </span>
                        </span>
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {isPrimeCost ? "PC" : "PS"} allowance · {item.estimateName}
                {item.notIncluded && (
                  <>
                    {" · "}
                    <span className="text-[hsl(var(--coral))]">
                      Excluded — was {formatCurrency(originalNotIncludedCents)}. The client still
                      needs a variation to be credited.
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Confirm exclusion. Worth a step: it drops the estimate total and, on
            a contracted job, changes what the client owes. */}
        <Dialog open={confirmNotIncludedOpen} onOpenChange={setConfirmNotIncludedOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark “{item.name}” as not included?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 pt-1 text-sm">
                  <p>
                    This allowance drops from{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(allowance?.item.priceIncTax ?? 0)}
                    </span>{" "}
                    to <span className="font-semibold text-foreground">$0</span> and the estimate
                    total falls by the same amount.
                  </p>
                  <p>
                    The original amount is kept, so you can undo this at any time from the same
                    menu.
                  </p>
                  <p className="text-[hsl(var(--coral))]">
                    If this allowance is already contracted, the client is not credited by this
                    action — raise a variation with a deduction line for{" "}
                    {formatCurrency(allowance?.item.priceIncTax ?? 0)}.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmNotIncludedOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={notIncludedMutation.isPending}
                onClick={() => {
                  notIncludedMutation.mutate(true);
                  setConfirmNotIncludedOpen(false);
                }}
                data-testid="button-confirm-not-included"
              >
                {notIncludedMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Mark not included
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── FINANCIAL SUMMARY ───────────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Estimate</p>
              <p className="text-2xl font-bold text-foreground" data-testid="text-estimate-price">
                {formatCurrency(estimateExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(estimateIncGst)} inc GST</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Actual Spend</p>
              <p className="text-2xl font-bold text-foreground" data-testid="text-actual-price">
                {formatCurrency(actualExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(actualIncGst)} inc GST</p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Variance</p>
              <p
                className="text-2xl font-bold"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
                data-testid="text-variance"
              >
                {isOverBudget ? "↑" : "↓"} {formatCurrency(varianceExGst)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">ex GST</p>
              <p
                className="text-[10px] font-medium"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
              >
                {isOverBudget ? "Over budget" : "Under budget"}
              </p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-1">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percentUsed}%`,
                  background: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[10px] text-muted-foreground">{percentUsed}% used</p>
              <p
                className="text-[10px] font-medium"
                style={{ color: isOverBudget ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
              >
                {formatCurrency(Math.abs(estimateExGst - actualExGst))} ex remaining
              </p>
            </div>
          </div>
        </div>

        {/* ── PS SECTIONS ─────────────────────────────────────────────────── */}
        {!isPrimeCost && (
          <>
            {/* Bills */}
            <SectionCard
              accentColor="hsl(var(--amber))"
              iconBg="hsl(var(--amber-light))"
              iconText="$"
              title="Bills"
              subtitle="Supplier invoices for this allowance"
              actionLabel="+ Add Bills"
              onAction={() => setIsPsBillModalOpen(true)}
            >
              {/* No empty-state card: an empty table still shows its header row
                  and the section's add action, exactly like Cost Entries /
                  Custom Lines. One pattern for every table on the page. */}
              {(
                <div className="pt-2">
                 <div className="overflow-x-auto">
                  <div style={{ minWidth: `${billCols.minWidth}px` }}>
                  <div
                    className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                    style={{ gridTemplateColumns: billCols.gridTemplate }}
                  >
                    <span className="relative">Supplier
                      <ColResizeHandle testId="resize-bill-supplier" onStart={(e) => billCols.startResize("supplier", e.clientX, billCols.widthFor("supplier", 200))} />
                    </span>
                    <span className="relative">Invoice #
                      <ColResizeHandle testId="resize-bill-invoice" onStart={(e) => billCols.startResize("invoice", e.clientX, billCols.widthFor("invoice", 110))} />
                    </span>
                    <span className="relative">Date
                      <ColResizeHandle testId="resize-bill-date" onStart={(e) => billCols.startResize("date", e.clientX, billCols.widthFor("date", 100))} />
                    </span>
                    <span className="relative text-right">Ex GST
                      <ColResizeHandle testId="resize-bill-ex" onStart={(e) => billCols.startResize("ex", e.clientX, billCols.widthFor("ex", 100))} />
                    </span>
                    <span className="relative text-right">Inc GST
                      <ColResizeHandle testId="resize-bill-inc" onStart={(e) => billCols.startResize("inc", e.clientX, billCols.widthFor("inc", 100))} />
                    </span>
                    <span className="relative">Status
                      <ColResizeHandle testId="resize-bill-status" onStart={(e) => billCols.startResize("status", e.clientX, billCols.widthFor("status", 80))} />
                    </span>
                    <span />
                  </div>
                  {billDisplayMode === "bill" && renderBillGroups()}
                  {billDisplayMode === "line" && allocatedBills.map((bill, idx) => (
                    <div
                      key={bill.id}
                      className="grid items-center py-2.5 border-b border-border gap-2"
                      style={{ gridTemplateColumns: billCols.gridTemplate }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                        >
                          {initials(bill.supplierName || bill.billNumber)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{bill.supplierName || "—"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{bill.lineItemDescription}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{bill.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFullDate(bill.billDate)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountExGst)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountIncGst)}</p>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                        style={{ background: "hsl(var(--sage-light))", color: "hsl(var(--sage))" }}
                      >
                        Saved
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteBillAllocationMutation.mutate(bill.id)}
                        data-testid={`button-remove-bill-${bill.id}`}
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                    </div>
                  ))}
                  {pendingPsBillItems.map((li) => {
                    const parentBill = bills.find((b) => b.id === li.billId);
                    const liExGst = li.totalExGst; // taxMode-aware ex-GST from the server
                    return (
                      <div
                        key={li.id}
                        className="grid items-center py-2.5 border-b border-border gap-2"
                        style={{ gridTemplateColumns: billCols.gridTemplate, background: "hsl(var(--amber-light) / 0.4)" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                          >
                            {initials(parentBill?.billReference || parentBill?.billNumber || "??")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {parentBill?.billReference || parentBill?.billNumber || "Bill"}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{li.description}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{parentBill?.billNumber || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {parentBill ? formatFullDate(parentBill.billDate) : "—"}
                        </p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(liExGst)}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(li.totalIncGst)}</p>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                          style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                        >
                          Pending
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => togglePsLineItemSelection(li.id)}
                        >
                          <Plus className="h-3 w-3 rotate-45" />
                        </Button>
                      </div>
                    );
                  })}
                  </div>
                 </div>
                  {/* Add affordance always present (like LineItemsTable's add
                      row); the subtotal only once there's something to total. */}
                  <div className="flex justify-between items-center pt-2">
                    <span
                      className="text-xs font-medium cursor-pointer"
                      style={{ color: "hsl(var(--primary))" }}
                      onClick={() => setIsPsBillModalOpen(true)}
                      data-testid="button-add-ps-bill-inline"
                    >
                      {allocatedBills.length > 0 || pendingPsBillItems.length > 0 ? "+ Add more" : "+ Add bill"}
                    </span>
                    {(allocatedBills.length > 0 || pendingPsBillItems.length > 0) && (
                      <p className="text-xs font-semibold text-foreground">
                        Subtotal:{" "}
                        {formatCurrency(
                          allocatedBills.reduce((s, b) => s + b.amountExGst, 0) +
                            pendingPsBillItems.reduce((s, li) => s + li.totalExGst, 0)
                        )}{" "}
                        ex
                      </p>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Timesheets */}
            <SectionCard
              accentColor="hsl(var(--teal))"
              iconBg="hsl(var(--teal-light))"
              iconText="T"
              title="Timesheets"
              subtitle={`Labour entries · ${timesheetDisplayPref === "date" ? "grouped by date" : timesheetDisplayPref === "person-summary" ? "one line per person" : "grouped by person"}`}
              actionLabel="+ Add Timesheets"
              onAction={() => setIsTimesheetModalOpen(true)}
            >
              {/* Header row always shown, no empty-state card — same pattern as
                  the other tables on this page. */}
              {(
                <div className="pt-2">
                 <div className="overflow-x-auto">
                  <div style={{ minWidth: `${tsCols.minWidth}px` }}>
                  <div
                    className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                    style={{ gridTemplateColumns: tsCols.gridTemplate }}
                  >
                    <span className="relative">{timesheetDisplayPref === "person" ? "Date" : "Team member"}
                      <ColResizeHandle testId="resize-ts-name" onStart={(e) => tsCols.startResize("name", e.clientX, tsCols.widthFor("name", 190))} />
                    </span>
                    <span className="relative text-right">Hours
                      <ColResizeHandle testId="resize-ts-hours" onStart={(e) => tsCols.startResize("hours", e.clientX, tsCols.widthFor("hours", 70))} />
                    </span>
                    <span className="relative text-right">Charge Rate
                      <ColResizeHandle testId="resize-ts-rate" onStart={(e) => tsCols.startResize("rate", e.clientX, tsCols.widthFor("rate", 90))} />
                    </span>
                    <span className="relative">Cost Code
                      <ColResizeHandle testId="resize-ts-costCode" onStart={(e) => tsCols.startResize("costCode", e.clientX, tsCols.widthFor("costCode", 140))} />
                    </span>
                    <span className="relative text-right">Ex GST
                      <ColResizeHandle testId="resize-ts-ex" onStart={(e) => tsCols.startResize("ex", e.clientX, tsCols.widthFor("ex", 100))} />
                    </span>
                    <span className="relative text-right">Inc GST
                      <ColResizeHandle testId="resize-ts-inc" onStart={(e) => tsCols.startResize("inc", e.clientX, tsCols.widthFor("inc", 100))} />
                    </span>
                    <span />
                  </div>
                  {timesheetDisplayPref === "person-summary" && personSummaryRows.map((row, idx) => {
                    const expanded = expandedTsPersons.has(row.staffName);
                    return (
                    <div key={row.staffName}>
                      {/* Summary line — click to expand into this person's entries */}
                      <div
                        className="grid items-center py-2.5 border-b border-border gap-2 cursor-pointer hover:bg-muted/30 rounded-sm"
                        style={{ gridTemplateColumns: tsCols.gridTemplate }}
                        onClick={() => toggleTsPerson(row.staffName)}
                        data-testid={`ts-person-summary-${row.staffName}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                            style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                          >
                            {initials(row.staffName)}
                          </div>
                          <p className="text-xs font-semibold text-foreground truncate">
                            {row.staffName}
                            {!row.allSaved && (
                              <span
                                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                                style={{ background: "hsl(var(--teal-light))", color: "hsl(var(--teal))" }}
                              >
                                Pending
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-[11px] text-foreground text-right">{row.hours} hrs</p>
                        <p className="text-[11px] text-muted-foreground text-right" title="Weighted average — expand to edit each entry">{formatCurrency(row.rateCents)}/hr</p>
                        <p className="text-[11px] text-muted-foreground truncate">{row.costCode}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(row.exCents)}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(row.incCents)}</p>
                        <span />
                      </div>
                      {/* Expanded: individual entries, each with editable rate + delete */}
                      {expanded && row.rows.map((entry) => (
                        <div
                          key={entry.id}
                          className="grid items-center py-2 border-b border-border gap-2"
                          style={{
                            gridTemplateColumns: tsCols.gridTemplate,
                            background: entry.saved ? "hsl(var(--muted) / 0.15)" : "hsl(var(--teal-light) / 0.3)",
                          }}
                        >
                          <p className="text-[11px] text-foreground pl-8">
                            {formatDayMonth(entry.date)}
                            {!entry.saved && (
                              <span
                                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                                style={{ background: "hsl(var(--teal-light))", color: "hsl(var(--teal))" }}
                              >
                                Pending
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-foreground text-right">{entry.hours} hrs</p>
                          <RateCell
                            rateCents={entry.rateCents}
                            onCommit={(v) => commitRateEdit(entry, v)}
                          />
                          <p className="text-[11px] text-muted-foreground truncate">{entry.costCode}</p>
                          <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(entry.exCents)}</p>
                          <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(entry.incCents)}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              entry.saved
                                ? deleteTimesheetAllocationMutation.mutate(entry.id)
                                : toggleTimesheetSelection(entry.id)
                            }
                            data-testid={`button-remove-timesheet-${entry.id}`}
                          >
                            <Plus className="h-3 w-3 rotate-45" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    );
                  })}
                  {timesheetDisplayPref !== "person-summary" && sectionTimesheetGroups.map(([groupLabel, rows], groupIdx) => (
                    <div key={groupLabel}>
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 mt-3 mb-1 rounded-md"
                        style={{ background: "hsl(var(--muted))" }}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(groupIdx).bg, color: avatarColor(groupIdx).text }}
                        >
                          {timesheetDisplayPref === "person" ? initials(groupLabel) : groupLabel.slice(0, 2)}
                        </div>
                        <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">{groupLabel}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground ml-auto">
                          {formatCurrency(rows.reduce((s, r) => s + r.exCents, 0))} ex
                        </p>
                      </div>
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          className="grid items-center py-2 border-b border-border gap-2"
                          style={{
                            gridTemplateColumns: tsCols.gridTemplate,
                            background: row.saved ? undefined : "hsl(var(--teal-light) / 0.3)",
                          }}
                        >
                          <p className="text-[11px] text-foreground pl-8">
                            {timesheetDisplayPref === "person" ? formatDayMonth(row.date) : row.staffName}
                            {!row.saved && (
                              <span
                                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                                style={{ background: "hsl(var(--teal-light))", color: "hsl(var(--teal))" }}
                              >
                                Pending
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-foreground text-right">{row.hours} hrs</p>
                          <RateCell
                            rateCents={row.rateCents}
                            onCommit={(v) => commitRateEdit(row, v)}
                          />
                          <p className="text-[11px] text-muted-foreground truncate">{row.costCode}</p>
                          <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(row.exCents)}</p>
                          <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(row.incCents)}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              row.saved
                                ? deleteTimesheetAllocationMutation.mutate(row.id)
                                : toggleTimesheetSelection(row.id)
                            }
                            data-testid={`button-remove-timesheet-${row.id}`}
                          >
                            <Plus className="h-3 w-3 rotate-45" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
                  </div>
                 </div>
                  <div className="flex justify-end pt-2">
                    <p className="text-xs font-semibold text-foreground">
                      Subtotal: {formatCurrency(sectionTimesheetRows.reduce((s, r) => s + r.exCents, 0))} ex
                      {" · "}labour is ex GST
                    </p>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Custom Lines */}
            <SectionCard
              accentColor="hsl(var(--sage))"
              iconBg="hsl(var(--sage-light))"
              iconText="+"
              title="Custom Lines"
              subtitle="Manual line items not covered above"
              headerExtra={<LineItemColumnsButton columns={customLineColumns} />}
            >
              <div className="pt-2">
                <LineItemsTable
                  columns={customLineColumns}
                  rows={customLineRows}
                  costCodes={costCodes}
                  onAdd={(line) => setPendingLines([...pendingLines, { ...line, id: `custom-${Date.now()}-${pendingLines.length}` }])}
                  onUpdate={(id, line) => {
                    if (pendingLines.some((l) => l.id === id)) {
                      setPendingLines(pendingLines.map((l) => (l.id === id ? { ...line, id } : l)));
                    } else {
                      updateAllowanceItemMutation.mutate({ id, line });
                    }
                  }}
                  onDelete={handleDeleteCustomLine}
                  addLabel="Add line"
                />
              </div>
            </SectionCard>
          </>
        )}

        {/* ── PC SECTIONS ─────────────────────────────────────────────────── */}
        {isPrimeCost && (
          <>
            {/* Linked selection */}
            <SectionCard
              accentColor="hsl(var(--primary))"
              iconBg="hsl(var(--primary) / 0.12)"
              iconText="S"
              title="Linked Selection"
              subtitle="Client selection driving this Prime Cost item"
            >
              <div className="pt-3">
                {linkedSelection ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate" data-testid="text-linked-selection-name">
                          {linkedSelection.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {[linkedSelection.category, linkedSelection.room].filter(Boolean).join(" · ") || "Selection"}
                          {" · "}{linkedSelection.optionCount} option{linkedSelection.optionCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                        style={{
                          background: linkedSelection.status === "approved" ? "hsl(var(--sage-light))" : "hsl(var(--amber-light))",
                          color: linkedSelection.status === "approved" ? "hsl(var(--sage))" : "hsl(var(--amber))",
                        }}
                      >
                        {linkedSelection.status}
                      </span>
                    </div>
                    {linkedSelection.selectedOption ? (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 flex-wrap gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{linkedSelection.selectedOption.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {linkedSelection.selectedOption.quantity} {linkedSelection.selectedOption.unitType} ×{" "}
                            {formatCurrency(linkedSelection.selectedOption.unitCostCents)}
                            {linkedSelection.selectedOption.gstInclusive ? " inc" : " ex"} GST
                            {linkedSelection.selectedOption.markupPercent ? ` + ${linkedSelection.selectedOption.markupPercent}% markup` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-foreground">
                            {formatCurrency(linkedSelection.selectedOption.totalExCents)}
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">ex</span>
                            <span className="text-xs font-semibold text-muted-foreground ml-2">
                              {formatCurrency(linkedSelection.selectedOption.totalIncCents)}
                            </span>
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">inc GST</span>
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={syncSelectionMutation.isPending}
                            onClick={() => syncSelectionMutation.mutate()}
                            data-testid="button-use-selection-costing"
                          >
                            {syncSelectionMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1.5" />
                            )}
                            Use selection costing
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No option chosen yet — costing will sync automatically when an option is approved.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={selectionToLink} onValueChange={setSelectionToLink}>
                      <SelectTrigger className="h-8 text-xs w-64" data-testid="select-link-selection">
                        <SelectValue placeholder="Choose a selection to link…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectSelections.filter((s) => !s.estimateItemId).map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!selectionToLink || linkSelectionMutation.isPending}
                      onClick={() => linkSelectionMutation.mutate(selectionToLink)}
                      data-testid="button-link-selection"
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1.5" /> Link
                    </Button>
                    <p className="text-[11px] text-muted-foreground w-full">
                      Linking a selection lets its approved option's costing flow into this allowance automatically.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Cost entries */}
            <SectionCard
              accentColor="hsl(var(--sage))"
              iconBg="hsl(var(--sage-light))"
              iconText="$"
              title="Cost Entries"
              subtitle="Actual costs recorded against this Prime Cost item"
              headerExtra={<LineItemColumnsButton columns={pcEntryColumns} />}
            >
              <div className="pt-2">
                <LineItemsTable
                  columns={pcEntryColumns}
                  rows={[
                    ...allocatedItems.map((i) => ({
                      id: i.id,
                      itemName: i.itemName,
                      description: i.description,
                      costCode: i.costCode,
                      quantity: i.quantity,
                      unitType: i.unitType,
                      unitCostExTaxCents: i.unitCostExTaxCents,
                      markupPercent: i.markupPercent,
                      unitPrice: i.unitPrice,
                      total: i.total,
                    })),
                    ...pcPendingLines.map((l) => ({
                      id: l.id,
                      itemName: l.itemName,
                      description: l.description,
                      costCode: l.costCode,
                      quantity: l.quantity,
                      unitType: l.unitType,
                      unitCostExTaxCents: l.unitCostExTaxCents,
                      markupPercent: l.markupPercent,
                      unitPrice: l.unitPrice,
                      total: l.totalPrice,
                      pending: true,
                    })),
                  ]}
                  costCodes={costCodes}
                  onAdd={(line) => setPcPendingLines([...pcPendingLines, { ...line, id: `pc-${Date.now()}-${pcPendingLines.length}` }])}
                  onUpdate={(id, line) => {
                    if (pcPendingLines.some((l) => l.id === id)) {
                      setPcPendingLines(pcPendingLines.map((l) => (l.id === id ? { ...line, id } : l)));
                    } else {
                      updateAllowanceItemMutation.mutate({ id, line });
                    }
                  }}
                  onDelete={(id) => {
                    if (pcPendingLines.some((l) => l.id === id)) {
                      setPcPendingLines(pcPendingLines.filter((l) => l.id !== id));
                    } else {
                      deleteAllowanceItemMutation.mutate(id);
                    }
                  }}
                  addLabel="Add cost entry"
                />
              </div>
            </SectionCard>

            {/* Bills */}
            <SectionCard
              accentColor="hsl(var(--amber))"
              iconBg="hsl(var(--amber-light))"
              iconText="$"
              title="Bills"
              subtitle="Supplier invoices allocated to this Prime Cost item"
              actionLabel="+ Select from Bills"
              onAction={() => setIsBillModalOpen(true)}
            >
              {/* Same as Cost Entries: header row always shown, add action in
                  the section header — no empty-state card. */}
              {(
                <div className="pt-2">
                 <div className="overflow-x-auto">
                  <div style={{ minWidth: `${billCols.minWidth}px` }}>
                  <div
                    className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                    style={{ gridTemplateColumns: billCols.gridTemplate }}
                  >
                    <span className="relative">Supplier
                      <ColResizeHandle testId="resize-bill-supplier" onStart={(e) => billCols.startResize("supplier", e.clientX, billCols.widthFor("supplier", 200))} />
                    </span>
                    <span className="relative">Invoice #
                      <ColResizeHandle testId="resize-bill-invoice" onStart={(e) => billCols.startResize("invoice", e.clientX, billCols.widthFor("invoice", 110))} />
                    </span>
                    <span className="relative">Date
                      <ColResizeHandle testId="resize-bill-date" onStart={(e) => billCols.startResize("date", e.clientX, billCols.widthFor("date", 100))} />
                    </span>
                    <span className="relative text-right">Ex GST
                      <ColResizeHandle testId="resize-bill-ex" onStart={(e) => billCols.startResize("ex", e.clientX, billCols.widthFor("ex", 100))} />
                    </span>
                    <span className="relative text-right">Inc GST
                      <ColResizeHandle testId="resize-bill-inc" onStart={(e) => billCols.startResize("inc", e.clientX, billCols.widthFor("inc", 100))} />
                    </span>
                    <span className="relative">Status
                      <ColResizeHandle testId="resize-bill-status" onStart={(e) => billCols.startResize("status", e.clientX, billCols.widthFor("status", 80))} />
                    </span>
                    <span />
                  </div>
                  {billDisplayMode === "bill" && renderBillGroups()}
                  {billDisplayMode === "line" && allocatedBills.map((bill, idx) => (
                    <div
                      key={bill.id}
                      className="grid items-center py-2.5 border-b border-border gap-2"
                      style={{ gridTemplateColumns: billCols.gridTemplate }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(idx).bg, color: avatarColor(idx).text }}
                        >
                          {initials(bill.supplierName || bill.billNumber)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{bill.supplierName || "—"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{bill.lineItemDescription}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{bill.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFullDate(bill.billDate)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountExGst)}</p>
                      <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(bill.amountIncGst)}</p>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                        style={{ background: "hsl(var(--sage-light))", color: "hsl(var(--sage))" }}
                      >
                        Saved
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteBillAllocationMutation.mutate(bill.id)}
                        data-testid={`button-remove-pc-bill-${bill.id}`}
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                    </div>
                  ))}
                  {pendingPcBillItems.map((li) => {
                    const parentBill = bills.find((b) => b.id === li.billId);
                    return (
                      <div
                        key={li.id}
                        className="grid items-center py-2.5 border-b border-border gap-2"
                        style={{ gridTemplateColumns: billCols.gridTemplate, background: "hsl(var(--amber-light) / 0.4)" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                          >
                            {initials(parentBill?.billReference || parentBill?.billNumber || "??")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {parentBill?.billReference || parentBill?.billNumber || "Bill"}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{li.description}</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{parentBill?.billNumber || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {parentBill ? formatFullDate(parentBill.billDate) : "—"}
                        </p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(li.totalExGst)}</p>
                        <p className="text-xs font-semibold text-foreground text-right">{formatCurrency(li.totalIncGst)}</p>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                          style={{ background: "hsl(var(--amber-light))", color: "hsl(var(--amber))" }}
                        >
                          Pending
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleLineItemSelection(li.id)}
                        >
                          <Plus className="h-3 w-3 rotate-45" />
                        </Button>
                      </div>
                    );
                  })}
                  </div>
                 </div>
                  {/* Inline add, always present — mirrors the add row on Cost
                      Entries so an empty table still offers the action. */}
                  <div className="flex justify-between items-center pt-2">
                    <span
                      className="text-xs font-medium cursor-pointer"
                      style={{ color: "hsl(var(--primary))" }}
                      onClick={() => setIsBillModalOpen(true)}
                      data-testid="button-add-pc-bill-inline"
                    >
                      {allocatedBills.length > 0 || pendingPcBillItems.length > 0 ? "+ Add more" : "+ Add bill"}
                    </span>
                    {(allocatedBills.length > 0 || pendingPcBillItems.length > 0) && (
                      <p className="text-xs font-semibold text-foreground">
                        Subtotal:{" "}
                        {formatCurrency(
                          allocatedBills.reduce((s, b) => s + b.amountExGst, 0) +
                            pendingPcBillItems.reduce((s, li) => s + li.totalExGst, 0)
                        )}{" "}
                        ex
                      </p>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

          </>
        )}

        {/* ── TOTAL BAR (live, includes unsaved pending) ───────────────────── */}
        {/* Plum background, not hsl(var(--foreground)) — foreground is near-white
            in dark mode, which made this bar white-on-white. --primary reads as
            a deliberate accent and carries white text in both themes. */}
        <div
          className="rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
          style={{ background: "hsl(var(--primary))" }}
        >
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              TOTAL ACTUAL
            </p>
            <p className="text-sm font-semibold text-white" data-testid="text-live-total">
              {formatCurrency(actualExGst + pendingExCents)} ex &nbsp;/&nbsp; {formatCurrency(actualIncGst + pendingIncCents)} inc GST
            </p>
            {pendingIncCents > 0 && (
              <p className="text-[10px]" style={{ color: "hsl(var(--amber))" }}>
                includes {formatCurrency(pendingIncCents)} inc pending — save to commit
              </p>
            )}
          </div>
          <p className="text-[11px] ml-2" style={{ color: "rgba(255,255,255,0.35)" }}>
            vs Estimate {formatCurrency(estimateExGst)} ex / {formatCurrency(estimateIncGst)} inc
          </p>
          <div className="ml-auto">
            <span
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: actualIncGst + pendingIncCents > estimateIncGst ? "hsl(var(--coral-light))" : "hsl(var(--sage-light))",
                color: actualIncGst + pendingIncCents > estimateIncGst ? "hsl(var(--coral))" : "hsl(var(--sage))",
              }}
            >
              {actualIncGst + pendingIncCents > estimateIncGst ? "↑ Over budget" : "↓ Under budget"}
            </span>
          </div>
        </div>

        {/* ── STICKY SAVE BAR ──────────────────────────────────────────────
            One bar for both allowance types. Sticks to the bottom of the
            viewport whenever there are unsaved changes, so the Save action is
            reachable without scrolling past the Bills/Cost-entry sections. */}
        {(isPrimeCost ? hasPcPendingItems : hasPendingItems) && (
          <div className="sticky bottom-4 z-30 flex justify-end">
            <div className="flex items-center gap-3 bg-card border border-border rounded-xl shadow-lg px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                Unsaved · <span className="font-semibold text-foreground">{formatCurrency(pendingIncCents)} inc</span> pending
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isPrimeCost) {
                    setSelectedLineItems(new Set());
                    setPcPendingLines([]);
                  } else {
                    setSelectedPsLineItems(new Set());
                    setSelectedTimesheetKeys(new Set());
                    setPendingLines([]);
                  }
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={isPrimeCost ? handleSavePcItem : handleSavePsItem}
                disabled={isPrimeCost ? isSavingPc : isSavingPs}
                data-testid={isPrimeCost ? "button-save-pc-item" : "button-save-ps-item"}
              >
                {(isPrimeCost ? isSavingPc : isSavingPs) ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Bills pickers — one component, both allowance types */}
      <BillsPickerModal
        open={isBillModalOpen}
        onOpenChange={setIsBillModalOpen}
        title="Select Bills"
        description="Pick whole bills, or expand one to allocate individual line items."
        bills={bills}
        billLineItems={billLineItems}
        costCodeLabel={costCodeLabel}
        isLoading={isLoadingBills}
        selected={selectedLineItems}
        setSelected={setSelectedLineItems}
        expanded={expandedBills}
        setExpanded={setExpandedBills}
        displayMode={billDisplayMode}
        setDisplayMode={setBillDisplayMode}
      />

      <BillsPickerModal
        open={isPsBillModalOpen}
        onOpenChange={setIsPsBillModalOpen}
        title="Add Bills"
        description="Pick whole bills, or expand one to allocate individual line items."
        bills={bills}
        billLineItems={billLineItems}
        costCodeLabel={costCodeLabel}
        isLoading={isLoadingBills}
        selected={selectedPsLineItems}
        setSelected={setSelectedPsLineItems}
        expanded={expandedPsBills}
        setExpanded={setExpandedPsBills}
        displayMode={billDisplayMode}
        setDisplayMode={setBillDisplayMode}
      />

      {/* Timesheets modal */}
      <Dialog open={isTimesheetModalOpen} onOpenChange={setIsTimesheetModalOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Timesheets</DialogTitle>
            <DialogDescription>
              All project timesheets shown — only approved entries can be selected. Split timesheets show one row per cost code.
            </DialogDescription>
          </DialogHeader>

          {/* Group-by toggle (browsing aid for THIS list) */}
          <div className="flex items-center gap-1 px-1 py-1 bg-muted rounded-lg self-start">
            <button
              type="button"
              onClick={() => setGroupMode("date")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetGroupMode === "date" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-group-by-date"
            >
              <CalendarDays className="h-3 w-3" /> By Date
            </button>
            <button
              type="button"
              onClick={() => setGroupMode("person")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetGroupMode === "person" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-group-by-person"
            >
              <Users className="h-3 w-3" /> By Person
            </button>
            <button
              type="button"
              onClick={() => setGroupMode("costcode")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${timesheetGroupMode === "costcode" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-group-by-cost-code"
            >
              <Hash className="h-3 w-3" /> By Cost Code
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              type="button"
              onClick={() => setShowTsDescriptions(!showTsDescriptions)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${showTsDescriptions ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-toggle-descriptions"
            >
              Descriptions
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {isLoadingTimesheets && timesheetRows.length === 0 ? (
              <ModalLoading label="Loading timesheets…" />
            ) : timesheetRows.length === 0 ? (
              <EmptyState variant="inline" title="No timesheets found for this project" className="py-8" />
            ) : (() => {
              const groupKeyOf = (row: TimesheetDisplayRow): string => {
                if (timesheetGroupMode === "person") return getUserName(row.userId);
                if (timesheetGroupMode === "costcode") {
                  const cc = row.costCodeId ? costCodeMap.get(row.costCodeId) : null;
                  return cc ? `${cc.code} — ${cc.title}` : "(no cost code)";
                }
                return formatFullDate(row.date);
              };

              const sorted = [...timesheetRows].sort((a, b) => {
                const ga = groupKeyOf(a);
                const gb = groupKeyOf(b);
                if (ga !== gb) {
                  if (timesheetGroupMode === "date") {
                    return new Date(b.date).getTime() - new Date(a.date).getTime();
                  }
                  return ga.localeCompare(gb);
                }
                return new Date(b.date).getTime() - new Date(a.date).getTime();
              });

              const groups: { label: string; rows: TimesheetDisplayRow[] }[] = [];
              for (const row of sorted) {
                const label = groupKeyOf(row);
                const last = groups[groups.length - 1];
                if (last && last.label === label) last.rows.push(row);
                else groups.push({ label, rows: [row] });
              }

              const statusColors: Record<string, { bg: string; text: string }> = {
                approved: { bg: "hsl(var(--sage-light))", text: "hsl(var(--sage))" },
                pending: { bg: "hsl(var(--amber-light))", text: "hsl(var(--amber))" },
                rejected: { bg: "hsl(var(--coral-light))", text: "hsl(var(--coral))" },
                submitted: { bg: "hsl(var(--primary) / 0.1)", text: "hsl(var(--primary))" },
              };

              const gridColumns = "24px 1.6fr 1fr 0.6fr 1fr 0.9fr 80px 90px";

              return (
                <div className="space-y-4">
                  {/* Column header */}
                  <div
                    className="grid items-center text-[9px] font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border gap-2 px-1"
                    style={{ gridTemplateColumns: gridColumns }}
                  >
                    <span />
                    <span>Team member</span>
                    <span>Date</span>
                    <span className="text-right">Hours</span>
                    <span>Time</span>
                    <span>Cost Code</span>
                    <span>Status</span>
                    <span className="text-right">Amount ex</span>
                  </div>

                  {groups.map((group) => {
                    const isCollapsed = isTsGroupCollapsed(group.label);
                    // A group's own selectable rows — lets the header act as
                    // "select all in this cost code" without hunting row by row.
                    const groupSelectable = group.rows.filter(
                      (r) => r.status === "approved" && !alreadyAllocatedKeys.has(r.key)
                    );
                    const allSelected =
                      groupSelectable.length > 0 && groupSelectable.every((r) => selectedTimesheetKeys.has(r.key));
                    const someSelected = groupSelectable.some((r) => selectedTimesheetKeys.has(r.key));
                    const toggleGroupSelection = () => {
                      setSelectedTimesheetKeys((prev) => {
                        const next = new Set(prev);
                        if (allSelected) groupSelectable.forEach((r) => next.delete(r.key));
                        else groupSelectable.forEach((r) => next.add(r.key));
                        return next;
                      });
                    };
                    return (
                    <div key={group.label}>
                      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 pb-1 pt-1">
                        <div className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-muted/50">
                          <Checkbox
                            // "indeterminate" renders the dash for some-but-not-all
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            disabled={groupSelectable.length === 0}
                            onCheckedChange={toggleGroupSelection}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`checkbox-group-${group.label}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleTsGroup(group.label)}
                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            data-testid={`toggle-group-${group.label}`}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                              {group.label}
                              <span className="ml-2 normal-case font-normal">
                                {group.rows.length} entr{group.rows.length === 1 ? "y" : "ies"} ·{" "}
                                {formatCurrency(group.rows.reduce((s, r) => s + r.amountExCents, 0))} ex
                              </span>
                            </p>
                          </button>
                        </div>
                      </div>
                      <div className={`space-y-1 ${isCollapsed ? "hidden" : ""}`}>
                        {group.rows.map((row) => {
                          const isApproved = row.status === "approved";
                          const alreadyAllocated = alreadyAllocatedKeys.has(row.key);
                          const selectable = isApproved && !alreadyAllocated;
                          const staffName = getUserName(row.userId);
                          const statusColor = statusColors[row.status] ?? { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))" };
                          const timeStr = row.startTime && row.endTime ? `${hm(row.startTime)}–${hm(row.endTime)}` : "—";
                          const userIdx = users.findIndex((u) => u.id === row.userId);
                          return (
                            <div
                              key={row.key}
                              className={`grid items-center px-1 py-2 rounded-md border gap-2 ${!selectable ? "opacity-60" : ""}`}
                              style={{ gridTemplateColumns: gridColumns }}
                              data-testid={`timesheet-row-${row.key}`}
                            >
                              <Checkbox
                                checked={selectedTimesheetKeys.has(row.key)}
                                onCheckedChange={() => selectable && toggleTimesheetSelection(row.key)}
                                disabled={!selectable}
                                data-testid={`checkbox-timesheet-${row.key}`}
                              />
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                  style={{ background: avatarColor(userIdx).bg, color: avatarColor(userIdx).text }}
                                >
                                  {initials(staffName)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{staffName}</p>
                                  {showTsDescriptions && row.description && (
                                    <p className="text-[10px] text-muted-foreground truncate">{row.description}</p>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-foreground">{formatDayMonth(row.date)}</p>
                              <p className="text-[11px] text-foreground text-right">{row.hours}h</p>
                              <p className="text-[11px] text-muted-foreground">{timeStr}{row.isSplit ? " (split)" : ""}</p>
                              <p className="text-[11px] text-muted-foreground truncate" title={row.costCodeId ? `${costCodeMap.get(row.costCodeId)?.code ?? ""} ${costCodeMap.get(row.costCodeId)?.title ?? ""}` : undefined}>
                                {costCodeLabel(row.costCodeId)}
                              </p>
                              {alreadyAllocated ? (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit"
                                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
                                >
                                  Allocated
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize w-fit"
                                  style={{ background: statusColor.bg, color: statusColor.text }}
                                >
                                  {row.status}
                                </span>
                              )}
                              <p className="text-sm font-semibold text-right">{formatCurrency(row.amountExCents)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Display in allowance:</Label>
                <Select value={timesheetDisplayPref} onValueChange={(v) => setTimesheetDisplayPref(v as TsDisplayPref)}>
                  <SelectTrigger className="h-7 text-xs w-40" data-testid="select-timesheet-display">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person" className="text-xs">By Person</SelectItem>
                    <SelectItem value="person-summary" className="text-xs">By Person (totals)</SelectItem>
                    <SelectItem value="date" className="text-xs">By Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTimesheetKeys.size > 0
                  ? `${selectedTimesheetKeys.size} selected · ${formatCurrency(pendingTimesheetRows.reduce((s, r) => s + r.amountExCents, 0))} ex GST`
                  : "No entries selected"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsTimesheetModalOpen(false)}>Cancel</Button>
              <Button
                onClick={() => setIsTimesheetModalOpen(false)}
                disabled={selectedTimesheetKeys.size === 0}
                data-testid="button-save-timesheets"
              >
                Add {selectedTimesheetKeys.size > 0 ? `(${selectedTimesheetKeys.size})` : ""} Selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
