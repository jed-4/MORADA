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
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FolderPlus,
  Package,
  Target,
  Download,
  Info,
  Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverheadCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface OverheadItem {
  id: string;
  categoryId: string;
  name: string;
  frequency: "weekly" | "monthly" | "quarterly" | "annual";
  budgetCents: number;
  xeroAccountCode: string | null;
  notes: string | null;
  sortOrder: number;
}

interface OverheadMonthActual {
  id: string;
  itemId: string;
  year: number;
  month: number;
  actualCents: number;
  xeroImported: boolean;
}

interface OverheadMonthStatus {
  id: string;
  companyId: string;
  year: number;
  month: number;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
}

interface OhSettings {
  targetOhPercent: string;
}

interface OhPipelineJob {
  id: string;
  name: string;
  estimatedValue: number;
  probabilityPercent: number;
  expectedStartDate: string | null;
  notes: string | null;
}

interface OverheadForecastOverride {
  id: string;
  itemId: string;
  year: number;
  month: number;
  forecastCents: number;
}

interface ContractedProject {
  id: string;
  name: string;
  projectStatus: string | null;
  lockedContractPrice: number | null;
}

interface OverheadsData {
  categories: OverheadCategory[];
  items: OverheadItem[];
  actuals: OverheadMonthActual[];
  monthStatuses: OverheadMonthStatus[];
  settings: OhSettings | null;
}

type Frequency = "weekly" | "monthly" | "quarterly" | "annual";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDollars(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtK(cents: number): string {
  const val = cents / 100;
  if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${Math.round(val)}`;
}

function toMonthlyCents(item: OverheadItem): number {
  switch (item.frequency) {
    case "weekly":    return Math.round(item.budgetCents * 52 / 12);
    case "monthly":   return item.budgetCents;
    case "quarterly": return Math.round(item.budgetCents / 3);
    case "annual":    return Math.round(item.budgetCents / 12);
  }
}

function getActualKey(itemId: string, year: number, month: number) {
  return `${itemId}__${year}__${month}`;
}

function buildActualMap(actuals: OverheadMonthActual[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of actuals) {
    m.set(getActualKey(a.itemId, a.year, a.month), a.actualCents);
  }
  return m;
}

function buildStatusSet(statuses: OverheadMonthStatus[]): Set<string> {
  const s = new Set<string>();
  for (const st of statuses) {
    if (st.confirmedAt) s.add(`${st.year}__${st.month}`);
  }
  return s;
}

function buildOverrideMap(overrides: OverheadForecastOverride[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of overrides) {
    m.set(getActualKey(o.itemId, o.year, o.month), o.forecastCents);
  }
  return m;
}

function variantClass(variance: number): string {
  if (variance < 0) return "text-destructive";
  if (variance > 0) return "text-green-600 dark:text-green-400";
  return "text-muted-foreground";
}

// ─── Inline editable cell (estimate-spreadsheet style) ────────────────────────

interface InlineCellProps {
  value: string;
  onCommit: (val: string) => void;
  align?: "left" | "right";
  placeholder?: string;
  type?: string;
  active: boolean;
  onActivate: () => void;
}

function InlineCell({ value, onCommit, align = "right", placeholder, type = "text", active, onActivate }: InlineCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  const commit = () => { onCommit(draft); };

  if (active) {
    return (
      <div className="ring-1 ring-inset ring-primary/60 rounded-[2px] h-full flex items-center">
        <input
          ref={inputRef}
          autoFocus
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") { commit(); }
            if (e.key === "Escape") { setDraft(value); }
          }}
          className={`h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1 ${align === "right" ? "text-right" : "text-left"} tabular-nums`}
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <button
      onClick={onActivate}
      className={`w-full h-full flex items-center ${align === "right" ? "justify-end" : "justify-start"} text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors cursor-pointer tabular-nums`}
    >
      {value || <span className="text-muted-foreground/40 text-xs">{placeholder || "—"}</span>}
    </button>
  );
}

// ─── Editable actual cell ─────────────────────────────────────────────────────

function ActualCell({ cents, onSave }: { cents: number; onSave: (val: number) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="ring-1 ring-inset ring-primary/60 rounded-[2px] h-full flex items-center">
        <input
          autoFocus
          type="number"
          defaultValue={cents > 0 ? (cents / 100).toFixed(0) : ""}
          className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1 tabular-nums"
          onBlur={e => {
            const num = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
            onSave(isNaN(num) ? 0 : Math.round(num * 100));
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full h-full text-right text-xs tabular-nums px-1 border-b border-transparent hover:border-primary/30 transition-colors cursor-pointer"
    >
      {cents > 0 ? fmtK(cents) : <span className="text-muted-foreground/30">—</span>}
    </button>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function AddCategoryDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const handleSave = () => { if (!name.trim()) return; onSave(name.trim()); setName(""); onClose(); };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Overhead Category</DialogTitle></DialogHeader>
        <div>
          <Label className="text-xs text-muted-foreground">Category Name</Label>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); }} placeholder="e.g. Staffing, Software, Rent" className="mt-1" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Add Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ItemFormState {
  name: string;
  frequency: Frequency;
  budgetCents: string;
  xeroAccountCode: string;
  notes: string;
  categoryId: string;
}

function ItemDialog({
  open, onClose, onSave, categories, initial, title,
}: {
  open: boolean; onClose: () => void; onSave: (form: ItemFormState) => void;
  categories: OverheadCategory[]; initial?: Partial<ItemFormState>; title?: string;
}) {
  const [form, setForm] = useState<ItemFormState>({
    name: initial?.name || "",
    frequency: (initial?.frequency as Frequency) || "monthly",
    budgetCents: initial?.budgetCents || "",
    xeroAccountCode: initial?.xeroAccountCode || "",
    notes: initial?.notes || "",
    categoryId: initial?.categoryId || categories[0]?.id || "",
  });

  const handleSave = () => { if (!form.name.trim() || !form.categoryId) return; onSave(form); onClose(); };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title || "Add Overhead Item"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Item Name</Label>
              <Input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Office Rent" className="mt-1" />
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
              <Label className="text-xs text-muted-foreground">Xero Account Code</Label>
              <Input value={form.xeroAccountCode} onChange={e => setForm(f => ({ ...f, xeroAccountCode: e.target.value }))} placeholder="e.g. 420" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || !form.categoryId}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab 1: Register ──────────────────────────────────────────────────────────

type CellId = { itemId: string; field: string };

function RegisterTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<OverheadItem | null>(null);
  const [preselectedCategoryId, setPreselectedCategoryId] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [activeCell, setActiveCell] = useState<CellId | null>(null);

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => apiRequest("/api/overheads/categories", "POST", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/overheads/categories/${id}`, "PATCH", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); setEditingCatId(null); },
    onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/categories/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });

  const createItemMutation = useMutation({
    mutationFn: (form: ItemFormState) =>
      apiRequest("/api/overheads/items", "POST", {
        ...form,
        budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to create item", variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/overheads/items/${id}`, "PATCH", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/items/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
  });

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, OverheadItem[]>();
    for (const cat of data.categories) {
      map.set(cat.id, data.items.filter(i => i.categoryId === cat.id));
    }
    return map;
  }, [data.categories, data.items]);

  const grandTotal = useMemo(() => data.items.reduce((sum, item) => sum + toMonthlyCents(item), 0), [data.items]);

  const FREQ_COLORS: Record<Frequency, string> = {
    weekly:    "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    monthly:   "bg-[#bba7db]/10 text-[#8b6db5] dark:text-[#bba7db]",
    quarterly: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    annual:    "bg-green-500/10 text-green-700 dark:text-green-400",
  };

  const GRID = "40px 1fr 70px 80px 90px 85px 32px";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Total monthly overhead budget</p>
          <p className="text-2xl font-bold tabular-nums">{fmtDollars(grandTotal)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add Item
          </Button>
          <Button size="sm" onClick={() => setAddCatOpen(true)}>
            <FolderPlus className="w-3.5 h-3.5 mr-1" />Add Category
          </Button>
        </div>
      </div>

      {data.categories.length === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <Package className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No overhead categories yet.</p>
            <p className="text-xs text-muted-foreground/60">Add categories like Staffing, Software, Rent, then add line items under each.</p>
            <Button size="sm" onClick={() => setAddCatOpen(true)}><FolderPlus className="w-3.5 h-3.5 mr-1" />Add First Category</Button>
          </CardContent>
        </Card>
      )}

      {data.categories.map(cat => {
        const catItems = itemsByCategory.get(cat.id) || [];
        const catTotal = catItems.reduce((s, i) => s + toMonthlyCents(i), 0);
        const isCollapsed = collapsedCategories.has(cat.id);

        return (
          <Card key={cat.id}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={() => setCollapsedCategories(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })} className="text-muted-foreground hover:text-foreground transition-colors">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {editingCatId === cat.id ? (
                    <div className="flex items-center gap-1">
                      <Input autoFocus value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") updateCategoryMutation.mutate({ id: cat.id, name: editingCatName }); if (e.key === "Escape") setEditingCatId(null); }}
                        className="h-6 text-sm py-0 w-48" />
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => updateCategoryMutation.mutate({ id: cat.id, name: editingCatName })}><Check className="w-3 h-3 text-green-500" /></Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingCatId(null)}><X className="w-3 h-3 text-muted-foreground" /></Button>
                    </div>
                  ) : (
                    <CardTitle className="text-sm font-semibold">{cat.name}</CardTitle>
                  )}
                  <Badge variant="secondary" className="text-[10px] no-default-active-elevate">{catItems.length} item{catItems.length !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{fmtDollars(catTotal)}/mo</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="w-3.5 h-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setPreselectedCategoryId(cat.id); setAddItemOpen(true); }}><Plus className="w-3.5 h-3.5 mr-2" />Add item to {cat.name}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}><Pencil className="w-3.5 h-3.5 mr-2" />Rename</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete "${cat.name}" and all its items?`)) deleteCategoryMutation.mutate(cat.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete Category</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>

            {!isCollapsed && (
              <CardContent className="px-0 pb-0">
                {catItems.length === 0 ? (
                  <div className="px-4 pb-3 border-t border-border/50 pt-2 text-xs text-muted-foreground/60 italic">
                    No items yet — <button className="text-primary underline underline-offset-2" onClick={() => { setPreselectedCategoryId(cat.id); setAddItemOpen(true); }}>add one</button>
                  </div>
                ) : (
                  <div className="border-t border-border/50">
                    {/* Header */}
                    <div className="grid px-4 py-1 text-[10px] text-muted-foreground uppercase tracking-wide" style={{ gridTemplateColumns: GRID }}>
                      <span />
                      <span>Item</span>
                      <span className="text-right">Freq.</span>
                      <span className="text-right">Budget</span>
                      <span className="text-right">Xero Code</span>
                      <span className="text-right">Monthly Equiv.</span>
                      <span />
                    </div>
                    {catItems.map(item => {
                      const isActive = (field: string) => activeCell?.itemId === item.id && activeCell?.field === field;
                      const activate = (field: string) => setActiveCell({ itemId: item.id, field });

                      const commitField = (field: string, rawVal: string) => {
                        setActiveCell(null);
                        let val: unknown = rawVal;
                        if (field === "budgetCents") val = Math.round(parseFloat(rawVal || "0") * 100) || 0;
                        if (field === "frequency") val = rawVal;
                        updateItemMutation.mutate({ id: item.id, patch: { [field]: val } });
                      };

                      return (
                        <div key={item.id} className="grid items-center px-4 border-t border-border/30 hover-elevate group" style={{ gridTemplateColumns: GRID, height: 34 }}>
                          {/* Drag handle placeholder */}
                          <span />

                          {/* Name — inline edit */}
                          <div className={`h-full flex items-center ${isActive("name") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                            {isActive("name") ? (
                              <input autoFocus defaultValue={item.name} className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs px-1"
                                onBlur={e => commitField("name", e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                            ) : (
                              <button onClick={() => activate("name")} className="w-full h-full flex items-center text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors text-left">{item.name}</button>
                            )}
                          </div>

                          {/* Frequency — inline select */}
                          {isActive("frequency") ? (
                            <div className="ring-1 ring-inset ring-primary/60 rounded-[2px] h-full flex items-center">
                              <Select defaultValue={item.frequency} onValueChange={v => commitField("frequency", v)}>
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
                              <button onClick={() => activate("frequency")}>
                                <Badge className={`text-[10px] no-default-active-elevate ${FREQ_COLORS[item.frequency]}`}>
                                  {item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}
                                </Badge>
                              </button>
                            </div>
                          )}

                          {/* Budget — inline edit */}
                          <div className={`h-full flex items-center ${isActive("budgetCents") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                            {isActive("budgetCents") ? (
                              <input autoFocus type="number" defaultValue={item.budgetCents > 0 ? (item.budgetCents / 100).toFixed(0) : ""}
                                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1 tabular-nums"
                                onBlur={e => commitField("budgetCents", e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                            ) : (
                              <button onClick={() => activate("budgetCents")} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors tabular-nums">
                                {item.budgetCents > 0 ? fmtDollars(item.budgetCents) : <span className="text-muted-foreground/40">—</span>}
                              </button>
                            )}
                          </div>

                          {/* Xero Code — inline edit */}
                          <div className={`h-full flex items-center ${isActive("xeroAccountCode") ? "ring-1 ring-inset ring-primary/60 rounded-[2px]" : ""}`}>
                            {isActive("xeroAccountCode") ? (
                              <input autoFocus defaultValue={item.xeroAccountCode || ""}
                                className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right px-1"
                                onBlur={e => commitField("xeroAccountCode", e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setActiveCell(null); }} />
                            ) : (
                              <button onClick={() => activate("xeroAccountCode")} className="w-full h-full text-right text-xs px-1 border-b border-transparent hover:border-primary/30 transition-colors text-muted-foreground tabular-nums">
                                {item.xeroAccountCode || <span className="opacity-40">—</span>}
                              </button>
                            )}
                          </div>

                          {/* Monthly equiv */}
                          <span className="text-xs text-right font-medium tabular-nums px-1">{fmtDollars(toMonthlyCents(item))}</span>

                          {/* Action menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-3 h-3" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditItem(item)}><Pencil className="w-3.5 h-3.5 mr-2" />Edit in dialog</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMutation.mutate(item.id); }}><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                    {/* Add item shortcut */}
                    <button className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground/50 hover:text-muted-foreground border-t border-border/30 transition-colors"
                      onClick={() => { setPreselectedCategoryId(cat.id); setAddItemOpen(true); }}>
                      <Plus className="w-3 h-3" />Add item
                    </button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} onSave={name => createCategoryMutation.mutate(name)} />

      <ItemDialog open={addItemOpen} onClose={() => { setAddItemOpen(false); setPreselectedCategoryId(""); }}
        onSave={form => createItemMutation.mutate(form)} categories={data.categories}
        initial={{ categoryId: preselectedCategoryId || data.categories[0]?.id || "" }} />

      {editItem && (
        <ItemDialog open title="Edit Overhead Item" onClose={() => setEditItem(null)}
          onSave={form => { updateItemMutation.mutate({ id: editItem.id, patch: { ...form, budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0 } }); setEditItem(null); }}
          categories={data.categories}
          initial={{ name: editItem.name, frequency: editItem.frequency, budgetCents: editItem.budgetCents > 0 ? (editItem.budgetCents / 100).toFixed(0) : "", xeroAccountCode: editItem.xeroAccountCode || "", notes: editItem.notes || "", categoryId: editItem.categoryId }}
        />
      )}
    </div>
  );
}

// ─── Tab 2: Monthly Actuals ───────────────────────────────────────────────────

interface XeroMappingRow {
  xeroAccountName: string;
  xeroKey: string;
  amounts: Record<string, number>;
  selectedItemId: string;
}

function MonthlyActualsTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [xeroDialogOpen, setXeroDialogOpen] = useState(false);
  const [xeroLoading, setXeroLoading] = useState(false);
  const [xeroMappings, setXeroMappings] = useState<XeroMappingRow[]>([]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);
  const statusSet = useMemo(() => buildStatusSet(data.monthStatuses), [data.monthStatuses]);

  const upsertActualMutation = useMutation({
    mutationFn: ({ itemId, year, month, actualCents }: { itemId: string; year: number; month: number; actualCents: number }) =>
      apiRequest("/api/overheads/actuals", "PUT", { itemId, year, month, actualCents }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to save actual", variant: "destructive" }),
  });

  const toggleMonthMutation = useMutation({
    mutationFn: ({ year, month, confirmed }: { year: number; month: number; confirmed: boolean }) =>
      apiRequest("/api/overheads/month-status", "POST", { year, month, confirmed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }),
    onError: () => toast({ title: "Failed to update month status", variant: "destructive" }),
  });

  const bulkUpsertMutation = useMutation({
    mutationFn: (actuals: Array<{ itemId: string; year: number; month: number; actualCents: number }>) =>
      apiRequest("/api/overheads/actuals/bulk", "POST", { actuals }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); toast({ title: "Xero actuals imported" }); setXeroDialogOpen(false); },
    onError: () => toast({ title: "Failed to import Xero actuals", variant: "destructive" }),
  });

  // Totals per month
  const monthTotals = useMemo(() => months.map(m => data.items.reduce((s, item) => s + (actualMap.get(getActualKey(item.id, viewYear, m)) || 0), 0)), [data.items, months, actualMap, viewYear]);
  const budgetTotals = useMemo(() => months.map(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0)), [data.items]);
  const varianceTotals = useMemo(() => monthTotals.map((a, i) => a > 0 ? budgetTotals[i] - a : 0), [monthTotals, budgetTotals]);

  const openXeroImport = async () => {
    setXeroLoading(true);
    setXeroDialogOpen(true);
    try {
      const fromDate = `${viewYear}-01-01`;
      const toDate = `${viewYear}-12-31`;
      const result = await fetch(`/api/xero/overhead-actuals?from=${fromDate}&to=${toDate}`, { credentials: "include" });
      if (!result.ok) throw new Error(await result.text());
      const json = await result.json() as { byAccount: Record<string, { name: string; amounts: Record<string, number> }>; accounts: Array<{ code: string; name: string }> };
      const mappings: XeroMappingRow[] = Object.entries(json.byAccount).map(([key, val]) => ({
        xeroAccountName: val.name,
        xeroKey: key,
        amounts: val.amounts,
        selectedItemId: data.items.find(i => i.xeroAccountCode === key)?.id || "",
      }));
      setXeroMappings(mappings);
    } catch {
      toast({ title: "Failed to load Xero data — ensure Xero is connected and try again", variant: "destructive" });
      setXeroDialogOpen(false);
    } finally {
      setXeroLoading(false);
    }
  };

  const applyXeroImport = () => {
    const actuals: Array<{ itemId: string; year: number; month: number; actualCents: number }> = [];
    for (const row of xeroMappings) {
      if (!row.selectedItemId) continue;
      for (const [monthKey, amount] of Object.entries(row.amounts)) {
        const [yyyy, mm] = monthKey.split("-").map(Number);
        if (yyyy === viewYear) {
          actuals.push({ itemId: row.selectedItemId, year: yyyy, month: mm, actualCents: Math.round(amount * 100) });
        }
      }
    }
    if (actuals.length === 0) { toast({ title: "No data to import — check account mappings" }); return; }
    bulkUpsertMutation.mutate(actuals);
  };

  if (data.categories.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Add overhead categories and items in the Register tab first.</CardContent></Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setViewYear(y => y - 1)}>‹ {viewYear - 1}</Button>
          <span className="text-sm font-semibold px-2">{viewYear}</span>
          <Button size="sm" variant="outline" onClick={() => setViewYear(y => y + 1)} disabled={viewYear >= now.getFullYear()}>{viewYear + 1} ›</Button>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground hidden md:block">Click any cell to enter actuals. Check icon to confirm month.</p>
          <Button size="sm" variant="outline" onClick={openXeroImport}>
            <Download className="w-3.5 h-3.5 mr-1" />Import from Xero
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 960 }}>
          {/* Column headers */}
          <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
            <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Item</div>
            {months.map(m => {
              const isConfirmed = statusSet.has(`${viewYear}__${m}`);
              const isCurrent = m === now.getMonth() + 1 && viewYear === now.getFullYear();
              return (
                <div key={m} className="flex-1 min-w-0 text-center px-0.5 py-1">
                  <p className={`text-[10px] uppercase tracking-wide font-medium ${isCurrent ? "text-[#bba7db]" : "text-muted-foreground"}`}>{MONTH_NAMES[m - 1]}</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={() => toggleMonthMutation.mutate({ year: viewYear, month: m, confirmed: !isConfirmed })}
                          className={`mt-0.5 w-full flex items-center justify-center transition-colors ${isConfirmed ? "text-green-600 dark:text-green-400" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`}>
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{isConfirmed ? "Confirmed — click to unconfirm" : "Click to confirm month"}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })}
            <div className="w-28 flex-shrink-0 text-center px-1 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Variance</div>
          </div>

          {/* Rows by category */}
          {data.categories.map(cat => {
            const catItems = data.items.filter(i => i.categoryId === cat.id);
            if (catItems.length === 0) return null;

            // Category totals
            const catActualPerMonth = months.map(m => catItems.reduce((s, item) => s + (actualMap.get(getActualKey(item.id, viewYear, m)) || 0), 0));
            const catBudgetPerMonth = months.map(() => catItems.reduce((s, i) => s + toMonthlyCents(i), 0));

            return (
              <div key={cat.id}>
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</div>
                  {months.map(m => <div key={m} className="flex-1 min-w-0 h-6" />)}
                  <div className="w-28 flex-shrink-0 h-6" />
                </div>

                {catItems.map(item => {
                  const rowVariance = months.reduce((s, m) => {
                    const actual = actualMap.get(getActualKey(item.id, viewYear, m)) || 0;
                    return s + (actual > 0 ? toMonthlyCents(item) - actual : 0);
                  }, 0);
                  const hasAnyActual = months.some(m => (actualMap.get(getActualKey(item.id, viewYear, m)) || 0) > 0);

                  return (
                    <div key={item.id} className="flex items-center border-b border-border/30 hover-elevate" style={{ height: 32 }}>
                      <div className="w-44 flex-shrink-0 px-3 text-xs truncate">{item.name}</div>
                      {months.map(m => {
                        const cents = actualMap.get(getActualKey(item.id, viewYear, m)) || 0;
                        const budget = toMonthlyCents(item);
                        const over = cents > 0 && budget > 0 && cents > budget * 1.1;
                        return (
                          <div key={m} className={`flex-1 min-w-0 h-full flex items-center ${over ? "bg-destructive/5" : ""}`}>
                            <ActualCell cents={cents} onSave={val => upsertActualMutation.mutate({ itemId: item.id, year: viewYear, month: m, actualCents: val })} />
                          </div>
                        );
                      })}
                      <div className={`w-28 flex-shrink-0 text-right pr-3 text-xs tabular-nums ${hasAnyActual ? variantClass(rowVariance) : "text-muted-foreground/30"}`}>
                        {hasAnyActual ? fmtK(rowVariance) : "—"}
                      </div>
                    </div>
                  );
                })}

                {/* Category subtotal */}
                <div className="flex items-center border-b border-border/40 bg-muted/10 font-medium" style={{ height: 28 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</div>
                  {months.map((m, idx) => (
                    <div key={m} className={`flex-1 min-w-0 text-right pr-1 text-[10px] tabular-nums ${catActualPerMonth[idx] > catBudgetPerMonth[idx] * 1.1 && catActualPerMonth[idx] > 0 ? "text-destructive" : catActualPerMonth[idx] > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>
                      {catActualPerMonth[idx] > 0 ? fmtK(catActualPerMonth[idx]) : "—"}
                    </div>
                  ))}
                  <div className="w-28 flex-shrink-0 text-right pr-3 text-[10px] tabular-nums text-muted-foreground">
                    {catActualPerMonth.some(v => v > 0) ? fmtK(catActualPerMonth.reduce((s, a, i) => s + (a > 0 ? catBudgetPerMonth[i] - a : 0), 0)) : "—"}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Grand totals */}
          <div className="flex items-center border-t-2 border-border bg-muted/30 rounded-b-md font-semibold" style={{ height: 36 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs">Total Actuals</div>
            {months.map((m, idx) => {
              const actual = monthTotals[idx];
              const budget = budgetTotals[idx];
              return (
                <div key={m} className={`flex-1 min-w-0 text-right pr-1 text-xs tabular-nums ${actual > budget * 1.1 && actual > 0 ? "text-destructive" : actual > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {actual > 0 ? fmtK(actual) : "—"}
                </div>
              );
            })}
            <div className="w-28 flex-shrink-0 text-right pr-3 text-xs tabular-nums text-muted-foreground">
              {monthTotals.some(v => v > 0) ? fmtK(varianceTotals.reduce((s, v) => s + v, 0)) : "—"}
            </div>
          </div>

          {/* Budget row */}
          <div className="flex items-center border-t border-border/30" style={{ height: 28 }}>
            <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground uppercase tracking-wide">Budget</div>
            {budgetTotals.map((b, idx) => (
              <div key={idx} className="flex-1 min-w-0 text-right pr-1 text-[10px] text-muted-foreground tabular-nums">{fmtK(b)}</div>
            ))}
            <div className="w-28 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Xero import dialog */}
      <Dialog open={xeroDialogOpen} onOpenChange={setXeroDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import Actuals from Xero — {viewYear}</DialogTitle>
          </DialogHeader>
          {xeroLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-auto flex-1">
              <p className="text-xs text-muted-foreground">
                Match each Xero account to an overhead item. Only mapped rows will be imported.
              </p>
              {xeroMappings.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Info className="w-4 h-4" />
                  No P&L data found for {viewYear}. Ensure Xero is connected and has transactions.
                </div>
              ) : (
                <div className="border border-border/50 rounded-md overflow-hidden">
                  <div className="grid px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <span>Xero Account</span>
                    <span>Map to Overhead Item</span>
                  </div>
                  {xeroMappings.map((row, idx) => (
                    <div key={row.xeroKey} className="grid items-center px-3 py-2 border-t border-border/30" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <p className="text-xs font-medium">{row.xeroAccountName}</p>
                        <p className="text-[10px] text-muted-foreground">{row.xeroKey}</p>
                      </div>
                      <Select
                        value={row.selectedItemId || "none"}
                        onValueChange={v => setXeroMappings(prev => prev.map((r, i) => i === idx ? { ...r, selectedItemId: v === "none" ? "" : v } : r))}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Skip this account" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Skip</SelectItem>
                          {data.items.map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setXeroDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyXeroImport} disabled={xeroLoading || xeroMappings.every(r => !r.selectedItemId) || bulkUpsertMutation.isPending}>
              {bulkUpsertMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Import Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 3: Forecast (12 actuals + 12 forecast) ───────────────────────────────

function ForecastTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const [growthRate, setGrowthRate] = useState("0");

  // Last 12 months
  const last12 = useMemo(() => {
    const months: Array<{ year: number; month: number }> = [];
    let y = curYear; let m = curMonth;
    for (let i = 0; i < 12; i++) {
      months.unshift({ year: y, month: m });
      m--; if (m === 0) { m = 12; y--; }
    }
    return months;
  }, [curYear, curMonth]);

  // Next 12 months
  const next12 = useMemo(() => {
    const months: Array<{ year: number; month: number }> = [];
    let y = curYear; let m = curMonth + 1;
    for (let i = 0; i < 12; i++) {
      if (m > 12) { m = 1; y++; }
      months.push({ year: y, month: m }); m++;
    }
    return months;
  }, [curYear, curMonth]);

  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);

  const forecastQuery = useQuery<OverheadForecastOverride[]>({
    queryKey: ["/api/overheads/forecast"],
  });

  const overrideMap = useMemo(() => buildOverrideMap(forecastQuery.data || []), [forecastQuery.data]);

  const upsertForecastMutation = useMutation({
    mutationFn: ({ itemId, year, month, forecastCents }: { itemId: string; year: number; month: number; forecastCents: number }) =>
      apiRequest("/api/overheads/forecast", "PUT", { itemId, year, month, forecastCents }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads/forecast"] }),
    onError: () => toast({ title: "Failed to save forecast override", variant: "destructive" }),
  });

  const growth = parseFloat(growthRate) / 100;

  // Get projected value for a future month (index 0 = curMonth+1)
  const getForecast = (item: OverheadItem, year: number, month: number, futureIndex: number): number => {
    const key = getActualKey(item.id, year, month);
    if (overrideMap.has(key)) return overrideMap.get(key)!;
    const base = toMonthlyCents(item);
    return Math.round(base * Math.pow(1 + growth, Math.floor(futureIndex / 12) + (growth !== 0 ? 1 : 0)));
  };

  const totalMonthlyBudget = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);

  // Annual forecast = avg of forecasted 12 months
  const annualForecast = useMemo(() => {
    const total = next12.reduce((s, { year, month }, idx) =>
      s + data.items.reduce((si, item) => si + getForecast(item, year, month, idx), 0), 0);
    return total;
  }, [next12, data.items, overrideMap, growth]);

  // Last 12 actual totals per month
  const last12ActualTotals = useMemo(() => last12.map(({ year, month }) =>
    data.items.reduce((s, item) => s + (actualMap.get(getActualKey(item.id, year, month)) || 0), 0)
  ), [last12, data.items, actualMap]);

  const avgActual = useMemo(() => {
    const nonZero = last12ActualTotals.filter(v => v > 0);
    return nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  }, [last12ActualTotals]);

  if (data.categories.length === 0) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Add overhead categories and items in the Register tab first.</CardContent></Card>;
  }

  const splitPoint = 12; // Left = last 12, Right = next 12

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Monthly Budget", value: fmtDollars(totalMonthlyBudget), sub: "Per register" },
          { label: "Avg Monthly Actual", value: avgActual > 0 ? fmtDollars(avgActual) : "—", sub: "Last 12 months" },
          { label: "Annual Budget", value: fmtDollars(totalMonthlyBudget * 12), sub: "Budget × 12" },
          { label: "12-Month Forecast", value: fmtDollars(annualForecast), sub: growth !== 0 ? `Growth: ${growthRate}% p.a.` : "Based on budget + overrides", highlight: annualForecast > totalMonthlyBudget * 12 * 1.05 },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${k.highlight ? "text-destructive" : ""}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Growth rate control */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">Annual cost growth rate:</label>
        <div className="flex items-center gap-1.5">
          <Input type="number" value={growthRate} onChange={e => setGrowthRate(e.target.value)} className="h-7 w-20 text-xs text-right" step="0.5" />
          <span className="text-xs text-muted-foreground">% p.a.</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">Applied to forecast cells without manual overrides</span>
      </div>

      {/* 12+12 grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 1100 }}>
          {/* Header row */}
          <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
            <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Item</div>
            {/* Last 12 actuals */}
            {last12.map(({ year, month }) => (
              <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-[10px] text-muted-foreground/60">{MONTH_NAMES[month - 1]}</p>
                <p className="text-[9px] text-muted-foreground/40">{year}</p>
              </div>
            ))}
            {/* Divider */}
            <div className="w-px bg-[#bba7db]/40 self-stretch mx-0.5" />
            {/* Next 12 forecast */}
            {next12.map(({ year, month }) => (
              <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-center px-0.5 py-2">
                <p className="text-[10px] text-[#bba7db] font-medium">{MONTH_NAMES[month - 1]}</p>
                <p className="text-[9px] text-muted-foreground/40">{year}</p>
              </div>
            ))}
          </div>

          {/* Section labels */}
          <div className="flex border-b border-border/30 bg-muted/10">
            <div className="w-44 flex-shrink-0" />
            <div className="flex-1 text-center text-[9px] uppercase tracking-wide text-muted-foreground/50 py-0.5">← Actuals (last 12 months)</div>
            <div className="w-px bg-[#bba7db]/40" />
            <div className="flex-1 text-center text-[9px] uppercase tracking-wide text-[#bba7db]/60 py-0.5">Forecast (next 12 months) →</div>
          </div>

          {/* Item rows by category */}
          {data.categories.map(cat => {
            const catItems = data.items.filter(i => i.categoryId === cat.id);
            if (catItems.length === 0) return null;

            return (
              <div key={cat.id}>
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</div>
                  {last12.map(({ year, month }) => <div key={`a-${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                  <div className="w-px bg-[#bba7db]/40 self-stretch" />
                  {next12.map(({ year, month }) => <div key={`f-${year}-${month}`} className="flex-1 min-w-0 h-5" />)}
                </div>

                {catItems.map(item => (
                  <div key={item.id} className="flex items-center border-b border-border/30 hover-elevate" style={{ height: 32 }}>
                    <div className="w-44 flex-shrink-0 px-3 text-xs truncate">{item.name}</div>
                    {/* Actuals */}
                    {last12.map(({ year, month }) => {
                      const cents = actualMap.get(getActualKey(item.id, year, month)) || 0;
                      return (
                        <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-right text-xs px-0.5 tabular-nums text-muted-foreground">
                          {cents > 0 ? fmtK(cents) : <span className="text-muted-foreground/20">—</span>}
                        </div>
                      );
                    })}
                    {/* Divider */}
                    <div className="w-px bg-[#bba7db]/30 self-stretch" />
                    {/* Forecast — editable */}
                    {next12.map(({ year, month }, futureIdx) => {
                      const projected = getForecast(item, year, month, futureIdx);
                      const isOverridden = overrideMap.has(getActualKey(item.id, year, month));
                      return (
                        <div key={`f-${year}-${month}`} className={`flex-1 min-w-0 h-full flex items-center ${isOverridden ? "bg-[#bba7db]/5" : ""}`}>
                          <ActualCell
                            cents={projected}
                            onSave={val => upsertForecastMutation.mutate({ itemId: item.id, year, month, forecastCents: val })}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Category subtotals */}
                <div className="flex items-center border-b border-border/30 bg-muted/10" style={{ height: 28 }}>
                  <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground">Subtotal</div>
                  {last12.map(({ year, month }) => {
                    const total = catItems.reduce((s, item) => s + (actualMap.get(getActualKey(item.id, year, month)) || 0), 0);
                    return <div key={`a-${year}-${month}`} className="flex-1 min-w-0 text-right text-[10px] tabular-nums px-0.5 text-muted-foreground">{total > 0 ? fmtK(total) : "—"}</div>;
                  })}
                  <div className="w-px bg-[#bba7db]/30 self-stretch" />
                  {next12.map(({ year, month }, idx) => {
                    const total = catItems.reduce((s, item) => s + getForecast(item, year, month, idx), 0);
                    return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-[10px] tabular-nums px-0.5 text-[#bba7db]/70">{fmtK(total)}</div>;
                  })}
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex items-center border-t-2 border-border bg-muted/30 rounded-b-md font-semibold" style={{ height: 36 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs">Total</div>
            {last12.map(({ year, month }, idx) => (
              <div key={`a-${year}-${month}`} className={`flex-1 min-w-0 text-right text-xs tabular-nums px-0.5 ${last12ActualTotals[idx] > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                {last12ActualTotals[idx] > 0 ? fmtK(last12ActualTotals[idx]) : "—"}
              </div>
            ))}
            <div className="w-px bg-[#bba7db]/40 self-stretch" />
            {next12.map(({ year, month }, idx) => {
              const total = data.items.reduce((s, item) => s + getForecast(item, year, month, idx), 0);
              return <div key={`f-${year}-${month}`} className="flex-1 min-w-0 text-right text-xs tabular-nums px-0.5 text-[#bba7db]">{fmtK(total)}</div>;
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Purple columns show forecast. Click any purple cell to override the projected value. Growth rate adjusts future projections from next month.
      </p>
    </div>
  );
}

// ─── Tab 4: OH Recovery Predictor ────────────────────────────────────────────

interface PipelineJobForm {
  name: string;
  estimatedValue: string;
  probabilityPercent: string;
  expectedStartDate: string;
  notes: string;
}

function OhRecoveryTab({ data }: { data: OverheadsData }) {
  const { toast } = useToast();
  const [targetOhPct, setTargetOhPct] = useState<string>(data.settings?.targetOhPercent || "15");
  const [editingTarget, setEditingTarget] = useState(false);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [editJob, setEditJob] = useState<OhPipelineJob | null>(null);
  const [jobForm, setJobForm] = useState<PipelineJobForm>({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" });

  const pipelineQuery = useQuery<OhPipelineJob[]>({ queryKey: ["/api/overheads/pipeline"] });
  const contractedQuery = useQuery<ContractedProject[]>({ queryKey: ["/api/overheads/predictor/contracted"] });

  const updateSettingsMutation = useMutation({
    mutationFn: (v: string) => apiRequest("/api/overheads/settings", "PUT", { targetOhPercent: v }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); setEditingTarget(false); toast({ title: "OH target saved" }); },
  });

  const addJobMutation = useMutation({
    mutationFn: (f: PipelineJobForm) => apiRequest("/api/overheads/pipeline", "POST", { ...f, estimatedValue: Math.round(parseFloat(f.estimatedValue || "0") * 100) || 0, probabilityPercent: parseInt(f.probabilityPercent) || 100 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }); setAddJobOpen(false); setJobForm({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" }); },
    onError: () => toast({ title: "Failed to add job", variant: "destructive" }),
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: PipelineJobForm }) => apiRequest(`/api/overheads/pipeline/${id}`, "PATCH", { ...f, estimatedValue: Math.round(parseFloat(f.estimatedValue || "0") * 100) || 0, probabilityPercent: parseInt(f.probabilityPercent) || 100 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }); setEditJob(null); },
    onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/pipeline/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }),
    onError: () => toast({ title: "Failed to delete job", variant: "destructive" }),
  });

  const monthlyOh = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const annualOh = monthlyOh * 12;
  const ohPct = parseFloat(targetOhPct) || 15;

  const jobs = pipelineQuery.data || [];
  const contractedProjects = contractedQuery.data || [];

  // Contracted revenue = sum of lockedContractPrice for construction/pre-construction projects (in dollars × 100)
  const totalContractedCents = useMemo(() =>
    contractedProjects.reduce((s, p) => s + Math.round((p.lockedContractPrice || 0) * 100), 0),
    [contractedProjects]);

  // Weighted pipeline = Σ(estimatedValue * probability / 100) — estimatedValue is in cents
  const weightedPipelineCents = useMemo(() =>
    jobs.reduce((s, j) => s + Math.round(j.estimatedValue * j.probabilityPercent / 100), 0),
    [jobs]);

  // Total projected turnover = contracted + weighted pipeline
  const totalProjectedCents = totalContractedCents + weightedPipelineCents;

  // OH recovered from total projected turnover
  const recoveredOhCents = Math.round(totalProjectedCents * ohPct / 100);

  // Breakeven = annual OH / (ohPct / 100)
  const breakevenCents = ohPct > 0 ? Math.round((annualOh / (ohPct / 100))) : 0;

  const shortfallCents = annualOh - recoveredOhCents;
  const isCovered = shortfallCents <= 0;
  const coveragePct = breakevenCents > 0 ? Math.min((totalProjectedCents / breakevenCents) * 100, 150) : 0;
  const trafficColor = isCovered ? "text-green-600 dark:text-green-400" : coveragePct > 60 ? "text-yellow-600 dark:text-yellow-400" : "text-destructive";
  const TrafficIcon = isCovered ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex flex-col gap-4">
      {/* Target + Breakeven */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">OH Recovery Target</CardTitle>
              {editingTarget ? (
                <div className="flex items-center gap-1">
                  <Input autoFocus type="number" value={targetOhPct} onChange={e => setTargetOhPct(e.target.value)} className="h-7 w-20 text-xs text-right" />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button size="icon" variant="ghost" onClick={() => updateSettingsMutation.mutate(targetOhPct)}><Check className="w-3 h-3 text-green-500" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditingTarget(false); setTargetOhPct(data.settings?.targetOhPercent || "15"); }}><X className="w-3 h-3 text-muted-foreground" /></Button>
                </div>
              ) : (
                <button onClick={() => setEditingTarget(true)} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors group/t">
                  {ohPct}% OH margin<Pencil className="w-2.5 h-2.5 opacity-0 group-hover/t:opacity-60 transition-opacity" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-col gap-3">
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
              <CardTitle className="text-sm font-semibold">OH Coverage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Projected Turnover</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(totalProjectedCents)}</p>
                <p className="text-[10px] text-muted-foreground">Contracted + Weighted Pipeline</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">OH Recovered</p>
                <p className={`text-xl font-bold tabular-nums ${trafficColor}`}>{fmtDollars(recoveredOhCents)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isCovered ? `${fmtDollars(-shortfallCents)} surplus` : `${fmtDollars(shortfallCents)} shortfall`}
                </p>
              </div>
            </div>
            <div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isCovered ? "bg-green-500" : coveragePct > 60 ? "bg-yellow-500" : "bg-destructive"}`} style={{ width: `${Math.min(coveragePct, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{coveragePct.toFixed(0)}% of breakeven revenue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contracted Projects */}
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
              <div className="px-4 pb-4 text-xs text-muted-foreground italic">No active (construction / pre-construction) projects with a locked contract price.</div>
            ) : (
              <div>
                <div className="grid px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 80px 100px" }}>
                  <span>Project</span>
                  <span>Status</span>
                  <span className="text-right">Contract</span>
                </div>
                {contractedProjects.map(p => (
                  <div key={p.id} className="grid items-center px-4 py-1.5 border-b border-border/30 hover-elevate" style={{ gridTemplateColumns: "1fr 80px 100px" }}>
                    <span className="text-xs truncate font-medium">{p.name}</span>
                    <Badge variant="secondary" className="text-[10px] no-default-active-elevate w-fit capitalize">{p.projectStatus}</Badge>
                    <span className="text-xs text-right tabular-nums">{p.lockedContractPrice ? fmtDollars(Math.round((p.lockedContractPrice) * 100)) : <span className="text-muted-foreground/40">—</span>}</span>
                  </div>
                ))}
                <div className="grid items-center px-4 py-2 border-t-2 border-border bg-muted/20 font-semibold rounded-b-md" style={{ gridTemplateColumns: "1fr 80px 100px" }}>
                  <span className="text-xs">Total Contracted</span>
                  <span />
                  <span className="text-xs text-right tabular-nums">{fmtDollars(totalContractedCents)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline Jobs */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Pipeline Jobs</CardTitle>
              </div>
              <Button size="sm" onClick={() => { setAddJobOpen(true); setJobForm({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" }); }}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add Job
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {pipelineQuery.isLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : jobs.length === 0 ? (
              <div className="px-4 pb-4 text-xs text-muted-foreground italic">No pipeline jobs yet. Add prospective jobs to see OH recovery forecast.</div>
            ) : (
              <div>
                <div className="grid px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50" style={{ gridTemplateColumns: "1fr 90px 60px 80px 28px" }}>
                  <span>Job</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">Win %</span>
                  <span className="text-right">Weighted</span>
                  <span />
                </div>
                {jobs.map(job => (
                  <div key={job.id} className="grid items-center px-4 py-2 border-b border-border/30 hover-elevate group" style={{ gridTemplateColumns: "1fr 90px 60px 80px 28px" }}>
                    <div>
                      <p className="text-xs font-medium truncate">{job.name}</p>
                      {job.expectedStartDate && <p className="text-[10px] text-muted-foreground">Start: {new Date(job.expectedStartDate).toLocaleDateString("en-AU")}</p>}
                    </div>
                    <span className="text-xs text-right tabular-nums">{fmtDollars(job.estimatedValue)}</span>
                    <span className="text-xs text-right tabular-nums">{job.probabilityPercent}%</span>
                    <span className="text-xs text-right tabular-nums font-medium">{fmtDollars(Math.round(job.estimatedValue * job.probabilityPercent / 100))}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreVertical className="w-3 h-3" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditJob(job); setJobForm({ name: job.name, estimatedValue: (job.estimatedValue / 100).toFixed(0), probabilityPercent: String(job.probabilityPercent), expectedStartDate: job.expectedStartDate || "", notes: job.notes || "" }); }}>
                          <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Delete this job?")) deleteJobMutation.mutate(job.id); }}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                <div className="grid items-center px-4 py-2 border-t-2 border-border bg-muted/20 font-semibold rounded-b-md" style={{ gridTemplateColumns: "1fr 90px 60px 80px 28px" }}>
                  <span className="text-xs">Weighted Total</span>
                  <span className="text-xs text-right tabular-nums">{fmtDollars(jobs.reduce((s, j) => s + j.estimatedValue, 0))}</span>
                  <span />
                  <span className="text-xs text-right tabular-nums">{fmtDollars(weightedPipelineCents)}</span>
                  <span />
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
            <div>
              <p className="text-xs text-muted-foreground">Contracted</p>
              <p className="text-lg font-bold tabular-nums">{fmtDollars(totalContractedCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Weighted Pipeline</p>
              <p className="text-lg font-bold tabular-nums">{fmtDollars(weightedPipelineCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Projected</p>
              <p className="text-lg font-bold tabular-nums">{fmtDollars(totalProjectedCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">OH Recovery @ {ohPct}%</p>
              <p className={`text-lg font-bold tabular-nums ${trafficColor}`}>{fmtDollars(recoveredOhCents)}</p>
              <p className={`text-[10px] ${trafficColor}`}>{isCovered ? `${fmtDollars(-shortfallCents)} above annual OH` : `${fmtDollars(shortfallCents)} below annual OH`}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Job Dialog */}
      <Dialog open={addJobOpen || !!editJob} onOpenChange={v => { if (!v) { setAddJobOpen(false); setEditJob(null); } }}>
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
            <Button variant="ghost" onClick={() => { setAddJobOpen(false); setEditJob(null); }}>Cancel</Button>
            <Button disabled={!jobForm.name.trim()} onClick={() => editJob ? updateJobMutation.mutate({ id: editJob.id, f: jobForm }) : addJobMutation.mutate(jobForm)}>
              {editJob ? "Save Changes" : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type TabId = "register" | "actuals" | "forecast" | "predictor";

const TABS: Array<{ id: TabId; label: string; icon: (p: { className?: string }) => JSX.Element }> = [
  { id: "register", label: "Register", icon: ({ className }) => <Package className={className} /> },
  { id: "actuals",  label: "Monthly Actuals", icon: ({ className }) => <Activity className={className} /> },
  { id: "forecast", label: "Forecast", icon: ({ className }) => <TrendingUp className={className} /> },
  { id: "predictor", label: "OH Predictor", icon: ({ className }) => <Target className={className} /> },
];

export default function BusinessOverheads() {
  const [activeTab, setActiveTab] = useState<TabId>("register");

  const { data, isLoading, error } = useQuery<OverheadsData>({
    queryKey: ["/api/overheads"],
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">Failed to load overhead data.</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-0 border-b border-border/50">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 h-8 text-xs rounded-t-sm transition-colors flex-shrink-0 ${isActive ? "text-[#bba7db] font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              <tab.icon className="w-3 h-3" />
              {tab.label}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db]" />}
            </button>
          );
        })}
      </div>

      {activeTab === "register"  && <RegisterTab data={data} />}
      {activeTab === "actuals"   && <MonthlyActualsTab data={data} />}
      {activeTab === "forecast"  && <ForecastTab data={data} />}
      {activeTab === "predictor" && <OhRecoveryTab data={data} />}
    </div>
  );
}
