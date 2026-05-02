import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  Activity,
  Plus,
  Trash2,
  MoreVertical,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FolderPlus,
  Package,
  Target,
  Download,
  Building2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Lock,
  TrendingDown,
  DollarSign,
  SlidersHorizontal,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverheadCategory { id: string; name: string; sortOrder: number; }
interface OverheadItem {
  id: string; categoryId: string; name: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annual";
  budgetCents: number; xeroAccountCode: string | null; xeroAccountType: string | null; xeroSynced: boolean;
  buildproGroup: string | null; notes: string | null; sortOrder: number;
}
interface OverheadMonthActual { id: string; itemId: string; year: number; month: number; actualCents: number; xeroImported: boolean; driftedSinceConfirmed: boolean; }
interface OverheadMonthStatus { id: string; companyId: string; year: number; month: number; confirmedAt: string | null; }
interface OhSettings { targetOhPercent: string; }
interface OhPipelineJob { id: string; name: string; estimatedValue: number; probabilityPercent: number; expectedStartDate: string | null; notes: string | null; }
interface OverheadForecastOverride { id: string; itemId: string; year: number; month: number; forecastCents: number; }
interface ContractedProject {
  id: string; name: string; projectStatus: string | null;
  lockedContractPrice: number | null;
  percentComplete: number | null;
  remainingCents: number;
}
interface CompanyIncomeActual { id: string; companyId: string; year: number; month: number; incomeCents: number; breakdown?: Record<string, number>; xeroImported: boolean; }
interface CompanyDirectCostActual { id: string; companyId: string; year: number; month: number; directCostCents: number; breakdown?: Record<string, number>; xeroImported: boolean; }

interface OverheadsData {
  categories: OverheadCategory[];
  items: OverheadItem[];
  actuals: OverheadMonthActual[];
  monthStatuses: OverheadMonthStatus[];
  settings: OhSettings | null;
  incomeActuals: CompanyIncomeActual[];
  directCostActuals: CompanyDirectCostActual[];
}

type Frequency = "weekly" | "monthly" | "quarterly" | "annual";
type TabId = "register" | "actuals" | "forecast" | "predictor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const XERO_TYPE_LABELS: Record<string, string> = {
  OVERHEADS: "Overheads",
  DIRECTCOSTS: "Direct Costs",
  EXPENSE: "Expenses",
  CURRLIAB: "Current Liabilities",
  REVENUE: "Revenue",
  OTHERINCOME: "Other Income",
  DEPRECIATN: "Depreciation",
  TERMLIAB: "Term Liabilities",
  EQUITY: "Equity",
  ASSET: "Assets",
  PREPAYMENT: "Prepayments",
  LIABILITY: "Liabilities",
  FIXED: "Fixed Assets",
};

function fmtDollars(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}
function fmtK(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}
function toMonthlyCents(item: OverheadItem): number {
  switch (item.frequency) {
    case "weekly":    return Math.round(item.budgetCents * 52 / 12);
    case "monthly":   return item.budgetCents;
    case "quarterly": return Math.round(item.budgetCents / 3);
    case "annual":    return Math.round(item.budgetCents / 12);
  }
}
function toAnnualCents(item: OverheadItem): number {
  switch (item.frequency) {
    case "weekly":    return Math.round(item.budgetCents * 52);
    case "monthly":   return item.budgetCents * 12;
    case "quarterly": return item.budgetCents * 4;
    case "annual":    return item.budgetCents;
  }
}
function getKey(itemId: string, year: number, month: number) { return `${itemId}__${year}__${month}`; }
function buildActualMap(actuals: OverheadMonthActual[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of actuals) m.set(getKey(a.itemId, a.year, a.month), a.actualCents);
  return m;
}
function buildDriftMap(actuals: OverheadMonthActual[]): Set<string> {
  const s = new Set<string>();
  for (const a of actuals) if (a.driftedSinceConfirmed) s.add(getKey(a.itemId, a.year, a.month));
  return s;
}
function buildStatusSet(statuses: OverheadMonthStatus[]): Set<string> {
  const s = new Set<string>();
  for (const st of statuses) if (st.confirmedAt) s.add(`${st.year}__${st.month}`);
  return s;
}
function buildOverrideMap(overrides: OverheadForecastOverride[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of overrides) m.set(getKey(o.itemId, o.year, o.month), o.forecastCents);
  return m;
}

// Rolling N-month window ending at the most recently elapsed month
function rollingLastN(n: number): Array<{ year: number; month: number }> {
  const today = new Date();
  const months: Array<{ year: number; month: number }> = [];
  let y = today.getFullYear(); let m = today.getMonth(); // 0-based; last complete month
  if (m === 0) { m = 12; y--; } // wrap
  for (let i = 0; i < n; i++) {
    months.unshift({ year: y, month: m });
    m--; if (m === 0) { m = 12; y--; }
  }
  return months;
}

// Backwards-compatible 12-month helper (used by Prev 12 Summary view)
function rollingLast12(): Array<{ year: number; month: number }> {
  return rollingLastN(12);
}

// Next 12 months starting from current month
function rollingNext12(): Array<{ year: number; month: number }> {
  const today = new Date();
  const months: Array<{ year: number; month: number }> = [];
  let y = today.getFullYear(); let m = today.getMonth() + 1; // current month
  for (let i = 0; i < 12; i++) {
    if (m > 12) { m = 1; y++; }
    months.push({ year: y, month: m }); m++;
  }
  return months;
}

// Previous 12 months before the rolling window
function rollingPrev12(): Array<{ year: number; month: number }> {
  const start = rollingLast12()[0];
  const months: Array<{ year: number; month: number }> = [];
  let y = start.year; let m = start.month - 1;
  if (m === 0) { m = 12; y--; }
  for (let i = 0; i < 12; i++) {
    months.unshift({ year: y, month: m });
    m--; if (m === 0) { m = 12; y--; }
  }
  return months;
}

// ─── Financial year helpers (AU: FY runs Jul→Jun) ─────────────────────────────
// TODO: make FY_START_MONTH a per-company setting once multi-region is needed.
const FY_START_MONTH = 7;

function getFyStartYearForDate(year: number, month: number, fyStartMonth = FY_START_MONTH): number {
  return month >= fyStartMonth ? year : year - 1;
}

function fyLabel(fyStartYear: number): string {
  return `FY ${String(fyStartYear).slice(-2)}/${String(fyStartYear + 1).slice(-2)}`;
}

function buildFyMonths(fyStartYear: number, fyStartMonth = FY_START_MONTH): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  for (let i = 0; i < 12; i++) {
    let m = fyStartMonth + i;
    let y = fyStartYear;
    while (m > 12) { m -= 12; y++; }
    result.push({ year: y, month: m });
  }
  return result;
}

function buildQuartersOfFy(fyStartYear: number, fyStartMonth = FY_START_MONTH): Array<{
  key: string; shortLabel: string; subLabel: string; months: Array<{ year: number; month: number }>;
}> {
  const monthsArr = buildFyMonths(fyStartYear, fyStartMonth);
  const quarters: Array<{ key: string; shortLabel: string; subLabel: string; months: Array<{ year: number; month: number }> }> = [];
  for (let q = 0; q < 4; q++) {
    const qMonths = monthsArr.slice(q * 3, q * 3 + 3);
    const first = qMonths[0]; const last = qMonths[qMonths.length - 1];
    quarters.push({
      key: `q${q + 1}-${fyStartYear}`,
      shortLabel: `Q${q + 1}`,
      subLabel: `${MONTH_NAMES[first.month - 1]}–${MONTH_NAMES[last.month - 1]}`,
      months: qMonths,
    });
  }
  return quarters;
}

function buildLastNFys(n: number, currentFyStartYear: number, fyStartMonth = FY_START_MONTH): Array<{
  key: string; shortLabel: string; months: Array<{ year: number; month: number }>;
}> {
  const result: Array<{ key: string; shortLabel: string; months: Array<{ year: number; month: number }> }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const fyStartYear = currentFyStartYear - i;
    result.push({
      key: `fy-${fyStartYear}`,
      shortLabel: fyLabel(fyStartYear),
      months: buildFyMonths(fyStartYear, fyStartMonth),
    });
  }
  return result;
}

function buildLastNCys(n: number, currentYear: number): Array<{
  key: string; shortLabel: string; months: Array<{ year: number; month: number }>;
}> {
  const result: Array<{ key: string; shortLabel: string; months: Array<{ year: number; month: number }> }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const y = currentYear - i;
    const months: Array<{ year: number; month: number }> = [];
    for (let m = 1; m <= 12; m++) months.push({ year: y, month: m });
    result.push({ key: `cy-${y}`, shortLabel: String(y), months });
  }
  return result;
}

// Truncate months arrays so we never include data after "today" (month-1 cap).
// Used for FY view (current FY months past today are blank), Quarterly (partial-quarter labels),
// and Compare views (current FY/CY only counts elapsed months).
function clampMonthsToToday(months: Array<{ year: number; month: number }>, today: Date): Array<{ year: number; month: number }> {
  const cy = today.getFullYear(); const cm = today.getMonth() + 1;
  return months.filter(({ year, month }) => year < cy || (year === cy && month <= cm));
}

// ─── Shared editable cells ───────────────────────────────────────────────────

function ActualCell({ cents, highlight = false }: { cents: number; highlight?: boolean }) {
  return (
    <div className={`w-full h-full text-right text-xs tabular-nums px-1 flex items-center justify-end ${highlight ? "text-destructive" : cents !== 0 ? "" : "text-muted-foreground/30"}`}>
      {cents !== 0 ? fmtK(cents) : "—"}
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

function AddCategoryDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (n: string) => void }) {
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Overhead Category</DialogTitle></DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground">Category Name</Label>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) { onSave(name.trim()); setName(""); onClose(); } }}
            placeholder="e.g. Staffing, Software, Rent" className="mt-1" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(""); onClose(); }}>Add Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ItemFormState { name: string; frequency: Frequency; budgetCents: string; xeroAccountCode: string; notes: string; categoryId: string; }

function ItemDialog({ open, onClose, onSave, categories, initial, title, xeroSynced }: {
  open: boolean; onClose: () => void; onSave: (f: ItemFormState) => void;
  categories: OverheadCategory[]; initial?: Partial<ItemFormState>; title?: string; xeroSynced?: boolean;
}) {
  const [form, setForm] = useState<ItemFormState>({
    name: initial?.name || "", frequency: (initial?.frequency as Frequency) || "monthly",
    budgetCents: initial?.budgetCents || "", xeroAccountCode: initial?.xeroAccountCode || "",
    notes: initial?.notes || "", categoryId: initial?.categoryId || categories[0]?.id || "",
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title || "Add Overhead Item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Item Name{xeroSynced && <span className="ml-1 text-data text-[#00B9D7] dark:text-[#5FD9F0]">(managed by Xero)</span>}</Label>
            <Input autoFocus={!xeroSynced} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Office Rent" className="mt-1" readOnly={xeroSynced} disabled={xeroSynced} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v as Frequency }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Budget Amount ($)</Label>
            <Input type="number" value={form.budgetCents} onChange={e => setForm(f => ({ ...f, budgetCents: e.target.value }))} placeholder="0" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Xero Account Code{xeroSynced && <span className="ml-1 text-data text-[#00B9D7] dark:text-[#5FD9F0]">(managed by Xero)</span>}</Label>
            <Input value={form.xeroAccountCode} onChange={e => setForm(f => ({ ...f, xeroAccountCode: e.target.value }))} placeholder="e.g. 420" className="mt-1" readOnly={xeroSynced} disabled={xeroSynced} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name.trim() || !form.categoryId} onClick={() => { onSave(form); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1: Register ──────────────────────────────────────────────────────────

type CellId = { itemId: string; field: string };

function bridgeLegacyOverheadsColumnLayout() {
  if (typeof window === "undefined") return;
  const LEGACY_KEY = "overheads-register-col-visibility";
  const NEW_HIDDEN_KEY = "buildpro_table_hidden_business-overheads";
  const NEW_ORDER_KEY = "buildpro_table_order_business-overheads";
  const NEW_WIDTHS_KEY = "buildpro_table_widths_business-overheads";
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const alreadyBridged =
      localStorage.getItem(NEW_HIDDEN_KEY) ||
      localStorage.getItem(NEW_ORDER_KEY) ||
      localStorage.getItem(NEW_WIDTHS_KEY);
    if (alreadyBridged) {
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    const legacy = JSON.parse(legacyRaw) as Record<string, boolean>;
    const LEGACY_TO_NEW: Record<string, string> = {
      freq: "frequency",
      budget: "budget",
      xeroCode: "xeroCode",
      xeroGroup: "xeroGroup",
      buildproGroup: "buildproGroup",
      monthly: "monthly",
      annual: "annual",
    };
    const hidden: Record<string, boolean> = {};
    for (const [legacyId, visible] of Object.entries(legacy)) {
      const newId = LEGACY_TO_NEW[legacyId];
      if (newId && visible === false) hidden[newId] = false;
    }
    localStorage.setItem(NEW_HIDDEN_KEY, JSON.stringify(hidden));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
  }
}

if (typeof window !== "undefined") {
  bridgeLegacyOverheadsColumnLayout();
}

function RegisterTab({ data, xeroConnected }: { data: OverheadsData; xeroConnected: boolean }) {
  const { toast } = useToast();
  useEffect(() => { bridgeLegacyOverheadsColumnLayout(); }, []);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<OverheadItem | null>(null);
  const [preselectedCatId, setPreselectedCatId] = useState("");
  const [activeCell, setActiveCell] = useState<CellId | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const toggleCollapse = (id: string) =>
    setCollapsed(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  const createCatMut = useMutation({
    mutationFn: (name: string) => apiRequest("/api/overheads/categories", "POST", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
  });
  const updateCatMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/overheads/categories/${id}`, "PATCH", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      setEditingCatId(null);
    },
    onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
  });
  const deleteCatMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/categories/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });
  const createItemMut = useMutation({
    mutationFn: (form: ItemFormState) => apiRequest("/api/overheads/items", "POST", { ...form, budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to create item", variant: "destructive" }),
  });
  const updateItemMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => apiRequest(`/api/overheads/items/${id}`, "PATCH", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });
  const deleteItemMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/items/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
  });

  const syncXeroMut = useMutation({
    mutationFn: () => apiRequest("/api/xero/sync-overhead-accounts", "POST"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      toast({ title: "Synced from Xero", description: `${data.created} added, ${data.updated} updated` });
    },
    onError: () => toast({ title: "Xero sync failed", variant: "destructive" }),
  });

  const grandMonthly = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const grandAnnual = useMemo(() => data.items.reduce((s, i) => s + toAnnualCents(i), 0), [data.items]);

  const FREQ_COLORS: Record<Frequency, string> = {
    weekly:    "bg-status-info-bg text-status-info dark:text-blue-400",
    monthly:   "bg-primary/10 text-[#8b6db5] dark:text-primary",
    quarterly: "bg-status-warning-bg text-status-warning dark:text-yellow-400",
    annual:    "bg-status-success-bg text-status-success dark:text-green-400",
  };

  const commitField = (itemId: string, field: string, rawVal: string) => {
    setActiveCell(null);
    let val: unknown = rawVal;
    if (field === "budgetCents") val = Math.round(parseFloat(rawVal || "0") * 100) || 0;
    updateItemMut.mutate({ id: itemId, patch: { [field]: val } });
  };
  const isActive = (itemId: string, field: string) => activeCell?.itemId === itemId && activeCell?.field === field;
  const activate = (itemId: string, field: string) => setActiveCell({ itemId, field });

  const categoryById = useMemo(() => {
    const m = new Map<string, OverheadCategory>();
    data.categories.forEach(c => m.set(c.id, c));
    return m;
  }, [data.categories]);

  type ItemRow = OverheadItem & { categoryName: string };
  const rows = useMemo<ItemRow[]>(
    () => data.items.map(i => ({ ...i, categoryName: categoryById.get(i.categoryId)?.name || "—" })),
    [data.items, categoryById],
  );

  const columns = useMemo<ColumnDef<ItemRow, unknown>[]>(() => [
    {
      id: "name",
      header: "Item",
      accessorFn: (r) => r.name,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className={`h-full flex items-center gap-1.5 ${isActive(item.id, "name") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
            {isActive(item.id, "name") && !item.xeroSynced ? (
              <input autoFocus defaultValue={item.name}
                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1"
                onClick={(e) => e.stopPropagation()}
                onBlur={e => commitField(item.id, "name", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); if (!item.xeroSynced) activate(item.id, "name"); }}
                className={`flex-1 h-full flex items-center text-xs px-1 border-b border-transparent transition-colors text-left ${item.xeroSynced ? "cursor-default" : "hover:border-primary/30"}`}>
                {item.name}
              </button>
            )}
            {item.xeroSynced && (
              <span className="text-label font-medium px-1 py-0.5 rounded bg-[#00B9D7]/10 text-[#00B9D7] dark:bg-[#5FD9F0]/15 dark:text-[#5FD9F0] shrink-0 leading-none">Xero</span>
            )}
          </div>
        );
      },
      size: 220,
      meta: { defaultWidth: 220, headerLabel: "Item" } satisfies DataTableColumnMeta,
    },
    {
      id: "frequency",
      header: "Freq.",
      accessorFn: (r) => r.frequency,
      cell: ({ row }) => {
        const item = row.original;
        return isActive(item.id, "frequency") ? (
          <div className="ring-1 ring-inset ring-primary/60 rounded-[2px] h-full flex items-center" onClick={(e) => e.stopPropagation()}>
            <Select defaultValue={item.frequency} onValueChange={v => commitField(item.id, "frequency", v)}>
              <SelectTrigger className="h-full border-0 shadow-none text-xs focus:ring-0 bg-transparent"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex justify-end h-full items-center">
            <button onClick={(e) => { e.stopPropagation(); activate(item.id, "frequency"); }}>
              <Badge className={`text-data no-default-active-elevate ${FREQ_COLORS[item.frequency]}`}>{item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}</Badge>
            </button>
          </div>
        );
      },
      size: 90,
      meta: { defaultWidth: 90, align: "right", headerLabel: "Freq." } satisfies DataTableColumnMeta,
    },
    {
      id: "budget",
      header: "Budget",
      accessorFn: (r) => r.budgetCents,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className={`h-full flex items-center ${isActive(item.id, "budgetCents") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
            {isActive(item.id, "budgetCents") ? (
              <input autoFocus type="number" defaultValue={item.budgetCents > 0 ? (item.budgetCents / 100).toFixed(0) : ""}
                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1 tabular-nums"
                onClick={(e) => e.stopPropagation()}
                onBlur={e => commitField(item.id, "budgetCents", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
            ) : (
              <button onClick={(e) => { e.stopPropagation(); activate(item.id, "budgetCents"); }} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors tabular-nums">
                {item.budgetCents > 0
                  ? fmtDollars(item.budgetCents)
                  : item.xeroSynced
                    ? <span className="text-amber-500 dark:text-amber-400 text-data">Set budget</span>
                    : <span className="text-muted-foreground/40">—</span>}
              </button>
            )}
          </div>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Budget" } satisfies DataTableColumnMeta,
    },
    {
      id: "xeroCode",
      header: "Xero Code",
      accessorFn: (r) => r.xeroAccountCode || "",
      cell: ({ row }) => {
        const item = row.original;
        return item.xeroSynced ? (
          <div className="h-full flex items-center justify-end gap-1 px-1">
            <Lock className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
            <span className="text-xs text-muted-foreground tabular-nums">{item.xeroAccountCode || <span className="opacity-40">—</span>}</span>
          </div>
        ) : (
          <div className={`h-full flex items-center ${isActive(item.id, "xeroAccountCode") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
            {isActive(item.id, "xeroAccountCode") ? (
              <input autoFocus defaultValue={item.xeroAccountCode || ""}
                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1"
                onClick={(e) => e.stopPropagation()}
                onBlur={e => commitField(item.id, "xeroAccountCode", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
            ) : (
              <button onClick={(e) => { e.stopPropagation(); activate(item.id, "xeroAccountCode"); }} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors text-muted-foreground">
                {item.xeroAccountCode || <span className="opacity-40">—</span>}
              </button>
            )}
          </div>
        );
      },
      size: 90,
      meta: { defaultWidth: 90, align: "right", headerLabel: "Xero Code" } satisfies DataTableColumnMeta,
    },
    {
      id: "xeroGroup",
      header: "Xero Group",
      accessorFn: (r) => r.xeroAccountType || "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="h-full flex items-center justify-end px-1">
            {item.xeroAccountType ? (
              <Badge className={`text-data no-default-active-elevate ${
                item.xeroAccountType === "DIRECTCOSTS" ? "bg-status-warning-bg text-status-warning dark:text-orange-400" :
                item.xeroAccountType === "OVERHEADS" ? "bg-[#00B9D7]/10 text-[#00B9D7] dark:bg-[#5FD9F0]/15 dark:text-[#5FD9F0]" :
                "bg-muted text-muted-foreground"
              }`}>{XERO_TYPE_LABELS[item.xeroAccountType] ?? item.xeroAccountType}</Badge>
            ) : <span className="text-muted-foreground/30 text-xs">—</span>}
          </div>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Xero Group" } satisfies DataTableColumnMeta,
    },
    {
      id: "buildproGroup",
      header: "BuildPro Group",
      accessorFn: (r) => r.buildproGroup || "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className={`h-full flex items-center ${isActive(item.id, "buildproGroup") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
            {isActive(item.id, "buildproGroup") ? (
              <input autoFocus defaultValue={item.buildproGroup || ""}
                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1 placeholder:text-muted-foreground/30"
                placeholder="e.g. Admin"
                onClick={(e) => e.stopPropagation()}
                onBlur={e => commitField(item.id, "buildproGroup", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
            ) : (
              <button onClick={(e) => { e.stopPropagation(); activate(item.id, "buildproGroup"); }} className="w-full h-full text-left text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors">
                {item.buildproGroup
                  ? <span className="text-foreground">{item.buildproGroup}</span>
                  : <span className="text-muted-foreground/30">—</span>}
              </button>
            )}
          </div>
        );
      },
      size: 130,
      meta: { defaultWidth: 130, headerLabel: "BuildPro Group" } satisfies DataTableColumnMeta,
    },
    {
      id: "monthly",
      header: "Monthly Equiv.",
      accessorFn: (r) => toMonthlyCents(r),
      cell: ({ row }) => <span className="text-xs text-right tabular-nums px-1">{fmtDollars(toMonthlyCents(row.original))}</span>,
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Monthly Equiv." } satisfies DataTableColumnMeta,
    },
    {
      id: "annual",
      header: "Annual Budget",
      accessorFn: (r) => toAnnualCents(r),
      cell: ({ row }) => <span className="text-xs text-right tabular-nums px-1 text-muted-foreground">{fmtDollars(toAnnualCents(row.original))}</span>,
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Annual Budget" } satisfies DataTableColumnMeta,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button size="icon" variant="ghost"><MoreVertical className="w-3 h-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditItem(item)}><Pencil className="w-3.5 h-3.5 mr-2" />Edit in dialog</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMut.mutate(item.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 40,
      meta: { defaultWidth: 40, align: "center", pinned: true, headerLabel: "Actions" } satisfies DataTableColumnMeta,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [activeCell, deleteItemMut]);

  const pickerColumns = useMemo(() => [
    { id: "name", label: "Item" },
    { id: "frequency", label: "Freq." },
    { id: "budget", label: "Budget" },
    { id: "xeroCode", label: "Xero Code" },
    { id: "xeroGroup", label: "Xero Group" },
    { id: "buildproGroup", label: "BuildPro Group" },
    { id: "monthly", label: "Monthly Equiv." },
    { id: "annual", label: "Annual Budget" },
    { id: "actions", label: "Actions", pinned: true },
  ], []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Monthly OH budget</p>
            <p className="text-2xl font-bold tabular-nums">{fmtDollars(grandMonthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Annual OH budget</p>
            <p className="text-2xl font-bold tabular-nums">{fmtDollars(grandAnnual)}<span className="text-sm font-normal text-muted-foreground">/yr</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><SlidersHorizontal className="w-3.5 h-3.5 mr-1" />Columns</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-0">
              <DataTableColumnPicker storageKey="business-overheads" columns={pickerColumns} />
            </PopoverContent>
          </Popover>
          {xeroConnected && (
            <Button size="sm" variant="outline" onClick={() => syncXeroMut.mutate()} disabled={syncXeroMut.isPending}>
              {syncXeroMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Sync from Xero
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)} disabled={data.categories.length === 0}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
          <Button size="sm" onClick={() => setAddCatOpen(true)}><FolderPlus className="w-3.5 h-3.5 mr-1" />Add Category</Button>
        </div>
      </div>

      {data.categories.length === 0 ? (
        <Card><CardContent className="py-10 flex flex-col items-center gap-3 text-center">
          <Package className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No overhead categories yet.</p>
          <div className="flex items-center gap-2">
            {xeroConnected && (
              <Button size="sm" variant="outline" onClick={() => syncXeroMut.mutate()} disabled={syncXeroMut.isPending}>
                {syncXeroMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Sync from Xero
              </Button>
            )}
            <Button size="sm" onClick={() => setAddCatOpen(true)}><FolderPlus className="w-3.5 h-3.5 mr-1" />Add First Category</Button>
          </div>
        </CardContent></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {data.categories.map(cat => {
            const catItems = rows.filter(r => r.categoryId === cat.id);
            const isCollapsed = collapsed.has(cat.id);
            const catMonthly = catItems.reduce((s, i) => s + toMonthlyCents(i), 0);
            const catAnnual = catItems.reduce((s, i) => s + toAnnualCents(i), 0);
            const tableHeight = catItems.length === 0
              ? 80
              : Math.min(catItems.length, 12) * 36 + 32;

            return (
              <Card key={cat.id} data-testid={`card-overhead-category-${cat.id}`}>
                <CardHeader className="p-3 hover-elevate cursor-pointer" onClick={() => toggleCollapse(cat.id)}>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(cat.id); }}
                      data-testid={`button-toggle-overhead-category-${cat.id}`}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {editingCatId === cat.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            autoFocus
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingCatName.trim()) {
                                updateCatMut.mutate({ id: cat.id, name: editingCatName.trim() });
                              }
                              if (e.key === "Escape") setEditingCatId(null);
                            }}
                            className="h-7 text-sm w-48"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => editingCatName.trim() && updateCatMut.mutate({ id: cat.id, name: editingCatName.trim() })}
                          >
                            <Check className="w-3 h-3 text-status-success dark:text-green-400" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setEditingCatId(null)}
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <CardTitle className="text-sm font-semibold">{cat.name}</CardTitle>
                      )}
                      <Badge variant="secondary" className="text-data no-default-active-elevate">{catItems.length}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtDollars(catMonthly)}/mo · {fmtDollars(catAnnual)}/yr
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setPreselectedCatId(cat.id); setAddItemOpen(true); }}
                        title="Add item to this category"
                        data-testid={`button-add-item-to-category-${cat.id}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-overhead-category-actions-${cat.id}`}>
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setPreselectedCatId(cat.id); setAddItemOpen(true); }}>
                            <Plus className="w-3.5 h-3.5 mr-2" />Add item
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Delete "${cat.name}" and all its items?`)) deleteCatMut.mutate(cat.id);
                            }}
                            data-testid={`menu-delete-overhead-category-${cat.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                {!isCollapsed && (
                  <CardContent className="p-0 pt-0 pb-2">
                    <div className="px-2" style={{ height: tableHeight }}>
                      <DataTable
                        data={catItems}
                        columns={columns}
                        storageKey="business-overheads"
                        legacyConfigKey="business-overheads-column-config-v1"
                        rowKey={(r) => r.id}
                        emptyState={
                          <span>
                            No items —{" "}
                            <button
                              className="text-primary underline underline-offset-2"
                              onClick={() => { setPreselectedCatId(cat.id); setAddItemOpen(true); }}
                            >
                              add one
                            </button>
                          </span>
                        }
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {data.items.length > 0 && (
            <div
              className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/60 backdrop-blur px-4 py-2 text-sm font-semibold"
              data-testid="overheads-register-totals"
            >
              <span>Total</span>
              <div className="flex items-center gap-6 tabular-nums">
                <span>{fmtDollars(grandMonthly)}<span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span></span>
                <span className="text-muted-foreground">{fmtDollars(grandAnnual)}<span className="ml-1 text-xs font-normal">/yr</span></span>
              </div>
            </div>
          )}
        </div>
      )}

      <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} onSave={name => createCatMut.mutate(name)} />
      <ItemDialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPreselectedCatId(""); }}
        onSave={form => createItemMut.mutate(form)} categories={data.categories}
        initial={{ categoryId: preselectedCatId || data.categories[0]?.id || "" }} />
      {editItem && (
        <ItemDialog open title="Edit Overhead Item" onClose={() => setEditItem(null)}
          onSave={form => { updateItemMut.mutate({ id: editItem.id, patch: { ...form, budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0 } }); setEditItem(null); }}
          categories={data.categories}
          xeroSynced={editItem.xeroSynced}
          initial={{ name: editItem.name, frequency: editItem.frequency, budgetCents: editItem.budgetCents > 0 ? (editItem.budgetCents / 100).toFixed(0) : "", xeroAccountCode: editItem.xeroAccountCode || "", notes: editItem.notes || "", categoryId: editItem.categoryId }} />
      )}
    </div>
  );
}

// ─── Tab 2: Monthly Actuals (rolling 12-month) ────────────────────────────────

type GroupBy = "xero" | "buildpro";
type ViewMode = "12months" | "fy" | "quarterly" | "compareFy" | "compareCy" | "rollingT12";

// One column in the grid (a month, a quarter, a financial/calendar year, or a summary).
type ColVariant = "data" | "current" | "accent" | "accentPct";
type ColSpec = {
  key: string;
  shortLabel: string;
  subLabel?: string;
  miniLabel?: string;
  width: number;
  months: Array<{ year: number; month: number }>;
  variant: ColVariant;
  showDot?: boolean;
  divisor?: number; // for "Avg" accent in compare views
  // When true, accent cells render two stacked numbers ($ on top,
  // % of trailing income on bottom). Used by the rolling-T12 view
  // where every column is a 12-month window with its own % anchor.
  stackedPct?: boolean;
};

// Subscribe to .dark class on <html> so palettes that need higher
// alpha in dark mode can re-render when the user toggles theme.
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function MonthlyActualsTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === "undefined") return "xero";
    const saved = localStorage.getItem("bp_overheads_group_by");
    if (saved === "buildpro") return "buildpro";
    // Migrate legacy "category" → "xero" silently
    return "xero";
  });
  useEffect(() => { localStorage.setItem("bp_overheads_group_by", groupBy); }, [groupBy]);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);

  // View mode (12months / FY / Quarterly / Compare FYs / Compare CYs)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "12months";
    const saved = localStorage.getItem("bp_overheads_view_mode");
    const valid: ViewMode[] = ["12months", "fy", "quarterly", "compareFy", "compareCy", "rollingT12"];
    return (valid.includes(saved as ViewMode) ? (saved as ViewMode) : "12months");
  });
  useEffect(() => { localStorage.setItem("bp_overheads_view_mode", viewMode); }, [viewMode]);

  // Period offset for FY / Quarterly views (0 = current FY, -1 = prior FY, etc.)
  const [fyOffset, setFyOffset] = useState<number>(0);
  // Number of periods to compare in compareFy / compareCy views (default 5).
  const [compareCount, setCompareCount] = useState<number>(5);

  // Display mode: $k vs $
  const [displayMode, setDisplayMode] = useState<'k' | 'dollars'>(() => {
    if (typeof window === "undefined") return 'k';
    return localStorage.getItem("bp_overheads_display_mode") === 'dollars' ? 'dollars' : 'k';
  });
  useEffect(() => { localStorage.setItem("bp_overheads_display_mode", displayMode); }, [displayMode]);

  const [hideZeroCats, setHideZeroCats] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bp_overheads_hide_zero") === "1";
  });
  useEffect(() => { localStorage.setItem("bp_overheads_hide_zero", hideZeroCats ? "1" : "0"); }, [hideZeroCats]);

  // Show per-column "% of income" sub-line under each cell value
  const [showColumnPct, setShowColumnPct] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bp_overheads_show_col_pct") === "1";
  });
  useEffect(() => { localStorage.setItem("bp_overheads_show_col_pct", showColumnPct ? "1" : "0"); }, [showColumnPct]);

  const [hideZeroItems, setHideZeroItems] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bp_overheads_hide_zero_items") === "1";
  });
  useEffect(() => { localStorage.setItem("bp_overheads_hide_zero_items", hideZeroItems ? "1" : "0"); }, [hideZeroItems]);

  // Per-section open state. Defaults: Income+DC collapsed, Overheads expanded.
  const [openIncome, setOpenIncome] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("bp_overheads_open_income") === "1");
  const [openDC, setOpenDC] = useState<boolean>(() =>
    typeof window !== "undefined" && localStorage.getItem("bp_overheads_open_dc") === "1");
  const [openOH, setOpenOH] = useState<boolean>(() =>
    typeof window === "undefined" || localStorage.getItem("bp_overheads_open_oh") !== "0");
  useEffect(() => { localStorage.setItem("bp_overheads_open_income", openIncome ? "1" : "0"); }, [openIncome]);
  useEffect(() => { localStorage.setItem("bp_overheads_open_dc", openDC ? "1" : "0"); }, [openDC]);
  useEffect(() => { localStorage.setItem("bp_overheads_open_oh", openOH ? "1" : "0"); }, [openOH]);

  const rolling12 = useMemo(() => rollingLast12(), []);
  // Fixed 12 trailing months (NOT including current) + a separate current-month column
  const trailingMonths = useMemo<{ year: number; month: number }[]>(() => {
    const today = new Date();
    const cy = today.getFullYear();
    const cm = today.getMonth() + 1; // 1-12
    const arr: { year: number; month: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = cm - 1 - i;
      let y = cy;
      while (m <= 0) { m += 12; y--; }
      arr.push({ year: y, month: m });
    }
    return arr;
  }, []);
  const currentCol = useMemo(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }, []);
  // Build the active grid columns for the current view mode + period offset.
  // 12months view = 12 month cols + T12 + T12% + Current (existing layout).
  // fy view       = 12 FY months (Jul→Jun) + FYTD + FYTD%.
  // quarterly     = 4 quarter cols + FYTD + FYTD%.
  // compareFy/Cy  = N FY/CY cols + Avg.
  const dataColumns = useMemo<ColSpec[]>(() => {
    const today = new Date();
    const cy = today.getFullYear(); const cm = today.getMonth() + 1;
    const currentFyStart = getFyStartYearForDate(cy, cm);
    const targetFyStart = currentFyStart + fyOffset;
    const targetCy = cy + fyOffset;

    if (viewMode === "12months") {
      const cols: ColSpec[] = trailingMonths.map(({ year, month }) => ({
        key: `m-${year}-${month}`,
        shortLabel: MONTH_NAMES[month - 1],
        subLabel: `'${String(year).slice(-2)}`,
        width: 72,
        months: [{ year, month }],
        variant: "data",
        showDot: true,
      }));
      cols.push({
        key: "t12", shortLabel: "T12", subLabel: "Trailing", miniLabel: "12 months",
        width: 90, months: [...trailingMonths], variant: "accent",
      });
      cols.push({
        key: "t12pct", shortLabel: "T12 %", subLabel: "% of", miniLabel: "income",
        width: 90, months: [], variant: "accentPct",
      });
      cols.push({
        key: "current", shortLabel: MONTH_NAMES[cm - 1], subLabel: `'${String(cy).slice(-2)}`,
        miniLabel: "In Progress",
        width: 90, months: [{ year: cy, month: cm }], variant: "current",
      });
      return cols;
    }

    if (viewMode === "fy") {
      const fyMonths = buildFyMonths(targetFyStart);
      // Month is "current" when it matches today's year+month within this FY
      const cols: ColSpec[] = fyMonths.map(({ year, month }) => {
        const isCurrent = (year === cy && month === cm);
        return {
          key: `fy-${year}-${month}`,
          shortLabel: MONTH_NAMES[month - 1],
          subLabel: `'${String(year).slice(-2)}`,
          width: 72,
          months: [{ year, month }],
          variant: isCurrent ? "current" : "data",
          showDot: !isCurrent,
        };
      });
      // FYTD: only include months up to today (so prior FYs sum the whole FY, current FY sums YTD).
      const ytdMonths = clampMonthsToToday(fyMonths, today);
      cols.push({
        key: "fytd", shortLabel: "FYTD", subLabel: fyLabel(targetFyStart), miniLabel: undefined,
        width: 90, months: ytdMonths, variant: "accent",
      });
      cols.push({
        key: "fytdpct", shortLabel: "FYTD %", subLabel: "% of", miniLabel: "income",
        width: 90, months: [], variant: "accentPct",
      });
      return cols;
    }

    if (viewMode === "rollingT12") {
      // 12 trailing-12-month windows side by side.
      // Anchor month slides from (current − 11) at the leftmost column
      // up to current at the rightmost. Each column's `months[]` is the
      // 12 calendar months ending at that anchor. WIP/amber treatment
      // is automatic via colIsWip when the window contains an
      // unconfirmed month.
      const cols: ColSpec[] = [];
      for (let i = 0; i < 12; i++) {
        // anchor month for this column (sliding from current-11 → current)
        let am = cm - (11 - i);
        let ay = cy;
        while (am <= 0) { am += 12; ay--; }
        // build the 12-month window ending at (ay, am)
        const months: { year: number; month: number }[] = [];
        for (let j = 11; j >= 0; j--) {
          let m = am - j;
          let y = ay;
          while (m <= 0) { m += 12; y--; }
          months.push({ year: y, month: m });
        }
        cols.push({
          key: `rt12-${ay}-${am}`,
          shortLabel: "T12",
          subLabel: `→ ${MONTH_NAMES[am - 1]} '${String(ay).slice(-2)}`,
          miniLabel: "12 mo rolling",
          width: 110,
          months,
          variant: "accent",
          stackedPct: true,
        });
      }
      return cols;
    }

    if (viewMode === "quarterly") {
      const quarters = buildQuartersOfFy(targetFyStart);
      const cols: ColSpec[] = quarters.map(q => ({
        key: q.key, shortLabel: q.shortLabel, subLabel: q.subLabel,
        width: 110, months: q.months, variant: "data",
      }));
      const ytdMonths = clampMonthsToToday(quarters.flatMap(q => q.months), today);
      cols.push({
        key: "fytd", shortLabel: "FYTD", subLabel: fyLabel(targetFyStart),
        width: 90, months: ytdMonths, variant: "accent",
      });
      cols.push({
        key: "fytdpct", shortLabel: "FYTD %", subLabel: "% of", miniLabel: "income",
        width: 90, months: [], variant: "accentPct",
      });
      return cols;
    }

    if (viewMode === "compareFy") {
      const fys = buildLastNFys(compareCount, currentFyStart);
      const dataCols: ColSpec[] = fys.map(fy => {
        // Clamp current FY to elapsed months only (so we're comparing apples-to-apples-ish for YTD).
        const isCurrent = fy.key === `fy-${currentFyStart}`;
        const months = isCurrent ? clampMonthsToToday(fy.months, today) : fy.months;
        return {
          key: fy.key,
          shortLabel: fy.shortLabel,
          subLabel: isCurrent ? "FYTD" : undefined,
          width: 110, months, variant: "data",
        };
      });
      // "Avg" = annualised mean across the N FYs.
      // Sum every month present in the comparison (current FY clamped to YTD) then
      // divide by (totalMonths / 12) so a partial current FY contributes only its
      // fractional weight — otherwise a 4-month YTD would dilute a 5-FY avg by 60%.
      const allMonths = dataCols.flatMap(c => c.months);
      dataCols.push({
        key: "avg", shortLabel: "Avg", subLabel: `${compareCount}-FY`, miniLabel: "annualised",
        width: 100, months: allMonths, variant: "accent",
        divisor: allMonths.length / 12,
      });
      dataCols.push({
        key: "avgpct", shortLabel: "Avg %", subLabel: "% of", miniLabel: "income",
        width: 90, months: [], variant: "accentPct",
      });
      return dataCols;
    }

    // compareCy
    const cys = buildLastNCys(compareCount, cy);
    const dataCols: ColSpec[] = cys.map(c => {
      const isCurrent = c.key === `cy-${cy}`;
      const months = isCurrent ? clampMonthsToToday(c.months, today) : c.months;
      return {
        key: c.key,
        shortLabel: c.shortLabel,
        subLabel: isCurrent ? "YTD" : undefined,
        width: 110, months, variant: "data",
      };
    });
    const allMonthsCy = dataCols.flatMap(c => c.months);
    dataCols.push({
      key: "avg", shortLabel: "Avg", subLabel: `${compareCount}-CY`, miniLabel: "annualised",
      width: 100, months: allMonthsCy, variant: "accent",
      divisor: allMonthsCy.length / 12,
    });
    dataCols.push({
      key: "avgpct", shortLabel: "Avg %", subLabel: "% of", miniLabel: "income",
      width: 90, months: [], variant: "accentPct",
    });
    return dataCols;
  }, [viewMode, fyOffset, compareCount, trailingMonths]);

  // Quick lookup: union of every (year, month) appearing in any data column.
  // Used by hideZeroItems / hideZeroCats predicates so that filtering follows the active view.
  const monthsInView = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ year: number; month: number }> = [];
    for (const col of dataColumns) {
      if (col.variant === "accentPct") continue;
      for (const ym of col.months) {
        const k = `${ym.year}__${ym.month}`;
        if (!seen.has(k)) { seen.add(k); out.push(ym); }
      }
    }
    return out;
  }, [dataColumns]);

  // Whether period stepper is visible (FY / Quarterly only)
  const showStepper = viewMode === "fy" || viewMode === "quarterly";
  // Whether month-level confirmation dots / amber current-month make sense in the header
  const isMonthLevel = viewMode === "12months" || viewMode === "fy";
  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);
  const driftMap = useMemo(() => buildDriftMap(data.actuals), [data.actuals]);
  const statusSet = useMemo(() => buildStatusSet(data.monthStatuses), [data.monthStatuses]);

  // A column is "WIP" (work-in-progress) when at least one of the months it
  // spans hasn't been confirmed yet. Used to flag quarterly / FYTD / compare
  // columns that include the current (or otherwise unconfirmed) month with
  // the same amber styling as the current-month column in the 12-month view.
  const colIsWip = (col: ColSpec): boolean => {
    if (col.variant === "accentPct") return false;
    return col.months.some(({ year, month }) => !statusSet.has(`${year}__${month}`));
  };

  // Income actuals map: "year__month" → cents
  const incomeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of (data.incomeActuals || [])) m.set(`${a.year}__${a.month}`, a.incomeCents);
    return m;
  }, [data.incomeActuals]);

  // Months with xero-imported income (locked)
  const incomeXeroSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of (data.incomeActuals || [])) if (a.xeroImported) s.add(`${a.year}__${a.month}`);
    return s;
  }, [data.incomeActuals]);

  // Direct cost actuals map: "year__month" → cents
  const directCostMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of (data.directCostActuals || [])) m.set(`${a.year}__${a.month}`, a.directCostCents);
    return m;
  }, [data.directCostActuals]);

  // Months with xero-imported direct costs (locked)
  const directCostXeroSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of (data.directCostActuals || [])) if (a.xeroImported) s.add(`${a.year}__${a.month}`);
    return s;
  }, [data.directCostActuals]);

  const monthsWithActuals = useMemo(() => {
    const s = new Set<string>();
    for (const a of data.actuals) if (a.actualCents !== 0) s.add(`${a.year}__${a.month}`);
    return s;
  }, [data.actuals]);

  const monthsWithDrift = useMemo(() => {
    const s = new Set<string>();
    for (const a of data.actuals) if (a.driftedSinceConfirmed) s.add(`${a.year}__${a.month}`);
    return s;
  }, [data.actuals]);

  const toggleMonthMut = useMutation({
    mutationFn: (p: { year: number; month: number; confirmed: boolean }) => apiRequest("/api/overheads/month-status", "POST", p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to update month status", variant: "destructive" }),
  });

  // Confirmation attestation dialog — opens only when transitioning a month
  // from unconfirmed → confirmed. Unconfirming an already-confirmed month
  // fires the mutation immediately (no dialog).
  const [confirmDialog, setConfirmDialog] = useState<{ year: number; month: number } | null>(null);

  const syncActualsMut = useMutation({
    mutationFn: () => apiRequest("/api/xero/sync-overhead-actuals", "POST", {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      const drifted = res?.drifted || 0;
      toast({ title: drifted > 0 ? `Synced — ${drifted} confirmed month${drifted !== 1 ? "s" : ""} have changed figures` : "Xero actuals synced" });
    },
    onError: () => toast({ title: "Failed to sync Xero actuals", variant: "destructive" }),
  });

  const monthBudget = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);

  // Grouped rows for both views
  const groupedData = useMemo((): { label: string; items: OverheadItem[] }[] => {
    if (groupBy === "xero") {
      const ORDER = ["OVERHEADS", "DIRECTCOSTS", "EXPENSE", "CURRLIAB"];
      const map = new Map<string, OverheadItem[]>();
      for (const item of data.items) {
        const key = item.xeroAccountType || "Unassigned";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      }
      return [...map.entries()].sort((a, b) => {
        const ai = ORDER.indexOf(a[0]); const bi = ORDER.indexOf(b[0]);
        if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      }).map(([key, items]) => ({ label: XERO_TYPE_LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase(), items }));
    }
    // buildpro
    const map = new Map<string, OverheadItem[]>();
    for (const item of data.items) {
      const key = item.buildproGroup || "Ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const sorted = [...map.entries()].sort((a, b) => {
      if (a[0] === "Ungrouped") return 1;
      if (b[0] === "Ungrouped") return -1;
      return a[0].localeCompare(b[0]);
    });
    return sorted.map(([label, items]) => ({ label, items }));
  }, [groupBy, data.items]);

  // (Empty-state early return is below, AFTER all useMemo hooks, to comply
  //  with React's Rules of Hooks. Do not move this above any hook.)

  // Compute income breakdown across rolling 12 months (from breakdown JSONB field)
  const incomeBreakdown12 = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { year, month } of rolling12) {
      const actual = data.incomeActuals.find(a => a.year === year && a.month === month);
      if (!actual?.breakdown) continue;
      for (const [name, cents] of Object.entries(actual.breakdown)) {
        map[name] = (map[name] || 0) + cents;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [data.incomeActuals, rolling12]);

  const incomeBreakdownNames = useMemo(() => {
    const names = new Set<string>();
    for (const { year, month } of monthsInView) {
      const a = data.incomeActuals.find(x => x.year === year && x.month === month);
      if (a?.breakdown) for (const k of Object.keys(a.breakdown)) names.add(k);
    }
    return Array.from(names).sort();
  }, [monthsInView, data.incomeActuals]);

  const dcBreakdownNames = useMemo(() => {
    const names = new Set<string>();
    for (const { year, month } of monthsInView) {
      const a = data.directCostActuals.find(x => x.year === year && x.month === month);
      if (a?.breakdown) for (const k of Object.keys(a.breakdown)) names.add(k);
    }
    return Array.from(names).sort();
  }, [monthsInView, data.directCostActuals]);

  const visibleGroups = useMemo(() => {
    if (!hideZeroCats) return groupedData;
    return groupedData.filter(g => g.items.some(item =>
      monthsInView.some(({ year, month }) => (actualMap.get(getKey(item.id, year, month)) || 0) !== 0)
    ));
  }, [groupedData, hideZeroCats, monthsInView, actualMap]);


  // ─── Monthly Grid View ───────────────────────────────────────────────────────

  // Per-month getters (work for any column type — single month, quarter, FY, CY).
  const incomeForMonth = (y: number, m: number) => incomeMap.get(`${y}__${m}`) || 0;
  const dcForMonth = (y: number, m: number) => directCostMap.get(`${y}__${m}`) || 0;
  const ohForMonth = (y: number, m: number) =>
    data.items.reduce((s, i) => s + (actualMap.get(getKey(i.id, y, m)) || 0), 0);

  // Pre-compute the income value for the "accent" column (T12 / FYTD / Avg).
  // Used as the denominator for the right-hand accentPct column on every row.
  const accentCol = dataColumns.find(c => c.variant === "accent");
  const accentIncome = useMemo(() => {
    if (!accentCol) return 0;
    let sum = 0;
    for (const { year, month } of accentCol.months) sum += incomeForMonth(year, month);
    if (accentCol.divisor) sum /= accentCol.divisor;
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentCol, incomeMap]);

  // Per-column income totals — used as denominators when the
  // "Show % of income per column" toggle is on.
  const colIncomes = useMemo(() => {
    return dataColumns.map(col => {
      if (col.variant === "accentPct") return 0;
      let s = 0;
      for (const { year, month } of col.months) s += incomeForMonth(year, month);
      if (col.divisor) s /= col.divisor;
      return s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataColumns, incomeMap]);

  // ─── Design tokens ──────────────────────────────────────────────────────────
  // Every value resolves to a CSS variable so the grid follows the global
  // light/dark theme automatically (matches Project → Scope visual language).
  // Muted-row tints get higher alpha in dark mode so the grid still reads
  // as banded against the warm dark card surface.
  const isDark = useIsDark();
  const C = {
    bg:          'hsl(var(--background))',
    white:       'hsl(var(--card))',
    purple:      'hsl(var(--primary))',
    purpleLight: isDark ? 'hsl(var(--primary) / 0.18)' : 'hsl(var(--primary) / 0.08)',
    purpleTint:  isDark ? 'hsl(var(--primary) / 0.24)' : 'hsl(var(--primary) / 0.12)',
    coral:       'hsl(var(--destructive))',
    greenTint:   'hsl(var(--status-success-bg))',
    greenNum:    'hsl(var(--status-success-fg))',
    redNum:      'hsl(var(--destructive))',
    border:      'hsl(var(--border))',
    text:        'hsl(var(--foreground))',
    textMid:     'hsl(var(--muted-foreground))',
    textLight:   isDark ? 'hsl(var(--muted-foreground) / 0.55)' : 'hsl(var(--muted-foreground) / 0.65)',
    zebraRow:    isDark ? 'hsl(var(--muted) / 0.85)' : 'hsl(var(--muted) / 0.35)',
    totalRow:    isDark ? 'hsl(var(--muted) / 1)'    : 'hsl(var(--muted) / 0.55)',
    sectionHdr:  isDark ? 'hsl(var(--muted) / 0.95)' : 'hsl(var(--muted) / 0.5)',
    amber:       'hsl(var(--amber))',
    dotGreen:    'hsl(var(--status-success-fg))',
    dotCoral:    'hsl(var(--destructive))',
    dotGray:     'hsl(var(--muted-foreground) / 0.35)',
  };

  // Number formatter: 0 → em-dash, otherwise absolute-value k or full dollars
  function fmtCell(cents: number, mode: 'k' | 'dollars'): string {
    if (cents === 0) return '—';
    if (mode === 'k') {
      const k = Math.abs(cents) / 100000;
      return `$${k.toFixed(1)}k`;
    }
    return `$${Math.abs(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // ─── Column-driven row renderer ──────────────────────────────────────────────
  // Drives every section/row in the grid off `dataColumns`, so swapping view modes
  // (12 months / FY / Quarterly / Compare FYs / Compare CYs) needs no per-row code.
  type RowColor = string | ((v: number) => string);
  type RenderRowOpts = {
    color?: RowColor;
    fontWeight?: number;
    isPct?: boolean;             // renders all data cells as % values
    pctOverride?: number | null; // for accentPct column. null = blank, undefined = auto
    // For per-cell colouring (e.g. drift detection on OH item rows)
    colorAt?: (year: number, month: number, value: number) => string | undefined;
    // Suppress the per-column % of income sub-line (e.g. on the Income row itself,
    // where it'd always read 100%).
    skipColPct?: boolean;
  };

  // Renders all cells for one row given a per-month value getter.
  const renderRow = (
    getVal: (year: number, month: number) => number,
    opts: RenderRowOpts = {},
  ) => {
    // Pre-compute the dollar/% value for every column.
    const cellVals = dataColumns.map(col => {
      if (col.variant === "accentPct") return null;
      let sum = 0;
      for (const { year, month } of col.months) sum += getVal(year, month);
      if (col.divisor) sum /= col.divisor;
      return sum;
    });
    // Find which column is the "accent" (for the % cell to reference).
    const accentIdx = dataColumns.findIndex(c => c.variant === "accent");
    const accentVal = accentIdx >= 0 ? (cellVals[accentIdx] ?? 0) : 0;

    const colorFor = (v: number) => {
      if (v === 0 && !opts.isPct) return C.textLight;
      if (typeof opts.color === 'function') return opts.color(v);
      return opts.color || C.text;
    };
    const fmt = (v: number) => {
      if (opts.isPct) return v === 0 ? '—' : `${v.toFixed(0)}%`;
      return fmtCell(v, displayMode);
    };
    const fw = opts.fontWeight || 400;

    return (
      <>
        {dataColumns.map((col, i) => {
          if (col.variant === "accentPct") {
            let pct: number | null;
            if (opts.pctOverride === null) pct = null;
            else if (opts.pctOverride !== undefined) pct = opts.pctOverride;
            else pct = accentIncome > 0 ? (accentVal / accentIncome) * 100 : null;
            const pctText = pct === null || pct === 0 ? '—' : `${pct.toFixed(1)}%`;
            return (
              <div key={col.key} style={{ width: col.width, minWidth: col.width, paddingRight: 8, backgroundColor: C.purpleLight, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{ color: C.textMid, fontSize: 11, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{pctText}</span>
              </div>
            );
          }
          const v = cellVals[i] ?? 0;
          // Per-cell colour override only applies to single-month columns (drift dot etc.)
          let cellColor = colorFor(v);
          if (col.months.length === 1 && opts.colorAt) {
            const { year, month } = col.months[0];
            const override = opts.colorAt(year, month, v);
            if (override) cellColor = override;
          }
          // Background & border per variant
          let bg: string | undefined;
          let borderLeft: string | undefined;
          let weight: number = fw;
          const isWip = colIsWip(col);
          if (col.variant === "accent") {
            bg = C.purpleLight;
            borderLeft = `4px solid ${C.purple}`;
            weight = Math.max(fw, 600);
          } else if (col.variant === "current") {
            borderLeft = `1px solid ${C.border}`;
          } else if (isWip) {
            // Multi-month / past-month columns containing unconfirmed months
            // get a thin amber left border to flag them as WIP.
            borderLeft = `1px solid ${C.amber}`;
          }
          // Optional per-column "% of income" sub-line.
          // - User-toggleable on data cells via showColumnPct.
          // - Always-on for accent cells in views that opt in via
          //   col.stackedPct (e.g. Rolling T12 — every column is its
          //   own 12-month window so we always pair $ + window %).
          const wantStackedPct = !!col.stackedPct && col.variant === "accent";
          const showPctLine =
            !opts.isPct && v !== 0 && (colIncomes[i] ?? 0) > 0 &&
            (wantStackedPct || (showColumnPct && !opts.skipColPct));
          const pctLineVal = showPctLine ? (v / colIncomes[i]) * 100 : 0;
          return (
            <div key={col.key} style={{
              width: col.width, minWidth: col.width, paddingRight: 8,
              backgroundColor: bg, borderLeft,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
              lineHeight: 1.15,
            }}>
              <span style={{ color: cellColor, fontSize: 12, fontWeight: weight, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</span>
              {showPctLine && (
                <span style={{ color: C.textLight, fontSize: 9, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {pctLineVal.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}
      </>
    );
  };

  // Variant of renderRow for ratio rows like OH% — value per column is
  // (sum of numerator over months) / (sum of denominator over months) * 100.
  const renderRatioRow = (
    getNum: (year: number, month: number) => number,
    getDen: (year: number, month: number) => number,
    opts: { color?: string; fontWeight?: number } = {},
  ) => {
    // Ratio rows compute (sumNum / sumDen) per column directly — averaging
    // monthly ratios would be wrong because column aggregations span 1, 3, or 12 months.
    const cellVals = dataColumns.map(col => {
      if (col.variant === "accentPct") return null;
      let num = 0, den = 0;
      for (const { year, month } of col.months) { num += getNum(year, month); den += getDen(year, month); }
      return den > 0 ? (num / den) * 100 : 0;
    });
    const accentIdx = dataColumns.findIndex(c => c.variant === "accent");
    const accentPct = accentIdx >= 0 ? (cellVals[accentIdx] ?? 0) : 0;
    const fw = opts.fontWeight || 400;
    return (
      <>
        {dataColumns.map((col, i) => {
          if (col.variant === "accentPct") {
            // OH%-style rows leave the right-hand pct column blank (parent already shows the %).
            return (
              <div key={col.key} style={{ width: col.width, minWidth: col.width, backgroundColor: C.purpleLight }} />
            );
          }
          const v = cellVals[i] ?? 0;
          const text = v === 0 ? '—' : `${v.toFixed(0)}%`;
          let bg: string | undefined;
          let borderLeft: string | undefined;
          let weight: number = fw;
          const isWip = colIsWip(col);
          if (col.variant === "accent") {
            bg = C.purpleLight; borderLeft = `4px solid ${C.purple}`; weight = Math.max(fw, 600);
          } else if (col.variant === "current") {
            borderLeft = `1px solid ${C.border}`;
          } else if (isWip) {
            borderLeft = `1px solid ${C.amber}`;
          }
          return (
            <div key={col.key} style={{
              width: col.width, minWidth: col.width, paddingRight: 8,
              backgroundColor: bg, borderLeft,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            }}>
              <span style={{ color: opts.color || C.textMid, fontSize: 12, fontWeight: weight, fontVariantNumeric: 'tabular-nums' }}>{text}</span>
            </div>
          );
        })}
      </>
    );
  };

  // Helper: render the sticky label cell for a row
  const labelCell = (content: React.ReactNode, opts: { bg: string; fontWeight?: number; color?: string; pl?: number } = { bg: C.white }) => (
    <div style={{
      width: 200, minWidth: 200, position: 'sticky', left: 0, zIndex: 1,
      backgroundColor: opts.bg, paddingLeft: opts.pl ?? 16, paddingRight: 8,
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: opts.fontWeight || 400, color: opts.color || C.text,
    }}>
      {content}
    </div>
  );

  // Grid width = sticky label (200) + sum of all dataColumns widths.
  const gridMinWidth = 200 + dataColumns.reduce((s, c) => s + c.width, 0);
  const monthShortYr = (year: number) => `'${String(year).slice(-2)}`;

  // Header sub-label for the sticky "Category" column reflects the active view.
  const categorySubLabel = useMemo(() => {
    const today = new Date();
    const cy = today.getFullYear(); const cm = today.getMonth() + 1;
    const currentFyStart = getFyStartYearForDate(cy, cm);
    const targetFyStart = currentFyStart + fyOffset;
    const targetCy = cy + fyOffset;
    if (viewMode === "12months") return "Trailing 12 months";
    if (viewMode === "fy") return `${fyLabel(targetFyStart)} (Jul–Jun)`;
    if (viewMode === "quarterly") return `${fyLabel(targetFyStart)} quarters`;
    if (viewMode === "compareFy") return `Last ${compareCount} financial years`;
    if (viewMode === "rollingT12") return "Rolling T12 — last 12 windows";
    return `Last ${compareCount} calendar years`;
  }, [viewMode, fyOffset, compareCount]);

  // Track row index for zebra striping (excluding section headers)
  let rowIdx = 0;
  const nextZebra = () => (rowIdx++ % 2 === 0 ? C.white : C.zebraRow);
  // Reset zebra rowIdx at start of each render (closure pattern: assignment inside JSX is fine here)

  // View-mode picker options (used in toolbar segmented control)
  const viewModeOpts = [
    { key: "12months",   label: "12M",          full: "12 Months" },
    { key: "fy",         label: "FY",           full: "Financial Year" },
    { key: "quarterly",  label: "Quarterly",    full: "Quarterly" },
    { key: "rollingT12", label: "Rolling T12",  full: "Rolling T12 trend" },
    { key: "compareFy",  label: "Compare FYs",  full: "Compare FYs" },
    { key: "compareCy",  label: "Compare CYs",  full: "Compare CYs" },
  ] as const;

  // Empty-state early return — placed AFTER all hooks above to comply with
  // React's Rules of Hooks. Adding more hooks below this line is unsafe.
  if (!data.categories.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add categories and items in the Register tab first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ─── Toolbar (single h-9 row, matches Project → Scope) ─────────────── */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/50 bg-card flex-wrap">
        {/* Data source dropdown */}
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger
            className="h-7 w-auto gap-1.5 border-border/50 bg-muted/30 px-2.5 py-0 text-xs font-medium [&_svg]:opacity-60"
            data-testid="select-source"
            aria-label="Data source"
          >
            <span className="text-muted-foreground">Source:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="xero" data-testid="select-source-xero">Xero</SelectItem>
            <SelectItem value="buildpro" data-testid="select-source-buildpro">BuildPro</SelectItem>
          </SelectContent>
        </Select>

        {/* View-mode dropdown */}
        <Select
          value={viewMode}
          onValueChange={(v) => {
            setViewMode(v as ViewMode);
            if (v !== "fy" && v !== "quarterly") setFyOffset(0);
          }}
        >
          <SelectTrigger
            className="h-7 w-auto gap-1.5 border-border/50 bg-muted/30 px-2.5 py-0 text-xs font-medium [&_svg]:opacity-60"
            data-testid="select-viewmode"
            aria-label="View mode"
          >
            <span className="text-muted-foreground">View:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {viewModeOpts.map(opt => (
              <SelectItem key={opt.key} value={opt.key} data-testid={`select-viewmode-${opt.key}`}>
                {opt.full}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Period stepper (FY + Quarterly only) */}
        {showStepper && (
          <div className="flex items-center gap-0.5 ml-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setFyOffset(o => o - 1)}
              data-testid="button-period-prev"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span
              className="text-xs font-semibold tabular-nums text-foreground min-w-[64px] text-center"
              data-testid="text-period-label"
            >
              {(() => {
                const today = new Date();
                const cy = today.getFullYear(); const cm = today.getMonth() + 1;
                const currentFyStart = getFyStartYearForDate(cy, cm);
                return fyLabel(currentFyStart + fyOffset);
              })()}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setFyOffset(o => o + 1)}
              disabled={fyOffset >= 0}
              data-testid="button-period-next"
              aria-label="Next period"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => syncActualsMut.mutate()}
                  disabled={syncActualsMut.isPending}
                  data-testid="button-sync-xero"
                  aria-label={syncActualsMut.isPending ? "Syncing from Xero" : "Sync from Xero"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncActualsMut.isPending ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{syncActualsMut.isPending ? "Syncing…" : "Sync from Xero"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-overheads-menu">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Display amounts as</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={displayMode} onValueChange={v => setDisplayMode(v as 'k' | 'dollars')}>
                <DropdownMenuRadioItem value="k" data-testid="display-mode-k">Thousands ($k)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dollars" data-testid="display-mode-dollars">Full dollars ($)</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {(viewMode === "compareFy" || viewMode === "compareCy") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Compare last</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={String(compareCount)} onValueChange={v => setCompareCount(parseInt(v, 10))}>
                    <DropdownMenuRadioItem value="3" data-testid="compare-count-3">3 years</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="5" data-testid="compare-count-5">5 years</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="7" data-testid="compare-count-7">7 years</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={hideZeroCats} onCheckedChange={v => setHideZeroCats(!!v)} data-testid="toggle-hide-zero-categories">
                Hide categories with no entries
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showColumnPct} onCheckedChange={v => setShowColumnPct(!!v)} data-testid="toggle-show-column-pct">
                Show % of income per column
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={hideZeroItems} onCheckedChange={v => setHideZeroItems(!!v)} data-testid="toggle-hide-zero-items">
                Hide rows with no entries
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Grid container ────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-md border border-border/50 bg-card">
        <div style={{ minWidth: gridMinWidth }}>
          {/* Sticky header row — driven by dataColumns so it adapts per view */}
          <div className="sticky top-0 z-10 bg-card border-b border-border/50">
            <div style={{ display: 'flex', minHeight: 52 }}>
              {/* Label header (sticky) */}
              <div style={{
                width: 200, minWidth: 200, position: 'sticky', left: 0, zIndex: 2,
                backgroundColor: C.white, paddingLeft: 16, paddingBottom: 8,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.4 }}>Category</span>
                <span style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>{categorySubLabel}</span>
              </div>

              {dataColumns.map(col => {
                if (col.variant === "data" || col.variant === "current") {
                  // Single-month columns get a confirmation dot when isMonthLevel.
                  const isSingleMonth = col.months.length === 1;
                  const ym = isSingleMonth ? col.months[0] : null;
                  const k = ym ? `${ym.year}__${ym.month}` : "";
                  const isConfirmed = ym ? statusSet.has(k) : false;
                  const hasData = ym ? monthsWithActuals.has(k) : false;
                  const hasDrift = ym ? monthsWithDrift.has(k) : false;
                  const showDot = isMonthLevel && isSingleMonth && !!col.showDot;
                  const dotColor = hasDrift ? C.dotCoral : isConfirmed ? C.dotGreen : C.dotGray;
                  const dotTooltip = hasDrift
                    ? "Xero figures changed since confirmed — re-confirm to accept"
                    : isConfirmed ? "Confirmed — click to unconfirm"
                    : hasData ? "Actuals entered but not yet confirmed — click to confirm"
                    : "No actuals entered — click to confirm";
                  const isCurrent = col.variant === "current";
                  const isWip = colIsWip(col);
                  // Show the amber stripe + "WIP" mini-label on the current
                  // month and on any multi-month column (Quarterly / FYTD /
                  // Compare) that contains an unconfirmed month.
                  const showWipStripe = isCurrent || (isWip && !isSingleMonth);
                  return (
                    <div key={col.key} style={{
                      width: col.width, minWidth: col.width,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8,
                      borderLeft: isCurrent
                        ? `1px solid ${C.border}`
                        : (isWip && !isSingleMonth ? `1px solid ${C.amber}` : undefined),
                      position: showWipStripe ? 'relative' : undefined,
                    }}>
                      {showWipStripe && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: C.amber }} />}
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, marginTop: showWipStripe ? 12 : 0 }}>{col.shortLabel}</span>
                      {col.subLabel && <span style={{ fontSize: 10, color: C.textLight, marginTop: 1 }}>{col.subLabel}</span>}
                      {col.miniLabel && <span style={{ fontSize: 9, fontWeight: 500, color: C.amber, marginTop: 4 }}>{col.miniLabel}</span>}
                      {showDot && ym && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isConfirmed) {
                                    // Unconfirm immediately — no attestation needed.
                                    toggleMonthMut.mutate({ year: ym.year, month: ym.month, confirmed: false });
                                  } else {
                                    // Open attestation dialog before confirming.
                                    setConfirmDialog({ year: ym.year, month: ym.month });
                                  }
                                }}
                                data-testid={`button-confirm-${ym.year}-${ym.month}`}
                                style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  backgroundColor: dotColor, marginTop: 6, cursor: 'pointer',
                                  border: 'none', padding: 0,
                                }}
                                aria-label={dotTooltip}
                              />
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{dotTooltip}</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  );
                }
                // Accent + accentPct columns (T12 / FYTD / Avg / pct cells)
                const isAccent = col.variant === "accent";
                const isAccentPct = col.variant === "accentPct";
                const isWip = colIsWip(col);
                return (
                  <div key={col.key} style={{
                    width: col.width, minWidth: col.width,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 8,
                    backgroundColor: C.purpleLight,
                    borderLeft: isAccent ? `4px solid ${C.purple}` : undefined,
                    position: isWip ? 'relative' : undefined,
                  }}>
                    {isWip && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: C.amber }} />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.purple, marginTop: isWip ? 12 : 8 }}>{col.shortLabel}</span>
                    {col.subLabel && <span style={{ fontSize: 10, color: C.purple, opacity: 0.7, marginTop: 1 }}>{col.subLabel}</span>}
                    {col.miniLabel && <span style={{ fontSize: 10, color: C.purple, opacity: 0.7 }}>{col.miniLabel}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Income section ───────────────────────────────────────────── */}
          {(() => {
            const bg = C.sectionHdr;
            return (
              <div className="hover-elevate cursor-pointer"
                style={{ display: 'flex', backgroundColor: bg, minHeight: 36, borderBottom: `1px solid ${C.border}` }}
                onClick={() => setOpenIncome(v => !v)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenIncome(v => !v); } }}
                data-testid="toggle-income-section"
              >
                {labelCell(
                  <>
                    {openIncome ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <TrendingUp className="w-3 h-3" style={{ color: C.purple }} />
                    <span style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Income</span>
                  </>,
                  { bg, fontWeight: 700, color: C.purple }
                )}
                {renderRow(incomeForMonth, { color: C.greenNum, fontWeight: 600, pctOverride: accentIncome > 0 ? 100 : null, skipColPct: true })}
              </div>
            );
          })()}

          {openIncome && incomeBreakdownNames.map(name => {
            const bg = nextZebra();
            const getVal = (year: number, month: number) => {
              const a = data.incomeActuals.find(x => x.year === year && x.month === month);
              return a?.breakdown?.[name] || 0;
            };
            return (
              <div key={`inc-${name}`} style={{ display: 'flex', backgroundColor: bg, minHeight: 28, borderBottom: `1px solid ${C.border}80` }}>
                {labelCell(
                  <span style={{ paddingLeft: 16, color: C.textMid, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>,
                  { bg, fontWeight: 400 }
                )}
                {renderRow(getVal, { color: C.greenNum })}
              </div>
            );
          })}

          {/* ─── Direct Costs section ─────────────────────────────────────── */}
          {(() => {
            const bg = C.sectionHdr;
            return (
              <div className="hover-elevate cursor-pointer"
                style={{ display: 'flex', backgroundColor: bg, minHeight: 36, borderBottom: `1px solid ${C.border}` }}
                onClick={() => setOpenDC(v => !v)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenDC(v => !v); } }}
                data-testid="toggle-dc-section"
              >
                {labelCell(
                  <>
                    {openDC ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <TrendingDown className="w-3 h-3" style={{ color: C.purple }} />
                    <span style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Direct Costs</span>
                  </>,
                  { bg, fontWeight: 700, color: C.purple }
                )}
                {renderRow(dcForMonth, { color: C.redNum, fontWeight: 600 })}
              </div>
            );
          })()}

          {openDC && dcBreakdownNames.map(name => {
            const bg = nextZebra();
            const getVal = (year: number, month: number) => {
              const a = data.directCostActuals.find(x => x.year === year && x.month === month);
              return a?.breakdown?.[name] || 0;
            };
            return (
              <div key={`dc-${name}`} style={{ display: 'flex', backgroundColor: bg, minHeight: 28, borderBottom: `1px solid ${C.border}80` }}>
                {labelCell(
                  <span style={{ paddingLeft: 16, color: C.textMid, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>,
                  { bg, fontWeight: 400 }
                )}
                {renderRow(getVal, { color: C.redNum })}
              </div>
            );
          })}

          {/* ─── Gross Profit row ─────────────────────────────────────────── */}
          {(() => {
            const bg = C.greenTint;
            const getGP = (y: number, m: number) => incomeForMonth(y, m) - dcForMonth(y, m);
            return (
              <div style={{ display: 'flex', backgroundColor: bg, minHeight: 32, borderBottom: `1px solid ${C.border}80` }}>
                {labelCell(<span>Gross Profit</span>, { bg, fontWeight: 600, color: C.text })}
                {renderRow(getGP, { color: (v: number) => v < 0 ? C.redNum : C.greenNum, fontWeight: 600 })}
              </div>
            );
          })()}

          {/* ─── Overheads section header ─────────────────────────────────── */}
          {(() => {
            const bg = C.sectionHdr;
            return (
              <div className="hover-elevate cursor-pointer"
                style={{ display: 'flex', backgroundColor: bg, minHeight: 36, borderBottom: `1px solid ${C.border}` }}
                onClick={() => setOpenOH(v => !v)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenOH(v => !v); } }}
                data-testid="toggle-oh-section"
              >
                {labelCell(
                  <>
                    {openOH ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Overheads</span>
                  </>,
                  { bg, fontWeight: 700, color: C.purple }
                )}
                {renderRow(ohForMonth, { color: C.redNum, fontWeight: 600 })}
              </div>
            );
          })()}

          {/* Flat overhead item rows (no group label rows, no per-group subtotals) */}
          {openOH && (() => {
            const allItems = visibleGroups.flatMap(g => g.items);
            const filteredItems = hideZeroItems
              ? allItems.filter(item =>
                  monthsInView.some(({ year, month }) => (actualMap.get(getKey(item.id, year, month)) || 0) !== 0)
                )
              : allItems;
            return filteredItems.map(item => {
              const bg = nextZebra();
              const itemBudgetMonthly = toMonthlyCents(item);
              const getVal = (year: number, month: number) => actualMap.get(getKey(item.id, year, month)) || 0;
              // Per-cell colour override only fires for single-month columns
              // (drift indicator only applies to monthly granularity).
              const colorAt = (year: number, month: number, v: number): string | undefined => {
                if (v === 0) return undefined;
                if (driftMap.has(getKey(item.id, year, month))) return C.coral;
                return undefined;
              };
              return (
                <div key={item.id} style={{ display: 'flex', backgroundColor: bg, minHeight: 30, borderBottom: `1px solid ${C.border}80` }}>
                  {labelCell(
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>,
                    { bg, fontWeight: 400, pl: 16 }
                  )}
                  {renderRow(getVal, { color: C.redNum, colorAt })}
                </div>
              );
            });
          })()}

          {/* Net Profit row */}
          {(() => {
            const bg = C.greenTint;
            const getNP = (y: number, m: number) => incomeForMonth(y, m) - dcForMonth(y, m) - ohForMonth(y, m);
            return (
              <div style={{ display: 'flex', backgroundColor: bg, minHeight: 38, borderTop: `2px solid ${C.border}` }}>
                {labelCell(<span>Net Profit</span>, { bg, fontWeight: 600, color: C.text })}
                {renderRow(getNP, { color: (v: number) => v < 0 ? C.redNum : C.greenNum, fontWeight: 600 })}
              </div>
            );
          })()}
        </div>

        {/* Legend */}
        <div className="flex items-center flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-t border-border/50 bg-card">
          {[
            { color: C.dotGreen, label: 'Month confirmed' },
            { color: C.dotCoral, label: 'Cost drifted from Xero — review needed' },
            { color: C.dotGray,  label: 'Awaiting confirmation' },
            { color: C.amber,    label: 'Current month (in progress)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Month-confirmation attestation dialog (#226).
          Only shown for unconfirmed → confirmed transitions; unconfirming
          fires the mutation directly without prompting. */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm month?</AlertDialogTitle>
            <AlertDialogDescription>
              I have reviewed this month&rsquo;s costings in Xero and can confirm that these costings are correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmDialog && (
            <div className="text-sm font-medium text-foreground" data-testid="text-confirm-dialog-month">
              {MONTH_NAMES[confirmDialog.month - 1]} {confirmDialog.year}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-dialog-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-dialog-confirm"
              onClick={() => {
                if (confirmDialog) {
                  toggleMonthMut.mutate({ year: confirmDialog.year, month: confirmDialog.month, confirmed: true });
                }
                setConfirmDialog(null);
              }}
            >
              Confirm month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 3: Forecast (12 actuals + 12 forecast, growth trend) ─────────────────

function ForecastTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [autoGrowth, setAutoGrowth] = useState(true);
  const [manualRate, setManualRate] = useState("0");

  const last12 = useMemo(() => rollingLast12(), []);
  const prev12 = useMemo(() => rollingPrev12(), []);
  const next12 = useMemo(() => rollingNext12(), []);

  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);

  const forecastQuery = useQuery<OverheadForecastOverride[]>({ queryKey: ["/api/overheads/forecast"] });
  const overrideMap = useMemo(() => buildOverrideMap(forecastQuery.data || []), [forecastQuery.data]);

  const upsertForecastMut = useMutation({
    mutationFn: (p: { itemId: string; year: number; month: number; forecastCents: number }) => apiRequest("/api/overheads/forecast", "PUT", p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads/forecast"] }),
    onError: () => toast({ title: "Failed to save forecast override", variant: "destructive" }),
  });

  // Compute per-category YoY growth rates from last12 vs prev12 actuals
  const categoryGrowthRates = useMemo(() => {
    const rates = new Map<string, number>();
    for (const cat of data.categories) {
      const catItems = data.items.filter(i => i.categoryId === cat.id);
      const last12Total = last12.reduce((s, { year, month }) => s + catItems.reduce((si, item) => si + (actualMap.get(getKey(item.id, year, month)) || 0), 0), 0);
      const prev12Total = prev12.reduce((s, { year, month }) => s + catItems.reduce((si, item) => si + (actualMap.get(getKey(item.id, year, month)) || 0), 0), 0);
      const rate = prev12Total > 0 ? (last12Total - prev12Total) / prev12Total : 0;
      rates.set(cat.id, rate);
    }
    return rates;
  }, [data.categories, data.items, last12, prev12, actualMap]);

  const manualGrowth = parseFloat(manualRate) / 100;

  const getForecastCents = (item: OverheadItem, year: number, month: number, futureIndex: number): number => {
    const key = getKey(item.id, year, month);
    if (overrideMap.has(key)) return overrideMap.get(key)!;
    const base = toMonthlyCents(item);
    const growth = autoGrowth ? (categoryGrowthRates.get(item.categoryId) || 0) : manualGrowth;
    const yearsAhead = Math.floor(futureIndex / 12) + (growth !== 0 ? 1 : 0);
    return Math.round(base * Math.pow(1 + growth, yearsAhead));
  };

  const totalMonthlyBudget = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const annualForecast = useMemo(() => next12.reduce((s, { year, month }, idx) =>
    s + data.items.reduce((si, item) => si + getForecastCents(item, year, month, idx), 0), 0),
    [next12, data.items, overrideMap, autoGrowth, manualGrowth, categoryGrowthRates]);

  const last12ActualTotals = useMemo(() => last12.map(({ year, month }) =>
    data.items.reduce((s, item) => s + (actualMap.get(getKey(item.id, year, month)) || 0), 0)),
    [last12, data.items, actualMap]);
  const avgActual = useMemo(() => { const nz = last12ActualTotals.filter(v => v > 0); return nz.length ? nz.reduce((a, b) => a + b, 0) / nz.length : 0; }, [last12ActualTotals]);

  if (!data.categories.length) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Add categories in the Register tab first.</CardContent></Card>;

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Monthly Budget", value: fmtDollars(totalMonthlyBudget), sub: "Per register" },
          { label: "Avg Monthly (actual)", value: avgActual > 0 ? fmtDollars(avgActual) : "—", sub: "Last 12 months" },
          { label: "Annual Budget", value: fmtDollars(totalMonthlyBudget * 12), sub: "Budget × 12" },
          { label: "12-Month Forecast", value: fmtDollars(annualForecast), sub: autoGrowth ? "Auto YoY from actuals" : manualGrowth !== 0 ? `Manual: ${manualRate}% p.a.` : "Budget + overrides", highlight: annualForecast > totalMonthlyBudget * 12 * 1.05 },
        ].map(k => (
          <Card key={k.label}><CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-0.5 ${k.highlight ? "text-destructive" : ""}`}>{k.value}</p>
            <p className="text-data text-muted-foreground mt-0.5">{k.sub}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Growth mode toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoGrowth(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {autoGrowth ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
            <span className={autoGrowth ? "text-foreground font-medium" : ""}>Auto YoY growth (from actuals)</span>
          </button>
        </div>
        {!autoGrowth && (
          <div className="flex items-center gap-1.5">
            <Input type="number" value={manualRate} onChange={e => setManualRate(e.target.value)} className="h-7 w-20 text-xs text-right" step="0.5" />
            <span className="text-xs text-muted-foreground">% p.a. (global)</span>
          </div>
        )}
        {autoGrowth && data.categories.map(cat => {
          const rate = categoryGrowthRates.get(cat.id) || 0;
          return (
            <div key={cat.id} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{cat.name}:</span>
              <Badge variant="secondary" className={`text-data no-default-active-elevate ${rate > 0 ? "text-destructive" : rate < 0 ? "text-status-success dark:text-green-400" : ""}`}>
                {rate > 0 ? "+" : ""}{(rate * 100).toFixed(1)}% YoY
              </Badge>
            </div>
          );
        })}
      </div>

      {/* 12 + 12 grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 1100 }}>
          {/* Column headers */}
          <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
            <div className="w-44 flex-shrink-0 px-3 py-2 text-data uppercase tracking-wide text-muted-foreground">Item</div>
            {last12.map(({ year, month }) => (
              <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-data text-muted-foreground/60">{MONTH_NAMES[month - 1]}</p>
                <p className="text-label text-muted-foreground/40">{year}</p>
              </div>
            ))}
            <div className="w-px bg-primary/40 self-stretch mx-0.5" />
            {next12.map(({ year, month }) => (
              <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-data text-primary font-medium">{MONTH_NAMES[month - 1]}</p>
                <p className="text-label text-muted-foreground/40">{year}</p>
              </div>
            ))}
          </div>
          <div className="flex border-b border-border/30 bg-muted/10">
            <div className="w-44 flex-shrink-0" />
            <div className="flex-1 text-center text-label uppercase tracking-wide text-muted-foreground/50 py-0.5">← Actuals (last 12 months, readonly)</div>
            <div className="w-px bg-primary/40" />
            <div className="flex-1 text-center text-label uppercase tracking-wide text-primary/60 py-0.5">Forecast — next 12 months (click to override) →</div>
          </div>

          {data.categories.map(cat => {
            const catItems = data.items.filter(i => i.categoryId === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1 text-data font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</div>
                  {last12.map(({ year, month }) => <div key={`a-${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                  <div className="w-px bg-primary/40 self-stretch" />
                  {next12.map(({ year, month }) => <div key={`f-${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                </div>

                {catItems.map(item => (
                  <div key={item.id} className="flex items-center border-b border-border/30 hover-elevate" style={{ height: 32 }}>
                    <div className="w-44 flex-shrink-0 px-3 text-xs truncate">{item.name}</div>
                    {last12.map(({ year, month }) => {
                      const cents = actualMap.get(getKey(item.id, year, month)) || 0;
                      return (
                        <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-right text-xs px-0.5 tabular-nums text-muted-foreground">
                          {cents > 0 ? fmtK(cents) : <span className="opacity-20">—</span>}
                        </div>
                      );
                    })}
                    <div className="w-px bg-primary/30 self-stretch" />
                    {next12.map(({ year, month }, idx) => {
                      const projected = getForecastCents(item, year, month, idx);
                      const isOverridden = overrideMap.has(getKey(item.id, year, month));
                      return (
                        <div key={`f-${year}-${month}`} className={`flex-1 min-w-0 h-full flex items-center ${isOverridden ? "bg-primary/5" : ""}`}>
                          <ActualCell cents={projected} onSave={val => upsertForecastMut.mutate({ itemId: item.id, year, month, forecastCents: val })} />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Category subtotals */}
                <div className="flex items-center border-b border-border/30 bg-muted/10" style={{ height: 26 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-data text-muted-foreground">Subtotal</div>
                  {last12.map(({ year, month }) => { const t = catItems.reduce((s, i) => s + (actualMap.get(getKey(i.id, year, month)) || 0), 0); return <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-right text-data px-0.5 tabular-nums text-muted-foreground">{t > 0 ? fmtK(t) : "—"}</div>; })}
                  <div className="w-px bg-primary/30 self-stretch" />
                  {next12.map(({ year, month }, idx) => { const t = catItems.reduce((s, i) => s + getForecastCents(i, year, month, idx), 0); return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-data px-0.5 tabular-nums text-primary/70">{fmtK(t)}</div>; })}
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex items-center border-t-2 border-border bg-muted/30 rounded-b-md font-semibold" style={{ height: 36 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs">Total</div>
            {last12ActualTotals.map((t, idx) => (
              <div key={idx} className={`flex-1 min-w-0 text-right text-xs px-0.5 tabular-nums ${t > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>{t > 0 ? fmtK(t) : "—"}</div>
            ))}
            <div className="w-px bg-primary/40 self-stretch" />
            {next12.map(({ year, month }, idx) => {
              const t = data.items.reduce((s, item) => s + getForecastCents(item, year, month, idx), 0);
              return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-xs px-0.5 tabular-nums text-primary">{fmtK(t)}</div>;
            })}
          </div>
        </div>
      </div>

      <p className="text-data text-muted-foreground">Purple columns = forecast. Click any to override the projected value. Auto YoY growth computes per-category growth from last 12 months vs previous 12 months of actuals.</p>
    </div>
  );
}

// ─── Tab 4: OH Recovery Predictor ────────────────────────────────────────────

interface PipelineJobForm { name: string; estimatedValue: string; probabilityPercent: string; expectedStartDate: string; notes: string; }

function OhRecoveryTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [targetOhPct, setTargetOhPct] = useState<string>(data.settings?.targetOhPercent || "15");
  const [editingTarget, setEditingTarget] = useState(false);
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editJob, setEditJob] = useState<OhPipelineJob | null>(null);
  const [jobForm, setJobForm] = useState<PipelineJobForm>({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" });

  const pipelineQuery = useQuery<OhPipelineJob[]>({ queryKey: ["/api/overheads/pipeline"] });
  const contractedQuery = useQuery<ContractedProject[]>({ queryKey: ["/api/overheads/predictor/contracted"] });

  const updateSettingsMut = useMutation({
    mutationFn: (v: string) => apiRequest("/api/overheads/settings", "PUT", { targetOhPercent: v }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); setEditingTarget(false); toast({ title: "OH target saved" }); },
  });
  const addJobMut = useMutation({
    mutationFn: (f: PipelineJobForm) => apiRequest("/api/overheads/pipeline", "POST", { name: f.name, estimatedValue: Math.round(parseFloat(f.estimatedValue || "0") * 100) || 0, probabilityPercent: parseInt(f.probabilityPercent) || 100, expectedStartDate: f.expectedStartDate || null, notes: f.notes || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }); setJobDialogOpen(false); },
    onError: () => toast({ title: "Failed to add job", variant: "destructive" }),
  });
  const updateJobMut = useMutation({
    mutationFn: ({ id, f }: { id: string; f: PipelineJobForm }) => apiRequest(`/api/overheads/pipeline/${id}`, "PATCH", { name: f.name, estimatedValue: Math.round(parseFloat(f.estimatedValue || "0") * 100) || 0, probabilityPercent: parseInt(f.probabilityPercent) || 100, expectedStartDate: f.expectedStartDate || null, notes: f.notes || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }); setEditJob(null); },
    onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
  });
  const deleteJobMut = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/pipeline/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }),
    onError: () => toast({ title: "Failed to delete job", variant: "destructive" }),
  });

  const monthlyOh = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const annualOh = monthlyOh * 12;
  const ohPct = parseFloat(targetOhPct) || 15;

  const jobs = pipelineQuery.data || [];
  const contractedProjects = contractedQuery.data || [];

  // Remaining contracted revenue = backend-computed remaining (full price for pre-construction, price×(1-pct) for construction)
  const totalContractedCents = useMemo(() =>
    contractedProjects.reduce((s, p) => s + p.remainingCents, 0),
    [contractedProjects]);
  const weightedPipelineCents = useMemo(() =>
    jobs.reduce((s, j) => s + Math.round(j.estimatedValue * j.probabilityPercent / 100), 0),
    [jobs]);
  const totalProjectedCents = totalContractedCents + weightedPipelineCents;
  const recoveredOhCents = Math.round(totalProjectedCents * ohPct / 100);
  const breakevenCents = ohPct > 0 ? Math.round(annualOh / (ohPct / 100)) : 0;
  const shortfallCents = annualOh - recoveredOhCents;
  const isCovered = shortfallCents <= 0;
  const coveragePct = breakevenCents > 0 ? (totalProjectedCents / breakevenCents) * 100 : 0;

  // Traffic light: green ≥ 100%, amber 90–100%, red < 90%
  const isAmber = !isCovered && coveragePct >= 90;
  const trafficColor = isCovered ? "text-status-success dark:text-green-400" : isAmber ? "text-status-warning dark:text-yellow-400" : "text-destructive";
  const TrafficIcon = isCovered ? CheckCircle2 : AlertTriangle;

  // Gap callout: additional revenue needed at current OH% to close the shortfall
  const revenueGapCents = shortfallCents > 0 && ohPct > 0 ? Math.round(shortfallCents / (ohPct / 100)) : 0;

  const openAddJob = () => { setJobForm({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" }); setJobDialogOpen(true); };

  return (
    <div className="flex flex-col gap-4">
      {/* Target settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">OH Recovery Target</CardTitle>
              {editingTarget ? (
                <div className="flex items-center gap-1">
                  <Input autoFocus type="number" value={targetOhPct} onChange={e => setTargetOhPct(e.target.value)} className="h-7 w-20 text-xs text-right" />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button size="icon" variant="ghost" onClick={() => updateSettingsMut.mutate(targetOhPct)}><Check className="w-3 h-3 text-status-success dark:text-green-400" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditingTarget(false); setTargetOhPct(data.settings?.targetOhPercent || "15"); }}><X className="w-3 h-3 text-muted-foreground" /></Button>
                </div>
              ) : (
                <button onClick={() => setEditingTarget(true)} className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group/t">
                  {ohPct}% OH margin<Pencil className="w-2.5 h-2.5 opacity-0 group-hover/t:opacity-60 transition-opacity" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Annual OH Budget</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(annualOh)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Breakeven Revenue</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(breakevenCents)}</p>
                <p className="text-data text-muted-foreground">To fully recover OH at {ohPct}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrafficIcon className={`w-4 h-4 ${trafficColor}`} />
              <CardTitle className="text-sm font-semibold">Coverage Status</CardTitle>
              <Badge className={`text-data no-default-active-elevate ${isCovered ? "bg-status-success-bg text-status-success dark:text-green-400" : isAmber ? "bg-status-warning-bg text-status-warning dark:text-yellow-400" : "bg-destructive/10 text-destructive"}`}>
                {isCovered ? "Fully Covered" : isAmber ? "Close to Target" : "Under-Recovered"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Projected Revenue</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(totalProjectedCents)}</p>
                <p className="text-data text-muted-foreground">Contracted + Weighted Pipeline</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">OH Recovered @ {ohPct}%</p>
                <p className={`text-xl font-bold tabular-nums ${trafficColor}`}>{fmtDollars(recoveredOhCents)}</p>
                <p className={`text-data font-medium ${trafficColor}`}>
                  {isCovered ? `${fmtDollars(-shortfallCents)} surplus` : `${fmtDollars(shortfallCents)} shortfall`}
                </p>
              </div>
            </div>
            <div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isCovered ? "bg-status-success" : isAmber ? "bg-status-warning" : "bg-destructive"}`} style={{ width: `${Math.min(coveragePct, 100)}%` }} />
              </div>
              <p className="text-data text-muted-foreground mt-1">{coveragePct.toFixed(0)}% of breakeven revenue ({fmtDollars(breakevenCents)})</p>
            </div>
            {!isCovered && revenueGapCents > 0 && (
              <div className={`text-xs font-medium rounded-md px-3 py-2 ${isAmber ? "bg-status-warning-bg text-yellow-800 dark:text-yellow-300" : "bg-destructive/10 text-destructive"}`}>
                Need {fmtDollars(revenueGapCents)} more in contracted/pipeline revenue to close the gap at {ohPct}% OH.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contracted projects */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Contracted Projects</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {contractedQuery.isLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : contractedProjects.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground italic">No active (construction / pre-construction) projects with a locked contract price.</p>
            ) : (
              <div>
                <div className="grid px-4 py-1.5 text-data uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 90px 95px 95px" }}>
                  <span>Project</span><span>Status</span><span className="text-right">Contract</span><span className="text-right">Remaining</span>
                </div>
                {contractedProjects.map(p => (
                  <div key={p.id} className="grid items-center px-4 py-1.5 border-b border-border/30 hover-elevate" style={{ gridTemplateColumns: "1fr 90px 95px 95px" }}>
                    <div>
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      {p.projectStatus === "construction" && (p.percentComplete || 0) > 0 && (
                        <p className="text-data text-muted-foreground">{p.percentComplete}% complete</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-data no-default-active-elevate capitalize w-fit">{p.projectStatus}</Badge>
                    <span className="text-xs text-right tabular-nums text-muted-foreground">
                      {p.lockedContractPrice ? fmtDollars(p.lockedContractPrice) : <span className="opacity-40">—</span>}
                    </span>
                    <span className="text-xs text-right tabular-nums font-medium">{fmtDollars(p.remainingCents)}</span>
                  </div>
                ))}
                <div className="grid items-center px-4 py-2 border-t-2 border-border bg-muted/20 font-semibold" style={{ gridTemplateColumns: "1fr 90px 95px 95px" }}>
                  <span className="text-xs">Total Remaining</span><span /><span />
                  <span className="text-xs text-right tabular-nums">{fmtDollars(totalContractedCents)}</span>
                </div>
                <p className="px-4 py-2 text-data text-muted-foreground/60 italic">
                  Remaining = contract × (1 − % complete). Update % complete on each project to refine this figure.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline jobs */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Pipeline Jobs</CardTitle>
              </div>
              <Button size="sm" onClick={openAddJob}><Plus className="w-3.5 h-3.5 mr-1" />Add Job</Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {pipelineQuery.isLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : jobs.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground italic">No pipeline jobs yet. Add prospective work to model OH recovery.</p>
            ) : (
              <div>
                <div className="grid px-4 py-1.5 text-data uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 90px 55px 85px 28px" }}>
                  <span>Job</span><span className="text-right">Value</span><span className="text-right">Win%</span><span className="text-right">Weighted</span><span />
                </div>
                {jobs.map(job => (
                  <div key={job.id} className="grid items-center px-4 py-2 border-b border-border/30 hover-elevate group" style={{ gridTemplateColumns: "1fr 90px 55px 85px 28px" }}>
                    <div>
                      <p className="text-xs font-medium truncate">{job.name}</p>
                      {job.expectedStartDate && <p className="text-data text-muted-foreground">Start: {new Date(job.expectedStartDate).toLocaleDateString("en-AU")}</p>}
                    </div>
                    <span className="text-xs text-right tabular-nums">{fmtDollars(job.estimatedValue)}</span>
                    <span className="text-xs text-right tabular-nums">{job.probabilityPercent}%</span>
                    <span className="text-xs text-right tabular-nums font-medium">{fmtDollars(Math.round(job.estimatedValue * job.probabilityPercent / 100))}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-3 h-3" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditJob(job); setJobForm({ name: job.name, estimatedValue: (job.estimatedValue / 100).toFixed(0), probabilityPercent: String(job.probabilityPercent), expectedStartDate: job.expectedStartDate || "", notes: job.notes || "" }); }}>
                          <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Delete this job?")) deleteJobMut.mutate(job.id); }}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                <div className="grid items-center px-4 py-2 border-t-2 border-border bg-muted/20 font-semibold" style={{ gridTemplateColumns: "1fr 90px 55px 85px 28px" }}>
                  <span className="text-xs">Weighted Total</span>
                  <span className="text-xs text-right tabular-nums">{fmtDollars(jobs.reduce((s, j) => s + j.estimatedValue, 0))}</span>
                  <span /><span className="text-xs text-right tabular-nums">{fmtDollars(weightedPipelineCents)}</span><span />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Combined summary */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">Contracted</p><p className="text-lg font-bold tabular-nums">{fmtDollars(totalContractedCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Weighted Pipeline</p><p className="text-lg font-bold tabular-nums">{fmtDollars(weightedPipelineCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Projected</p><p className="text-lg font-bold tabular-nums">{fmtDollars(totalProjectedCents)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">OH Recovery @ {ohPct}%</p>
              <p className={`text-lg font-bold tabular-nums ${trafficColor}`}>{fmtDollars(recoveredOhCents)}</p>
              <p className={`text-data font-medium ${trafficColor}`}>{isCovered ? `${fmtDollars(-shortfallCents)} surplus` : `${fmtDollars(shortfallCents)} shortfall`}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job dialog */}
      <Dialog open={jobDialogOpen || !!editJob} onOpenChange={v => { if (!v) { setJobDialogOpen(false); setEditJob(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editJob ? "Edit Pipeline Job" : "Add Pipeline Job"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Job Name</Label>
              <Input autoFocus value={jobForm.name} onChange={e => setJobForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Smith Residence" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contract Value ($)</Label>
              <Input type="number" value={jobForm.estimatedValue} onChange={e => setJobForm(f => ({ ...f, estimatedValue: e.target.value }))} placeholder="0" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Win Probability (%)</Label>
              <Input type="number" min={0} max={100} value={jobForm.probabilityPercent} onChange={e => setJobForm(f => ({ ...f, probabilityPercent: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Expected Start</Label>
              <Input type="date" value={jobForm.expectedStartDate} onChange={e => setJobForm(f => ({ ...f, expectedStartDate: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setJobDialogOpen(false); setEditJob(null); }}>Cancel</Button>
            <Button disabled={!jobForm.name.trim()} onClick={() => editJob ? updateJobMut.mutate({ id: editJob.id, f: jobForm }) : addJobMut.mutate(jobForm)}>
              {editJob ? "Save Changes" : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; Icon: (p: { className?: string }) => JSX.Element }> = [
  { id: "register",  label: "Register",        Icon: ({ className }) => <Package className={className} /> },
  { id: "actuals",   label: "Monthly Actuals", Icon: ({ className }) => <Activity className={className} /> },
  { id: "forecast",  label: "Forecast",        Icon: ({ className }) => <TrendingUp className={className} /> },
  { id: "predictor", label: "OH Predictor",    Icon: ({ className }) => <Target className={className} /> },
];

export default function BusinessOverheads() {
  const [activeTab, setActiveTab] = useState<TabId>("register");

  const { data, isLoading, error } = useQuery<OverheadsData>({ queryKey: ["/api/overheads"] });
  const { data: xeroStatus } = useQuery<{ connected: boolean }>({ queryKey: ["/api/xero/status"] });
  const xeroConnected = xeroStatus?.connected ?? false;

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error || !data) return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Failed to load overhead data.</div>;

  return (
    <div className="flex flex-col gap-4 p-4 min-h-full bg-background">
      {/* Floating parent tabs — sit on the page background, single divider beneath */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              data-testid={`tab-${id}`}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-xs transition-colors flex-shrink-0 cursor-pointer bg-transparent border-0 ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {isActive && (
                <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "register"  && <RegisterTab data={data} xeroConnected={xeroConnected} />}
      {activeTab === "actuals"   && <MonthlyActualsTab data={data} />}
      {activeTab === "forecast"  && <ForecastTab data={data} />}
      {activeTab === "predictor" && <OhRecoveryTab data={data} />}
    </div>
  );
}
