import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import type { CostCode } from "@shared/schema";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Plus, 
  MoreVertical, 
  Trash2, 
  Edit3, 
  GripVertical,
  ChevronDown,
  ChevronRight,
  Calculator,
  Settings,
  DollarSign,
} from "lucide-react";
import type { EstimateTemplate } from "@shared/schema";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TemplateItem {
  id: string;
  groupName?: string;
  name: string;
  description?: string;
  costCodeId?: string;
  costCodeTitle?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  markup?: number;
  sortOrder: number;
  isGroup: boolean;
  parentGroupName?: string;
}

interface SortableItemProps {
  item: TemplateItem;
  onEdit: (item: TemplateItem) => void;
  onDelete: (item: TemplateItem) => void;
}

function SortableItem({ item, onEdit, onDelete }: SortableItemProps) {
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

  const total = item.quantity && item.unitPrice 
    ? (item.quantity * item.unitPrice * (1 + (item.markup || 0) / 100)) 
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 border rounded-md bg-card hover-elevate group ${item.isGroup ? 'bg-muted/30 font-medium' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab hover:bg-muted rounded p-1"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${item.isGroup ? 'font-semibold' : ''}`}>{item.name}</span>
        </div>
        {item.description && !item.isGroup && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
        )}
      </div>

      {!item.isGroup && (
        <>
          {/* Cost Code Chip - Fixed width with truncation */}
          <div className="w-24 flex-shrink-0">
            {item.costCodeTitle ? (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] max-w-full truncate block text-center">
                {item.costCodeTitle}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">-</span>
            )}
          </div>
          {/* Quantity */}
          <div className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
            {item.quantity || 0} {item.unit || ''}
          </div>
          {/* Unit Price */}
          <div className="text-xs text-muted-foreground w-20 text-right flex-shrink-0">
            ${((item.unitPrice || 0) / 100).toFixed(2)}
          </div>
          {/* Markup */}
          <div className="text-xs text-muted-foreground w-14 text-right flex-shrink-0">
            {item.markup ? `${item.markup}%` : '-'}
          </div>
          {/* Total */}
          <div className="text-xs font-medium w-24 text-right flex items-center justify-end gap-1 flex-shrink-0">
            <DollarSign className="h-3 w-3" />
            {(total / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </>
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
            onClick={() => onDelete(item)} 
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

export default function EstimateTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['ungrouped']));
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TemplateItem | null>(null);
  
  const [newItem, setNewItem] = useState<Partial<TemplateItem>>({
    name: "",
    description: "",
    costCodeId: "",
    costCodeTitle: "",
    unit: "m2",
    quantity: 1,
    unitPrice: 0,
    markup: 0,
    isGroup: false,
    groupName: "ungrouped",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Fetch cost codes for dropdown and lookups
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Create a map for cost code lookups
  const costCodeMap = useMemo(() => {
    const map = new Map<string, CostCode>();
    costCodes.forEach((cc) => map.set(cc.id, cc));
    return map;
  }, [costCodes]);

  const getCostCodeDisplay = (costCodeId: string | undefined) => {
    if (!costCodeId) return "";
    const cc = costCodeMap.get(costCodeId);
    return cc ? `${cc.code} - ${cc.title}` : "";
  };

  const { data: template, isLoading } = useQuery<EstimateTemplate>({
    queryKey: ["/api/estimate-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/estimate-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<EstimateTemplate>) => {
      return await apiRequest(`/api/estimate-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
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

  // Preserve existing IDs from template data - use useMemo for stability
  const items: TemplateItem[] = useMemo(() => {
    return ((template?.templateData as TemplateItem[]) || []).map((item, idx) => ({
      ...item,
      sortOrder: item.sortOrder ?? idx,
    }));
  }, [template?.templateData]);

  const groups = [...new Set(items.map(item => item.groupName || 'ungrouped'))];
  if (groups.length === 0) groups.push('ungrouped');

  const getItemsByGroup = (group: string) => {
    return items.filter(item => (item.groupName || 'ungrouped') === group && !item.isGroup)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(item => item.id === active.id);
    const newIndex = items.findIndex(item => item.id === over.id);

    const newItems = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx,
    }));

    updateMutation.mutate({ templateData: newItems });
  };

  const handleAddItem = () => {
    if (!newItem.name?.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter an item name.",
        variant: "destructive",
      });
      return;
    }

    const newItemData: TemplateItem = {
      id: crypto.randomUUID(),
      name: newItem.name.trim(),
      description: newItem.description?.trim(),
      costCodeId: newItem.costCodeId || undefined,
      costCodeTitle: newItem.costCodeId ? getCostCodeDisplay(newItem.costCodeId) : undefined,
      unit: newItem.unit,
      quantity: newItem.quantity,
      unitPrice: newItem.unitPrice ? Math.round(newItem.unitPrice * 100) : 0,
      markup: newItem.markup || 0,
      isGroup: newItem.isGroup || false,
      groupName: newItem.groupName || 'ungrouped',
      sortOrder: items.length,
    };

    updateMutation.mutate({ templateData: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setNewItem({
      name: "",
      description: "",
      costCodeId: "",
      costCodeTitle: "",
      unit: "m2",
      quantity: 1,
      unitPrice: 0,
      markup: 0,
      isGroup: false,
      groupName: "ungrouped",
    });
  };

  const handleEditItem = (item: TemplateItem) => {
    setEditingItem({
      ...item,
      unitPrice: item.unitPrice ? item.unitPrice / 100 : 0,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    const updatedItems = items.map(item => 
      item.id === editingItem.id 
        ? { 
            ...editingItem, 
            costCodeTitle: editingItem.costCodeId ? getCostCodeDisplay(editingItem.costCodeId) : undefined,
            unitPrice: editingItem.unitPrice ? Math.round(editingItem.unitPrice * 100) : 0 
          } 
        : item
    );

    updateMutation.mutate({ templateData: updatedItems });
    setEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (item: TemplateItem) => {
    setDeleteConfirmItem(item);
  };

  const confirmDeleteItem = () => {
    if (!deleteConfirmItem) return;
    console.log('[DEBUG] confirmDeleteItem called');
    console.log('[DEBUG] deleteConfirmItem:', deleteConfirmItem);
    console.log('[DEBUG] items before filter:', items.length, items.map(i => ({ id: i.id, name: i.name })));
    const updatedItems = items.filter(item => item.id !== deleteConfirmItem.id);
    console.log('[DEBUG] updatedItems after filter:', updatedItems.length, updatedItems.map(i => ({ id: i.id, name: i.name })));
    updateMutation.mutate({ templateData: updatedItems });
    setDeleteConfirmItem(null);
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const calculateTotal = () => {
    return items
      .filter(item => !item.isGroup)
      .reduce((acc, item) => {
        const lineTotal = (item.quantity || 0) * (item.unitPrice || 0) * (1 + (item.markup || 0) / 100);
        return acc + lineTotal;
      }, 0);
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
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-muted-foreground">Template not found</div>
        <Button variant="outline" onClick={() => navigate("/estimate-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Row 1 - Back + Title */}
      <div className="h-9 bg-background flex items-center px-2 gap-3 border-b border-border flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => navigate("/estimate-templates")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold" data-testid="text-template-name">
          {template.name}
        </h2>
        <Badge variant="outline" className="text-xs">
          {items.filter(i => !i.isGroup).length} {items.filter(i => !i.isGroup).length === 1 ? 'item' : 'items'}
        </Badge>
        <div className="ml-auto text-sm font-medium">
          Total: ${(calculateTotal() / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* Header Row 2 - Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setSettingsDialogOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-3 w-3 mr-1" />
            Settings
          </Button>
        </div>
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
          onClick={() => setAddItemDialogOpen(true)}
          data-testid="button-add-item"
        >
          <Plus className="w-3 h-3" />
          <span>Add Item</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add estimate items to this template
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
            <div className="space-y-4">
              {groups.map(group => {
                const groupItems = getItemsByGroup(group);
                const isExpanded = expandedGroups.has(group);
                const groupTotal = groupItems.reduce((acc, item) => {
                  return acc + (item.quantity || 0) * (item.unitPrice || 0) * (1 + (item.markup || 0) / 100);
                }, 0);
                
                return (
                  <div key={group} className="border rounded-md">
                    <div 
                      className="flex items-center gap-2 p-2 bg-muted/50 cursor-pointer"
                      onClick={() => toggleGroup(group)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm capitalize">
                        {group === 'ungrouped' ? 'General' : group}
                      </span>
                      <Badge variant="outline" className="h-4 text-[10px]">
                        {groupItems.length}
                      </Badge>
                      <div className="ml-auto text-xs font-medium">
                        ${(groupTotal / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-2 space-y-2">
                        <SortableContext
                          items={groupItems.map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {groupItems.map(item => (
                            <SortableItem
                              key={item.id}
                              item={item}
                              onEdit={handleEditItem}
                              onDelete={handleDeleteItem}
                            />
                          ))}
                        </SortableContext>
                        
                        {groupItems.length === 0 && (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            No items in this group
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DndContext>
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent data-testid="dialog-add-item">
          <DialogHeader>
            <DialogTitle>Add Estimate Item</DialogTitle>
            <DialogDescription>
              Add a new line item to this estimate template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input
                placeholder="e.g., Concrete Slab"
                value={newItem.name || ""}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this item..."
                value={newItem.description || ""}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cost Code</Label>
                <CostCodeSelect
                  value={newItem.costCodeId || ""}
                  onValueChange={(value) => setNewItem({ ...newItem, costCodeId: value })}
                  placeholder="Select cost code..."
                  data-testid="select-cost-code"
                />
              </div>
              <div className="space-y-2">
                <Label>Group</Label>
                <Input
                  placeholder="e.g., Foundations"
                  value={newItem.groupName || ""}
                  onChange={(e) => setNewItem({ ...newItem, groupName: e.target.value })}
                  data-testid="input-group"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.quantity || ""}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || undefined })}
                  data-testid="input-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={newItem.unit || "m2"}
                  onValueChange={(value) => setNewItem({ ...newItem, unit: value })}
                >
                  <SelectTrigger data-testid="select-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="m2">m²</SelectItem>
                    <SelectItem value="m3">m³</SelectItem>
                    <SelectItem value="lm">LM</SelectItem>
                    <SelectItem value="ea">Each</SelectItem>
                    <SelectItem value="hr">Hour</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="item">Item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.unitPrice || ""}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || undefined })}
                  data-testid="input-unit-price"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Markup (%)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={newItem.markup || ""}
                onChange={(e) => setNewItem({ ...newItem, markup: parseFloat(e.target.value) || undefined })}
                data-testid="input-markup"
              />
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

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-item">
          <DialogHeader>
            <DialogTitle>Edit Estimate Item</DialogTitle>
            <DialogDescription>
              Update this estimate line item.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Code</Label>
                  <CostCodeSelect
                    value={editingItem.costCodeId || ""}
                    onValueChange={(value) => setEditingItem({ ...editingItem, costCodeId: value })}
                    placeholder="Select cost code..."
                    data-testid="select-edit-cost-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Group</Label>
                  <Input
                    value={editingItem.groupName || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, groupName: e.target.value })}
                    data-testid="input-edit-group"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.quantity || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || undefined })}
                    data-testid="input-edit-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select
                    value={editingItem.unit || "m2"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, unit: value })}
                  >
                    <SelectTrigger data-testid="select-edit-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m2">m²</SelectItem>
                      <SelectItem value="m3">m³</SelectItem>
                      <SelectItem value="lm">LM</SelectItem>
                      <SelectItem value="ea">Each</SelectItem>
                      <SelectItem value="hr">Hour</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="item">Item</SelectItem>
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
              <div className="space-y-2">
                <Label>Markup (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={editingItem.markup || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, markup: parseFloat(e.target.value) || undefined })}
                  data-testid="input-edit-markup"
                />
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

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update template name and description.
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
                placeholder="Describe this template..."
                rows={3}
                data-testid="input-settings-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmItem?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
