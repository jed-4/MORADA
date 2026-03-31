import { useState, useMemo } from "react";
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
  BarChart3,
  TrendingUp,
  Activity,
  Lightbulb,
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
  Zap,
  Target,
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

interface OverheadsData {
  categories: OverheadCategory[];
  items: OverheadItem[];
  actuals: OverheadMonthActual[];
  monthStatuses: OverheadMonthStatus[];
  settings: OhSettings | null;
}

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

// Convert budget cents to monthly equivalent
function toMonthlyCents(item: OverheadItem): number {
  switch (item.frequency) {
    case "weekly": return Math.round(item.budgetCents * 52 / 12);
    case "monthly": return item.budgetCents;
    case "quarterly": return Math.round(item.budgetCents / 3);
    case "annual": return Math.round(item.budgetCents / 12);
  }
}

function getActualKey(itemId: string, year: number, month: number) {
  return `${itemId}__${year}__${month}`;
}

// Build a map from key -> actualCents
function buildActualMap(actuals: OverheadMonthActual[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of actuals) {
    m.set(getActualKey(a.itemId, a.year, a.month), a.actualCents);
  }
  return m;
}

// Build a set of confirmed months
function buildStatusSet(statuses: OverheadMonthStatus[]): Set<string> {
  const s = new Set<string>();
  for (const st of statuses) {
    if (st.confirmedAt) s.add(`${st.year}__${st.month}`);
  }
  return s;
}

// Generate last N months from a reference (year, month inclusive)
function lastNMonths(n: number, refYear: number, refMonth: number): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  let y = refYear;
  let m = refMonth;
  for (let i = 0; i < n; i++) {
    months.unshift({ year: y, month: m });
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return months;
}

// ─── Editable cell for inline month actuals ───────────────────────────────────

function ActualCell({ cents, onSave }: { cents: number; onSave: (val: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const num = parseFloat(draft.replace(/[^0-9.-]/g, ""));
    onSave(isNaN(num) ? 0 : Math.round(num * 100));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="h-full w-full bg-transparent border-0 shadow-none focus:outline-none text-xs text-right tabular-nums px-1"
        defaultValue={cents > 0 ? (cents / 100).toFixed(0) : ""}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(cents > 0 ? (cents / 100).toFixed(0) : ""); setEditing(true); }}
      className="w-full h-full text-right text-xs tabular-nums px-1 text-muted-foreground hover:text-foreground transition-colors border-b border-transparent hover:border-primary/30 cursor-pointer"
    >
      {cents > 0 ? fmtK(cents) : <span className="opacity-30">—</span>}
    </button>
  );
}

// ─── Add Category Dialog ──────────────────────────────────────────────────────

function AddCategoryDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Overhead Category</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Category Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              placeholder="e.g. Staffing, Software, Rent"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Add Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add / Edit Item Dialog ───────────────────────────────────────────────────

interface ItemForm {
  name: string;
  frequency: string;
  budgetCents: string;
  xeroAccountCode: string;
  notes: string;
  categoryId: string;
}

function ItemDialog({
  open,
  onClose,
  onSave,
  categories,
  initial,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: ItemForm) => void;
  categories: OverheadCategory[];
  initial?: Partial<ItemForm>;
  title?: string;
}) {
  const [form, setForm] = useState<ItemForm>({
    name: initial?.name || "",
    frequency: initial?.frequency || "monthly",
    budgetCents: initial?.budgetCents || "",
    xeroAccountCode: initial?.xeroAccountCode || "",
    notes: initial?.notes || "",
    categoryId: initial?.categoryId || categories[0]?.id || "",
  });

  const handleSave = () => {
    if (!form.name.trim() || !form.categoryId) return;
    onSave(form);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title || "Add Overhead Item"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Item Name</Label>
              <Input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Office Rent"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Frequency</Label>
              <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                type="number"
                value={form.budgetCents}
                onChange={e => setForm(f => ({ ...f, budgetCents: e.target.value }))}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Xero Account Code</Label>
              <Input
                value={form.xeroAccountCode}
                onChange={e => setForm(f => ({ ...f, xeroAccountCode: e.target.value }))}
                placeholder="e.g. 420"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="mt-1"
              />
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

// ─── Register Tab ─────────────────────────────────────────────────────────────

function RegisterTab({ data, refetch }: { data: OverheadsData; refetch: () => void }) {
  const { toast } = useToast();
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<OverheadItem | null>(null);
  const [preselectedCategoryId, setPreselectedCategoryId] = useState<string>("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => apiRequest("/api/overheads/categories", "POST", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });

  const createItemMutation = useMutation({
    mutationFn: (form: ItemForm) =>
      apiRequest("/api/overheads/items", "POST", {
        ...form,
        budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to create item", variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: ItemForm }) =>
      apiRequest(`/api/overheads/items/${id}`, "PATCH", {
        ...form,
        budgetCents: Math.round(parseFloat(form.budgetCents || "0") * 100) || 0,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/items/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
  });

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, OverheadItem[]>();
    for (const cat of data.categories) {
      map.set(cat.id, data.items.filter(i => i.categoryId === cat.id));
    }
    return map;
  }, [data.categories, data.items]);

  const grandTotal = useMemo(() => {
    return data.items.reduce((sum, item) => sum + toMonthlyCents(item), 0);
  }, [data.items]);

  const toggleCollapse = (id: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const FREQ_COLORS: Record<string, string> = {
    weekly: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    monthly: "bg-[#bba7db]/10 text-[#8b6db5] dark:text-[#bba7db]",
    quarterly: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    annual: "bg-green-500/10 text-green-700 dark:text-green-400",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Total monthly overhead budget</p>
          <p className="text-2xl font-bold tabular-nums">{fmtDollars(grandTotal)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Item
          </Button>
          <Button size="sm" onClick={() => setAddCatOpen(true)}>
            <FolderPlus className="w-3.5 h-3.5 mr-1" />
            Add Category
          </Button>
        </div>
      </div>

      {data.categories.length === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <Package className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No overhead categories yet.</p>
            <p className="text-xs text-muted-foreground/60">Add categories like Staffing, Software, Rent, then add line items under each.</p>
            <Button size="sm" onClick={() => setAddCatOpen(true)}>
              <FolderPlus className="w-3.5 h-3.5 mr-1" />
              Add First Category
            </Button>
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
                  <button
                    onClick={() => toggleCollapse(cat.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {editingCatId === cat.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editingCatName}
                        onChange={e => setEditingCatName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") updateCategoryMutation.mutate({ id: cat.id, name: editingCatName });
                          if (e.key === "Escape") setEditingCatId(null);
                        }}
                        className="h-6 text-sm py-0 w-48"
                      />
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => updateCategoryMutation.mutate({ id: cat.id, name: editingCatName })}>
                        <Check className="w-3 h-3 text-green-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingCatId(null)}>
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <CardTitle className="text-sm font-semibold">{cat.name}</CardTitle>
                  )}
                  <Badge variant="secondary" className="text-[10px] tabular-nums no-default-active-elevate">
                    {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{fmtDollars(catTotal)}/mo</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost"><MoreVertical className="w-3.5 h-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setPreselectedCategoryId(cat.id);
                        setAddItemOpen(true);
                      }}>
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        Add item to {cat.name}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => { if (confirm(`Delete "${cat.name}" and all its items?`)) deleteCategoryMutation.mutate(cat.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete Category
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>

            {!isCollapsed && (
              <CardContent className="px-0 pb-0">
                {catItems.length === 0 ? (
                  <div className="px-4 pb-3 text-xs text-muted-foreground/60 italic">
                    No items yet —{" "}
                    <button
                      className="text-primary underline underline-offset-2"
                      onClick={() => { setPreselectedCategoryId(cat.id); setAddItemOpen(true); }}
                    >
                      add one
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-border/50">
                    {/* Header row */}
                    <div className="grid px-4 py-1 text-[10px] text-muted-foreground uppercase tracking-wide"
                      style={{ gridTemplateColumns: "1fr 70px 100px 80px 90px 32px" }}>
                      <span>Item</span>
                      <span className="text-right">Freq.</span>
                      <span className="text-right">Budget</span>
                      <span className="text-right">Xero Code</span>
                      <span className="text-right">Monthly Equiv.</span>
                      <span />
                    </div>
                    {catItems.map(item => (
                      <div
                        key={item.id}
                        className="grid items-center px-4 py-1.5 border-t border-border/30 hover-elevate"
                        style={{ gridTemplateColumns: "1fr 70px 100px 80px 90px 32px" }}
                      >
                        <span className="text-xs truncate">{item.name}</span>
                        <div className="flex justify-end">
                          <Badge className={`text-[10px] no-default-active-elevate ${FREQ_COLORS[item.frequency]}`}>
                            {item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)}
                          </Badge>
                        </div>
                        <span className="text-xs text-right tabular-nums">{fmtDollars(item.budgetCents)}</span>
                        <span className="text-xs text-right text-muted-foreground tabular-nums">{item.xeroAccountCode || "—"}</span>
                        <span className="text-xs text-right font-medium tabular-nums">{fmtDollars(toMonthlyCents(item))}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditItem(item)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItemMutation.mutate(item.id); }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                    {/* Add item shortcut */}
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground/50 hover:text-muted-foreground border-t border-border/30 transition-colors"
                      onClick={() => { setPreselectedCategoryId(cat.id); setAddItemOpen(true); }}
                    >
                      <Plus className="w-3 h-3" />
                      Add item
                    </button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Dialogs */}
      <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} onSave={name => createCategoryMutation.mutate(name)} />

      <ItemDialog
        open={addItemOpen}
        onClose={() => { setAddItemOpen(false); setPreselectedCategoryId(""); }}
        onSave={form => createItemMutation.mutate(form)}
        categories={data.categories}
        initial={{ categoryId: preselectedCategoryId || data.categories[0]?.id || "" }}
      />

      {editItem && (
        <ItemDialog
          open={!!editItem}
          title="Edit Overhead Item"
          onClose={() => setEditItem(null)}
          onSave={form => {
            updateItemMutation.mutate({ id: editItem.id, form });
            setEditItem(null);
          }}
          categories={data.categories}
          initial={{
            name: editItem.name,
            frequency: editItem.frequency,
            budgetCents: editItem.budgetCents > 0 ? (editItem.budgetCents / 100).toFixed(0) : "",
            xeroAccountCode: editItem.xeroAccountCode || "",
            notes: editItem.notes || "",
            categoryId: editItem.categoryId,
          }}
        />
      )}
    </div>
  );
}

// ─── Monthly Actuals Tab ──────────────────────────────────────────────────────

function MonthlyActualsTab({ data, refetch }: { data: OverheadsData; refetch: () => void }) {
  const { toast } = useToast();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);
  const statusSet = useMemo(() => buildStatusSet(data.monthStatuses), [data.monthStatuses]);

  const upsertActualMutation = useMutation({
    mutationFn: ({ itemId, year, month, actualCents }: { itemId: string; year: number; month: number; actualCents: number }) =>
      apiRequest("/api/overheads/actuals", "PUT", { itemId, year, month, actualCents }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to save actual", variant: "destructive" }),
  });

  const toggleMonthMutation = useMutation({
    mutationFn: ({ year, month, confirmed }: { year: number; month: number; confirmed: boolean }) =>
      apiRequest("/api/overheads/month-status", "POST", { year, month, confirmed }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads"] }); },
    onError: () => toast({ title: "Failed to update month status", variant: "destructive" }),
  });

  // Totals per month
  const monthTotals = useMemo(() => {
    return months.map(m => {
      let total = 0;
      for (const item of data.items) {
        total += actualMap.get(getActualKey(item.id, viewYear, m)) || 0;
      }
      return total;
    });
  }, [data.items, months, actualMap, viewYear]);

  // Budget monthly
  const budgetTotals = useMemo(() => {
    return months.map(_ => data.items.reduce((s, i) => s + toMonthlyCents(i), 0));
  }, [data.items]);

  if (data.categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add overhead categories and items in the Register tab first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Year nav */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setViewYear(y => y - 1)}>‹ {viewYear - 1}</Button>
          <span className="text-sm font-semibold px-2">{viewYear}</span>
          <Button size="sm" variant="outline" onClick={() => setViewYear(y => y + 1)} disabled={viewYear >= now.getFullYear()}>
            {viewYear + 1} ›
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Click any cell to enter actuals. Confirm months to lock.</p>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 900 }}>
          {/* Header row */}
          <div className="flex border-b border-border/50 bg-muted/30 rounded-t-md">
            <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Item</div>
            {months.map(m => {
              const isConfirmed = statusSet.has(`${viewYear}__${m}`);
              const isCurrentMonth = m === now.getMonth() + 1 && viewYear === now.getFullYear();
              return (
                <div key={m} className="flex-1 min-w-0 text-center px-1 py-2">
                  <p className={`text-[10px] uppercase tracking-wide font-medium ${isCurrentMonth ? "text-[#bba7db]" : "text-muted-foreground"}`}>
                    {MONTH_NAMES[m - 1]}
                  </p>
                  {/* Confirm chip */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleMonthMutation.mutate({ year: viewYear, month: m, confirmed: !isConfirmed })}
                          className={`mt-0.5 w-full flex items-center justify-center text-[9px] transition-colors rounded ${
                            isConfirmed
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground/40 hover:text-muted-foreground/70"
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{isConfirmed ? "Confirmed — click to unconfirm" : "Click to confirm month"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })}
          </div>

          {/* Rows by category */}
          {data.categories.map(cat => {
            const catItems = data.items.filter(i => i.categoryId === cat.id);
            if (catItems.length === 0) return null;

            return (
              <div key={cat.id}>
                {/* Category header */}
                <div className="flex items-center bg-muted/20 border-b border-border/40">
                  <div className="w-44 flex-shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat.name}
                  </div>
                  {months.map(m => (
                    <div key={m} className="flex-1 min-w-0 h-6" />
                  ))}
                </div>

                {/* Item rows */}
                {catItems.map(item => (
                  <div key={item.id} className="flex items-center border-b border-border/30 hover-elevate" style={{ height: 32 }}>
                    <div className="w-44 flex-shrink-0 px-3 text-xs truncate">{item.name}</div>
                    {months.map(m => {
                      const cents = actualMap.get(getActualKey(item.id, viewYear, m)) || 0;
                      const budget = toMonthlyCents(item);
                      const over = cents > 0 && budget > 0 && cents > budget * 1.1;
                      return (
                        <div
                          key={m}
                          className={`flex-1 min-w-0 flex items-center justify-end h-full ${over ? "bg-destructive/5" : ""}`}
                          title={over ? `Over budget (budget: ${fmtDollars(budget)})` : undefined}
                        >
                          <ActualCell
                            cents={cents}
                            onSave={val => upsertActualMutation.mutate({ itemId: item.id, year: viewYear, month: m, actualCents: val })}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Totals row */}
          <div className="flex items-center border-t-2 border-border bg-muted/30 rounded-b-md font-semibold" style={{ height: 36 }}>
            <div className="w-44 flex-shrink-0 px-3 text-xs">Total Actuals</div>
            {months.map((m, idx) => {
              const actual = monthTotals[idx];
              const budget = budgetTotals[idx];
              const over = actual > budget * 1.1 && actual > 0;
              return (
                <div key={m} className={`flex-1 min-w-0 text-right px-1 text-xs tabular-nums ${over ? "text-destructive" : actual > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {actual > 0 ? fmtK(actual) : "—"}
                </div>
              );
            })}
          </div>

          {/* Budget row */}
          <div className="flex items-center border-t border-border/30" style={{ height: 28 }}>
            <div className="w-44 flex-shrink-0 px-3 text-[10px] text-muted-foreground uppercase tracking-wide">Budget</div>
            {budgetTotals.map((b, idx) => (
              <div key={idx} className="flex-1 min-w-0 text-right px-1 text-[10px] text-muted-foreground tabular-nums">
                {fmtK(b)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Forecast Tab ─────────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: OverheadsData }) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // Last 12 months of actuals + next 12 months = budget forecast
  const last12 = useMemo(() => lastNMonths(12, curYear, curMonth), [curYear, curMonth]);
  const next12 = useMemo(() => {
    const months: Array<{ year: number; month: number }> = [];
    let y = curYear;
    let m = curMonth + 1;
    for (let i = 0; i < 12; i++) {
      if (m > 12) { m = 1; y++; }
      months.push({ year: y, month: m });
      m++;
    }
    return months;
  }, [curYear, curMonth]);

  const actualMap = useMemo(() => buildActualMap(data.actuals), [data.actuals]);

  const totalMonthlyBudget = useMemo(() =>
    data.items.reduce((s, i) => s + toMonthlyCents(i), 0),
    [data.items]);

  // 12-month trend — average of actuals that exist
  const actualsForLast12 = useMemo(() => {
    return last12.map(({ year, month }) =>
      data.items.reduce((s, item) => s + (actualMap.get(getActualKey(item.id, year, month)) || 0), 0)
    );
  }, [last12, data.items, actualMap]);

  const avgActual = useMemo(() => {
    const nonZero = actualsForLast12.filter(v => v > 0);
    return nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  }, [actualsForLast12]);

  const annualBudget = totalMonthlyBudget * 12;
  const annualForecast = avgActual > 0 ? avgActual * 12 : annualBudget;

  if (data.categories.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Add overhead categories and items in the Register tab first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">Monthly Budget</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{fmtDollars(totalMonthlyBudget)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Per register</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">Avg. Monthly Actual</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{avgActual > 0 ? fmtDollars(avgActual) : "—"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Last 12 months</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">Annual Budget</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">{fmtDollars(annualBudget)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Budget × 12</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className="text-xs text-muted-foreground">12-Month Forecast</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${annualForecast > annualBudget * 1.05 ? "text-destructive" : ""}`}>
              {fmtDollars(annualForecast)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {avgActual > 0 ? `Avg actual × 12` : "Budget (no actuals yet)"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trend chart — bar chart via CSS */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Actual vs Budget — Last 12 Months</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-end gap-1 h-32">
            {last12.map(({ year, month }, idx) => {
              const actual = actualsForLast12[idx];
              const budget = totalMonthlyBudget;
              const maxVal = Math.max(budget, ...actualsForLast12.filter(v => v > 0)) || 1;
              const actualPct = Math.round((actual / maxVal) * 100);
              const budgetPct = Math.round((budget / maxVal) * 100);
              return (
                <div key={`${year}-${month}`} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 100 }}>
                    {/* Budget bar */}
                    <div className="flex-1 rounded-sm bg-muted/50 transition-all" style={{ height: `${budgetPct}%` }} title={`Budget: ${fmtDollars(budget)}`} />
                    {/* Actual bar */}
                    <div
                      className={`flex-1 rounded-sm transition-all ${actual > budget * 1.1 ? "bg-destructive/60" : actual > 0 ? "bg-[#bba7db]/70" : "bg-transparent"}`}
                      style={{ height: actual > 0 ? `${actualPct}%` : "2px" }}
                      title={`Actual: ${actual > 0 ? fmtDollars(actual) : "None"}`}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{MONTH_NAMES[month - 1]}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-muted/50" /><span className="text-[10px] text-muted-foreground">Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#bba7db]/70" /><span className="text-[10px] text-muted-foreground">Actual</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-destructive/60" /><span className="text-[10px] text-muted-foreground">Over budget</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Next 12 months forecast */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Forecast — Next 12 Months</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {next12.map(({ year, month }) => (
              <div key={`${year}-${month}`} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{MONTH_NAMES[month - 1]} {year !== curYear ? year : ""}</span>
                <span className="text-xs font-semibold tabular-nums">{fmtDollars(totalMonthlyBudget)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">Forecast based on monthly budget. Update actuals to refine predictions.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── OH Recovery Predictor Tab ────────────────────────────────────────────────

function OhRecoveryTab({ data, refetch }: { data: OverheadsData; refetch: () => void }) {
  const { toast } = useToast();
  const [targetOhPct, setTargetOhPct] = useState<string>(data.settings?.targetOhPercent || "15");
  const [editingTarget, setEditingTarget] = useState(false);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const [editJob, setEditJob] = useState<OhPipelineJob | null>(null);
  const [jobForm, setJobForm] = useState({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" });

  const pipelineQuery = useQuery<OhPipelineJob[]>({
    queryKey: ["/api/overheads/pipeline"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (targetOhPercent: string) => apiRequest("/api/overheads/settings", "PUT", { targetOhPercent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads"] });
      setEditingTarget(false);
      toast({ title: "Settings saved" });
    },
  });

  const addJobMutation = useMutation({
    mutationFn: (job: typeof jobForm) => apiRequest("/api/overheads/pipeline", "POST", {
      ...job,
      estimatedValue: Math.round(parseFloat(job.estimatedValue || "0") * 100) || 0,
      probabilityPercent: parseInt(job.probabilityPercent) || 100,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] });
      setAddJobOpen(false);
      setJobForm({ name: "", estimatedValue: "", probabilityPercent: "100", expectedStartDate: "", notes: "" });
    },
    onError: () => toast({ title: "Failed to add job", variant: "destructive" }),
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ id, job }: { id: string; job: typeof jobForm }) => apiRequest(`/api/overheads/pipeline/${id}`, "PATCH", {
      ...job,
      estimatedValue: Math.round(parseFloat(job.estimatedValue || "0") * 100) || 0,
      probabilityPercent: parseInt(job.probabilityPercent) || 100,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] });
      setEditJob(null);
    },
    onError: () => toast({ title: "Failed to update job", variant: "destructive" }),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/overheads/pipeline/${id}`, "DELETE"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/overheads/pipeline"] }); },
    onError: () => toast({ title: "Failed to delete job", variant: "destructive" }),
  });

  const monthlyOh = useMemo(() => data.items.reduce((s, i) => s + toMonthlyCents(i), 0), [data.items]);
  const annualOh = monthlyOh * 12;
  const ohPct = parseFloat(targetOhPct) || 15;

  const jobs = pipelineQuery.data || [];

  // Weighted revenue = sum(value * probability / 100)
  const weightedRevenue = useMemo(() =>
    jobs.reduce((s, j) => s + (j.estimatedValue * j.probabilityPercent / 100), 0),
    [jobs]);

  // Breakeven revenue needed = annualOh / (ohPct / 100)
  const breakevenRevenue = ohPct > 0 ? Math.round(annualOh / (ohPct / 100)) : 0;

  // Recovery if pipeline wins = (weightedRevenue * ohPct / 100)
  const recoveredOh = Math.round(weightedRevenue * ohPct / 100);

  const shortfall = annualOh - recoveredOh;
  const surplusClass = shortfall <= 0 ? "text-green-600 dark:text-green-400" : shortfall > annualOh * 0.3 ? "text-destructive" : "text-yellow-600 dark:text-yellow-400";
  const TrafficIcon = shortfall <= 0 ? CheckCircle2 : shortfall > annualOh * 0.3 ? AlertTriangle : AlertTriangle;

  const pipelinePct = breakevenRevenue > 0 ? Math.min((weightedRevenue / breakevenRevenue) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* OH Target + Breakeven */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">OH Recovery Target</CardTitle>
              {editingTarget ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    type="number"
                    value={targetOhPct}
                    onChange={e => setTargetOhPct(e.target.value)}
                    className="h-7 w-20 text-xs text-right"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button size="icon" variant="ghost" onClick={() => updateSettingsMutation.mutate(targetOhPct)}>
                    <Check className="w-3 h-3 text-green-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditingTarget(false); setTargetOhPct(data.settings?.targetOhPercent || "15"); }}>
                    <X className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <button onClick={() => setEditingTarget(true)} className="flex items-center gap-1 text-sm font-bold hover:text-foreground text-muted-foreground transition-colors group/t">
                  {ohPct}% OH margin
                  <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/t:opacity-60 transition-opacity" />
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
                <p className="text-xl font-bold tabular-nums">{fmtDollars(breakevenRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">To fully recover OH at {ohPct}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <TrafficIcon className={`w-4 h-4 ${surplusClass}`} />
              <CardTitle className="text-sm font-semibold">Pipeline Coverage</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Weighted Pipeline</p>
                <p className="text-xl font-bold tabular-nums">{fmtDollars(weightedRevenue)}</p>
                <p className="text-[10px] text-muted-foreground">Value × win probability</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recovered OH</p>
                <p className={`text-xl font-bold tabular-nums ${surplusClass}`}>{fmtDollars(recoveredOh)}</p>
                <p className="text-[10px] text-muted-foreground">{shortfall <= 0 ? `${fmtDollars(-shortfall)} surplus` : `${fmtDollars(shortfall)} shortfall`}</p>
              </div>
            </div>
            {/* Coverage bar */}
            <div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${shortfall <= 0 ? "bg-green-500" : pipelinePct > 60 ? "bg-yellow-500" : "bg-destructive"}`}
                  style={{ width: `${pipelinePct}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{pipelinePct.toFixed(0)}% of breakeven revenue in pipeline</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline jobs */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">Pipeline Jobs</CardTitle>
            <Button size="sm" onClick={() => setAddJobOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Job
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {pipelineQuery.isLoading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : jobs.length === 0 ? (
            <div className="px-4 pb-4 text-xs text-muted-foreground italic">No pipeline jobs yet. Add jobs to see OH recovery forecast.</div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50"
                style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}>
                <span>Job</span>
                <span className="text-right">Contract Value</span>
                <span className="text-right">Win %</span>
                <span className="text-right">Weighted</span>
                <span />
              </div>
              {jobs.map(job => (
                <div key={job.id} className="grid items-center px-4 py-2 border-b border-border/30 hover-elevate group"
                  style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}>
                  <div>
                    <p className="text-xs font-medium truncate">{job.name}</p>
                    {job.expectedStartDate && (
                      <p className="text-[10px] text-muted-foreground">Start: {new Date(job.expectedStartDate).toLocaleDateString("en-AU")}</p>
                    )}
                  </div>
                  <span className="text-xs text-right tabular-nums">{fmtDollars(job.estimatedValue)}</span>
                  <span className="text-xs text-right tabular-nums">{job.probabilityPercent}%</span>
                  <span className="text-xs text-right tabular-nums font-medium">{fmtDollars(Math.round(job.estimatedValue * job.probabilityPercent / 100))}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditJob(job);
                        setJobForm({
                          name: job.name,
                          estimatedValue: (job.estimatedValue / 100).toFixed(0),
                          probabilityPercent: String(job.probabilityPercent),
                          expectedStartDate: job.expectedStartDate || "",
                          notes: job.notes || "",
                        });
                      }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Delete this job?")) deleteJobMutation.mutate(job.id); }}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {/* Totals */}
              <div className="grid items-center px-4 py-2 border-t-2 border-border bg-muted/30 rounded-b-md font-semibold"
                style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}>
                <span className="text-xs">Total</span>
                <span className="text-xs text-right tabular-nums">{fmtDollars(jobs.reduce((s, j) => s + j.estimatedValue, 0))}</span>
                <span />
                <span className="text-xs text-right tabular-nums">{fmtDollars(weightedRevenue)}</span>
                <span />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Job Dialog */}
      <Dialog open={addJobOpen || !!editJob} onOpenChange={v => { if (!v) { setAddJobOpen(false); setEditJob(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editJob ? "Edit Pipeline Job" : "Add Pipeline Job"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
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
                <Label className="text-xs text-muted-foreground">Expected Start Date</Label>
                <Input type="date" value={jobForm.expectedStartDate} onChange={e => setJobForm(f => ({ ...f, expectedStartDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Input value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddJobOpen(false); setEditJob(null); }}>Cancel</Button>
            <Button
              disabled={!jobForm.name.trim()}
              onClick={() => {
                if (editJob) {
                  updateJobMutation.mutate({ id: editJob.id, job: jobForm });
                } else {
                  addJobMutation.mutate(jobForm);
                }
              }}
            >
              {editJob ? "Save Changes" : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type TabId = "register" | "actuals" | "forecast" | "predictor";

const TABS: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
  { id: "register", label: "Register", icon: Package },
  { id: "actuals", label: "Monthly Actuals", icon: Activity },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "predictor", label: "OH Predictor", icon: Target },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessOverheads() {
  const [activeTab, setActiveTab] = useState<TabId>("register");

  const { data, isLoading, error, refetch } = useQuery<OverheadsData>({
    queryKey: ["/api/overheads"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Failed to load overhead data.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 h-8 text-xs rounded-t-sm transition-colors flex-shrink-0 ${
                isActive
                  ? "text-[#bba7db] font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db]" />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "register" && <RegisterTab data={data} refetch={refetch} />}
      {activeTab === "actuals" && <MonthlyActualsTab data={data} refetch={refetch} />}
      {activeTab === "forecast" && <ForecastTab data={data} />}
      {activeTab === "predictor" && <OhRecoveryTab data={data} refetch={refetch} />}
    </div>
  );
}
