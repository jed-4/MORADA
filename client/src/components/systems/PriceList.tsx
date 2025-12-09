import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
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
                  ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
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
                  ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
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
                  ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30" 
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

  useEffect(() => {
    if (open) {
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
            <span className="text-[11px] text-muted-foreground w-16">Name *</span>
            <Input
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Item name"
              className="h-7 text-[11px] flex-1 ml-2"
              data-testid="input-name"
            />
          </div>

          {/* Nickname Row */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded">
            <span className="text-[11px] text-muted-foreground w-16">Nickname</span>
            <Input
              value={formData.nickname}
              onChange={(e) => updateField("nickname", e.target.value)}
              placeholder="Team terminology"
              className="h-7 text-[11px] flex-1 ml-2"
              data-testid="input-nickname"
            />
          </div>

          {/* Category, Code, Unit - Compact Grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-[10px] text-muted-foreground">Category</Label>
              <Select value={formData.categoryId} onValueChange={(v) => updateField("categoryId", v)}>
                <SelectTrigger className="h-7 text-[11px]" data-testid="select-category">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-[11px]">
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Code</Label>
              <Input
                value={formData.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="SKU"
                className="h-7 text-[11px]"
                data-testid="input-code"
              />
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Unit</Label>
              <Select value={formData.unitType} onValueChange={(v) => updateField("unitType", v)}>
                <SelectTrigger className="h-7 text-[11px]" data-testid="select-unit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each" className="text-[11px]">Each</SelectItem>
                  <SelectItem value="m" className="text-[11px]">m</SelectItem>
                  <SelectItem value="m2" className="text-[11px]">m2</SelectItem>
                  <SelectItem value="m3" className="text-[11px]">m3</SelectItem>
                  <SelectItem value="lm" className="text-[11px]">lm</SelectItem>
                  <SelectItem value="kg" className="text-[11px]">kg</SelectItem>
                  <SelectItem value="t" className="text-[11px]">t</SelectItem>
                  <SelectItem value="l" className="text-[11px]">L</SelectItem>
                  <SelectItem value="hr" className="text-[11px]">hr</SelectItem>
                  <SelectItem value="day" className="text-[11px]">day</SelectItem>
                  <SelectItem value="pack" className="text-[11px]">pack</SelectItem>
                  <SelectItem value="box" className="text-[11px]">box</SelectItem>
                  <SelectItem value="roll" className="text-[11px]">roll</SelectItem>
                  <SelectItem value="sheet" className="text-[11px]">sheet</SelectItem>
                  <SelectItem value="bag" className="text-[11px]">bag</SelectItem>
                  <SelectItem value="pallet" className="text-[11px]">pallet</SelectItem>
                  <SelectItem value="item" className="text-[11px]">item</SelectItem>
                  <SelectItem value="lot" className="text-[11px]">lot</SelectItem>
                  <SelectItem value="allowance" className="text-[11px]">allowance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing Row - Highlight Section */}
          <div className="px-2 py-2 bg-[#bba7db]/10 border border-[#bba7db]/20 rounded">
            <div className="flex items-center gap-1 mb-2">
              <DollarSign className="h-3 w-3 text-[#bba7db]" />
              <span className="text-[10px] font-medium text-[#bba7db]">Pricing</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Cost</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costPrice}
                    onChange={(e) => updateField("costPrice", e.target.value)}
                    placeholder="0.00"
                    className="h-7 text-[11px] pl-5"
                    data-testid="input-cost-price"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Markup</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    value={formData.markupPercent}
                    onChange={(e) => updateField("markupPercent", e.target.value)}
                    placeholder="0"
                    className="h-7 text-[11px] pr-5"
                    data-testid="input-markup"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Sell</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.sellPrice}
                    onChange={(e) => updateField("sellPrice", e.target.value)}
                    placeholder="0.00"
                    className="h-7 text-[11px] pl-5"
                    data-testid="input-sell-price"
                  />
                </div>
              </div>
            </div>
            {calculatedMarkup && (
              <div className="mt-1.5 text-[10px] text-muted-foreground text-right">
                Calculated markup: <span className="font-medium text-foreground">{calculatedMarkup}%</span>
              </div>
            )}
          </div>

          {/* Supplier Row */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-[10px] text-muted-foreground">Supplier</Label>
              <Select value={formData.supplierId} onValueChange={(v) => updateField("supplierId", v)}>
                <SelectTrigger className="h-7 text-[11px]" data-testid="select-supplier">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id} className="text-[11px]">
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Supplier Code</Label>
              <Input
                value={formData.supplierCode}
                onChange={(e) => updateField("supplierCode", e.target.value)}
                placeholder="Code"
                className="h-7 text-[11px]"
                data-testid="input-supplier-code"
              />
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Lead Time</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={formData.leadTimeDays}
                  onChange={(e) => updateField("leadTimeDays", e.target.value)}
                  placeholder="0"
                  className="h-7 text-[11px] pr-8"
                  data-testid="input-lead-time"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">days</span>
              </div>
            </div>
          </div>

          {/* Description - 2 line preview like rapid approval */}
          <div>
            <Label className="text-[10px] text-muted-foreground mb-0.5 block">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Item description"
              className="text-[11px] min-h-[40px] resize-none"
              rows={2}
              data-testid="input-description"
            />
          </div>

          {/* Show More Toggle */}
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-muted-foreground hover:text-foreground"
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
                  <Label className="text-[10px] text-muted-foreground">Brand</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                    placeholder="Brand name"
                    className="h-7 text-[11px]"
                    data-testid="input-brand"
                  />
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground">Tags</Label>
                  <Input
                    value={formData.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                    placeholder="tag1, tag2"
                    className="h-7 text-[11px]"
                    data-testid="input-tags"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Internal notes"
                  className="text-[11px] min-h-[40px] resize-none"
                  rows={2}
                  data-testid="input-notes"
                />
              </div>
            </div>
          )}

          {/* Footer with Active toggle and buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => updateField("isActive", e.target.checked)}
                className="h-3.5 w-3.5 rounded"
                data-testid="checkbox-active"
              />
              <span className={formData.isActive ? "text-green-600" : "text-muted-foreground"}>
                {formData.isActive ? "Active" : "Inactive"}
              </span>
            </label>
            
            <div className="flex items-center gap-1.5">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => onOpenChange(false)} 
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-[11px]"
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
