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
  FileText,
} from "lucide-react";
import type { RfqTemplate, TemplateCategory } from "@shared/schema";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CASVA_LILAC = '#bba7db';

interface RfqItem {
  id: string;
  description: string;
  quantity?: string;
  unit?: string;
  notes?: string;
  sortOrder: number;
}

const UNITS = [
  "ea", "m", "m2", "m3", "lm", "kg", "t", "L", "hrs", "days", "lot", "set",
];

interface SortableItemProps {
  item: RfqItem;
  onEdit: (item: RfqItem) => void;
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
        {item.notes && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.notes}</p>
        )}
      </div>

      {item.quantity && (
        <Badge variant="outline" className="h-5 text-[10px] flex-shrink-0">
          {item.quantity} {item.unit || 'ea'}
        </Badge>
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

export default function RfqTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RfqItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  
  const [newItem, setNewItem] = useState<Partial<RfqItem>>({
    description: "",
    quantity: "",
    unit: "ea",
    notes: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: template, isLoading } = useQuery<RfqTemplate>({
    queryKey: ["/api/rfq-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/rfq-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", "rfq"],
    queryFn: async () => {
      const response = await fetch("/api/template-categories?templateType=rfq");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<RfqTemplate>) => {
      return await apiRequest(`/api/rfq-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates"] });
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

  const items: RfqItem[] = ((template?.items as RfqItem[]) || []).map((item, idx) => ({
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

    const newItemData: RfqItem = {
      id: crypto.randomUUID(),
      description: newItem.description.trim(),
      quantity: newItem.quantity?.trim() || undefined,
      unit: newItem.unit || "ea",
      notes: newItem.notes?.trim() || undefined,
      sortOrder: items.length,
    };

    updateMutation.mutate({ items: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setNewItem({
      description: "",
      quantity: "",
      unit: "ea",
      notes: "",
    });
  };

  const handleEditItem = (item: RfqItem) => {
    setEditingItem(item);
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
      item.id === editingItem.id ? editingItem : item
    );

    updateMutation.mutate({ items: updatedItems });
    setEditDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string) => {
    const updatedItems = items.filter(item => item.id !== id);
    updateMutation.mutate({ items: updatedItems });
  };

  const getCategoryBreadcrumb = (categoryId: string | null | undefined): string => {
    if (!categoryId) return "";
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return "";
    
    const breadcrumbParts: string[] = [category.name];
    let currentCategory = category;
    
    while (currentCategory.parentId) {
      const parent = categories.find((c) => c.id === currentCategory.parentId);
      if (parent) {
        breadcrumbParts.unshift(parent.name);
        currentCategory = parent;
      } else {
        break;
      }
    }
    
    return breadcrumbParts.join(" / ");
  };

  const buildCategoryTree = () => {
    const rootCategories = categories.filter((c) => !c.parentId);
    const tree: { id: string; name: string; depth: number }[] = [];
    
    const addChildren = (parentId: string | null, depth: number) => {
      const children = categories.filter((c) => c.parentId === parentId);
      children.forEach((child) => {
        tree.push({ id: child.id, name: child.name, depth });
        addChildren(child.id, depth + 1);
      });
    };
    
    rootCategories.forEach((root) => {
      tree.push({ id: root.id, name: root.name, depth: 0 });
      addChildren(root.id, 1);
    });
    
    return tree;
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
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/rfq-templates")}>
          Back to RFQ Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/rfq-templates")}
            className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold line-clamp-1" data-testid="text-template-name">
            {template.name}
          </h2>
          {template.tradeName && (
            <Badge variant="secondary" className="text-xs">
              {template.tradeName}
            </Badge>
          )}
          {getCategoryBreadcrumb(template.categoryId) && (
            <Badge variant="outline" className="text-xs">
              {getCategoryBreadcrumb(template.categoryId)}
            </Badge>
          )}
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
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No items yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add RFQ line items to this template
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
            <DialogTitle>Add RFQ Item</DialogTitle>
            <DialogDescription>
              Add a new line item to this RFQ template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="e.g., Supply and install kitchen cabinetry"
                value={newItem.description || ""}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes or specifications..."
                value={newItem.notes || ""}
                onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                rows={2}
                data-testid="input-notes"
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-item">
          <DialogHeader>
            <DialogTitle>Edit RFQ Item</DialogTitle>
            <DialogDescription>
              Update this RFQ line item.
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
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editingItem.notes || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  rows={2}
                  data-testid="input-edit-notes"
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

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update template details and default text.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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
              <Select
                value={template.categoryId || "none"}
                onValueChange={(value) => updateMutation.mutate({ categoryId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-settings-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {buildCategoryTree().map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span style={{ paddingLeft: `${cat.depth * 12}px` }}>
                        {cat.depth > 0 ? "└ " : ""}{cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Trade Name</Label>
              <Input
                value={template.tradeName || ""}
                onChange={(e) => updateMutation.mutate({ tradeName: e.target.value })}
                placeholder="e.g., Electrical, Plumbing"
                data-testid="input-settings-trade"
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
              <Label>Introduction Text</Label>
              <Textarea
                value={template.introText || ""}
                onChange={(e) => updateMutation.mutate({ introText: e.target.value })}
                placeholder="Text to appear at the start of RFQs using this template..."
                rows={3}
                data-testid="input-settings-intro"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope of Work</Label>
              <Textarea
                value={template.scope || ""}
                onChange={(e) => updateMutation.mutate({ scope: e.target.value })}
                placeholder="Define the scope of work..."
                rows={3}
                data-testid="input-settings-scope"
              />
            </div>
            <div className="space-y-2">
              <Label>Terms and Conditions</Label>
              <Textarea
                value={template.termsAndConditions || ""}
                onChange={(e) => updateMutation.mutate({ termsAndConditions: e.target.value })}
                placeholder="Standard terms and conditions..."
                rows={3}
                data-testid="input-settings-terms"
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
