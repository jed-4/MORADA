import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Search, Filter, Edit, Trash2, ChevronRight, ChevronDown, Building, Tag, DollarSign, Box, Loader2, ChevronsUpDown, ChevronsDownUp, ToggleLeft, ToggleRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { PriceListItem, PriceListCategory, Supplier } from "@shared/schema";

export interface PriceListHandle {
  openAddModal: () => void;
}

type GroupBy = "none" | "category" | "supplier";

interface PriceListProps {
  searchQuery?: string;
}

export const PriceList = forwardRef<PriceListHandle, PriceListProps>(({ searchQuery: externalSearch = "" }, ref) => {
  const { toast } = useToast();
  const [internalSearch, setInternalSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const searchQuery = externalSearch || internalSearch;

  useImperativeHandle(ref, () => ({
    openAddModal: () => setShowAddModal(true),
  }));

  const { data: items = [], isLoading: isLoadingItems } = useQuery<PriceListItem[]>({
    queryKey: ["/api/price-list/items", searchQuery, filterCategory, filterSupplier, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (filterCategory !== "all") params.set("categoryId", filterCategory);
      if (filterSupplier !== "all") params.set("supplierId", filterSupplier);
      if (filterStatus !== "all") params.set("isActive", filterStatus === "active" ? "true" : "false");
      const res = await fetch(`/api/price-list/items?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<PriceListCategory[]>({
    queryKey: ["/api/price-list/categories"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/price-list/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      toast({ title: "Item deleted successfully" });
    },
  });

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
    if (groupBy === "category") {
      categories.forEach((c) => allIds.add(c.id));
      allIds.add("uncategorized");
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
      return [{ id: "all", name: "All Items", items: items }];
    }

    if (groupBy === "category") {
      const grouped = new Map<string, PriceListItem[]>();
      items.forEach((item) => {
        const key = item.categoryId || "uncategorized";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
      });

      return Array.from(grouped.entries()).map(([key, groupItems]) => {
        const category = categories.find((c) => c.id === key);
        return {
          id: key,
          name: category?.name || "Uncategorized",
          items: groupItems,
        };
      });
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
          items: groupItems,
        };
      });
    }

    return [];
  };

  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount) return "-";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(num);
  };

  const formatCurrencyIncGst = (amount: string | number | null | undefined) => {
    if (!amount) return "-";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    const incGst = num * 1.1; // Australian GST is 10%
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(incGst);
  };

  const getMarkup = (cost: string | number | null, sell: string | number | null) => {
    if (!cost || !sell) return "-";
    const costNum = typeof cost === "string" ? parseFloat(cost) : cost;
    const sellNum = typeof sell === "string" ? parseFloat(sell) : sell;
    if (costNum === 0) return "-";
    const markup = ((sellNum - costNum) / costNum) * 100;
    return `${markup.toFixed(1)}%`;
  };

  const columns = useMemo<ColumnDef<PriceListItem, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (i) => i.name || "",
        cell: ({ row }) => <span className="text-xs font-medium">{row.original.name}</span>,
        size: 180,
        meta: { defaultWidth: 180, headerLabel: "Name" } satisfies DataTableColumnMeta,
      },
      {
        id: "nickname",
        header: "Nickname",
        accessorFn: (i) => i.nickname || "",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.nickname || "-"}</span>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Nickname" } satisfies DataTableColumnMeta,
      },
      {
        id: "code",
        header: "Code",
        accessorFn: (i) => i.code || "",
        cell: ({ row }) => (
          <span className="text-xs font-mono">{row.original.code || "-"}</span>
        ),
        size: 90,
        meta: { defaultWidth: 90, headerLabel: "Code" } satisfies DataTableColumnMeta,
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (i) => suppliers.find((s) => s.id === i.supplierId)?.name || "",
        cell: ({ row }) => (
          <span className="text-xs">
            {suppliers.find((s) => s.id === row.original.supplierId)?.name || "-"}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Supplier" } satisfies DataTableColumnMeta,
      },
      {
        id: "unit",
        header: "Unit",
        accessorFn: (i) => i.unitType || "",
        cell: ({ row }) => <span className="text-xs">{row.original.unitType || "-"}</span>,
        size: 60,
        meta: { defaultWidth: 60, headerLabel: "Unit" } satisfies DataTableColumnMeta,
      },
      {
        id: "costEx",
        header: "Cost (ex)",
        accessorFn: (i) => Number(i.costPrice) || 0,
        cell: ({ row }) => (
          <span className="text-xs font-mono">{formatCurrency(row.original.costPrice)}</span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Cost (ex)" } satisfies DataTableColumnMeta,
      },
      {
        id: "costInc",
        header: "Cost (inc)",
        accessorFn: (i) => Number(i.costPrice) || 0,
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {formatCurrencyIncGst(row.original.costPrice)}
          </span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Cost (inc)" } satisfies DataTableColumnMeta,
      },
      {
        id: "sellEx",
        header: "Sell (ex)",
        accessorFn: (i) => Number(i.sellPrice) || 0,
        cell: ({ row }) => (
          <span className="text-xs font-mono">{formatCurrency(row.original.sellPrice)}</span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Sell (ex)" } satisfies DataTableColumnMeta,
      },
      {
        id: "sellInc",
        header: "Sell (inc)",
        accessorFn: (i) => Number(i.sellPrice) || 0,
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground">
            {formatCurrencyIncGst(row.original.sellPrice)}
          </span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Sell (inc)" } satisfies DataTableColumnMeta,
      },
      {
        id: "markup",
        header: "Markup",
        accessorFn: (i) => {
          const cost = Number(i.costPrice);
          const sell = Number(i.sellPrice);
          if (!cost || !sell) return -Infinity;
          return ((sell - cost) / cost) * 100;
        },
        cell: ({ row }) => (
          <span className="text-xs">{getMarkup(row.original.costPrice, row.original.sellPrice)}</span>
        ),
        size: 70,
        meta: { defaultWidth: 70, align: "right", headerLabel: "Markup" } satisfies DataTableColumnMeta,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (i) => (i.isActive ? "Active" : "Inactive"),
        cell: ({ row }) => (
          <Badge
            variant={row.original.isActive ? "outline" : "secondary"}
            className="h-4 text-label"
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 80,
        meta: { defaultWidth: 80, headerLabel: "Status" } satisfies DataTableColumnMeta,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setEditingItem(row.original)}
              data-testid={`button-edit-${row.original.id}`}
            >
              <Edit className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => deleteMutation.mutate(row.original.id)}
                  data-testid={`button-confirm-delete-${row.original.id}`}
                >
                  Confirm Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 64,
        meta: { defaultWidth: 64, align: "center", headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers],
  );

  const groups = useMemo(() => groupedItems(), [groupBy, items, categories, suppliers]);

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
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          {groupBy !== "none" && (
            <button
              onClick={toggleExpandCollapse}
              className="h-6 w-6 flex items-center justify-center border rounded-md hover-elevate active-elevate-2"
              title={allExpanded ? "Collapse all" : "Expand all"}
              data-testid="button-toggle-expand"
            >
              {allExpanded ? (
                <ChevronsDownUp className="h-3 w-3" />
              ) : (
                <ChevronsUpDown className="h-3 w-3" />
              )}
            </button>
          )}

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger 
              className={`h-6 px-2 text-xs rounded-md ${
                filterCategory !== "all" 
                  ? "bg-primary/10 text-primary border-primary/30" 
                  : ""
              }`}
              data-testid="select-filter-category"
            >
              <Tag className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger 
              className={`h-6 px-2 text-xs rounded-md ${
                filterSupplier !== "all" 
                  ? "bg-primary/10 text-primary border-primary/30" 
                  : ""
              }`}
              data-testid="select-filter-supplier"
            >
              <Building className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((sup) => (
                <SelectItem key={sup.id} value={sup.id}>
                  {sup.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger 
              className={`h-6 px-2 text-xs rounded-md ${
                filterStatus !== "all" 
                  ? "bg-primary/10 text-primary border-primary/30" 
                  : ""
              }`}
              data-testid="select-filter-status"
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Group:</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-6 w-24 text-xs border-0 bg-transparent" data-testid="select-group-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="category">Category</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Badge variant="secondary" className="h-5 text-data">
            {items.length} items
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoadingItems ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            variant="inline"
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
          <div className="p-2">
            {groups.map((group) => (
              <div key={group.id} className="mb-3">
                {groupBy !== "none" && (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-foreground hover-elevate rounded-md mb-1"
                    data-testid={`button-toggle-group-${group.id}`}
                  >
                    {expandedGroups.has(group.id) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{group.name}</span>
                    <Badge variant="outline" className="h-4 text-data ml-1">
                      {group.items.length}
                    </Badge>
                  </button>
                )}

                {(groupBy === "none" || expandedGroups.has(group.id)) && (
                  <DataTable
                    data={group.items}
                    columns={columns}
                    storageKey="price-list"
                    rowKey={(item) => `item-${item.id}`}
                    rowHeight={28}
                    emptyState={<EmptyState variant="inline" title="No items" />}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <PriceListItemModal
        open={showAddModal || !!editingItem}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddModal(false);
            setEditingItem(null);
          }
        }}
        item={editingItem}
        categories={categories}
        suppliers={suppliers}
      />
    </div>
  );
});

PriceList.displayName = "PriceList";

interface PriceListItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceListItem | null;
  categories: PriceListCategory[];
  suppliers: Supplier[];
}

function PriceListItemModal({ open, onOpenChange, item, categories, suppliers }: PriceListItemModalProps) {
  const { toast } = useToast();
  const isEditing = !!item;
  const [enterIncGst, setEnterIncGst] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    code: "",
    description: "",
    categoryId: "",
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
          categoryId: item.categoryId || "",
          unitType: item.unitType || "each",
          costPrice: item.costPrice || "",
          sellPrice: item.sellPrice || "",
          markupPercent: item.markupPercent || "",
          supplierId: item.supplierId || "",
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
          categoryId: "",
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
    mutationFn: (data: any) => apiRequest("/api/price-list/items", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      toast({ title: "Item created successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create item", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/price-list/items/${item?.id}`, { method: "PATCH", body: JSON.stringify(data) }),
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
      name: formData.name,
      nickname: formData.nickname || null,
      code: formData.code || null,
      description: formData.description || null,
      categoryId: formData.categoryId || null,
      unitType: formData.unitType || "each",
      costPrice: formData.costPrice || null,
      sellPrice: formData.sellPrice || null,
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
              <Label className="text-data text-muted-foreground">Category</Label>
              <Select value={formData.categoryId} onValueChange={(v) => updateField("categoryId", v)}>
                <SelectTrigger className="h-7 text-table" data-testid="select-category">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-table">
                      {cat.name}
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
              <Select value={formData.unitType} onValueChange={(v) => updateField("unitType", v)}>
                <SelectTrigger className="h-7 text-table" data-testid="select-unit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each" className="text-table">Each</SelectItem>
                  <SelectItem value="m" className="text-table">m</SelectItem>
                  <SelectItem value="m2" className="text-table">m2</SelectItem>
                  <SelectItem value="m3" className="text-table">m3</SelectItem>
                  <SelectItem value="lm" className="text-table">lm</SelectItem>
                  <SelectItem value="kg" className="text-table">kg</SelectItem>
                  <SelectItem value="t" className="text-table">t</SelectItem>
                  <SelectItem value="l" className="text-table">L</SelectItem>
                  <SelectItem value="hr" className="text-table">hr</SelectItem>
                  <SelectItem value="day" className="text-table">day</SelectItem>
                  <SelectItem value="pack" className="text-table">pack</SelectItem>
                  <SelectItem value="box" className="text-table">box</SelectItem>
                  <SelectItem value="roll" className="text-table">roll</SelectItem>
                  <SelectItem value="sheet" className="text-table">sheet</SelectItem>
                  <SelectItem value="bag" className="text-table">bag</SelectItem>
                  <SelectItem value="pallet" className="text-table">pallet</SelectItem>
                  <SelectItem value="item" className="text-table">item</SelectItem>
                  <SelectItem value="lot" className="text-table">lot</SelectItem>
                  <SelectItem value="allowance" className="text-table">allowance</SelectItem>
                </SelectContent>
              </Select>
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
                <Label className="text-data text-muted-foreground">Cost {enterIncGst ? '(inc)' : '(ex)'}</Label>
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
                <Label className="text-data text-muted-foreground">Sell {enterIncGst ? '(inc)' : '(ex)'}</Label>
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

          {/* Supplier Row */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-data text-muted-foreground">Supplier</Label>
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
            </div>

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
