import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Search, Filter, Edit, Trash2, ChevronRight, ChevronDown, Building, Tag, DollarSign, Box, Loader2, ChevronsUpDown, ChevronsDownUp, ToggleLeft, ToggleRight, X, MoreVertical, FolderPlus, Columns3, Upload, Download, FileSpreadsheet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useResizableColumns, ColResizeHandle } from "@/components/useResizableColumns";
import { ImportPriceListDialog } from "@/components/systems/ImportPriceListDialog";
import * as XLSX from "xlsx";
import { EmptyState } from "@/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { PriceListItem, PriceListGroup, Contact, CostCode } from "@shared/schema";
import { formatCents, dollarsToCents, centsToDollars, incGstFromEx, exGstFromInc, toNumber } from "@shared/money";
import { UnitSelect } from "@/components/UnitSelect";

export interface PriceListHandle {
  openAddModal: () => void;
}

type GroupBy = "none" | "group" | "supplier";

const COLUMN_ORDER_KEY = "grid-col-order-v1";

/** Read a saved column order, dropping unknown keys and appending any new ones. */
function loadColumnOrder(namespace: string, defaults: string[]): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) || "{}");
    const saved: unknown = all?.[namespace];
    if (!Array.isArray(saved)) return defaults;
    const known = saved.filter((k): k is string => defaults.includes(k));
    // Columns the saved order predates are spliced in at their catalogue position
    // rather than appended, so enabling one drops it beside its neighbours instead
    // of at the far right. Appending would be tidier to code and worse to use.
    const result = [...known];
    defaults.forEach((k, i) => {
      if (result.includes(k)) return;
      const before = defaults.slice(0, i).reverse().find((d) => result.includes(d));
      result.splice(before ? result.indexOf(before) + 1 : 0, 0, k);
    });
    return result;
  } catch {
    return defaults;
  }
}

function saveColumnOrder(namespace: string, order: string[]) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY) || "{}");
    all[namespace] = order;
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Every column the grid can show. `defaultVisible: false` ones are opt-in via the
 *  column picker — the fields exist on an item but would crowd the default view. */
const GRID_COLUMNS = [
  { key: "name",         label: "Item",        defaultWidth: 260, required: true },
  { key: "code",         label: "SKU",         defaultWidth: 120 },
  { key: "nickname",     label: "Nickname",    defaultWidth: 140, defaultVisible: false },
  { key: "supplier",     label: "Supplier",    defaultWidth: 150, defaultVisible: false },
  { key: "supplierCode", label: "Supplier ref", defaultWidth: 120, defaultVisible: false },
  { key: "brand",        label: "Brand",       defaultWidth: 120, defaultVisible: false },
  { key: "unit",         label: "Unit",        defaultWidth: 80 },
  { key: "cost",         label: "Cost (ex)",   defaultWidth: 110, align: "right" as const },
  { key: "costInc",      label: "Cost (inc)",  defaultWidth: 110, align: "right" as const, defaultVisible: false },
  { key: "sell",         label: "Sell (ex)",   defaultWidth: 110, align: "right" as const },
  { key: "sellInc",      label: "Sell (inc)",  defaultWidth: 110, align: "right" as const, defaultVisible: false },
  { key: "markup",       label: "Markup",      defaultWidth: 90,  align: "right" as const },
  { key: "leadTime",     label: "Lead time",   defaultWidth: 100, align: "right" as const, defaultVisible: false },
];

type GridColumn = (typeof GRID_COLUMNS)[number];

const COLUMN_HIDDEN_KEY = "grid-col-hidden-v1";

/** Hidden-key map per namespace. Absent = fall back to the column's default. */
function loadHiddenColumns(namespace: string): Record<string, boolean> {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_HIDDEN_KEY) || "{}");
    return all?.[namespace] ?? {};
  } catch {
    return {};
  }
}

function saveHiddenColumns(namespace: string, hidden: Record<string, boolean>) {
  try {
    const all = JSON.parse(localStorage.getItem(COLUMN_HIDDEN_KEY) || "{}");
    all[namespace] = hidden;
    localStorage.setItem(COLUMN_HIDDEN_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

interface PriceListProps {
  searchQuery?: string;
  /** The list these items belong to. Omitted = cross-list view (read-only). */
  priceListId?: string;
  /** Drives which columns/fields make sense: a rate card has no lead time. */
  kind?: "supplier" | "labour" | "internal";
  /** Opens the parent page's list-details modal from the overflow menu. */
  onEditList?: () => void;
}

export const PriceList = forwardRef<PriceListHandle, PriceListProps>(({ searchQuery: externalSearch = "", priceListId, kind = "internal", onEditList }, ref) => {
  const { toast } = useToast();
  const [internalSearch, setInternalSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("group");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const searchQuery = externalSearch || internalSearch;

  useImperativeHandle(ref, () => ({
    openAddModal: () => setShowAddModal(true),
  }));

  const { data: items = [], isLoading: isLoadingItems } = useQuery<PriceListItem[]>({
    queryKey: ["/api/price-list/items", priceListId, searchQuery, filterGroup, filterSupplier, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (priceListId) params.set("priceListId", priceListId);
      if (searchQuery) params.set("search", searchQuery);
      if (filterGroup !== "all") params.set("groupId", filterGroup);
      if (filterSupplier !== "all") params.set("supplierId", filterSupplier);
      if (filterStatus !== "all") params.set("isActive", filterStatus === "active" ? "true" : "false");
      return apiRequest(`/api/price-list/items?${params.toString()}`, "GET");
    },
  });

  const { data: priceListGroups = [] } = useQuery<PriceListGroup[]>({
    queryKey: ["/api/price-list/groups", priceListId],
    queryFn: () => apiRequest(
      `/api/price-list/groups${priceListId ? `?priceListId=${priceListId}` : ""}`, "GET"),
  });

  // price_list_items.supplierId FKs contacts.id. The old picker was fed /api/suppliers
  // (the deprecated `suppliers` table), so every saved supplier was a dangling id.
  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "supplier"],
    queryFn: () => apiRequest("/api/contacts?contactType=supplier", "GET"),
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/price-list/items/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete item", description: error.message, variant: "destructive" });
    },
  });

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/price-list/groups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
  };

  const createGroupMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("/api/price-list/groups", "POST", { name, priceListId }),
    onSuccess: () => { invalidateGroups(); toast({ title: "Group added" }); },
    onError: (error: any) =>
      toast({ title: "Failed to add group", description: error.message, variant: "destructive" }),
  });

  const renameGroupMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/price-list/groups/${id}`, "PATCH", { name }),
    onSuccess: () => { invalidateGroups(); toast({ title: "Group renamed" }); },
    onError: (error: any) =>
      toast({ title: "Failed to rename group", description: error.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/price-list/groups/${id}`, "DELETE"),
    onSuccess: () => { invalidateGroups(); toast({ title: "Group deleted", description: "Its items moved to Ungrouped." }); },
    onError: (error: any) =>
      toast({ title: "Failed to delete group", description: error.message, variant: "destructive" }),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest(`/api/price-list/items/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
    },
    onError: (error: any) =>
      toast({ title: "Failed to save", description: error.message, variant: "destructive" }),
  });

  const quickAdd = useMutation({
    mutationFn: ({ name, groupId }: { name: string; groupId: string | null }) =>
      apiRequest("/api/price-list/items", "POST", {
        name, priceListId, groupId, unitType: "ea", costPrice: 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
    },
    onError: (error: any) =>
      toast({ title: "Failed to add item", description: error.message, variant: "destructive" }),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest(`/api/price-list/items/${id}`, "DELETE")));
    },
    onSuccess: (_d, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      setSelected(new Set());
      toast({ title: `${ids.length} item${ids.length === 1 ? "" : "s"} deleted` });
    },
    onError: (error: any) =>
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" }),
  });

  /** Which fields can be typed into directly, and how their text maps to the API. */
  const EDITABLE: Record<string, { get: (i: PriceListItem) => string; toPayload: (v: string) => Record<string, unknown> | null }> = {
    name: { get: (i) => i.name ?? "", toPayload: (v) => (v.trim() ? { name: v.trim() } : null) },
    code: { get: (i) => i.code ?? "", toPayload: (v) => ({ code: v.trim() || null }) },
    nickname: { get: (i) => i.nickname ?? "", toPayload: (v) => ({ nickname: v.trim() || null }) },
    supplierCode: { get: (i) => i.supplierCode ?? "", toPayload: (v) => ({ supplierCode: v.trim() || null }) },
    brand: { get: (i) => i.brand ?? "", toPayload: (v) => ({ brand: v.trim() || null }) },
    unit: { get: (i) => i.unitType ?? "", toPayload: (v) => (v.trim() ? { unitType: v.trim() } : null) },
    // Typed in dollars, stored in cents — the boundary that caused the original bug.
    cost: { get: (i) => (i.costPrice ? String(centsToDollars(i.costPrice)) : ""), toPayload: (v) => ({ costPrice: v.trim() ? dollarsToCents(v) : 0 }) },
    sell: { get: (i) => (i.sellPrice ? String(centsToDollars(i.sellPrice)) : ""), toPayload: (v) => ({ sellPrice: v.trim() ? dollarsToCents(v) : null }) },
    leadTime: { get: (i) => (i.leadTimeDays ? String(i.leadTimeDays) : ""), toPayload: (v) => ({ leadTimeDays: v.trim() ? parseInt(v, 10) : null }) },
  };

  const beginEdit = (item: PriceListItem, key: string) => {
    if (!EDITABLE[key]) return;
    setEditing({ id: item.id, key });
    setDraftValue(EDITABLE[key].get(item));
  };

  const commitEdit = (item: PriceListItem) => {
    if (!editing) return;
    const spec = EDITABLE[editing.key];
    setEditing(null);
    if (!spec) return;
    if (draftValue === spec.get(item)) return;   // untouched — don't burn a request
    const payload = spec.toPayload(draftValue);
    if (payload) patchItem.mutate({ id: item.id, data: payload });
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    if (groupBy === "group") {
      priceListGroups.forEach((g) => allIds.add(g.id));
      allIds.add("ungrouped");
    } else if (groupBy === "supplier") {
      items.forEach((i) => allIds.add(i.supplierId || "no-supplier"));
    }
    setExpandedGroups(allIds);
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const groupedItems = () => {
    if (groupBy === "none") {
      return [{ id: "all", name: "All Items", colour: null, items }];
    }

    if (groupBy === "group") {
      const grouped = new Map<string, PriceListItem[]>();
      // Show every group in the list, even empty ones — an empty section is a
      // place to drop items into, not something to hide.
      priceListGroups.forEach((g) => grouped.set(g.id, []));
      items.forEach((item) => {
        const key = item.groupId && grouped.has(item.groupId) ? item.groupId : "ungrouped";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
      });

      const ordered = [
        ...priceListGroups.map((g) => ({
          id: g.id, name: g.name, colour: g.colour ?? null, items: grouped.get(g.id) ?? [],
        })),
        ...(grouped.has("ungrouped")
          ? [{ id: "ungrouped", name: "Ungrouped", colour: null, items: grouped.get("ungrouped")! }]
          : []),
      ];
      return ordered;
    }

    if (groupBy === "supplier") {
      const grouped = new Map<string, PriceListItem[]>();
      items.forEach((item) => {
        const key = item.supplierId || "no-supplier";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
      });

      return Array.from(grouped.entries()).map(([key, groupItems]) => {
        const supplier = suppliers.find((s) => s.id === key);
        return {
          id: key,
          name: supplier?.name || "No Supplier",
          colour: null,
          items: groupItems,
        };
      });
    }

    return [];
  };

  // costPrice/sellPrice are integer CENTS. These used to parseFloat and format the raw
  // value as dollars, so a stored 1250 rendered as $1,250.00 instead of $12.50.
  // shared/money.ts is the only sanctioned formatter (see CLAUDE.md).
  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return "-";
    return formatCents(cents);
  };

  const formatCurrencyIncGst = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return "-";
    return formatCents(incGstFromEx(cents));
  };

  const renderCell = (key: string, item: PriceListItem) => {
    switch (key) {
      case "name":
        return (
          <>
            <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
            {item.nickname && (
              <p className="text-[10px] text-muted-foreground truncate">{item.nickname}</p>
            )}
          </>
        );
      case "code":
        return <p className="text-[11px] text-muted-foreground truncate">{item.code || "—"}</p>;
      case "nickname":
        return <p className="text-[11px] text-muted-foreground truncate">{item.nickname || "—"}</p>;
      case "supplier":
        return (
          <p className="text-[11px] text-muted-foreground truncate">
            {suppliers.find((sp) => sp.id === item.supplierId)?.name || "—"}
          </p>
        );
      case "supplierCode":
        return <p className="text-[11px] text-muted-foreground truncate">{item.supplierCode || "—"}</p>;
      case "brand":
        return <p className="text-[11px] text-muted-foreground truncate">{item.brand || "—"}</p>;
      case "unit":
        return <p className="text-[11px] text-muted-foreground truncate">{item.unitType || "—"}</p>;
      case "costInc":
        return (
          <p className="text-xs text-muted-foreground text-right tabular-nums">
            {item.costPrice ? formatCents(incGstFromEx(item.costPrice)) : "—"}
          </p>
        );
      case "sellInc":
        return (
          <p className="text-xs text-muted-foreground text-right tabular-nums">
            {item.sellPrice ? formatCents(incGstFromEx(item.sellPrice)) : "—"}
          </p>
        );
      case "leadTime":
        return (
          <p className="text-[11px] text-muted-foreground text-right tabular-nums">
            {item.leadTimeDays ? `${item.leadTimeDays}d` : "—"}
          </p>
        );
      case "cost":
        return <p className="text-xs text-foreground text-right tabular-nums">{formatCurrency(item.costPrice)}</p>;
      case "sell":
        return <p className="text-xs text-foreground text-right tabular-nums">{formatCurrency(item.sellPrice)}</p>;
      case "markup":
        return (
          <p className="text-[11px] text-muted-foreground text-right tabular-nums">
            {getMarkup(item.costPrice, item.sellPrice)}
          </p>
        );
      default:
        return null;
    }
  };

  const getMarkup = (cost: string | number | null, sell: string | number | null) => {
    if (!cost || !sell) return "-";
    const costNum = typeof cost === "string" ? parseFloat(cost) : cost;
    const sellNum = typeof sell === "string" ? parseFloat(sell) : sell;
    if (costNum === 0) return "-";
    const markup = ((sellNum - costNum) / costNum) * 100;
    return `${markup.toFixed(1)}%`;
  };

  const groups = useMemo(() => groupedItems(), [groupBy, items, priceListGroups, suppliers]);

  // Recalibrate expandedGroups when groups change
  useEffect(() => {
    if (groupBy === "none") return;
    const currentGroupIds = new Set(groups.map(g => g.id));
    // Remove any expanded groups that no longer exist
    setExpandedGroups(prev => {
      const filtered = new Set([...prev].filter(id => currentGroupIds.has(id)));
      return filtered.size !== prev.size ? filtered : prev;
    });
  }, [groups, groupBy]);

  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => loadColumnOrder("price-list", GRID_COLUMNS.map((c) => c.key)),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Which cell is open for editing, and the text currently in it. */
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  /** Per-group "type a name to add an item" row. */
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  /** Groups whose blank add-row is currently open. */
  const [addingIn, setAddingIn] = useState<Set<string>>(new Set());
  const openAddRow = (groupId: string) =>
    setAddingIn((prev) => new Set(prev).add(groupId));
  const closeAddRow = (groupId: string) =>
    setAddingIn((prev) => { const next = new Set(prev); next.delete(groupId); return next; });

  const [hiddenColumns, setHiddenColumns] = useState<Record<string, boolean>>(
    () => loadHiddenColumns("price-list"),
  );

  const isColumnVisible = (c: GridColumn) =>
    hiddenColumns[c.key] ?? (c.defaultVisible !== false);

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const col = GRID_COLUMNS.find((c) => c.key === key);
      if (!col || col.required) return prev;
      const current = prev[key] ?? (col.defaultVisible !== false);
      const next = { ...prev, [key]: !current };
      saveHiddenColumns("price-list", next);
      return next;
    });
  };

  const orderedColumns = useMemo(
    () => columnOrder
      .map((k) => GRID_COLUMNS.find((c) => c.key === k))
      .filter((c): c is GridColumn => !!c)
      // A supplier list's rows all carry the list's own supplier — never useful here.
      .filter((c) => !(kind === "supplier" && c.key === "supplier"))
      .filter((c) => hiddenColumns[c.key] ?? (c.defaultVisible !== false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnOrder, hiddenColumns, kind],
  );

  const moveColumn = (from: string, toIndex: number) => {
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== from);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, from);
      saveColumnOrder("price-list", next);
      return next;
    });
  };

  /** Drag a header cell sideways to reorder; drop index comes from cumulative widths. */
  const startColumnDrag = (key: string, e: React.MouseEvent) => {
    const row = e.currentTarget.parentElement as HTMLElement | null;
    if (!row) return;
    e.preventDefault();
    setDragKey(key);
    const targetIndex = { current: columnOrder.indexOf(key) };

    const onMove = (ev: MouseEvent) => {
      const cells = Array.from(
        row.querySelectorAll<HTMLElement>('[data-testid^="col-header-"]'),
      );
      if (cells.length === 0) return;
      let idx = cells.length - 1;
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) { idx = i; break; }
      }
      targetIndex.current = idx;
      setHoverIndex(idx);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      moveColumn(key, targetIndex.current);
      setDragKey(null);
      setHoverIndex(null);
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Trailing 72px is the fixed (non-draggable) actions cell.
  const gridCols = useResizableColumns("price-list", orderedColumns, 72);
  const gridTemplate = `32px ${gridCols.gridTemplate}`;

  /** Export the list as .xlsx using the same headers the importer expects, so a
   *  round trip works without remapping. Money is written in dollars. */
  /** The importer's headers and nothing else. json_to_sheet on an empty array
   *  writes no headers at all (range A1), so the row is built explicitly with
   *  aoa_to_sheet. Deliberately no example row — a template that ships with a
   *  product in it gets imported as one. */
  const exportTemplate = () => {
    const headers = [
      "Item name", "SKU", "Group", "Unit",
      "Cost (ex GST)", "Sell (ex GST)",
      "Nickname", "Description", "Supplier ref", "Brand", "Lead time (days)",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price list");
    XLSX.writeFile(wb, "price-list-template.xlsx");
  };

  const exportXlsx = () => {
    const groupName = new Map(priceListGroups.map((g) => [g.id, g.name]));
    const rows = items.map((i) => ({
      "Item name": i.name,
      SKU: i.code ?? "",
      Group: i.groupId ? (groupName.get(i.groupId) ?? "") : "",
      Unit: i.unitType ?? "",
      "Cost (ex GST)": i.costPrice ? centsToDollars(i.costPrice) : 0,
      "Sell (ex GST)": i.sellPrice ? centsToDollars(i.sellPrice) : "",
      Nickname: i.nickname ?? "",
      Description: i.description ?? "",
      "Supplier ref": i.supplierCode ?? "",
      Brand: i.brand ?? "",
      "Lead time (days)": i.leadTimeDays ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price list");
    XLSX.writeFile(wb, `price-list-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const activeFilterCount =
    (filterGroup !== "all" ? 1 : 0) +
    (filterSupplier !== "all" ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0);

  const allExpanded = groups.length > 0 && groups.every(g => expandedGroups.has(g.id));
  
  const toggleExpandCollapse = () => {
    if (allExpanded) {
      collapseAll();
    } else {
      // Expand all current groups
      setExpandedGroups(new Set(groups.map(g => g.id)));
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="price-list">
      {/* Grid toolbar — second row inside the page card. Filters collapse behind a
          single control with a count badge, matching Tasks. */}
      <div className="h-9 flex items-center justify-between px-4 gap-2 flex-shrink-0">
        {selected.size > 0 ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <button
              onClick={() => {
                if (window.confirm(`Delete ${selected.size} item${selected.size === 1 ? "" : "s"}?`)) {
                  bulkDelete.mutate(Array.from(selected));
                }
              }}
              className="h-6 px-2 text-xs rounded-md border border-border/50 text-destructive hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="button-bulk-delete"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="h-6 px-2 text-xs rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
              data-testid="button-clear-selection"
            >
              Clear
            </button>
          </div>
        ) : (
        <div className="flex items-center gap-1 min-w-0">
          {groupBy !== "none" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleExpandCollapse}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-toggle-expand"
                  aria-label={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? <ChevronsDownUp className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{allExpanded ? "Collapse all" : "Expand all"}</TooltipContent>
            </Tooltip>
          )}

          <div className="relative w-44 flex-shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search items..."
              value={internalSearch}
              onChange={(e) => setInternalSearch(e.target.value)}
              className="h-6 pl-7 pr-6 py-0 text-xs border bg-transparent"
              data-testid="input-search-items"
            />
            {internalSearch && (
              <button
                onClick={() => setInternalSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                      activeFilterCount > 0
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "border-border/50 text-muted-foreground"
                    }`}
                    data-testid="button-filter-items"
                    aria-label="Filter"
                  >
                    <Filter className="h-3 w-3" />
                    {activeFilterCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                        data-testid="badge-item-filter-count"
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter</TooltipContent>
            </Tooltip>

            <PopoverContent align="start" className="w-56 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Group</Label>
                <Select value={filterGroup} onValueChange={setFilterGroup}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-filter-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {priceListGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* A supplier list IS one supplier — filtering by it would be a no-op. */}
              {kind !== "supplier" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Supplier</Label>
                  <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-filter-supplier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All suppliers</SelectItem>
                      {suppliers.map((sup) => (
                        <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs text-muted-foreground">Group by</Label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-group-by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setFilterGroup("all"); setFilterSupplier("all"); setFilterStatus("all"); }}
                  className="w-full h-6 text-xs rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-clear-item-filters"
                >
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                    data-testid="button-columns"
                    aria-label="Columns"
                  >
                    <Columns3 className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Columns</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 p-1">
              <div className="px-1.5 pt-1 text-sm font-semibold">Columns</div>
              <p className="px-1.5 pb-2 text-xs text-muted-foreground">Toggle to show or hide.</p>
              <div className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
                {GRID_COLUMNS
                  .filter((c) => !(kind === "supplier" && c.key === "supplier"))
                  .map((c) => (
                    <div
                      key={c.key}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded-md ${
                        c.required ? "opacity-50" : "hover:bg-muted cursor-pointer"
                      }`}
                      onClick={() => !c.required && toggleColumn(c.key)}
                      data-testid={`column-toggle-${c.key}`}
                    >
                      <Checkbox
                        checked={isColumnVisible(c)}
                        disabled={c.required}
                        onCheckedChange={() => !c.required && toggleColumn(c.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      />
                      <span className="truncate text-sm flex-1">{c.label || c.key}</span>
                    </div>
                  ))}
              </div>
            </PopoverContent>
          </Popover>

          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowAddModal(true)}
            data-testid="button-add-price-list-item"
          >
            <Plus className="w-3 h-3" />
            <span>Add Item</span>
          </button>

          {/* Everything that isn't the primary action lives here rather than as a
              loose button under the last group. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                data-testid="button-list-overflow"
                aria-label="More actions"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {priceListId && (
                <DropdownMenuItem
                  onClick={() => {
                    const name = window.prompt("New group name")?.trim();
                    if (name) createGroupMutation.mutate(name);
                  }}
                  data-testid="button-add-group"
                >
                  <FolderPlus className="h-3 w-3 mr-2" />
                  Add group
                </DropdownMenuItem>
              )}
              {priceListId && (
                <DropdownMenuItem onClick={() => setShowImport(true)} data-testid="button-import-items">
                  <Upload className="h-3 w-3 mr-2" />
                  Import from spreadsheet
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={exportXlsx}
                disabled={items.length === 0}
                data-testid="button-export-items"
              >
                <Download className="h-3 w-3 mr-2" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportTemplate} data-testid="button-export-template">
                <FileSpreadsheet className="h-3 w-3 mr-2" />
                Download import template
              </DropdownMenuItem>
              {onEditList && (
                <DropdownMenuItem onClick={onEditList} data-testid="button-edit-list-details">
                  <Edit className="h-3 w-3 mr-2" />
                  List details
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Each group is its own section card on the page ground — same shape as the
          bills / timesheets sections on an allowance. The old single full-bleed
          white panel read as one big slab against the cream page. */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {isLoadingItems ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 && priceListGroups.length === 0 ? (
          <EmptyState
            variant="card"
            icon={Box}
            title="No price list items yet"
            description="Add your first item to start building your price list."
            action={{
              label: "Add Item",
              icon: Plus,
              onClick: () => setShowAddModal(true),
              "data-testid": "button-add-first-item",
            }}
          />
        ) : (
          <>
            {groups.map((group) => {
              const expanded = groupBy === "none" || expandedGroups.has(group.id);
              return (
                <div
                  key={group.id}
                  className="bg-card rounded-md border border-border overflow-hidden"
                  style={{ boxShadow: "var(--shadow-card)" }}
                  data-testid={`section-group-${group.id}`}
                >
                  <div className="px-4 py-3">
                    <div className="group/hdr flex items-center justify-between gap-2">
                      <button
                        onClick={() => groupBy !== "none" && toggleGroup(group.id)}
                        className="flex items-center gap-2 min-w-0 text-left"
                        data-testid={`button-toggle-group-${group.id}`}
                      >
                        {groupBy !== "none" && (
                          expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {/* Only drawn when the group actually has a colour set — an
                                accent every group shares tells you nothing. */}
                            {group.colour && (
                              <span
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ background: group.colour }}
                                aria-hidden="true"
                              />
                            )}
                            <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                          </div>
                        </div>
                      </button>

                      {groupBy === "group" && group.id !== "ungrouped" && (
                        <div className="flex items-center gap-1 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const name = window.prompt("Rename group", group.name)?.trim();
                              if (name && name !== group.name) renameGroupMutation.mutate({ id: group.id, name });
                            }}
                            data-testid={`button-rename-group-${group.id}`}
                            aria-label="Rename group"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => {
                              const msg = group.items.length
                                ? `Delete "${group.name}"? Its ${group.items.length} items move to Ungrouped.`
                                : `Delete "${group.name}"?`;
                              if (window.confirm(msg)) deleteGroupMutation.mutate(group.id);
                            }}
                            data-testid={`button-delete-group-${group.id}`}
                            aria-label="Delete group"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {expanded && (
                      <div className="mt-3 border-t border-border overflow-x-auto dt-autohide-scrollbar">
                        <div style={{ minWidth: gridCols.minWidth + 32 }}>
                          {/* column labels */}
                          <div
                            className="grid text-[9px] font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border gap-2"
                            style={{ gridTemplateColumns: gridTemplate }}
                          >
                            <span className="flex items-center justify-center">
                              <Checkbox
                                checked={group.items.length > 0 && group.items.every((i) => selected.has(i.id))}
                                onCheckedChange={(v) => setSelected((prev) => {
                                  const next = new Set(prev);
                                  group.items.forEach((i) => v ? next.add(i.id) : next.delete(i.id));
                                  return next;
                                })}
                                aria-label="Select all in group"
                                data-testid={`select-all-${group.id}`}
                              />
                            </span>
                            {orderedColumns.map((c, idx) => (
                              <span
                                key={c.key}
                                onMouseDown={(e) => startColumnDrag(c.key, e)}
                                className={`relative cursor-grab active:cursor-grabbing select-none ${
                                  c.align === "right" ? "text-right" : ""
                                } ${dragKey === c.key ? "opacity-40" : ""} ${
                                  dragKey && hoverIndex === idx && dragKey !== c.key
                                    ? "before:absolute before:-left-1 before:top-0 before:bottom-0 before:w-[2px] before:bg-primary"
                                    : ""
                                }`}
                                title="Drag to reorder"
                                data-testid={`col-header-${c.key}`}
                              >
                                {c.label}
                                <ColResizeHandle
                                  testId={`resize-${c.key}`}
                                  onStart={(e) => gridCols.startResize(c.key, e.clientX, gridCols.widthFor(c.key, c.defaultWidth))}
                                />
                              </span>
                            ))}
                            <span />
                          </div>

                          {group.items.length === 0 ? null : (
                            group.items.map((item) => (
                              <div
                                key={item.id}
                                className={`group/row grid items-center py-2.5 border-b border-border gap-2 rounded-sm ${
                                  editing?.id === item.id ? "bg-primary/[0.04]" : "hover:bg-muted/30"
                                }`}
                                style={{ gridTemplateColumns: gridTemplate }}
                                data-testid={`row-item-${item.id}`}
                              >
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    checked={selected.has(item.id)}
                                    onCheckedChange={(v) => setSelected((prev) => {
                                      const next = new Set(prev);
                                      v ? next.add(item.id) : next.delete(item.id);
                                      return next;
                                    })}
                                    aria-label={`Select ${item.name}`}
                                    data-testid={`select-row-${item.id}`}
                                  />
                                </div>
                                {/* Cells follow the header order, so reordering moves both. */}
                                {orderedColumns.map((c) => {
                                  const isEditing = editing?.id === item.id && editing.key === c.key;
                                  if (isEditing) {
                                    return (
                                      <div
                                        key={c.key}
                                        className="min-w-0 ring-1 ring-inset ring-primary/60 rounded-[2px]"
                                      >
                                        <Input
                                          // Focus AND select on mount. autoFocus paired with
                                          // onFocus proved unreliable here — the element ends
                                          // up focused but the selection never lands — so the
                                          // mount ref does both explicitly.
                                          ref={(el) => { if (el) { el.focus(); el.select(); } }}
                                          value={draftValue}
                                          onChange={(e) => setDraftValue(e.target.value)}
                                          onBlur={() => commitEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); commitEdit(item); }
                                            if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                                          }}
                                          className={`h-6 px-1 py-0 text-xs bg-transparent border-0 shadow-none focus-visible:ring-0 ${c.align === "right" ? "text-right" : ""}`}
                                          data-testid={`edit-${c.key}-${item.id}`}
                                        />
                                      </div>
                                    );
                                  }
                                  return (
                                    <div
                                      key={c.key}
                                      className={`min-w-0 rounded-sm ${
                                        EDITABLE[c.key]
                                          ? "border-b border-transparent hover:border-primary/30 transition-colors cursor-pointer"
                                          : ""
                                      }`}
                                      onClick={() => beginEdit(item, c.key)}
                                      data-testid={`cell-${c.key}-${item.id}`}
                                    >
                                      {renderCell(c.key, item)}
                                    </div>
                                  );
                                })}
                                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setEditingItem(item)}
                                    data-testid={`button-edit-${item.id}`}
                                    aria-label="Edit item"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => {
                                      if (window.confirm(`Delete "${item.name}"?`)) deleteMutation.mutate(item.id);
                                    }}
                                    data-testid={`button-delete-${item.id}`}
                                    aria-label="Delete item"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}

                          {/* One affordance: the blank row only exists once asked for. */}
                          {priceListId && (
                            addingIn.has(group.id) ? (
                              <div
                                className="grid items-center py-1.5 gap-2"
                                style={{ gridTemplateColumns: gridTemplate }}
                              >
                                <span />
                                <Input
                                  autoFocus
                                  value={newRow[group.id] ?? ""}
                                  onChange={(e) => setNewRow((p) => ({ ...p, [group.id]: e.target.value }))}
                                  onBlur={() => {
                                    const name = (newRow[group.id] ?? "").trim();
                                    if (name) {
                                      quickAdd.mutate({ name, groupId: group.id === "ungrouped" ? null : group.id });
                                      setNewRow((p) => ({ ...p, [group.id]: "" }));
                                    }
                                    closeAddRow(group.id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      setNewRow((p) => ({ ...p, [group.id]: "" }));
                                      closeAddRow(group.id);
                                      return;
                                    }
                                    if (e.key !== "Enter") return;
                                    e.preventDefault();
                                    const name = (newRow[group.id] ?? "").trim();
                                    if (!name) { closeAddRow(group.id); return; }
                                    quickAdd.mutate({ name, groupId: group.id === "ungrouped" ? null : group.id });
                                    // Stay open so a run of items can be typed in one go.
                                    setNewRow((p) => ({ ...p, [group.id]: "" }));
                                  }}
                                  placeholder="Item name, then Enter"
                                  className="h-6 px-1 py-0 text-xs border-0 bg-transparent placeholder:text-muted-foreground/60 focus-visible:ring-0"
                                  data-testid={`input-new-item-${group.id}`}
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => openAddRow(group.id)}
                                className="mt-1 flex items-center gap-1 px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                                data-testid={`button-add-item-${group.id}`}
                              >
                                <Plus className="h-3 w-3" />
                                Add an item
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          </>
        )}
      </div>

      {priceListId && (
        <ImportPriceListDialog
          open={showImport}
          onOpenChange={setShowImport}
          priceListId={priceListId}
        />
      )}

      <PriceListItemModal
        open={showAddModal || !!editingItem}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddModal(false);
            setEditingItem(null);
          }
        }}
        item={editingItem}
        groups={priceListGroups}
        suppliers={suppliers}
        costCodes={costCodes}
        priceListId={priceListId}
        kind={kind}
      />
    </div>
  );
});

PriceList.displayName = "PriceList";

interface PriceListItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceListItem | null;
  groups: PriceListGroup[];
  suppliers: Contact[];
  costCodes: CostCode[];
  priceListId?: string;
  kind: "supplier" | "labour" | "internal";
}

function PriceListItemModal({ open, onOpenChange, item, groups, suppliers, costCodes, priceListId, kind }: PriceListItemModalProps) {
  const { toast } = useToast();
  const isEditing = !!item;
  const [enterIncGst, setEnterIncGst] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    code: "",
    description: "",
    groupId: "",
    costCodeId: "",
    unitType: "each",
    costPrice: "",
    sellPrice: "",
    markupPercent: "",
    supplierId: "",
    supplierCode: "",
    leadTimeDays: "",
    brand: "",
    imageUrl: "",
    tags: "",
    notes: "",
    isActive: true,
  });

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };
      
      if (field === "costPrice" && prev.markupPercent && value) {
        const cost = parseFloat(value as string);
        const markup = parseFloat(prev.markupPercent);
        if (!isNaN(cost) && !isNaN(markup)) {
          newData.sellPrice = (cost * (1 + markup / 100)).toFixed(2);
        }
      }
      
      if (field === "markupPercent" && prev.costPrice && value) {
        const cost = parseFloat(prev.costPrice);
        const markup = parseFloat(value as string);
        if (!isNaN(cost) && !isNaN(markup)) {
          newData.sellPrice = (cost * (1 + markup / 100)).toFixed(2);
        }
      }
      
      return newData;
    });
  };

  useEffect(() => {
    if (open) {
      setEnterIncGst(false);
      if (item) {
        setFormData({
          name: item.name || "",
          nickname: item.nickname || "",
          code: item.code || "",
          description: item.description || "",
          groupId: item.groupId || "",
          unitType: item.unitType || "each",
          costPrice: item.costPrice ? String(centsToDollars(item.costPrice)) : "",
          sellPrice: item.sellPrice ? String(centsToDollars(item.sellPrice)) : "",
          markupPercent: item.markupPercent || "",
          supplierId: item.supplierId || "",
          costCodeId: item.costCodeId || "",
          supplierCode: item.supplierCode || "",
          leadTimeDays: item.leadTimeDays?.toString() || "",
          brand: item.brand || "",
          imageUrl: item.imageUrl || "",
          tags: (item.tags as string[] || []).join(", "),
          notes: item.notes || "",
          isActive: item.isActive ?? true,
        });
        setShowMore(false);
      } else {
        setFormData({
          name: "",
          nickname: "",
          code: "",
          description: "",
          groupId: "",
          costCodeId: "",
          unitType: "each",
          costPrice: "",
          sellPrice: "",
          markupPercent: "",
          supplierId: "",
          supplierCode: "",
          leadTimeDays: "",
          brand: "",
          imageUrl: "",
          tags: "",
          notes: "",
          isActive: true,
        });
        setShowMore(false);
      }
    }
  }, [open, item]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/price-list/items", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: "Item created successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create item", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/price-list/items/${item?.id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      toast({ title: "Item updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const data = {
      // The list this item belongs to — required by the server.
      ...(priceListId ? { priceListId } : {}),
      name: formData.name,
      nickname: formData.nickname || null,
      code: formData.code || null,
      description: formData.description || null,
      groupId: formData.groupId || null,
      costCodeId: formData.costCodeId || null,
      unitType: formData.unitType || "each",
      // Dollars in the form, integer CENTS on the wire. Sending "12.50" to an integer
      // column was a hard Postgres 22P02 reject; "12" silently stored 12 cents.
      costPrice: formData.costPrice ? dollarsToCents(formData.costPrice) : 0,
      sellPrice: formData.sellPrice ? dollarsToCents(formData.sellPrice) : null,
      markupPercent: formData.markupPercent || null,
      supplierId: formData.supplierId || null,
      supplierCode: formData.supplierCode || null,
      leadTimeDays: formData.leadTimeDays ? parseInt(formData.leadTimeDays) : null,
      brand: formData.brand || null,
      imageUrl: formData.imageUrl || null,
      tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
      notes: formData.notes || null,
      isActive: formData.isActive,
    };

    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const [showMore, setShowMore] = useState(false);
  
  const calculatedMarkup = formData.costPrice && formData.sellPrice
    ? (((parseFloat(formData.sellPrice) - parseFloat(formData.costPrice)) / parseFloat(formData.costPrice)) * 100).toFixed(1)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="modal-price-list-item">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Box className="w-4 h-4" />
            {isEditing ? "Edit Item" : "Add Item"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Name Row - Most Important */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded">
            <span className="text-table text-muted-foreground w-16">Name *</span>
            <Input
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Item name"
              className="h-7 text-table flex-1 ml-2"
              data-testid="input-name"
            />
          </div>

          {/* Nickname Row */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded">
            <span className="text-table text-muted-foreground w-16">Nickname</span>
            <Input
              value={formData.nickname}
              onChange={(e) => updateField("nickname", e.target.value)}
              placeholder="Team terminology"
              className="h-7 text-table flex-1 ml-2"
              data-testid="input-nickname"
            />
          </div>

          {/* Category, Code, Unit - Compact Grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-data text-muted-foreground">Group</Label>
              <Select value={formData.groupId} onValueChange={(v) => updateField("groupId", v)}>
                <SelectTrigger className="h-7 text-table" data-testid="select-group">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-table">
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-data text-muted-foreground">Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="SKU"
                className="h-7 text-table"
                data-testid="input-code"
              />
            </div>

            <div>
              <Label className="text-data text-muted-foreground">Unit</Label>
              {/* Units come from Field Settings, not a hardcoded list. The old inline
                  dropdown offered 19 options against a 14-value pgEnum — 12 of them
                  were guaranteed insert errors. */}
              <UnitSelect
                value={formData.unitType}
                onValueChange={(v) => updateField("unitType", v)}
                triggerClassName="h-7 text-table"
                data-testid="select-unit-type"
              />
            </div>
          </div>

          {/* Pricing Row - Highlight Section */}
          <div className="px-2 py-2 bg-primary/10 border border-primary/20 rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-primary" />
                <span className="text-data font-medium text-primary">Pricing</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-label ${!enterIncGst ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>Ex GST</span>
                <Switch
                  checked={enterIncGst}
                  onCheckedChange={setEnterIncGst}
                  className="h-4 w-7 data-[state=checked]:bg-primary"
                  data-testid="switch-gst-mode"
                />
                <span className={`text-label ${enterIncGst ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>Inc GST</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-data text-muted-foreground">
                  {kind === "labour" ? "Cost rate" : "Cost"} {enterIncGst ? '(inc)' : '(ex)'}
                </Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-data text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={enterIncGst && formData.costPrice ? (parseFloat(formData.costPrice) * 1.1).toFixed(2) : formData.costPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (enterIncGst && val) {
                        updateField("costPrice", (parseFloat(val) / 1.1).toFixed(2));
                      } else {
                        updateField("costPrice", val);
                      }
                    }}
                    placeholder="0.00"
                    className="h-7 text-table pl-5"
                    data-testid="input-cost-price"
                  />
                </div>
                {formData.costPrice && (
                  <div className="text-label text-muted-foreground mt-0.5 text-right">
                    {enterIncGst ? 'ex' : 'inc'}: ${enterIncGst ? formData.costPrice : (parseFloat(formData.costPrice) * 1.1).toFixed(2)}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-data text-muted-foreground">Markup</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.markupPercent}
                    onChange={(e) => updateField("markupPercent", e.target.value)}
                    placeholder="0"
                    className="h-7 text-table pr-5"
                    data-testid="input-markup"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-data text-muted-foreground">%</span>
                </div>
              </div>

              <div>
                <Label className="text-data text-muted-foreground">
                  {kind === "labour" ? "Charge rate" : "Sell"} {enterIncGst ? '(inc)' : '(ex)'}
                </Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-data text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={enterIncGst && formData.sellPrice ? (parseFloat(formData.sellPrice) * 1.1).toFixed(2) : formData.sellPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (enterIncGst && val) {
                        updateField("sellPrice", (parseFloat(val) / 1.1).toFixed(2));
                      } else {
                        updateField("sellPrice", val);
                      }
                    }}
                    placeholder="0.00"
                    className="h-7 text-table pl-5"
                    data-testid="input-sell-price"
                  />
                </div>
                {formData.sellPrice && (
                  <div className="text-label text-muted-foreground mt-0.5 text-right">
                    {enterIncGst ? 'ex' : 'inc'}: ${enterIncGst ? formData.sellPrice : (parseFloat(formData.sellPrice) * 1.1).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            {calculatedMarkup && (
              <div className="mt-1.5 text-data text-muted-foreground text-right">
                Calculated markup: <span className="font-medium text-foreground">{calculatedMarkup}%</span>
              </div>
            )}
          </div>

          {/* Supplier row. On a supplier list the supplier is inherited from the list
              itself, so that slot becomes the cost code instead. A labour rate card has
              no supplier, no supplier code and no lead time at all. */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-data text-muted-foreground">
                {kind === "supplier" ? "Cost Code" : "Supplier"}
              </Label>
              {kind === "supplier" ? (
                <Select value={formData.costCodeId} onValueChange={(v) => updateField("costCodeId", v)}>
                  <SelectTrigger className="h-7 text-table" data-testid="select-cost-code">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCodes.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id} className="text-table">
                        {cc.code ? `${cc.code} — ${cc.title}` : cc.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={formData.supplierId} onValueChange={(v) => updateField("supplierId", v)}>
                  <SelectTrigger className="h-7 text-table" data-testid="select-supplier">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id} className="text-table">
                        {sup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {kind !== "labour" && (
            <div>
              <Label className="text-data text-muted-foreground">Supplier Code</Label>
              <Input
                value={formData.supplierCode}
                onChange={(e) => updateField("supplierCode", e.target.value)}
                placeholder="Code"
                className="h-7 text-table"
                data-testid="input-supplier-code"
              />
            </div>
            )}

            {kind !== "labour" && (
            <div>
              <Label className="text-data text-muted-foreground">Lead Time</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={formData.leadTimeDays}
                  onChange={(e) => updateField("leadTimeDays", e.target.value)}
                  placeholder="0"
                  className="h-7 text-table pr-8"
                  data-testid="input-lead-time"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-data text-muted-foreground">days</span>
              </div>
            </div>
            )}
          </div>

          {/* Description - 2 line preview like rapid approval */}
          <div>
            <Label className="text-data text-muted-foreground mb-0.5 block">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Item description"
              className="text-table min-h-[40px] resize-none"
              rows={2}
              data-testid="input-description"
            />
          </div>

          {/* Show More Toggle */}
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="w-full flex items-center justify-center gap-1 py-1 text-data text-muted-foreground hover:text-foreground"
            data-testid="button-show-more"
          >
            {showMore ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showMore ? "Show less" : "More options"}
          </button>

          {/* Collapsible Additional Details */}
          {showMore && (
            <div className="space-y-2 pt-1 border-t">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-data text-muted-foreground">Brand</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                    placeholder="Brand name"
                    className="h-7 text-table"
                    data-testid="input-brand"
                  />
                </div>

                <div>
                  <Label className="text-data text-muted-foreground">Tags</Label>
                  <Input
                    value={formData.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                    placeholder="tag1, tag2"
                    className="h-7 text-table"
                    data-testid="input-tags"
                  />
                </div>
              </div>

              <div>
                <Label className="text-data text-muted-foreground">Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Internal notes"
                  className="text-table min-h-[40px] resize-none"
                  rows={2}
                  data-testid="input-notes"
                />
              </div>
            </div>
          )}

          {/* Footer with Active toggle and buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <label className="flex items-center gap-1.5 text-table cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => updateField("isActive", e.target.checked)}
                className="h-3.5 w-3.5 rounded"
                data-testid="checkbox-active"
              />
              <span className={formData.isActive ? "text-status-success" : "text-muted-foreground"}>
                {formData.isActive ? "Active" : "Inactive"}
              </span>
            </label>
            
            <div className="flex items-center gap-1.5">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                className="h-7 text-table"
                onClick={() => onOpenChange(false)} 
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-table"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                {isEditing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
