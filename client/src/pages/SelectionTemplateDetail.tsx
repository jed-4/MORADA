import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  CheckSquare,
  Settings,
  DollarSign,
} from "lucide-react";
import type { SelectionTemplate } from "@shared/schema";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CASVA_LILAC = '#bba7db';

interface SelectionItem {
  id: string;
  categoryName: string;
  itemName: string;
  description?: string;
  allowanceType?: "PC" | "PS";
  budgetAmount?: number;
  sortOrder: number;
}

interface SortableItemProps {
  item: SelectionItem;
  onEdit: (item: SelectionItem) => void;
  onDelete: (id: string) => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 border rounded-md bg-card hover-elevate group"
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
          <span className="font-medium text-sm">{item.itemName}</span>
          {item.allowanceType && (
            <Badge variant="outline" className="h-4 text-[10px]">
              {item.allowanceType}
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
        )}
      </div>

      {item.budgetAmount && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          {(item.budgetAmount / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
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

export default function SelectionTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SelectionItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['General']));
  
  const [newItem, setNewItem] = useState<Partial<SelectionItem>>({
    categoryName: "General",
    itemName: "",
    description: "",
    allowanceType: undefined,
    budgetAmount: undefined,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: template, isLoading } = useQuery<SelectionTemplate>({
    queryKey: ["/api/selection-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/selection-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<SelectionTemplate>) => {
      return await apiRequest(`/api/selection-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
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

  const items: SelectionItem[] = ((template?.templateData as SelectionItem[]) || []).map((item, idx) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
    sortOrder: item.sortOrder ?? idx,
  }));

  const categories = [...new Set(items.map(item => item.categoryName || 'General'))];
  if (categories.length === 0) categories.push('General');

  const getItemsByCategory = (category: string) => {
    return items.filter(item => (item.categoryName || 'General') === category)
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
    if (!newItem.itemName?.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter an item name.",
        variant: "destructive",
      });
      return;
    }

    const newItemData: SelectionItem = {
      id: crypto.randomUUID(),
      categoryName: newItem.categoryName || "General",
      itemName: newItem.itemName.trim(),
      description: newItem.description?.trim(),
      allowanceType: newItem.allowanceType,
      budgetAmount: newItem.budgetAmount ? Math.round(newItem.budgetAmount * 100) : undefined,
      sortOrder: items.length,
    };

    updateMutation.mutate({ templateData: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setNewItem({
      categoryName: "General",
      itemName: "",
      description: "",
      allowanceType: undefined,
      budgetAmount: undefined,
    });
  };

  const handleEditItem = (item: SelectionItem) => {
    setEditingItem({
      ...item,
      budgetAmount: item.budgetAmount ? item.budgetAmount / 100 : undefined,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    const updatedItems = items.map(item => 
      item.id === editingItem.id 
        ? { 
            ...editingItem, 
            budgetAmount: editingItem.budgetAmount ? Math.round(editingItem.budgetAmount * 100) : undefined 
          } 
        : item
    );

    updateMutation.mutate({ templateData: updatedItems });
    setEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (itemId: string) => {
    const updatedItems = items.filter(item => item.id !== itemId);
    updateMutation.mutate({ templateData: updatedItems });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
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
        <Button variant="outline" onClick={() => navigate("/selection-templates")}>
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
          onClick={() => navigate("/selection-templates")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold" data-testid="text-template-name">
          {template.name}
        </h2>
        {template.category && (
          <Badge variant="secondary" className="text-xs">
            {template.category}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Badge>
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
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add selection items to this template
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
              {categories.map(category => {
                const categoryItems = getItemsByCategory(category);
                const isExpanded = expandedCategories.has(category);
                
                return (
                  <div key={category} className="border rounded-md">
                    <div 
                      className="flex items-center gap-2 p-2 bg-muted/50 cursor-pointer"
                      onClick={() => toggleCategory(category)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{category}</span>
                      <Badge variant="outline" className="h-4 text-[10px]">
                        {categoryItems.length}
                      </Badge>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-2 space-y-2">
                        <SortableContext
                          items={categoryItems.map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {categoryItems.map(item => (
                            <SortableItem
                              key={item.id}
                              item={item}
                              onEdit={handleEditItem}
                              onDelete={handleDeleteItem}
                            />
                          ))}
                        </SortableContext>
                        
                        {categoryItems.length === 0 && (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            No items in this category
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
            <DialogTitle>Add Selection Item</DialogTitle>
            <DialogDescription>
              Add a new item to this selection template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input
                placeholder="e.g., Kitchen Benchtop"
                value={newItem.itemName || ""}
                onChange={(e) => setNewItem({ ...newItem, itemName: e.target.value })}
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                placeholder="e.g., Kitchen, Bathroom"
                value={newItem.categoryName || "General"}
                onChange={(e) => setNewItem({ ...newItem, categoryName: e.target.value })}
                data-testid="input-category"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this selection item..."
                value={newItem.description || ""}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Allowance Type</Label>
                <Select
                  value={newItem.allowanceType || "none"}
                  onValueChange={(value) => setNewItem({ ...newItem, allowanceType: value === "none" ? undefined : value as "PC" | "PS" })}
                >
                  <SelectTrigger data-testid="select-allowance-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="PC">Prime Cost (PC)</SelectItem>
                    <SelectItem value="PS">Provisional Sum (PS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Budget Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.budgetAmount || ""}
                  onChange={(e) => setNewItem({ ...newItem, budgetAmount: parseFloat(e.target.value) || undefined })}
                  data-testid="input-budget"
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

      {/* Edit Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-item">
          <DialogHeader>
            <DialogTitle>Edit Selection Item</DialogTitle>
            <DialogDescription>
              Update this selection item.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Item Name *</Label>
                <Input
                  value={editingItem.itemName}
                  onChange={(e) => setEditingItem({ ...editingItem, itemName: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={editingItem.categoryName || "General"}
                  onChange={(e) => setEditingItem({ ...editingItem, categoryName: e.target.value })}
                  data-testid="input-edit-category"
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
                  <Label>Allowance Type</Label>
                  <Select
                    value={editingItem.allowanceType || "none"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, allowanceType: value === "none" ? undefined : value as "PC" | "PS" })}
                  >
                    <SelectTrigger data-testid="select-edit-allowance">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="PC">Prime Cost (PC)</SelectItem>
                      <SelectItem value="PS">Provisional Sum (PS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Budget Amount ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.budgetAmount || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, budgetAmount: parseFloat(e.target.value) || undefined })}
                    data-testid="input-edit-budget"
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

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update template name, category, and description.
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
              <Label>Category</Label>
              <Input
                value={template.category || ""}
                onChange={(e) => updateMutation.mutate({ category: e.target.value })}
                placeholder="e.g., Residential, Commercial"
                data-testid="input-settings-category"
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
    </div>
  );
}
