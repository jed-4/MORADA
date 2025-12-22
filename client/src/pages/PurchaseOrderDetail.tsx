import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Plus,
  Save,
  Send,
  Printer,
  FileText,
  Trash2,
  GripVertical,
  X,
  Building2,
  Mail,
  Phone,
  MapPin,
  Copy,
  Check,
  Calendar,
  Download,
  ChevronDown,
  MoreHorizontal,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  InsertPurchaseOrderItem,
  Project,
  Contact,
  CostCode,
} from "@shared/schema";

interface RouteParams {
  id?: string;
  poId?: string;
  projectId?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
  sent: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  approved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  received: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function parseCurrency(value: string): number {
  const clean = value.replace(/[^0-9.-]/g, "");
  return Math.round(parseFloat(clean || "0") * 100);
}

interface SortableItemRowProps {
  item: PurchaseOrderItem;
  index: number;
  onUpdate: (id: string, updates: Partial<PurchaseOrderItem>) => void;
  onDelete: (id: string) => void;
  costCodes: CostCode[];
  disabled?: boolean;
}

function SortableItemRow({ item, index, onUpdate, onDelete, costCodes, disabled }: SortableItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  const quantity = parseFloat(item.quantity || "1");
  const unitPrice = item.unitPrice || 0;
  const lineTotal = Math.round(quantity * unitPrice);
  const gstAmount = item.isGstFree ? 0 : Math.round(lineTotal * 0.1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[40px_1fr_80px_80px_100px_100px_80px_120px_40px] gap-2 items-center px-2 py-2 border-b hover:bg-muted/30 group ${
        isDragging ? "bg-muted shadow-lg" : ""
      }`}
      data-testid={`po-item-row-${item.id}`}
    >
      <div className="flex items-center justify-center">
        <button
          {...attributes}
          {...listeners}
          className="p-1 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
          disabled={disabled}
          data-testid={`po-item-drag-${item.id}`}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <Input
        value={item.description}
        onChange={(e) => onUpdate(item.id, { description: e.target.value })}
        placeholder="Item description"
        className="h-8 text-sm"
        disabled={disabled}
        data-testid={`po-item-description-${item.id}`}
      />

      <Input
        type="number"
        value={item.quantity}
        onChange={(e) => {
          const qty = e.target.value;
          const newTotal = Math.round(parseFloat(qty || "0") * unitPrice);
          onUpdate(item.id, { quantity: qty, total: newTotal });
        }}
        placeholder="1"
        className="h-8 text-sm text-right"
        disabled={disabled}
        data-testid={`po-item-qty-${item.id}`}
      />

      <Input
        value={item.unit || ""}
        onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
        placeholder="each"
        className="h-8 text-sm"
        disabled={disabled}
        data-testid={`po-item-unit-${item.id}`}
      />

      <Input
        type="text"
        value={(unitPrice / 100).toFixed(2)}
        onChange={(e) => {
          const price = parseCurrency(e.target.value);
          const newTotal = Math.round(quantity * price);
          onUpdate(item.id, { unitPrice: price, total: newTotal });
        }}
        placeholder="0.00"
        className="h-8 text-sm text-right"
        disabled={disabled}
        data-testid={`po-item-price-${item.id}`}
      />

      <div className="text-sm text-right font-medium" data-testid={`po-item-total-${item.id}`}>
        {formatCurrency(lineTotal)}
      </div>

      <div className="flex items-center justify-center">
        <Switch
          checked={item.isGstFree}
          onCheckedChange={(checked) => onUpdate(item.id, { isGstFree: checked })}
          disabled={disabled}
          data-testid={`po-item-gstfree-${item.id}`}
        />
      </div>

      <div className="w-full">
        <CostCodeSelect
          value={item.costCodeId || ""}
          onValueChange={(value) => onUpdate(item.id, { costCodeId: value || null })}
          placeholder="Cost code"
          className="h-8 text-xs"
          disabled={disabled}
          data-testid={`po-item-costcode-${item.id}`}
        />
      </div>

      <button
        onClick={() => onDelete(item.id)}
        className="p-1 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded"
        disabled={disabled}
        data-testid={`po-item-delete-${item.id}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function PurchaseOrderDetail() {
  const params = useParams<RouteParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rawPoId = params.id || params.poId;
  const projectIdFromUrl = params.projectId;
  
  // poId is always a real ID now - creation happens in PurchaseOrders.tsx before navigation
  const poId = rawPoId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [scopeText, setScopeText] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [includeGst, setIncludeGst] = useState(true);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportScopeDialogOpen, setIsImportScopeDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: purchaseOrder, isLoading: poLoading } = useQuery<PurchaseOrder>({
    queryKey: ["/api/purchase-orders", poId],
    enabled: !!poId,
    retry: false,
  });

  const { data: poItems = [], isLoading: itemsLoading } = useQuery<PurchaseOrderItem[]>({
    queryKey: ["/api/purchase-orders", poId, "items"],
    enabled: !!poId,
    retry: false,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const project = useMemo(() => {
    const pid = purchaseOrder?.projectId || projectIdFromUrl;
    return projects.find((p) => p.id === pid);
  }, [purchaseOrder, projectIdFromUrl, projects]);

  const supplier = useMemo(() => {
    if (!purchaseOrder?.supplierId) return null;
    return contacts.find((c) => c.id === purchaseOrder.supplierId);
  }, [purchaseOrder, contacts]);

  useEffect(() => {
    if (purchaseOrder) {
      setTitle(purchaseOrder.title || "");
      setDescription(purchaseOrder.description || "");
      setScope(purchaseOrder.scope || "");
      setTermsAndConditions(purchaseOrder.termsAndConditions || "");
      setDeliveryAddress(purchaseOrder.deliveryAddress || "");
      setDeliveryInstructions(purchaseOrder.deliveryInstructions || "");
      setRequiredByDate(
        purchaseOrder.requiredByDate
          ? new Date(purchaseOrder.requiredByDate).toISOString().split("T")[0]
          : ""
      );
    }
  }, [purchaseOrder]);

  useEffect(() => {
    setItems(poItems);
  }, [poItems]);

  const updatePoMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseOrder>) => {
      return apiRequest(`/api/purchase-orders/${poId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setHasUnsavedChanges(false);
      toast({ title: "Purchase order saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Error saving",
        description: error.message || "Failed to save purchase order",
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<PurchaseOrderItem> }) => {
      return apiRequest(`/api/purchase-orders/${poId}/items/${itemId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest(`/api/purchase-orders/${poId}/items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      toast({ title: "Item deleted" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: InsertPurchaseOrderItem) => {
      return apiRequest(`/api/purchase-orders/${poId}/items`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId] });
      toast({ title: "Item added" });
    },
  });

  const reorderItemsMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return apiRequest(`/api/purchase-orders/${poId}/items/reorder`, "POST", { itemIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", poId, "items"] });
    },
  });

  const handleSave = async () => {
    if (!poId) return;
    setIsSaving(true);
    try {
      await updatePoMutation.mutateAsync({
        title,
        description,
        scope,
        termsAndConditions,
        deliveryAddress,
        deliveryInstructions,
        requiredByDate: requiredByDate ? new Date(requiredByDate) : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemUpdate = (itemId: string, updates: Partial<PurchaseOrderItem>) => {
    if (!poId) return;
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item))
    );
    updateItemMutation.mutate({ itemId, data: updates });
  };

  const handleItemDelete = (itemId: string) => {
    if (!poId) return;
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    deleteItemMutation.mutate(itemId);
  };

  const handleAddItem = () => {
    if (!poId) return;
    const newOrder = items.length;
    addItemMutation.mutate({
      purchaseOrderId: poId,
      description: "",
      quantity: "1",
      unit: "each",
      unitPrice: 0,
      total: 0,
      gstAmount: 0,
      isGstFree: false,
      displayOrder: newOrder,
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItemId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItemId(null);

    if (!poId || !over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);
    reorderItemsMutation.mutate(newItems.map((item) => item.id));
  };

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity || "0");
      const price = item.unitPrice || 0;
      return sum + Math.round(qty * price);
    }, 0);
  }, [items]);

  const gstAmount = useMemo(() => {
    if (!includeGst) return 0;
    return items.reduce((sum, item) => {
      if (item.isGstFree) return sum;
      const qty = parseFloat(item.quantity || "0");
      const price = item.unitPrice || 0;
      const lineTotal = Math.round(qty * price);
      return sum + Math.round(lineTotal * 0.1);
    }, 0);
  }, [items, includeGst]);

  const total = subtotal + gstAmount;

  const handleGoBack = () => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/purchase-orders`);
    } else {
      setLocation("/purchase-orders");
    }
  };

  const handleImportProjectScope = () => {
    if (project?.scope) {
      setScope(project.scope);
      setHasUnsavedChanges(true);
      setIsImportScopeDialogOpen(false);
      toast({ title: "Scope imported from project" });
    }
  };

  const isLocked = purchaseOrder?.status !== "draft";

  if (poLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Purchase order not found</p>
        <Button variant="outline" onClick={handleGoBack}>
          Go Back
        </Button>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[purchaseOrder.status] || STATUS_COLORS.draft;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none border-b bg-background">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold" data-testid="text-po-number">
                {purchaseOrder.poNumber}
              </h1>
              <Badge className={`${statusColor.bg} ${statusColor.text}`}>
                {purchaseOrder.status.charAt(0).toUpperCase() + purchaseOrder.status.slice(1)}
              </Badge>
              {purchaseOrder.type === "site" && (
                <Badge variant="outline" className="text-xs">Site PO</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLocked}
              data-testid="button-save-po"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-po-actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {}} data-testid="action-print-po">
                  <Printer className="w-4 h-4 mr-2" />
                  Print / PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}} data-testid="action-email-po">
                  <Mail className="w-4 h-4 mr-2" />
                  Email to Supplier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {}} data-testid="action-duplicate-po">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {purchaseOrder.status === "draft" && (
              <Button
                size="sm"
                className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                onClick={() => {}}
                data-testid="button-send-po"
              >
                <Send className="w-4 h-4 mr-1" />
                Send to Supplier
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">PO Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="e.g., Kitchen Materials, Bathroom Fixtures"
                    disabled={isLocked}
                    data-testid="input-po-title"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <Input
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Brief description of this purchase order"
                    disabled={isLocked}
                    data-testid="input-po-description"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Scope of Work</CardTitle>
                {project?.scope && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsImportScopeDialogOpen(true)}
                    disabled={isLocked}
                    data-testid="button-import-scope"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Import from Project
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  content={scope}
                  onChange={(html, text) => {
                    setScope(html);
                    setScopeText(text);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Describe the scope of work for this order..."
                  disabled={isLocked}
                  data-testid="editor-po-scope"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Line Items</CardTitle>
                <Button
                  size="sm"
                  onClick={handleAddItem}
                  disabled={isLocked || addItemMutation.isPending}
                  data-testid="button-add-item"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-[40px_1fr_80px_80px_100px_100px_80px_120px_40px] gap-2 px-2 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                  <div></div>
                  <div>Description</div>
                  <div className="text-right">Qty</div>
                  <div>Unit</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">Total</div>
                  <div className="text-center">GST Free</div>
                  <div>Cost Code</div>
                  <div></div>
                </div>

                {itemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileText className="w-8 h-8 mb-2" />
                    <p className="text-sm">No items yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleAddItem}
                      disabled={isLocked}
                      data-testid="button-add-first-item"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={items.map((item) => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {items.map((item, index) => (
                        <SortableItemRow
                          key={item.id}
                          item={item}
                          index={index}
                          onUpdate={handleItemUpdate}
                          onDelete={handleItemDelete}
                          costCodes={costCodes}
                          disabled={isLocked}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={termsAndConditions}
                  onChange={(e) => {
                    setTermsAndConditions(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Standard terms and conditions for this purchase order..."
                  rows={4}
                  disabled={isLocked}
                  data-testid="textarea-po-terms"
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Supplier
                </CardTitle>
              </CardHeader>
              <CardContent>
                {supplier ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">{supplier.name}</p>
                    {supplier.email && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        {supplier.email}
                      </p>
                    )}
                    {supplier.phone && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {supplier.phone}
                      </p>
                    )}
                    {supplier.address && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {supplier.address}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No supplier selected</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Required By</Label>
                  <Input
                    type="date"
                    value={requiredByDate}
                    onChange={(e) => {
                      setRequiredByDate(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    disabled={isLocked}
                    data-testid="input-required-by-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Delivery Address</Label>
                  <Textarea
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Site address for delivery..."
                    rows={2}
                    disabled={isLocked}
                    data-testid="textarea-delivery-address"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Instructions</Label>
                  <Textarea
                    value={deliveryInstructions}
                    onChange={(e) => {
                      setDeliveryInstructions(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Special delivery instructions..."
                    rows={2}
                    disabled={isLocked}
                    data-testid="textarea-delivery-instructions"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Include GST</span>
                  <Switch
                    checked={includeGst}
                    onCheckedChange={setIncludeGst}
                    data-testid="switch-include-gst"
                  />
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium" data-testid="text-subtotal">
                    {formatCurrency(subtotal)}
                  </span>
                </div>
                {includeGst && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST (10%)</span>
                    <span className="font-medium" data-testid="text-gst">
                      {formatCurrency(gstAmount)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span data-testid="text-total">{formatCurrency(total)}</span>
                </div>
              </CardContent>
            </Card>

            {project && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium text-sm">{project.name}</p>
                  {project.address && (
                    <p className="text-xs text-muted-foreground mt-1">{project.address}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isImportScopeDialogOpen} onOpenChange={setIsImportScopeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Scope from Project</DialogTitle>
            <DialogDescription>
              This will replace the current scope with the project's scope content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportScopeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportProjectScope}>
              Import Scope
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
