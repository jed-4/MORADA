import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Edit3, 
  GripVertical,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { PurchaseOrderTemplate, CostCode } from "@shared/schema";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CASVA_LILAC = '#bba7db';

interface POItem {
  id: string;
  description: string;
  quantity?: string;
  unit?: string;
  unitPrice?: number;
  costCodeId?: string;
  sortOrder: number;
}

const UNITS = [
  "ea", "m", "m2", "m3", "lm", "kg", "t", "L", "hrs", "days", "lot", "set",
];

interface SortableItemProps {
  item: POItem;
  costCodes: CostCode[];
  onEdit: (item: POItem) => void;
  onDelete: (id: string) => void;
}

function SortableItem({ item, costCodes, onEdit, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const costCode = costCodes.find(c => c.id === item.costCodeId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 p-2 border rounded-md bg-card hover-elevate"
      data-testid={`item-${item.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-clamp-1">{item.description}</p>
        {costCode && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {costCode.code} - {costCode.name}
          </p>
        )}
      </div>

      {item.quantity && (
        <Badge variant="outline" className="h-5 text-[10px] flex-shrink-0">
          {item.quantity} {item.unit || 'ea'}
        </Badge>
      )}

      {item.unitPrice !== undefined && item.unitPrice > 0 && (
        <div className="text-xs font-medium text-muted-foreground">
          ${(item.unitPrice / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            data-testid={`button-menu-item-${item.id}`}
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(item)} data-testid={`menu-edit-${item.id}`}>
            <Edit3 className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onDelete(item.id)} 
            className="text-destructive"
            data-testid={`menu-delete-${item.id}`}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function POTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<POItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  
  const [newItem, setNewItem] = useState<Partial<POItem>>({
    description: "",
    quantity: "",
    unit: "ea",
    unitPrice: undefined,
    costCodeId: undefined,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: template, isLoading } = useQuery<PurchaseOrderTemplate>({
    queryKey: ["/api/purchase-order-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-order-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PurchaseOrderTemplate>) => {
      return await apiRequest(`/api/purchase-order-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates"] });
      toast({
        title: "Template updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const items: POItem[] = ((template?.items as POItem[]) || []).map((item, idx) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    sortOrder: item.sortOrder ?? idx,
  }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(item => item.id === active.id);
    const newIndex = items.findIndex(item => item.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx,
    }));

    updateMutation.mutate({ items: newItems });
  };

  const handleAddItem = () => {
    if (!newItem.description?.trim()) {
      toast({
        title: "Missing description",
        description: "Please enter an item description.",
        variant: "destructive",
      });
      return;
    }

    const newItemData: POItem = {
      id: crypto.randomUUID(),
      description: newItem.description.trim(),
      quantity: newItem.quantity?.trim() || undefined,
      unit: newItem.unit || "ea",
      unitPrice: newItem.unitPrice ? Math.round(newItem.unitPrice * 100) : undefined,
      costCodeId: newItem.costCodeId,
      sortOrder: items.length,
    };

    updateMutation.mutate({ items: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setNewItem({
      description: "",
      quantity: "",
      unit: "ea",
      unitPrice: undefined,
      costCodeId: undefined,
    });
  };

  const handleEditItem = (item: POItem) => {
    setEditingItem({
      ...item,
      unitPrice: item.unitPrice ? item.unitPrice / 100 : undefined,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editingItem.description?.trim()) {
      toast({
        title: "Missing description",
        description: "Please enter an item description.",
        variant: "destructive",
      });
      return;
    }

    const updatedItems = items.map(item =>
      item.id === editingItem.id ? {
        ...editingItem,
        unitPrice: editingItem.unitPrice ? Math.round(editingItem.unitPrice * 100) : undefined,
      } : item
    );

    updateMutation.mutate({ items: updatedItems });
    setEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string) => {
    const updatedItems = items.filter(item => item.id !== id);
    updateMutation.mutate({ items: updatedItems });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/po-templates")}>
          Back to PO Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/po-templates")}
            className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold line-clamp-1" data-testid="text-template-name">
            {template.name}
          </h2>
          <Badge variant="outline" className="text-xs">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-6 flex items-center justify-center rounded-md border hover-elevate"
            onClick={() => setSettingsDialogOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-3 w-3" />
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setAddItemDialogOpen(true)}
            data-testid="button-add-item"
          >
            <Plus className="h-3 w-3" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add purchase order line items to this template
            </p>
            <button
              className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
              onClick={() => setAddItemDialogOpen(true)}
              data-testid="button-add-first-item"
            >
              <Plus className="h-3 w-3" />
              Add Item
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {items.sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    costCodes={costCodes}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent data-testid="dialog-add-item">
          <DialogHeader>
            <DialogTitle>Add PO Item</DialogTitle>
            <DialogDescription>
              Add a new line item to this purchase order template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="e.g., Concrete 25MPa"
                value={newItem.description || ""}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Cost Code</Label>
              <Select
                value={newItem.costCodeId || "none"}
                onValueChange={(value) => setNewItem({ ...newItem, costCodeId: value === "none" ? undefined : value })}
              >
                <SelectTrigger data-testid="select-cost-code">
                  <SelectValue placeholder="Select cost code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No cost code</SelectItem>
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id}>
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  placeholder="e.g., 10"
                  value={newItem.quantity || ""}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  data-testid="input-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={newItem.unit || "ea"}
                  onValueChange={(value) => setNewItem({ ...newItem, unit: value })}
                >
                  <SelectTrigger data-testid="select-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newItem.unitPrice || ""}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || undefined })}
                  data-testid="input-unit-price"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddItem}
              disabled={updateMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-add"
            >
              {updateMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-item">
          <DialogHeader>
            <DialogTitle>Edit PO Item</DialogTitle>
            <DialogDescription>
              Update this purchase order line item.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Code</Label>
                <Select
                  value={editingItem.costCodeId || "none"}
                  onValueChange={(value) => setEditingItem({ ...editingItem, costCodeId: value === "none" ? undefined : value })}
                >
                  <SelectTrigger data-testid="select-edit-cost-code">
                    <SelectValue placeholder="Select cost code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No cost code</SelectItem>
                    {costCodes.map((code) => (
                      <SelectItem key={code.id} value={code.id}>
                        {code.code} - {code.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    value={editingItem.quantity || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })}
                    data-testid="input-edit-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select
                    value={editingItem.unit || "ea"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, unit: value })}
                  >
                    <SelectTrigger data-testid="select-edit-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Unit Price ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.unitPrice || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, unitPrice: parseFloat(e.target.value) || undefined })}
                    data-testid="input-edit-unit-price"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update template details and default scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={template.name}
                onChange={(e) => updateMutation.mutate({ name: e.target.value })}
                data-testid="input-settings-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={template.description || ""}
                onChange={(e) => updateMutation.mutate({ description: e.target.value })}
                placeholder="Brief description of this template..."
                rows={2}
                data-testid="input-settings-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope of Work</Label>
              <Textarea
                value={template.scope || ""}
                onChange={(e) => updateMutation.mutate({ scope: e.target.value })}
                placeholder="Default scope of work text..."
                rows={4}
                data-testid="input-settings-scope"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
