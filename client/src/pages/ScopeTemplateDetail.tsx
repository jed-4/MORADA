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
  Layers,
  Settings,
} from "lucide-react";
import type { ScopeTemplate } from "@shared/schema";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CASVA_LILAC = '#bba7db';

interface TemplateItem {
  id: string;
  title: string;
  description?: string;
  itemType?: string;
  quantity?: number;
  rate?: number;
  stage?: string;
  sortOrder: number;
}

interface SortableItemProps {
  item: TemplateItem;
  onEdit: (item: TemplateItem) => void;
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
          <span className="font-medium text-sm">{item.title}</span>
          {item.itemType && (
            <Badge variant="outline" className="h-4 text-[10px]">
              {item.itemType}
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
        )}
      </div>

      {item.quantity && item.rate && (
        <div className="text-xs text-muted-foreground">
          {item.quantity} × ${(item.rate / 100).toFixed(2)}
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

export default function ScopeTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(['default']));
  
  const [newItem, setNewItem] = useState<Partial<TemplateItem>>({
    title: "",
    description: "",
    itemType: "Labour",
    quantity: 1,
    rate: 0,
    stage: "default",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: template, isLoading } = useQuery<ScopeTemplate>({
    queryKey: ["/api/scope-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/scope-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ScopeTemplate>) => {
      return await apiRequest(`/api/scope-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
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

  const items: TemplateItem[] = (template?.templateData as TemplateItem[]) || [];

  const stages = [...new Set(items.map(item => item.stage || 'default'))];
  if (stages.length === 0) stages.push('default');

  const getItemsByStage = (stage: string) => {
    return items.filter(item => (item.stage || 'default') === stage)
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
    if (!newItem.title?.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter an item title.",
        variant: "destructive",
      });
      return;
    }

    const newItemData: TemplateItem = {
      id: crypto.randomUUID(),
      title: newItem.title.trim(),
      description: newItem.description?.trim(),
      itemType: newItem.itemType,
      quantity: newItem.quantity,
      rate: newItem.rate ? Math.round(newItem.rate * 100) : undefined,
      stage: newItem.stage || 'default',
      sortOrder: items.length,
    };

    updateMutation.mutate({ templateData: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setNewItem({
      title: "",
      description: "",
      itemType: "Labour",
      quantity: 1,
      rate: 0,
      stage: "default",
    });
  };

  const handleEditItem = (item: TemplateItem) => {
    setEditingItem({
      ...item,
      rate: item.rate ? item.rate / 100 : 0,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    const updatedItems = items.map(item => 
      item.id === editingItem.id 
        ? { 
            ...editingItem, 
            rate: editingItem.rate ? Math.round(editingItem.rate * 100) : undefined 
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

  const toggleStage = (stage: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
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
        <Button variant="outline" onClick={() => navigate("/scope-templates")}>
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
          onClick={() => navigate("/scope-templates")}
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
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add scope items to this template
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
              {stages.map(stage => {
                const stageItems = getItemsByStage(stage);
                const isExpanded = expandedStages.has(stage);
                
                return (
                  <div key={stage} className="border rounded-md">
                    <div 
                      className="flex items-center gap-2 p-2 bg-muted/50 cursor-pointer"
                      onClick={() => toggleStage(stage)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm capitalize">
                        {stage === 'default' ? 'General' : stage}
                      </span>
                      <Badge variant="outline" className="h-4 text-[10px]">
                        {stageItems.length}
                      </Badge>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-2 space-y-2">
                        <SortableContext
                          items={stageItems.map(item => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stageItems.map(item => (
                            <SortableItem
                              key={item.id}
                              item={item}
                              onEdit={handleEditItem}
                              onDelete={handleDeleteItem}
                            />
                          ))}
                        </SortableContext>
                        
                        {stageItems.length === 0 && (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            No items in this stage
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
            <DialogTitle>Add Scope Item</DialogTitle>
            <DialogDescription>
              Add a new item to this scope template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="e.g., Foundation Works"
                value={newItem.title || ""}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                data-testid="input-item-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe this scope item..."
                value={newItem.description || ""}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
                data-testid="input-item-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newItem.itemType || "Labour"}
                  onValueChange={(value) => setNewItem({ ...newItem, itemType: value })}
                >
                  <SelectTrigger data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Labour">Labour</SelectItem>
                    <SelectItem value="Material">Material</SelectItem>
                    <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="Equipment">Equipment</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select
                  value={newItem.stage || "default"}
                  onValueChange={(value) => setNewItem({ ...newItem, stage: value })}
                >
                  <SelectTrigger data-testid="select-item-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">General</SelectItem>
                    <SelectItem value="foundation">Foundation</SelectItem>
                    <SelectItem value="framing">Framing</SelectItem>
                    <SelectItem value="roofing">Roofing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="finishing">Finishing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={newItem.quantity || ""}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || undefined })}
                  data-testid="input-item-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Rate ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.rate || ""}
                  onChange={(e) => setNewItem({ ...newItem, rate: parseFloat(e.target.value) || undefined })}
                  data-testid="input-item-rate"
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
            <DialogTitle>Edit Scope Item</DialogTitle>
            <DialogDescription>
              Update this scope item.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  data-testid="input-edit-title"
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
                  <Label>Type</Label>
                  <Select
                    value={editingItem.itemType || "Labour"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, itemType: value })}
                  >
                    <SelectTrigger data-testid="select-edit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Labour">Labour</SelectItem>
                      <SelectItem value="Material">Material</SelectItem>
                      <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                      <SelectItem value="Equipment">Equipment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select
                    value={editingItem.stage || "default"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, stage: value })}
                  >
                    <SelectTrigger data-testid="select-edit-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">General</SelectItem>
                      <SelectItem value="foundation">Foundation</SelectItem>
                      <SelectItem value="framing">Framing</SelectItem>
                      <SelectItem value="roofing">Roofing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="finishing">Finishing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editingItem.quantity || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || undefined })}
                    data-testid="input-edit-quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rate ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.rate || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, rate: parseFloat(e.target.value) || undefined })}
                    data-testid="input-edit-rate"
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
