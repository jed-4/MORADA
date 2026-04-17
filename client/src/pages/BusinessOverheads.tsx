import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  ArrowUpRight,
  ArrowDownRight,
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
interface CompanyDirectCostActual { id: string; companyId: string; year: number; month: number; directCostCents: number; xeroImported: boolean; }

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

// Rolling 12-month window ending at the most recently elapsed month
function rollingLast12(): Array<{ year: number; month: number }> {
  const today = new Date();
  const months: Array<{ year: number; month: number }> = [];
  let y = today.getFullYear(); let m = today.getMonth(); // 0-based; last complete month
  if (m === 0) { m = 12; y--; } // wrap
  for (let i = 0; i < 12; i++) {
    months.unshift({ year: y, month: m });
    m--; if (m === 0) { m = 12; y--; }
  }
  return months;
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

// ─── Shared editable cells ───────────────────────────────────────────────────

function ActualCell({ cents, highlight = false }: { cents: number; highlight?: boolean }) {
  return (
    <div className={`w-full h-full text-right text-xs tabular-nums px-1 flex items-center justify-end ${highlight ? "text-destructive" : cents > 0 ? "" : "text-muted-foreground/30"}`}>
      {cents > 0 ? fmtK(cents) : "—"}
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
            <Label className="text-xs text-muted-foreground">Item Name{xeroSynced && <span className="ml-1 text-[10px] text-[#00B9D7]">(managed by Xero)</span>}</Label>
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
            <Label className="text-xs text-muted-foreground">Xero Account Code{xeroSynced && <span className="ml-1 text-[10px] text-[#00B9D7]">(managed by Xero)</span>}</Label>
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

function RegisterTab({ data, xeroConnected }: { data: OverheadsData; xeroConnected: boolean }) {
  const { toast } = useToast();
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<OverheadItem | null>(null);
  const [preselectedCatId, setPreselectedCatId] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [activeCell, setActiveCell] = useState<CellId | null>(null);

  const STORED_COLS_KEY = "overheads-register-col-visibility";
  const DEFAULT_COLS = { freq: true, budget: true, xeroCode: true, xeroGroup: true, buildproGroup: true, monthly: true, annual: true };
  const [colVis, setColVis] = useState<typeof DEFAULT_COLS>(() => {
    try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem(STORED_COLS_KEY) || "{}") }; }
    catch { return DEFAULT_COLS; }
  });
  const toggleCol = (col: keyof typeof DEFAULT_COLS) => setColVis(prev => {
    const next = { ...prev, [col]: !prev[col] };
    localStorage.setItem(STORED_COLS_KEY, JSON.stringify(next));
    return next;
  });

  const createCatMut = useMutation({
    mutationFn: (name: string) => apiRequest("/api/overheads/categories", "POST", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
  });
  const updateCatMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiRequest(`/api/overheads/categories/${id}`, "PATCH", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); setEditingCatId(null); },
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

  const itemsByCategory = useMemo(() => {
    const m = new Map<string, OverheadItem[]>();
    for (const cat of data.categories) m.set(cat.id, data.items.filter(i => i.categoryId === cat.id));
    return m;
  }, [data.categories, data.items]);

  const grandMonthly = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const grandAnnual = useMemo(() => data.items.reduce((s, i) => s + toAnnualCents(i), 0), [data.items]);

  const FREQ_COLORS: Record<Frequency, string> = {
    weekly:    "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    monthly:   "bg-[#A890D4]/10 text-[#8b6db5] dark:text-[#A890D4]",
    quarterly: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    annual:    "bg-green-500/10 text-green-700 dark:text-green-400",
  };

  // col layout: drag|name|freq?|budget?|xeroCode?|xeroGroup?|buildproGroup?|monthly?|annual?|action
  const GRID = [
    "28px", "1fr",
    colVis.freq ? "78px" : null,
    colVis.budget ? "88px" : null,
    colVis.xeroCode ? "80px" : null,
    colVis.xeroGroup ? "80px" : null,
    colVis.buildproGroup ? "110px" : null,
    colVis.monthly ? "95px" : null,
    colVis.annual ? "95px" : null,
    "30px",
  ].filter(Boolean).join(" ");

  const commitField = (itemId: string, field: string, rawVal: string) => {
    setActiveCell(null);
    let val: unknown = rawVal;
    if (field === "budgetCents") val = Math.round(parseFloat(rawVal || "0") * 100) || 0;
    updateItemMut.mutate({ id: itemId, patch: { [field]: val } });
  };
  const isActive = (itemId: string, field: string) => activeCell?.itemId === itemId && activeCell?.field === field;
  const activate = (itemId: string, field: string) => setActiveCell({ itemId, field });

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
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline"><SlidersHorizontal className="w-3.5 h-3.5 mr-1" />Columns</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 pb-1">Toggle columns</p>
              {([
                ["freq", "Frequency"],
                ["budget", "Budget"],
                ["xeroCode", "Xero Code"],
                ["xeroGroup", "Xero Group"],
                ["buildproGroup", "BuildPro Group"],
                ["monthly", "Monthly Equiv."],
                ["annual", "Annual Budget"],
              ] as [keyof typeof DEFAULT_COLS, string][]).map(([key, label]) => (
                <button key={key} onClick={() => toggleCol(key)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover-elevate text-left">
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${colVis[key] ? "bg-primary border-primary" : "border-border"}`}>
                    {colVis[key] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </span>
                  {label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {xeroConnected && (
            <Button size="sm" variant="outline" onClick={() => syncXeroMut.mutate()} disabled={syncXeroMut.isPending}>
              {syncXeroMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Sync from Xero
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
          <Button size="sm" onClick={() => setAddCatOpen(true)}><FolderPlus className="w-3.5 h-3.5 mr-1" />Add Category</Button>
        </div>
      </div>

      {data.categories.length === 0 && (
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
      )}

      {data.categories.map(cat => {
        const catItems = itemsByCategory.get(cat.id) || [];
        const catMonthly = catItems.reduce((s, i) => s + toMonthlyCents(i), 0);
        const catAnnual = catItems.reduce((s, i) => s + toAnnualCents(i), 0);
        const isCollapsed = collapsed.has(cat.id);

        return (
          <Card key={cat.id}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })} className="text-muted-foreground hover:text-foreground transition-colors">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {editingCatId === cat.id ? (
                    <div className="flex items-center gap-1">
                      <Input autoFocus value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") updateCatMut.mutate({ id: cat.id, name: editingCatName }); if (e.key === "Escape") setEditingCatId(null); }}
                        className="h-6 text-sm py-0 w-48" />
                      <Button size="icon" variant="ghost" onClick={() => updateCatMut.mutate({ id: cat.id, name: editingCatName })}><Check className="w-3 h-3 text-green-500" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingCatId(null)}><X className="w-3 h-3 text-muted-foreground" /></Button>
                    </div>
                  ) : (
                    <CardTitle className="text-sm font-semibold">{cat.name}</CardTitle>
                  )}
                  <Badge variant="secondary" className="text-[10px] no-default-active-elevate">{catItems.length}</Badge>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtDollars(catMonthly)}/mo · {fmtDollars(catAnnual)}/yr</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="w-3.5 h-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setPreselectedCatId(cat.id); setAddItemOpen(true); }}><Plus className="w-3.5 h-3.5 mr-2" />Add item</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}><Pencil className="w-3.5 h-3.5 mr-2" />Rename</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete "${cat.name}" and all its items?`)) deleteCatMut.mutate(cat.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>

            {!isCollapsed && (
              <CardContent className="px-0 pb-0">
                <div className="border-t border-border/50">
                  {/* Column header */}
                  <div className="grid px-4 py-1 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ gridTemplateColumns: GRID }}>
                    <span /><span>Item</span>
                    {colVis.freq && <span className="text-right">Freq.</span>}
                    {colVis.budget && <span className="text-right">Budget</span>}
                    {colVis.xeroCode && <span className="text-right">Xero Code</span>}
                    {colVis.xeroGroup && <span className="text-right">Xero Group</span>}
                    {colVis.buildproGroup && <span>BuildPro Group</span>}
                    {colVis.monthly && <span className="text-right">Monthly Equiv.</span>}
                    {colVis.annual && <span className="text-right">Annual Budget</span>}
                    <span />
                  </div>

                  {catItems.length === 0 ? (
                    <div className="px-4 pb-3 border-t border-border/30 pt-2 text-xs text-muted-foreground/60 italic">
                      No items — <button className="text-primary underline underline-offset-2" onClick={() => { setPreselectedCatId(cat.id); setAddItemOpen(true); }}>add one</button>
                    </div>
                  ) : catItems.map(item => (
                    <div key={item.id} className="grid items-center px-4 border-t border-border/30 hover-elevate group" style={{ gridTemplateColumns: GRID, height: 34 }}>
                      <span />

                      {/* Name inline */}
                      <div className={`h-full flex items-center gap-1.5 ${isActive(item.id, "name") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                        {isActive(item.id, "name") && !item.xeroSynced ? (
                          <input autoFocus defaultValue={item.name} className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1"
                            onBlur={e => commitField(item.id, "name", e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                        ) : (
                          <button onClick={() => !item.xeroSynced && activate(item.id, "name")} className={`flex-1 h-full flex items-center text-xs px-1 border-b border-transparent transition-colors text-left ${item.xeroSynced ? "cursor-default" : "hover:border-primary/30"}`}>{item.name}</button>
                        )}
                        {item.xeroSynced && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#00B9D7]/10 text-[#00B9D7] shrink-0 leading-none">Xero</span>
                        )}
                      </div>

                      {/* Frequency badge */}
                      {colVis.freq && (isActive(item.id, "frequency") ? (
                        <div className="ring-1 ring-inset ring-primary/60 rounded-[2px] h-full flex items-center">
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
                          <button onClick={() => activate(item.id, "frequency")}>
                            <Badge className={`text-[10px] no-default-active-elevate ${FREQ_COLORS[item.frequency]}`}>{item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}</Badge>
                          </button>
                        </div>
                      ))}

                      {/* Budget inline */}
                      {colVis.budget && (
                        <div className={`h-full flex items-center ${isActive(item.id, "budgetCents") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                          {isActive(item.id, "budgetCents") ? (
                            <input autoFocus type="number" defaultValue={item.budgetCents > 0 ? (item.budgetCents / 100).toFixed(0) : ""}
                              className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1 tabular-nums"
                              onBlur={e => commitField(item.id, "budgetCents", e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                          ) : (
                            <button onClick={() => activate(item.id, "budgetCents")} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors tabular-nums">
                              {item.budgetCents > 0
                                ? fmtDollars(item.budgetCents)
                                : item.xeroSynced
                                  ? <span className="text-amber-500 dark:text-amber-400 text-[10px]">Set budget</span>
                                  : <span className="text-muted-foreground/40">—</span>
                              }
                            </button>
                          )}
                        </div>
                      )}

                      {/* Xero code inline — read-only for synced items */}
                      {colVis.xeroCode && (item.xeroSynced ? (
                        <div className="h-full flex items-center justify-end gap-1 px-1">
                          <Lock className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                          <span className="text-xs text-muted-foreground tabular-nums">{item.xeroAccountCode || <span className="opacity-40">—</span>}</span>
                        </div>
                      ) : (
                        <div className={`h-full flex items-center ${isActive(item.id, "xeroAccountCode") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                          {isActive(item.id, "xeroAccountCode") ? (
                            <input autoFocus defaultValue={item.xeroAccountCode || ""}
                              className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1"
                              onBlur={e => commitField(item.id, "xeroAccountCode", e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                          ) : (
                            <button onClick={() => activate(item.id, "xeroAccountCode")} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors text-muted-foreground">
                              {item.xeroAccountCode || <span className="opacity-40">—</span>}
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Xero Group — read-only badge from xeroAccountType */}
                      {colVis.xeroGroup && (
                        <div className="h-full flex items-center justify-end px-1">
                          {item.xeroAccountType ? (
                            <Badge className={`text-[10px] no-default-active-elevate ${
                              item.xeroAccountType === "DIRECTCOSTS" ? "bg-orange-500/10 text-orange-700 dark:text-orange-400" :
                              item.xeroAccountType === "OVERHEADS" ? "bg-[#00B9D7]/10 text-[#00B9D7]" :
                              "bg-muted text-muted-foreground"
                            }`}>{XERO_TYPE_LABELS[item.xeroAccountType] ?? item.xeroAccountType}</Badge>
                          ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                        </div>
                      )}

                      {/* BuildPro Group — editable */}
                      {colVis.buildproGroup && (
                        <div className={`h-full flex items-center ${isActive(item.id, "buildproGroup") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                          {isActive(item.id, "buildproGroup") ? (
                            <input autoFocus defaultValue={item.buildproGroup || ""}
                              className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1 placeholder:text-muted-foreground/30"
                              placeholder="e.g. Admin"
                              onBlur={e => commitField(item.id, "buildproGroup", e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                          ) : (
                            <button onClick={() => activate(item.id, "buildproGroup")} className="w-full h-full text-left text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors">
                              {item.buildproGroup
                                ? <span className="text-foreground">{item.buildproGroup}</span>
                                : <span className="text-muted-foreground/30">—</span>}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Monthly equiv — read-only */}
                      {colVis.monthly && <span className="text-xs text-right tabular-nums px-1">{fmtDollars(toMonthlyCents(item))}</span>}

                      {/* Annual budget — read-only */}
                      {colVis.annual && <span className="text-xs text-right tabular-nums px-1 text-muted-foreground">{fmtDollars(toAnnualCents(item))}</span>}

                      {/* Action */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-3 h-3" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditItem(item)}><Pencil className="w-3.5 h-3.5 mr-2" />Edit in dialog</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMut.mutate(item.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}

                  <button className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground/50 hover:text-muted-foreground border-t border-border/30 transition-colors"
                    onClick={() => { setPreselectedCatId(cat.id); setAddItemOpen(true); }}>
                    <Plus className="w-3 h-3" />Add item to {cat.name}
                  </button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Footer totals */}
      {data.categories.length > 0 && (
        <div className="grid px-4 py-3 rounded-md bg-muted/30 border border-border/50 font-semibold text-sm" style={{ gridTemplateColumns: GRID }}>
          <span /><span>Total</span>
          {colVis.freq && <span />}
          {colVis.budget && <span />}
          {colVis.xeroCode && <span />}
          {colVis.xeroGroup && <span />}
          {colVis.buildproGroup && <span />}
          {colVis.monthly && <span className="text-right tabular-nums">{fmtDollars(grandMonthly)}/mo</span>}
          {colVis.annual && <span className="text-right tabular-nums text-muted-foreground">{fmtDollars(grandAnnual)}/yr</span>}
          <span />
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

type GroupBy = "category" | "xero" | "buildpro";

function MonthlyActualsTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [view, setView] = useState<"monthly" | "prev12">("monthly");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [editingIncome, setEditingIncome] = useState<string | null>(null); // "year__month"
  const [incomeInput, setIncomeInput] = useState("");
  const [editingDirectCost, setEditingDirectCost] = useState<string | null>(null); // "year__month"
  const [directCostInput, setDirectCostInput] = useState("");
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);

  const rolling12 = useMemo(() => rollingLast12(), []);
  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);
  const driftMap = useMemo(() => buildDriftMap(data.actuals), [data.actuals]);
  const statusSet = useMemo(() => buildStatusSet(data.monthStatuses), [data.monthStatuses]);

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

  const syncActualsMut = useMutation({
    mutationFn: () => apiRequest("/api/xero/sync-overhead-actuals", "POST", {}),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      const drifted = res?.drifted || 0;
      toast({ title: drifted > 0 ? `Synced — ${drifted} confirmed month${drifted !== 1 ? "s" : ""} have changed figures` : "Xero actuals synced" });
    },
    onError: () => toast({ title: "Failed to sync Xero actuals", variant: "destructive" }),
  });

  const incomeActualMut = useMutation({
    mutationFn: (p: { year: number; month: number; incomeCents: number }) => apiRequest("/api/overheads/income-actual", "PUT", p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      setEditingIncome(null);
    },
    onError: () => toast({ title: "Failed to save income", variant: "destructive" }),
  });

  const directCostActualMut = useMutation({
    mutationFn: (p: { year: number; month: number; directCostCents: number }) => apiRequest("/api/overheads/direct-cost-actual", "PUT", p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      setEditingDirectCost(null);
    },
    onError: () => toast({ title: "Failed to save direct costs", variant: "destructive" }),
  });

  const monthBudget = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);

  // Grouped rows for both views
  const groupedData = useMemo((): { label: string; items: OverheadItem[] }[] => {
    if (groupBy === "category") {
      return data.categories.map(cat => ({ label: cat.name, items: data.items.filter(i => i.categoryId === cat.id) })).filter(g => g.items.length > 0);
    }
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
  }, [groupBy, data.categories, data.items]);

  if (!data.categories.length) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Add categories and items in the Register tab first.</CardContent></Card>;

  // ─── Prev 12 Summary View ────────────────────────────────────────────────────
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

  if (view === "prev12") {
    const totalIncome12 = rolling12.reduce((s, { year, month }) => s + (incomeMap.get(`${year}__${month}`) || 0), 0);
    const totalDC12 = rolling12.reduce((s, { year, month }) => s + (directCostMap.get(`${year}__${month}`) || 0), 0);
    const totalOH12 = rolling12.reduce((s, { year, month }) => s + data.items.reduce((is, i) => is + (actualMap.get(getKey(i.id, year, month)) || 0), 0), 0);
    const avgIncome = totalIncome12 / 12;
    const avgDC = totalDC12 / 12;
    const avgOH = totalOH12 / 12;
    const grossProfit12 = totalIncome12 - totalDC12;
    const avgGrossProfit = grossProfit12 / 12;
    const netProfit12 = grossProfit12 - totalOH12;
    const avgNetProfit = netProfit12 / 12;
    const dcPct = totalIncome12 > 0 ? (totalDC12 / totalIncome12) * 100 : 0;
    const ohPct = totalIncome12 > 0 ? (totalOH12 / totalIncome12) * 100 : 0;
    const gpPct = totalIncome12 > 0 ? (grossProfit12 / totalIncome12) * 100 : 0;

    // MoM: compare last month vs month before
    const lastM = rolling12[rolling12.length - 1];
    const prevM = rolling12[rolling12.length - 2];
    const lastIncome = lastM ? (incomeMap.get(`${lastM.year}__${lastM.month}`) || 0) : 0;
    const prevIncome = prevM ? (incomeMap.get(`${prevM.year}__${prevM.month}`) || 0) : 0;
    const lastDC = lastM ? (directCostMap.get(`${lastM.year}__${lastM.month}`) || 0) : 0;
    const prevDC = prevM ? (directCostMap.get(`${prevM.year}__${prevM.month}`) || 0) : 0;
    const lastOH = lastM ? data.items.reduce((s, i) => s + (actualMap.get(getKey(i.id, lastM.year, lastM.month)) || 0), 0) : 0;
    const prevOH = prevM ? data.items.reduce((s, i) => s + (actualMap.get(getKey(i.id, prevM.year, prevM.month)) || 0), 0) : 0;

    function MoMArrow({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
      if (!prev) return <span className="text-muted-foreground/30 text-[10px]">—</span>;
      const diff = cur - prev;
      const pct = Math.abs((diff / prev) * 100).toFixed(0);
      const up = diff > 0;
      const good = invert ? !up : up;
      return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${good ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {pct}%
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">Previous 12 months — totals, averages, and OH% of income</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
              {(["category", "xero", "buildpro"] as GroupBy[]).map((g, i) => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={`px-2.5 py-1 transition-colors ${groupBy === g ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover-elevate"} ${i > 0 ? "border-l border-border" : ""}`}>
                  {g === "category" ? "By Category" : g === "xero" ? "Xero Group" : "BuildPro Group"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setView("monthly")}>Monthly Grid</Button>
            <Button size="sm" variant="outline" onClick={() => syncActualsMut.mutate()} disabled={syncActualsMut.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncActualsMut.isPending ? "animate-spin" : ""}`} />
              {syncActualsMut.isPending ? "Syncing…" : "Sync from Xero"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: 560 }}>
            {/* Header */}
            <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
              <div className="flex-1 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Item</div>
              <div className="w-28 flex-shrink-0 text-right px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Total (12m)</div>
              <div className="w-28 flex-shrink-0 text-right px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Avg / Month</div>
              <div className="w-24 flex-shrink-0 text-right px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">% of Income</div>
              <div className="w-20 flex-shrink-0 text-right px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">MoM</div>
            </div>

            {/* Income row */}
            <div className="border-b border-border/40 bg-green-500/5">
              <div className="flex items-center" style={{ height: 36 }}>
                <div className="flex-1 px-3 text-xs font-semibold flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  Income
                  {incomeBreakdown12.length > 0 && (
                    <button
                      onClick={() => setShowIncomeBreakdown(v => !v)}
                      className="ml-1 p-0.5 rounded hover-elevate text-muted-foreground/60"
                      title="Show income breakdown"
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${showIncomeBreakdown ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
                <div className="w-28 flex-shrink-0 text-right px-3 text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">{totalIncome12 > 0 ? fmtK(totalIncome12) : "—"}</div>
                <div className="w-28 flex-shrink-0 text-right px-3 text-xs text-green-600/80 dark:text-green-400/80 tabular-nums">{avgIncome > 0 ? fmtK(avgIncome) : "—"}</div>
                <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground">100%</div>
                <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastIncome} prev={prevIncome} /></div>
              </div>
              {/* Income breakdown sub-rows */}
              {showIncomeBreakdown && incomeBreakdown12.length > 0 && (
                <div className="border-t border-green-200/40 dark:border-green-800/30">
                  {incomeBreakdown12.map(([name, cents]) => (
                    <div key={name} className="flex items-center" style={{ height: 28 }}>
                      <div className="flex-1 pl-8 pr-3 text-xs text-muted-foreground truncate">{name}</div>
                      <div className="w-28 flex-shrink-0 text-right px-3 text-xs text-green-600/70 dark:text-green-400/70 tabular-nums">{fmtK(cents)}</div>
                      <div className="w-28 flex-shrink-0 text-right px-3 text-xs text-muted-foreground/50 tabular-nums">{fmtK(Math.round(cents / 12))}</div>
                      <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground/50 tabular-nums">{totalIncome12 > 0 ? `${((cents / totalIncome12) * 100).toFixed(1)}%` : "—"}</div>
                      <div className="w-20 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Costs row */}
            <div className="flex items-center border-b border-border/40" style={{ height: 36 }}>
              <div className="flex-1 px-3 text-xs font-semibold flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />Direct Costs</div>
              <div className="w-28 flex-shrink-0 text-right px-3 text-sm font-semibold text-orange-500 dark:text-orange-400 tabular-nums">{totalDC12 > 0 ? fmtK(totalDC12) : "—"}</div>
              <div className="w-28 flex-shrink-0 text-right px-3 text-xs text-orange-500/80 dark:text-orange-400/80 tabular-nums">{avgDC > 0 ? fmtK(avgDC) : "—"}</div>
              <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground">{dcPct > 0 ? `${dcPct.toFixed(1)}%` : "—"}</div>
              <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastDC} prev={prevDC} invert /></div>
            </div>

            {/* Gross Profit row */}
            <div className={`flex items-center border-b border-border/50 font-semibold ${grossProfit12 >= 0 ? "bg-green-500/5" : "bg-destructive/5"}`} style={{ height: 36 }}>
              <div className="flex-1 px-3 text-xs flex items-center gap-1.5">
                {grossProfit12 >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                Gross Profit
              </div>
              <div className={`w-28 flex-shrink-0 text-right px-3 text-sm tabular-nums ${grossProfit12 >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{totalIncome12 > 0 || totalDC12 > 0 ? fmtK(grossProfit12) : "—"}</div>
              <div className={`w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums ${grossProfit12 >= 0 ? "text-green-600/80 dark:text-green-400/80" : "text-destructive/80"}`}>{totalIncome12 > 0 || totalDC12 > 0 ? fmtK(avgGrossProfit) : "—"}</div>
              <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground">{totalIncome12 > 0 ? `${gpPct.toFixed(1)}%` : "—"}</div>
              <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastIncome - lastDC} prev={prevIncome - prevDC} /></div>
            </div>

            {/* Group rows */}
            {groupedData.map(group => {
              const catItems = group.items;
              if (!catItems.length) return null;
              const catTotal = rolling12.reduce((s, { year, month }) => s + catItems.reduce((is, i) => is + (actualMap.get(getKey(i.id, year, month)) || 0), 0), 0);
              const catAvg = catTotal / 12;
              const catPct = totalIncome12 > 0 ? (catTotal / totalIncome12) * 100 : 0;
              const lastCat = lastM ? catItems.reduce((s, i) => s + (actualMap.get(getKey(i.id, lastM.year, lastM.month)) || 0), 0) : 0;
              const prevCat = prevM ? catItems.reduce((s, i) => s + (actualMap.get(getKey(i.id, prevM.year, prevM.month)) || 0), 0) : 0;

              return (
                <div key={group.label}>
                  <div className="flex items-center bg-muted/20 border-b border-border/40" style={{ height: 28 }}>
                    <div className="flex-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                    <div className="w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums font-medium">{catTotal > 0 ? fmtK(catTotal) : "—"}</div>
                    <div className="w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums text-muted-foreground">{catAvg > 0 ? fmtK(catAvg) : "—"}</div>
                    <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground">{catPct > 0 ? `${catPct.toFixed(1)}%` : "—"}</div>
                    <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastCat} prev={prevCat} invert /></div>
                  </div>
                  {catItems.map(item => {
                    const itemTotal = rolling12.reduce((s, { year, month }) => s + (actualMap.get(getKey(item.id, year, month)) || 0), 0);
                    const itemAvg = itemTotal / 12;
                    const itemPct = totalIncome12 > 0 ? (itemTotal / totalIncome12) * 100 : 0;
                    const lastItem = lastM ? (actualMap.get(getKey(item.id, lastM.year, lastM.month)) || 0) : 0;
                    const prevItem = prevM ? (actualMap.get(getKey(item.id, prevM.year, prevM.month)) || 0) : 0;
                    return (
                      <div key={item.id} className="flex items-center border-b border-border/20 hover-elevate" style={{ height: 30 }}>
                        <div className="flex-1 px-3 pl-6 text-xs truncate text-muted-foreground">{item.name}</div>
                        <div className="w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums">{itemTotal > 0 ? fmtK(itemTotal) : "—"}</div>
                        <div className="w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums text-muted-foreground">{itemAvg > 0 ? fmtK(itemAvg) : "—"}</div>
                        <div className="w-24 flex-shrink-0 text-right px-3 text-[10px] text-muted-foreground">{itemPct > 0 ? `${itemPct.toFixed(1)}%` : "—"}</div>
                        <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastItem} prev={prevItem} invert /></div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Total OH */}
            <div className="flex items-center border-t-2 border-border bg-muted/30 font-semibold" style={{ height: 36 }}>
              <div className="flex-1 px-3 text-xs">Total Overheads</div>
              <div className={`w-28 flex-shrink-0 text-right px-3 text-sm tabular-nums ${totalOH12 > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>{totalOH12 > 0 ? fmtK(totalOH12) : "—"}</div>
              <div className="w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums text-muted-foreground">{avgOH > 0 ? fmtK(avgOH) : "—"}</div>
              <div className="w-24 flex-shrink-0 text-right px-3 text-xs tabular-nums text-muted-foreground">{ohPct > 0 ? `${ohPct.toFixed(1)}%` : "—"}</div>
              <div className="w-20 flex-shrink-0 text-right px-3"><MoMArrow cur={lastOH} prev={prevOH} invert /></div>
            </div>

            {/* Net Profit */}
            <div className={`flex items-center border-t border-border/40 rounded-b-md font-semibold ${netProfit12 >= 0 ? "bg-green-500/5" : "bg-destructive/5"}`} style={{ height: 36 }}>
              <div className="flex-1 px-3 text-xs flex items-center gap-1.5">
                {netProfit12 >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                Net Profit
              </div>
              <div className={`w-28 flex-shrink-0 text-right px-3 text-sm tabular-nums ${netProfit12 >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{totalIncome12 > 0 || totalOH12 > 0 ? fmtK(netProfit12) : "—"}</div>
              <div className={`w-28 flex-shrink-0 text-right px-3 text-xs tabular-nums ${netProfit12 >= 0 ? "text-green-600/80 dark:text-green-400/80" : "text-destructive/80"}`}>{totalIncome12 > 0 || totalOH12 > 0 ? fmtK(avgNetProfit) : "—"}</div>
              <div className="w-24 flex-shrink-0 text-right px-3 text-xs tabular-nums text-muted-foreground">{totalIncome12 > 0 ? `${((netProfit12 / totalIncome12) * 100).toFixed(1)}%` : "—"}</div>
              <div className="w-20 flex-shrink-0 text-right px-3">
                <MoMArrow cur={lastIncome - lastDC - lastOH} prev={prevIncome - prevDC - prevOH} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Monthly Grid View ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Rolling 12-month P&L — last 12 complete months</p>
          <p className="text-xs text-muted-foreground/60">Budget: {fmtDollars(monthBudget)}/mo overheads</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
            {(["category", "xero", "buildpro"] as GroupBy[]).map((g, i) => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`px-2.5 py-1 transition-colors ${groupBy === g ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover-elevate"} ${i > 0 ? "border-l border-border" : ""}`}>
                {g === "category" ? "By Category" : g === "xero" ? "Xero Group" : "BuildPro Group"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => setView("prev12")}>
            <Activity className="w-3.5 h-3.5 mr-1" />
            Prev 12 Summary
          </Button>
          <Button size="sm" variant="outline" onClick={() => syncActualsMut.mutate()} disabled={syncActualsMut.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncActualsMut.isPending ? "animate-spin" : ""}`} />
            {syncActualsMut.isPending ? "Syncing…" : "Sync from Xero"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 960 }}>
          {/* Column headers */}
          <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
            <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Item</div>
            {rolling12.map(({ year, month }) => {
              const key = `${year}__${month}`;
              const isConfirmed = statusSet.has(key);
              const hasData = monthsWithActuals.has(key);
              const hasDrift = monthsWithDrift.has(key);
              const chipCls = hasDrift
                ? "text-orange-500 dark:text-orange-400"
                : isConfirmed
                  ? "text-green-600 dark:text-green-400"
                  : hasData
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-muted-foreground/30 hover:text-muted-foreground/60";
              const tipText = hasDrift
                ? "Xero figures changed since confirmed — re-confirm to accept"
                : isConfirmed ? "Confirmed — click to unconfirm"
                : hasData ? "Actuals entered but not yet confirmed — click to confirm"
                : "No actuals entered — click to confirm";
              return (
                <div key={`${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-1">
                  <p className="text-[10px] font-medium text-muted-foreground">{MONTH_NAMES[month - 1]}</p>
                  <p className="text-[9px] text-muted-foreground/40">{year}</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => toggleMonthMut.mutate({ year, month, confirmed: !isConfirmed })}
                          className={`mt-0.5 w-full flex items-center justify-center transition-colors ${chipCls}`}>
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{tipText}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })}
            <div className="w-32 flex-shrink-0 text-center px-1 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">OH vs Budget</div>
          </div>

          {/* Income row */}
          <div className="flex items-center border-b border-border/40 bg-green-500/5" style={{ height: 34 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs font-semibold flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />Income
            </div>
            {rolling12.map(({ year, month }) => {
              const key = `${year}__${month}`;
              const cents = incomeMap.get(key) || 0;
              const isXero = incomeXeroSet.has(key);
              const isEditing = editingIncome === key;
              return (
                <div key={key} className="flex-1 min-w-0 h-full flex items-center justify-center px-0.5">
                  {isXero ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] tabular-nums text-green-600 dark:text-green-400 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 opacity-50" />
                            {cents > 0 ? fmtK(cents) : "—"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Synced from Xero</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : isEditing ? (
                    <input
                      autoFocus
                      className="w-full text-[10px] text-right bg-transparent outline-none border-b border-primary tabular-nums"
                      value={incomeInput}
                      onChange={e => setIncomeInput(e.target.value)}
                      onBlur={() => {
                        const val = parseFloat(incomeInput.replace(/[^0-9.]/g, "")) || 0;
                        incomeActualMut.mutate({ year, month, incomeCents: Math.round(val * 100) });
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const val = parseFloat(incomeInput.replace(/[^0-9.]/g, "")) || 0;
                          incomeActualMut.mutate({ year, month, incomeCents: Math.round(val * 100) });
                        }
                        if (e.key === "Escape") setEditingIncome(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingIncome(key); setIncomeInput(cents > 0 ? (cents / 100).toFixed(0) : ""); }}
                      className="w-full text-[10px] tabular-nums text-right text-green-600 dark:text-green-400 hover:opacity-80 transition-opacity">
                      {cents > 0 ? fmtK(cents) : <span className="text-muted-foreground/20">+</span>}
                    </button>
                  )}
                </div>
              );
            })}
            <div className="w-32 flex-shrink-0" />
          </div>

          {/* Direct Costs row */}
          <div className="flex items-center border-b border-border/40" style={{ height: 34 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs font-semibold flex items-center gap-1.5">
              <TrendingDown className="w-3 h-3 text-orange-500 dark:text-orange-400" />Direct Costs
            </div>
            {rolling12.map(({ year, month }) => {
              const key = `${year}__${month}`;
              const cents = directCostMap.get(key) || 0;
              const isXero = directCostXeroSet.has(key);
              const isEditing = editingDirectCost === key;
              return (
                <div key={key} className="flex-1 min-w-0 h-full flex items-center justify-center px-0.5">
                  {isXero ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[10px] tabular-nums text-orange-500 dark:text-orange-400 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 opacity-50" />
                            {cents > 0 ? fmtK(cents) : "—"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Synced from Xero</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : isEditing ? (
                    <input
                      autoFocus
                      className="w-full text-[10px] text-right bg-transparent outline-none border-b border-primary tabular-nums"
                      value={directCostInput}
                      onChange={e => setDirectCostInput(e.target.value)}
                      onBlur={() => {
                        const val = parseFloat(directCostInput.replace(/[^0-9.]/g, "")) || 0;
                        directCostActualMut.mutate({ year, month, directCostCents: Math.round(val * 100) });
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const val = parseFloat(directCostInput.replace(/[^0-9.]/g, "")) || 0;
                          directCostActualMut.mutate({ year, month, directCostCents: Math.round(val * 100) });
                        }
                        if (e.key === "Escape") setEditingDirectCost(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingDirectCost(key); setDirectCostInput(cents > 0 ? (cents / 100).toFixed(0) : ""); }}
                      className="w-full text-[10px] tabular-nums text-right text-orange-500 dark:text-orange-400 hover:opacity-80 transition-opacity">
                      {cents > 0 ? fmtK(cents) : <span className="text-muted-foreground/20">+</span>}
                    </button>
                  )}
                </div>
              );
            })}
            <div className="w-32 flex-shrink-0" />
          </div>

          {/* Gross Profit row */}
          {(() => {
            const gpVals = rolling12.map(({ year, month }) => (incomeMap.get(`${year}__${month}`) || 0) - (directCostMap.get(`${year}__${month}`) || 0));
            const hasData = gpVals.some(v => v !== 0);
            return (
              <div className="flex items-center border-b border-border/50 bg-muted/10 font-medium" style={{ height: 28 }}>
                <div className="w-44 flex-shrink-0 px-3 text-xs flex items-center gap-1.5 text-muted-foreground">Gross Profit</div>
                {gpVals.map((gp, idx) => {
                  const income = incomeMap.get(`${rolling12[idx].year}__${rolling12[idx].month}`) || 0;
                  const dc = directCostMap.get(`${rolling12[idx].year}__${rolling12[idx].month}`) || 0;
                  return (
                    <div key={idx} className={`flex-1 min-w-0 text-right pr-1 text-[10px] tabular-nums ${!income && !dc ? "text-muted-foreground/20" : gp >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {income || dc ? fmtK(gp) : "—"}
                    </div>
                  );
                })}
                <div className="w-32 flex-shrink-0" />
              </div>
            );
          })()}

          {/* Overhead groups */}
          {groupedData.map(group => {
            const catItems = group.items;
            if (!catItems.length) return null;
            return (
              <div key={group.label}>
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                  {rolling12.map(({ year, month }) => <div key={`${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                  <div className="w-32 flex-shrink-0 h-5" />
                </div>
                {catItems.map(item => {
                  const itemBudgetMonthly = toMonthlyCents(item);
                  const totalActual = rolling12.reduce((s, { year, month }) => s + (actualMap.get(getKey(item.id, year, month)) || 0), 0);
                  const confirmedMonths = rolling12.filter(({ year, month }) => (actualMap.get(getKey(item.id, year, month)) || 0) > 0).length;
                  const totalBudgetForActualMonths = confirmedMonths * itemBudgetMonthly;
                  const varianceDollars = confirmedMonths > 0 ? totalBudgetForActualMonths - totalActual : 0;
                  const variancePct = totalBudgetForActualMonths > 0 ? (varianceDollars / totalBudgetForActualMonths) * 100 : 0;
                  return (
                    <div key={item.id} className="flex items-center border-b border-border/30 hover-elevate" style={{ height: 32 }}>
                      <div className="w-44 flex-shrink-0 px-3 text-xs truncate">{item.name}</div>
                      {rolling12.map(({ year, month }) => {
                        const cents = actualMap.get(getKey(item.id, year, month)) || 0;
                        const over = cents > 0 && itemBudgetMonthly > 0 && cents > itemBudgetMonthly * 1.1;
                        const drifted = driftMap.has(getKey(item.id, year, month));
                        return (
                          <div key={`${year}-${month}`} className={`flex-1 min-w-0 h-full flex items-center ${over ? "bg-destructive/5" : drifted ? "bg-orange-500/8" : ""}`}>
                            <ActualCell cents={cents} highlight={over} />
                          </div>
                        );
                      })}
                      <div className={`w-32 flex-shrink-0 text-right pr-3 text-xs tabular-nums ${confirmedMonths === 0 ? "text-muted-foreground/30" : varianceDollars < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                        {confirmedMonths > 0 ? <span>{varianceDollars < 0 ? "-" : "+"}{fmtK(Math.abs(varianceDollars))} <span className="text-[10px] opacity-70">({variancePct.toFixed(0)}%)</span></span> : "—"}
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center border-b border-border/40 bg-muted/10" style={{ height: 26 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</div>
                  {rolling12.map(({ year, month }) => {
                    const total = catItems.reduce((s, i) => s + (actualMap.get(getKey(i.id, year, month)) || 0), 0);
                    return <div key={`${year}-${month}`} className="flex-1 min-w-0 text-right pr-1 text-[10px] tabular-nums text-muted-foreground">{total > 0 ? fmtK(total) : "—"}</div>;
                  })}
                  <div className="w-32 flex-shrink-0" />
                </div>
              </div>
            );
          })}

          {/* Total overheads + budget rows */}
          {(() => {
            const grandActuals = rolling12.map(({ year, month }) => data.items.reduce((s, i) => s + (actualMap.get(getKey(i.id, year, month)) || 0), 0));
            const grandBudgets = rolling12.map(() => monthBudget);
            const totalActual = grandActuals.reduce((a, b) => a + b, 0);
            const confirmedMonths = grandActuals.filter(v => v > 0).length;
            const totalBudget = confirmedMonths * monthBudget;
            const varianceDollars = totalBudget > 0 ? totalBudget - totalActual : 0;
            const variancePct = totalBudget > 0 ? (varianceDollars / totalBudget) * 100 : 0;

            const incomeActuals = rolling12.map(({ year, month }) => incomeMap.get(`${year}__${month}`) || 0);
            const netProfits = rolling12.map(({ year, month }, i) => (incomeMap.get(`${year}__${month}`) || 0) - (directCostMap.get(`${year}__${month}`) || 0) - grandActuals[i]);
            const ohPcts = rolling12.map(({ year, month }, i) => {
              const income = incomeMap.get(`${year}__${month}`) || 0;
              return income > 0 ? (grandActuals[i] / income) * 100 : null;
            });

            return (
              <>
                <div className="flex items-center border-t-2 border-border bg-muted/30 font-semibold" style={{ height: 34 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-xs">Total Overheads</div>
                  {grandActuals.map((actual, idx) => (
                    <div key={idx} className={`flex-1 min-w-0 text-right pr-1 text-xs tabular-nums ${actual > grandBudgets[idx] * 1.1 && actual > 0 ? "text-destructive" : actual > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>{actual > 0 ? fmtK(actual) : "—"}</div>
                  ))}
                  <div className={`w-32 flex-shrink-0 text-right pr-3 text-xs tabular-nums ${confirmedMonths === 0 ? "text-muted-foreground/30" : varianceDollars < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                    {confirmedMonths > 0 ? <span>{varianceDollars < 0 ? "-" : "+"}{fmtK(Math.abs(varianceDollars))} <span className="text-[10px] opacity-70">({variancePct.toFixed(0)}%)</span></span> : "—"}
                  </div>
                </div>
                <div className="flex items-center border-t border-border/30" style={{ height: 24 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground">OH Budget</div>
                  {grandBudgets.map((b, idx) => <div key={idx} className="flex-1 min-w-0 text-right pr-1 text-[10px] text-muted-foreground tabular-nums">{fmtK(b)}</div>)}
                  <div className="w-32 flex-shrink-0" />
                </div>
                {/* OH% row */}
                <div className="flex items-center border-t border-border/30" style={{ height: 24 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" />OH%</div>
                  {ohPcts.map((pct, idx) => (
                    <div key={idx} className={`flex-1 min-w-0 text-right pr-1 text-[10px] tabular-nums ${pct !== null && pct > 30 ? "text-destructive/70" : "text-muted-foreground"}`}>
                      {pct !== null ? `${pct.toFixed(0)}%` : "—"}
                    </div>
                  ))}
                  <div className="w-32 flex-shrink-0" />
                </div>
                {/* Net Profit row */}
                <div className="flex items-center border-t border-border/40 bg-muted/10 rounded-b-md font-medium" style={{ height: 30 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-xs flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />Net Profit
                  </div>
                  {netProfits.map((np, idx) => {
                    const hasIncome = incomeActuals[idx] > 0;
                    return (
                      <div key={idx} className={`flex-1 min-w-0 text-right pr-1 text-xs tabular-nums font-medium ${!hasIncome ? "text-muted-foreground/30" : np >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                        {hasIncome ? fmtK(np) : "—"}
                      </div>
                    );
                  })}
                  <div className="w-32 flex-shrink-0" />
                </div>
              </>
            );
          })()}
        </div>
      </div>
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
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Growth mode toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoGrowth(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {autoGrowth ? <ToggleRight className="w-5 h-5 text-[#A890D4]" /> : <ToggleLeft className="w-5 h-5" />}
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
              <Badge variant="secondary" className={`text-[10px] no-default-active-elevate ${rate > 0 ? "text-destructive" : rate < 0 ? "text-green-600 dark:text-green-400" : ""}`}>
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
            <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">Item</div>
            {last12.map(({ year, month }) => (
              <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-[10px] text-muted-foreground/60">{MONTH_NAMES[month - 1]}</p>
                <p className="text-[9px] text-muted-foreground/40">{year}</p>
              </div>
            ))}
            <div className="w-px bg-[#A890D4]/40 self-stretch mx-0.5" />
            {next12.map(({ year, month }) => (
              <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-[10px] text-[#A890D4] font-medium">{MONTH_NAMES[month - 1]}</p>
                <p className="text-[9px] text-muted-foreground/40">{year}</p>
              </div>
            ))}
          </div>
          <div className="flex border-b border-border/30 bg-muted/10">
            <div className="w-44 flex-shrink-0" />
            <div className="flex-1 text-center text-[9px] uppercase tracking-wide text-muted-foreground/50 py-0.5">← Actuals (last 12 months, readonly)</div>
            <div className="w-px bg-[#A890D4]/40" />
            <div className="flex-1 text-center text-[9px] uppercase tracking-wide text-[#A890D4]/60 py-0.5">Forecast — next 12 months (click to override) →</div>
          </div>

          {data.categories.map(cat => {
            const catItems = data.items.filter(i => i.categoryId === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</div>
                  {last12.map(({ year, month }) => <div key={`a-${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                  <div className="w-px bg-[#A890D4]/40 self-stretch" />
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
                    <div className="w-px bg-[#A890D4]/30 self-stretch" />
                    {next12.map(({ year, month }, idx) => {
                      const projected = getForecastCents(item, year, month, idx);
                      const isOverridden = overrideMap.has(getKey(item.id, year, month));
                      return (
                        <div key={`f-${year}-${month}`} className={`flex-1 min-w-0 h-full flex items-center ${isOverridden ? "bg-[#A890D4]/5" : ""}`}>
                          <ActualCell cents={projected} onSave={val => upsertForecastMut.mutate({ itemId: item.id, year, month, forecastCents: val })} />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Category subtotals */}
                <div className="flex items-center border-b border-border/30 bg-muted/10" style={{ height: 26 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground">Subtotal</div>
                  {last12.map(({ year, month }) => { const t = catItems.reduce((s, i) => s + (actualMap.get(getKey(i.id, year, month)) || 0), 0); return <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-right text-[10px] px-0.5 tabular-nums text-muted-foreground">{t > 0 ? fmtK(t) : "—"}</div>; })}
                  <div className="w-px bg-[#A890D4]/30 self-stretch" />
                  {next12.map(({ year, month }, idx) => { const t = catItems.reduce((s, i) => s + getForecastCents(i, year, month, idx), 0); return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-[10px] px-0.5 tabular-nums text-[#A890D4]/70">{fmtK(t)}</div>; })}
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
            <div className="w-px bg-[#A890D4]/40 self-stretch" />
            {next12.map(({ year, month }, idx) => {
              const t = data.items.reduce((s, item) => s + getForecastCents(item, year, month, idx), 0);
              return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-xs px-0.5 tabular-nums text-[#A890D4]">{fmtK(t)}</div>;
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">Purple columns = forecast. Click any to override the projected value. Auto YoY growth computes per-category growth from last 12 months vs previous 12 months of actuals.</p>
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
  const trafficColor = isCovered ? "text-green-600 dark:text-green-400" : isAmber ? "text-yellow-600 dark:text-yellow-400" : "text-destructive";
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
                  <Button size="icon" variant="ghost" onClick={() => updateSettingsMut.mutate(targetOhPct)}><Check className="w-3 h-3 text-green-500" /></Button>
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
                <p className="text-[10px] text-muted-foreground">To fully recover OH at {ohPct}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrafficIcon className={`w-4 h-4 ${trafficColor}`} />
              <CardTitle className="text-sm font-semibold">Coverage Status</CardTitle>
              <Badge className={`text-[10px] no-default-active-elevate ${isCovered ? "bg-green-500/10 text-green-700 dark:text-green-400" : isAmber ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" : "bg-destructive/10 text-destructive"}`}>
                {isCovered ? "Fully Covered" : isAmber ? "Close to Target" : "Under-Recovered"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Projected Revenue</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(totalProjectedCents)}</p>
                <p className="text-[10px] text-muted-foreground">Contracted + Weighted Pipeline</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">OH Recovered @ {ohPct}%</p>
                <p className={`text-xl font-bold tabular-nums ${trafficColor}`}>{fmtDollars(recoveredOhCents)}</p>
                <p className={`text-[10px] font-medium ${trafficColor}`}>
                  {isCovered ? `${fmtDollars(-shortfallCents)} surplus` : `${fmtDollars(shortfallCents)} shortfall`}
                </p>
              </div>
            </div>
            <div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isCovered ? "bg-green-500" : isAmber ? "bg-yellow-500" : "bg-destructive"}`} style={{ width: `${Math.min(coveragePct, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{coveragePct.toFixed(0)}% of breakeven revenue ({fmtDollars(breakevenCents)})</p>
            </div>
            {!isCovered && revenueGapCents > 0 && (
              <div className={`text-xs font-medium rounded-md px-3 py-2 ${isAmber ? "bg-yellow-500/10 text-yellow-800 dark:text-yellow-300" : "bg-destructive/10 text-destructive"}`}>
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
                <div className="grid px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 90px 95px 95px" }}>
                  <span>Project</span><span>Status</span><span className="text-right">Contract</span><span className="text-right">Remaining</span>
                </div>
                {contractedProjects.map(p => (
                  <div key={p.id} className="grid items-center px-4 py-1.5 border-b border-border/30 hover-elevate" style={{ gridTemplateColumns: "1fr 90px 95px 95px" }}>
                    <div>
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      {p.projectStatus === "construction" && (p.percentComplete || 0) > 0 && (
                        <p className="text-[10px] text-muted-foreground">{p.percentComplete}% complete</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] no-default-active-elevate capitalize w-fit">{p.projectStatus}</Badge>
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
                <p className="px-4 py-2 text-[10px] text-muted-foreground/60 italic">
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
                <div className="grid px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 90px 55px 85px 28px" }}>
                  <span>Job</span><span className="text-right">Value</span><span className="text-right">Win%</span><span className="text-right">Weighted</span><span />
                </div>
                {jobs.map(job => (
                  <div key={job.id} className="grid items-center px-4 py-2 border-b border-border/30 hover-elevate group" style={{ gridTemplateColumns: "1fr 90px 55px 85px 28px" }}>
                    <div>
                      <p className="text-xs font-medium truncate">{job.name}</p>
                      {job.expectedStartDate && <p className="text-[10px] text-muted-foreground">Start: {new Date(job.expectedStartDate).toLocaleDateString("en-AU")}</p>}
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
              <p className={`text-[10px] font-medium ${trafficColor}`}>{isCovered ? `${fmtDollars(-shortfallCents)} surplus` : `${fmtDollars(shortfallCents)} shortfall`}</p>
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
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-0 border-b border-border/50">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-1.5 px-3 h-8 text-xs rounded-t-sm transition-colors flex-shrink-0 ${isActive ? "text-[#A890D4] font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3 h-3" />
              {label}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#A890D4]" />}
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
