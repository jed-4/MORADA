import { useState, useRef, useEffect } from "react";
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
  DropdownMenuSeparator,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Pen,
  Filter,
  FolderPlus,
  Check,
} from "lucide-react";
import type { ScopeTemplate, Project } from "@shared/schema";

const ITEM_TYPES = ['e-note', 'scope', 'note', 'tool', 'material'] as const;
type ItemType = typeof ITEM_TYPES[number];

const getTypeLabel = (type: string | null | undefined): string => {
  const typeMap: Record<string, string> = {
    'e-note': 'E-NOTE',
    'scope': 'SCOPE',
    'note': 'NOTE',
    'tool': 'TOOL',
    'material': 'MATERIAL',
    // Legacy types - map to closest equivalent
    'Labour': 'SCOPE',
    'Material': 'MATERIAL',
    'Equipment': 'TOOL',
    'Subcontractor': 'SCOPE',
    'Other': 'SCOPE',
  };
  return typeMap[type || 'scope'] || type?.toUpperCase() || 'SCOPE';
};

// Normalize legacy item type to new format
const normalizeItemType = (type: string | null | undefined): string => {
  const legacyMap: Record<string, string> = {
    'Labour': 'scope',
    'Material': 'material',
    'Equipment': 'tool',
    'Subcontractor': 'scope',
    'Other': 'scope',
  };
  if (!type) return 'scope';
  return legacyMap[type] || type;
};
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CASVA_LILAC = '#bba7db';

interface TemplateStage {
  id: string;
  name: string;
  sortOrder: number;
}

interface TemplateItem {
  id: string;
  title: string;
  description?: string;
  itemType?: string;
  quantity?: number;
  rate?: number;
  stageId?: string;
  sortOrder: number;
}

interface TemplateData {
  stages: TemplateStage[];
  items: TemplateItem[];
}

interface SortableItemProps {
  item: TemplateItem;
  onEdit: (item: TemplateItem) => void;
  onDelete: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

function SortableItem({ item, onEdit, onDelete, isSelected, onToggleSelect }: SortableItemProps) {
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

  const combinedStyle = {
    ...style,
    '--tw-ring-color': isSelected ? CASVA_LILAC : undefined,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={combinedStyle}
      className={`flex items-center gap-2 p-2 border rounded-lg bg-card hover-elevate group ${isSelected ? 'ring-2' : ''}`}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleSelect(item.id)}
        className="data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
        data-testid={`checkbox-item-${item.id}`}
      />
      
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
              {getTypeLabel(item.itemType)}
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
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [addStageDialogOpen, setAddStageDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [addingToStageId, setAddingToStageId] = useState<string | null>(null);
  
  const [newItem, setNewItem] = useState<Partial<TemplateItem>>({
    title: "",
    description: "",
    itemType: "scope",
    quantity: 1,
    rate: 0,
    stageId: undefined,
  });

  // Filtering and selection state
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(new Set(ITEM_TYPES));
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [addToProjectDialogOpen, setAddToProjectDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

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

  // Fetch projects for bulk add
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ScopeTemplate>) => {
      return await apiRequest(`/api/scope-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const DEFAULT_STAGE: TemplateStage = {
    id: 'stage-general',
    name: 'General',
    sortOrder: 0,
  };

  const parseTemplateData = (): TemplateData => {
    let rawData = template?.templateData as any;
    
    if (!rawData) {
      return { stages: [DEFAULT_STAGE], items: [] };
    }
    
    if (rawData.templateData && typeof rawData.templateData === 'object') {
      rawData = rawData.templateData;
    }
    
    if (Array.isArray(rawData)) {
      const oldItems = rawData as any[];
      const stageNames = [...new Set(oldItems.map(item => item.stage || 'General'))];
      if (stageNames.length === 0) stageNames.push('General');
      const stages: TemplateStage[] = stageNames.map((name, idx) => ({
        id: `stage-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        sortOrder: idx,
      }));
      const items: TemplateItem[] = oldItems.map(item => ({
        ...item,
        stageId: stages.find(s => s.name === (item.stage || 'General'))?.id,
      }));
      return { stages, items };
    }
    
    const data = rawData as TemplateData;
    const stages = [...(data?.stages || [])];
    const items = data?.items || [];
    
    if (stages.length === 0) {
      stages.push({ ...DEFAULT_STAGE });
    }
    
    return { stages, items };
  };

  const templateData = parseTemplateData();
  const stages = [...templateData.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const items = templateData.items;

  useEffect(() => {
    if (stages.length > 0 && expandedStages.size === 0) {
      setExpandedStages(new Set(stages.map(s => s.id)));
    }
  }, [template?.id]);

  const saveTemplateData = (newData: TemplateData) => {
    updateMutation.mutate({ templateData: newData as unknown as Record<string, unknown> });
  };

  const getItemsByStage = (stageId: string) => {
    return items.filter(item => item.stageId === stageId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const getStageTotal = (stageId: string) => {
    return getItemsByStage(stageId).reduce((sum, item) => {
      const qty = item.quantity || 0;
      const rate = item.rate || 0;
      return sum + (qty * rate);
    }, 0);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItem = items.find(item => item.id === active.id);
    const overItem = items.find(item => item.id === over.id);
    
    if (!activeItem || !overItem) return;
    
    if (activeItem.stageId !== overItem.stageId) {
      return;
    }

    const stageId = activeItem.stageId;
    const stageItems = items.filter(item => item.stageId === stageId);
    const otherItems = items.filter(item => item.stageId !== stageId);
    
    const oldIndex = stageItems.findIndex(item => item.id === active.id);
    const newIndex = stageItems.findIndex(item => item.id === over.id);

    const reorderedStageItems = arrayMove(stageItems, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      sortOrder: idx,
    }));

    saveTemplateData({ stages, items: [...otherItems, ...reorderedStageItems] });
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a stage name.",
        variant: "destructive",
      });
      return;
    }

    const newStage: TemplateStage = {
      id: `stage-${Date.now()}`,
      name: newStageName.trim(),
      sortOrder: stages.length,
    };

    saveTemplateData({ stages: [...stages, newStage], items });
    setExpandedStages(prev => new Set([...prev, newStage.id]));
    setAddStageDialogOpen(false);
    setNewStageName("");
    toast({ title: "Stage added" });
  };

  const handleRenameStage = (stageId: string) => {
    if (!editingStageName.trim()) {
      setEditingStageId(null);
      return;
    }

    const newStages = stages.map(stage =>
      stage.id === stageId ? { ...stage, name: editingStageName.trim() } : stage
    );

    saveTemplateData({ stages: newStages, items });
    setEditingStageId(null);
    setEditingStageName("");
  };

  const handleDeleteStage = (stageId: string) => {
    const stageItems = getItemsByStage(stageId);
    if (stageItems.length > 0) {
      toast({
        title: "Cannot delete stage",
        description: "Stage must be empty before deleting. Move or delete items first.",
        variant: "destructive",
      });
      return;
    }

    const newStages = stages.filter(stage => stage.id !== stageId)
      .map((stage, idx) => ({ ...stage, sortOrder: idx }));

    saveTemplateData({ stages: newStages, items });
    toast({ title: "Stage deleted" });
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

    const targetStageId = addingToStageId || newItem.stageId || stages[0]?.id;
    if (!targetStageId) {
      toast({
        title: "No stage available",
        description: "Please create a stage first.",
        variant: "destructive",
      });
      return;
    }

    const stageItems = getItemsByStage(targetStageId);
    const newItemData: TemplateItem = {
      id: crypto.randomUUID(),
      title: newItem.title.trim(),
      description: newItem.description?.trim(),
      itemType: newItem.itemType,
      quantity: newItem.quantity,
      rate: newItem.rate ? Math.round(newItem.rate * 100) : undefined,
      stageId: targetStageId,
      sortOrder: stageItems.length,
    };

    saveTemplateData({ stages, items: [...items, newItemData] });
    setAddItemDialogOpen(false);
    setAddingToStageId(null);
    setNewItem({
      title: "",
      description: "",
      itemType: "scope",
      quantity: 1,
      rate: 0,
      stageId: undefined,
    });
    toast({ title: "Item added" });
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

    saveTemplateData({ stages, items: updatedItems });
    setEditDialogOpen(false);
    setEditingItem(null);
    toast({ title: "Item updated" });
  };

  const handleDeleteItem = (itemId: string) => {
    const updatedItems = items.filter(item => item.id !== itemId);
    saveTemplateData({ stages, items: updatedItems });
  };

  // Filter and selection functions
  const toggleTypeFilter = (type: string) => {
    setActiveTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredItemIds = items
      .filter(item => !item.itemType || activeTypeFilters.has(normalizeItemType(item.itemType)))
      .map(item => item.id);
    
    const allSelected = filteredItemIds.every(id => selectedItems.has(id));
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItemIds));
    }
  };

  const toggleItemSelect = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Add selected items to project mutation
  const addToProjectMutation = useMutation({
    mutationFn: async ({ projectId, itemIds }: { projectId: string; itemIds: string[] }) => {
      const selectedItemsData = items.filter(item => itemIds.includes(item.id));
      
      // Create scope items for each selected template item
      const promises = selectedItemsData.map(item => 
        apiRequest(`/api/projects/${projectId}/scope`, 'POST', {
          title: item.title,
          description: item.description,
          stage: stages.find(s => s.id === item.stageId)?.name || 'General',
          itemType: item.itemType || 'scope',
          displayOrder: 0,
        })
      );
      
      return Promise.all(promises);
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope`] });
      setAddToProjectDialogOpen(false);
      setSelectedItems(new Set());
      setSelectedProjectId("");
      toast({ 
        title: "Items added to project",
        description: `${selectedItems.size} items have been added to the project scope.`
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add items to project.",
        variant: "destructive",
      });
    },
  });

  const handleAddToProject = () => {
    if (!selectedProjectId || selectedItems.size === 0) return;
    addToProjectMutation.mutate({ 
      projectId: selectedProjectId, 
      itemIds: Array.from(selectedItems) 
    });
  };

  // Check if item passes current filters
  const passesFilter = (item: TemplateItem) => {
    if (!item.itemType) return true; // Items without type always show
    const normalizedType = normalizeItemType(item.itemType);
    return activeTypeFilters.has(normalizedType);
  };

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const openAddItemForStage = (stageId: string) => {
    setAddingToStageId(stageId);
    setNewItem(prev => ({ ...prev, stageId }));
    setAddItemDialogOpen(true);
  };

  const handleStageKeyDown = (e: React.KeyboardEvent, stageId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameStage(stageId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingStageId(null);
      setEditingStageName("");
    }
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
          {stages.length} {stages.length === 1 ? 'stage' : 'stages'}
        </Badge>
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
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-background hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={() => setAddStageDialogOpen(true)}
            data-testid="button-add-stage"
          >
            <Plus className="w-3 h-3" />
            <span>Add Stage</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => {
              setAddingToStageId(null);
              setAddItemDialogOpen(true);
            }}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Filter Bar + Bulk Actions */}
      <div className="h-10 bg-background flex items-center justify-between px-2 gap-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Checkbox
              checked={items.length > 0 && items.every(item => selectedItems.has(item.id))}
              onCheckedChange={toggleSelectAll}
              className="data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
              data-testid="checkbox-select-all"
            />
            <span className="text-xs text-muted-foreground ml-1">
              {selectedItems.size > 0 ? `${selectedItems.size} selected` : 'Select all'}
            </span>
          </div>
          <div className="h-4 w-px bg-border mx-1" />
          <div className="flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            {ITEM_TYPES.map(type => (
              <Badge
                key={type}
                variant={activeTypeFilters.has(type) ? "default" : "outline"}
                className={`h-5 text-[10px] cursor-pointer ${
                  activeTypeFilters.has(type) 
                    ? 'bg-[#bba7db] hover:bg-[#bba7db]/90 text-white' 
                    : 'hover:bg-muted'
                }`}
                onClick={() => toggleTypeFilter(type)}
                data-testid={`filter-${type.toLowerCase().replace('-', '')}`}
              >
                {getTypeLabel(type)}
              </Badge>
            ))}
          </div>
        </div>
        
        {selectedItems.size > 0 && (
          <Button
            size="sm"
            className="h-6 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90"
            onClick={() => setAddToProjectDialogOpen(true)}
            data-testid="button-add-to-project"
          >
            <FolderPlus className="h-3 w-3 mr-1" />
            Add to Project
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {stages.length === 0 ? (
          <div className="text-center py-12">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">No stages yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add stages to organize your scope items
            </p>
            <button
              className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
              onClick={() => setAddStageDialogOpen(true)}
              data-testid="button-add-first-stage"
            >
              <Plus className="h-3 w-3" />
              Add Stage
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-3">
              {stages.map(stage => {
                const stageItems = getItemsByStage(stage.id);
                const isExpanded = expandedStages.has(stage.id);
                const stageTotal = getStageTotal(stage.id);
                const isEditing = editingStageId === stage.id;
                
                return (
                  <div 
                    key={stage.id} 
                    className="rounded-xl bg-muted/20 border border-border/50 overflow-hidden"
                  >
                    {/* Stage Header */}
                    <div 
                      className="h-9 px-3 flex items-center justify-between bg-background/50 group cursor-pointer hover-elevate"
                      onClick={() => !isEditing && toggleStage(stage.id)}
                      data-testid={`stage-header-${stage.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        
                        {isEditing ? (
                          <Input
                            ref={editInputRef}
                            value={editingStageName}
                            onChange={(e) => setEditingStageName(e.target.value)}
                            onKeyDown={(e) => handleStageKeyDown(e, stage.id)}
                            onBlur={() => handleRenameStage(stage.id)}
                            autoFocus
                            className="h-6 text-sm font-semibold px-2 w-40"
                            data-testid={`input-edit-stage-${stage.id}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span 
                            className="text-sm font-semibold" 
                            data-testid={`text-stage-name-${stage.id}`}
                          >
                            {stage.name}
                          </span>
                        )}

                        {stageItems.length > 0 && (
                          <span className="h-4 px-1.5 text-[10px] font-semibold rounded bg-[#bba7db]/10 text-[#bba7db] border border-[#bba7db]/20">
                            {stageItems.length}
                          </span>
                        )}

                        {stageTotal > 0 && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            ${(stageTotal / 100).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {!isEditing && (
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover-elevate"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingStageId(stage.id);
                              setEditingStageName(stage.name);
                            }}
                            data-testid={`button-edit-stage-${stage.id}`}
                          >
                            <Pen className="h-3 w-3" />
                          </button>
                        )}

                        <button
                          className="h-6 px-2 text-[10px] font-medium rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddItemForStage(stage.id);
                          }}
                          data-testid={`button-add-item-${stage.id}`}
                        >
                          <Plus className="h-3 w-3" />
                          <span>Item</span>
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover-elevate"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-menu-stage-${stage.id}`}
                            >
                              <span className="text-sm leading-none">⋯</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStageId(stage.id);
                                setEditingStageName(stage.name);
                              }}
                              data-testid={`menu-rename-stage-${stage.id}`}
                            >
                              <Pen className="h-4 w-4 mr-2" />
                              Rename Stage
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStage(stage.id);
                              }}
                              className="text-destructive"
                              data-testid={`menu-delete-stage-${stage.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Stage
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {/* Items Container */}
                    {isExpanded && (
                      <div className="p-2">
                        {stageItems.length === 0 ? (
                          <div 
                            className="text-center text-muted-foreground text-xs border-2 border-dashed rounded-lg flex items-center justify-center"
                            style={{ 
                              height: '60px',
                              borderColor: CASVA_LILAC + '40'
                            }}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs opacity-60">No items in this stage</span>
                              <button
                                className="text-[10px] text-[#bba7db] hover:underline"
                                onClick={() => openAddItemForStage(stage.id)}
                              >
                                Add first item
                              </button>
                            </div>
                          </div>
                        ) : (
                          <SortableContext
                            items={stageItems.map(item => item.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {stageItems.filter(passesFilter).map(item => (
                                <SortableItem
                                  key={item.id}
                                  item={item}
                                  onEdit={handleEditItem}
                                  onDelete={handleDeleteItem}
                                  isSelected={selectedItems.has(item.id)}
                                  onToggleSelect={toggleItemSelect}
                                />
                              ))}
                            </div>
                          </SortableContext>
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

      {/* Add Stage Dialog */}
      <Dialog open={addStageDialogOpen} onOpenChange={setAddStageDialogOpen}>
        <DialogContent data-testid="dialog-add-stage">
          <DialogHeader>
            <DialogTitle>Add Stage</DialogTitle>
            <DialogDescription>
              Create a new stage to organize scope items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Stage Name *</Label>
              <Input
                placeholder="e.g., Foundation, Framing, Electrical"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddStage();
                  }
                }}
                data-testid="input-stage-name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStage}
              disabled={updateMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-add-stage"
            >
              {updateMutation.isPending ? "Adding..." : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  value={newItem.itemType || "scope"}
                  onValueChange={(value) => setNewItem({ ...newItem, itemType: value })}
                >
                  <SelectTrigger data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{getTypeLabel(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select
                  value={addingToStageId || newItem.stageId || ""}
                  onValueChange={(value) => {
                    setAddingToStageId(value);
                    setNewItem({ ...newItem, stageId: value });
                  }}
                >
                  <SelectTrigger data-testid="select-item-stage">
                    <SelectValue placeholder="Select a stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
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
                    value={editingItem.itemType || "scope"}
                    onValueChange={(value) => setEditingItem({ ...editingItem, itemType: value })}
                  >
                    <SelectTrigger data-testid="select-edit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{getTypeLabel(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select
                    value={editingItem.stageId || ""}
                    onValueChange={(value) => setEditingItem({ ...editingItem, stageId: value })}
                  >
                    <SelectTrigger data-testid="select-edit-stage">
                      <SelectValue placeholder="Select a stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(stage => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
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

      {/* Add to Project Dialog */}
      <Dialog open={addToProjectDialogOpen} onOpenChange={setAddToProjectDialogOpen}>
        <DialogContent data-testid="dialog-add-to-project">
          <DialogHeader>
            <DialogTitle>Add Items to Project</DialogTitle>
            <DialogDescription>
              Add {selectedItems.size} selected item{selectedItems.size !== 1 ? 's' : ''} to a project scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              Selected items:
              <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                {Array.from(selectedItems).map(itemId => {
                  const item = items.find(i => i.id === itemId);
                  return item ? (
                    <li key={item.id} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-[#bba7db]" />
                      <span>{item.title}</span>
                      {item.itemType && (
                        <Badge variant="outline" className="h-4 text-[10px]">{getTypeLabel(item.itemType)}</Badge>
                      )}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddToProject}
              disabled={!selectedProjectId || addToProjectMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-add-to-project"
            >
              {addToProjectMutation.isPending ? "Adding..." : "Add to Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
