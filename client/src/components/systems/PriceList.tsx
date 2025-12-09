import { useState, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Search, Filter, Edit, Trash2, ChevronRight, ChevronDown, Building, Tag, DollarSign, Box, Loader2, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const getMarkup = (cost: string | null, sell: string | null) => {
    if (!cost || !sell) return "-";
    const costNum = parseFloat(cost);
    const sellNum = parseFloat(sell);
    if (costNum === 0) return "-";
    const markup = ((sellNum - costNum) / costNum) * 100;
    return `${markup.toFixed(1)}%`;
  };

  const groups = groupedItems();

  const allExpanded = groups.length > 0 && groups.every(g => expandedGroups.has(g.id));
  
  const toggleExpandCollapse = () => {
    if (allExpanded) {
      collapseAll();
    } else {
      expandAll();
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

          <button
            onClick={() => setFilterCategory(filterCategory === "all" ? "" : "all")}
            className={`h-6 px-2 text-xs border rounded-md flex items-center gap-1 ${
              filterCategory !== "all" 
                ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
                : "hover-elevate"
            } active-elevate-2`}
            data-testid="button-filter-category"
          >
            <Tag className="h-3 w-3" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-5 border-0 bg-transparent p-0 text-xs min-w-[70px]" data-testid="select-filter-category">
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
          </button>

          <button
            onClick={() => setFilterSupplier(filterSupplier === "all" ? "" : "all")}
            className={`h-6 px-2 text-xs border rounded-md flex items-center gap-1 ${
              filterSupplier !== "all" 
                ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
                : "hover-elevate"
            } active-elevate-2`}
            data-testid="button-filter-supplier"
          >
            <Building className="h-3 w-3" />
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="h-5 border-0 bg-transparent p-0 text-xs min-w-[70px]" data-testid="select-filter-supplier">
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
          </button>

          <button
            onClick={() => setFilterStatus(filterStatus === "all" ? "" : "all")}
            className={`h-6 px-2 text-xs border rounded-md flex items-center gap-1 ${
              filterStatus !== "all" 
                ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
                : "hover-elevate"
            } active-elevate-2`}
            data-testid="button-filter-status"
          >
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-5 border-0 bg-transparent p-0 text-xs min-w-[60px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </button>
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

          <Badge variant="secondary" className="h-5 text-[10px]">
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
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Box className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-1">No price list items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add your first item to start building your price list.
            </p>
            <Button size="sm" onClick={() => setShowAddModal(true)} data-testid="button-add-first-item">
              <Plus className="h-3 w-3 mr-1" />
              Add Item
            </Button>
          </div>
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
                    <Badge variant="outline" className="h-4 text-[10px] ml-1">
                      {group.items.length}
                    </Badge>
                  </button>
                )}

                {(groupBy === "none" || expandedGroups.has(group.id)) && (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-7">
                        <TableHead className="text-[10px] w-[160px]">Name</TableHead>
                        <TableHead className="text-[10px] w-[100px]">Nickname</TableHead>
                        <TableHead className="text-[10px] w-[80px]">Code</TableHead>
                        <TableHead className="text-[10px] w-[100px]">Supplier</TableHead>
                        <TableHead className="text-[10px] w-[60px]">Unit</TableHead>
                        <TableHead className="text-[10px] w-[90px] text-right">Cost</TableHead>
                        <TableHead className="text-[10px] w-[90px] text-right">Sell</TableHead>
                        <TableHead className="text-[10px] w-[60px] text-right">Markup</TableHead>
                        <TableHead className="text-[10px] w-[60px]">Status</TableHead>
                        <TableHead className="text-[10px] w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const supplier = suppliers.find((s) => s.id === item.supplierId);
                        return (
                          <TableRow key={item.id} className="h-7" data-testid={`row-item-${item.id}`}>
                            <TableCell className="text-[11px] font-medium py-1">
                              {item.name}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground py-1">
                              {item.nickname || "-"}
                            </TableCell>
                            <TableCell className="text-[11px] font-mono py-1">
                              {item.code || "-"}
                            </TableCell>
                            <TableCell className="text-[11px] py-1">
                              {supplier?.name || "-"}
                            </TableCell>
                            <TableCell className="text-[11px] py-1">
                              {item.unitType || "-"}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1 font-mono">
                              {formatCurrency(item.costPrice)}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1 font-mono">
                              {formatCurrency(item.sellPrice)}
                            </TableCell>
                            <TableCell className="text-[11px] text-right py-1">
                              {getMarkup(item.costPrice, item.sellPrice)}
                            </TableCell>
                            <TableCell className="py-1">
                              <Badge
                                variant={item.isActive ? "outline" : "secondary"}
                                className="h-4 text-[9px]"
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => setEditingItem(item)}
                                  data-testid={`button-edit-${item.id}`}
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
                                      onClick={() => deleteMutation.mutate(item.id)}
                                      data-testid={`button-confirm-delete-${item.id}`}
                                    >
                                      Confirm Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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

  useState(() => {
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
    }
  });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-price-list-item">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {isEditing ? "Edit Price List Item" : "Add Price List Item"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Item name"
                className="h-8 text-xs"
                data-testid="input-name"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nickname</Label>
              <Input
                value={formData.nickname}
                onChange={(e) => updateField("nickname", e.target.value)}
                placeholder="Team terminology"
                className="h-8 text-xs"
                data-testid="input-nickname"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="SKU / Item code"
                className="h-8 text-xs"
                data-testid="input-code"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={formData.categoryId} onValueChange={(v) => updateField("categoryId", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unit Type</Label>
              <Select value={formData.unitType} onValueChange={(v) => updateField("unitType", v)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-unit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">Each</SelectItem>
                  <SelectItem value="m">Metre (m)</SelectItem>
                  <SelectItem value="m2">Square Metre (m2)</SelectItem>
                  <SelectItem value="m3">Cubic Metre (m3)</SelectItem>
                  <SelectItem value="lm">Linear Metre (lm)</SelectItem>
                  <SelectItem value="kg">Kilogram (kg)</SelectItem>
                  <SelectItem value="t">Tonne (t)</SelectItem>
                  <SelectItem value="l">Litre (L)</SelectItem>
                  <SelectItem value="hr">Hour (hr)</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="pack">Pack</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="roll">Roll</SelectItem>
                  <SelectItem value="sheet">Sheet</SelectItem>
                  <SelectItem value="bag">Bag</SelectItem>
                  <SelectItem value="pallet">Pallet</SelectItem>
                  <SelectItem value="item">Item</SelectItem>
                  <SelectItem value="lot">Lot</SelectItem>
                  <SelectItem value="allowance">Allowance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Item description"
              className="text-xs min-h-[60px]"
              data-testid="input-description"
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-3 flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Pricing
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cost Price</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costPrice}
                    onChange={(e) => updateField("costPrice", e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs pl-5"
                    data-testid="input-cost-price"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Markup %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.markupPercent}
                    onChange={(e) => updateField("markupPercent", e.target.value)}
                    placeholder="0"
                    className="h-8 text-xs pr-5"
                    data-testid="input-markup"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Sell Price</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.sellPrice}
                    onChange={(e) => updateField("sellPrice", e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs pl-5"
                    data-testid="input-sell-price"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-3 flex items-center gap-1">
              <Building className="h-3 w-3" /> Supplier
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Supplier</Label>
                <Select value={formData.supplierId} onValueChange={(v) => updateField("supplierId", v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Supplier Code</Label>
                <Input
                  value={formData.supplierCode}
                  onChange={(e) => updateField("supplierCode", e.target.value)}
                  placeholder="Supplier's code"
                  className="h-8 text-xs"
                  data-testid="input-supplier-code"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Lead Time (days)</Label>
                <Input
                  type="number"
                  value={formData.leadTimeDays}
                  onChange={(e) => updateField("leadTimeDays", e.target.value)}
                  placeholder="0"
                  className="h-8 text-xs"
                  data-testid="input-lead-time"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-3">Additional Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Brand</Label>
                <Input
                  value={formData.brand}
                  onChange={(e) => updateField("brand", e.target.value)}
                  placeholder="Brand name"
                  className="h-8 text-xs"
                  data-testid="input-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tags</Label>
                <Input
                  value={formData.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                  placeholder="tag1, tag2, tag3"
                  className="h-8 text-xs"
                  data-testid="input-tags"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Internal notes"
                className="text-xs min-h-[60px]"
                data-testid="input-notes"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => updateField("isActive", e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-active"
              />
              <Label htmlFor="isActive" className="text-xs font-semibold cursor-pointer">
                Active
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              )}
              {isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
