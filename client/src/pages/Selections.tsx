import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { 
  insertSelectionSchema, 
  type Selection, 
  type InsertSelection,
  type FieldCategoryWithOptions,
  type SelectionWithOptions,
  type SelectionOption
} from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Settings,
  CheckCircle,
  Clock,
  AlertCircle,
  CalendarIcon,
  DollarSign,
  Layers,
  ChevronDown,
  Eye,
  List,
  Palette,
  Boxes,
  LayoutList,
  LayoutGrid,
  Pencil,
  MapPin,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Component for displaying selection options in dropdown
interface SelectionOptionsDropdownProps {
  selectionId: string;
  onNavigate: (path: string) => void;
}

function SelectionOptionsDropdown({ selectionId, onNavigate }: SelectionOptionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Fetch selection with options when dropdown is opened
  const { data: selectionWithOptions, isLoading } = useQuery<SelectionWithOptions>({
    queryKey: ["/api/selections", selectionId, "with-options"],
    queryFn: async () => {
      return await apiRequest(`/api/selections/${selectionId}`, "GET");
    },
    enabled: isOpen, // Only fetch when dropdown is open
  });

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="h-8 gap-1"
          data-testid={`button-view-options-${selectionId}`}
          onClick={(e) => e.stopPropagation()}
        >
          <List className="w-3 h-3" />
          <span className="text-xs">Options</span>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isLoading ? (
          <DropdownMenuItem disabled>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
              <span>Loading options...</span>
            </div>
          </DropdownMenuItem>
        ) : selectionWithOptions?.options && selectionWithOptions.options.length > 0 ? (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
              Available Options ({selectionWithOptions.options.length})
            </div>
            {selectionWithOptions.options.slice(0, 5).map((option) => (
              <DropdownMenuItem 
                key={option.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(`/selections/${selectionId}#option-${option.id}`);
                }}
                className="flex flex-col items-start gap-1 py-2"
              >
                <div className="font-medium text-sm">{option.name}</div>
                {option.price !== null && option.price !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    ${(option.price / 100).toFixed(2)}
                  </div>
                )}
              </DropdownMenuItem>
            ))}
            {selectionWithOptions.options.length > 5 && (
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onNavigate(`/selections/${selectionId}`);
              }}>
                <Eye className="w-4 h-4 mr-2" />
                View all {selectionWithOptions.options.length} options
              </DropdownMenuItem>
            )}
            <div className="border-t">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onNavigate(`/selections/${selectionId}#add-option`);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add New Option
              </DropdownMenuItem>
            </div>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled>
              <Package className="w-4 h-4 mr-2 text-muted-foreground" />
              No options available
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              onNavigate(`/selections/${selectionId}#add-option`);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Option
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Compact Selection Card for both List and Kanban views
interface SelectionCardCompactProps {
  selection: Selection;
  onClick: () => void;
  onEdit: (selection: Selection) => void;
  onDelete: (id: string) => void;
  showCategory?: boolean;
  showRoom?: boolean;
  isDragging?: boolean;
}

function SelectionCardCompact({ 
  selection, 
  onClick, 
  onEdit, 
  onDelete,
  showCategory = true,
  showRoom = true,
  isDragging = false
}: SelectionCardCompactProps) {
  const [isHovered, setIsHovered] = useState(false);
  const selectionType = (selection as any).selectionType || 'selection';

  const statusConfig = {
    draft: { color: '#eab308', bg: '#eab30815' },
    pending: { color: '#3b82f6', bg: '#3b82f615' },
    approved: { color: '#22c55e', bg: '#22c55e15' },
    completed: { color: '#16a34a', bg: '#16a34a15' },
  };

  const { color: statusColor, bg: statusBg } = statusConfig[selection.status as keyof typeof statusConfig] || statusConfig.draft;

  return (
    <Card
      className={`h-20 transition-all duration-200 cursor-pointer rounded-xl border-border/50 hover-elevate active-elevate-2 ${
        isDragging ? 'opacity-80 shadow-lg scale-[1.01]' : ''
      }`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`selection-card-${selection.id}`}
    >
      <CardContent className="p-2 h-full flex flex-col justify-between">
        {/* Top row: Title + Status Badge */}
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`selection-title-${selection.id}`}>
                {selection.name}
              </h3>
              
              {/* Status badge */}
              <Badge 
                className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
                style={{
                  backgroundColor: statusBg,
                  color: statusColor,
                  borderColor: `${statusColor}30`
                }}
              >
                {selection.status}
              </Badge>
            </div>

            {/* Metadata line below title */}
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
              {selectionType === 'design' && (
                <span className="flex items-center gap-0.5 text-purple-600">
                  <Palette className="h-2.5 w-2.5 flex-shrink-0" />
                  Design
                </span>
              )}
              {showCategory && selection.category && (
                <span className="truncate">{selection.category}</span>
              )}
              {showRoom && selection.room && (
                <span className="flex items-center gap-0.5 truncate">
                  <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                  {selection.room}
                </span>
              )}
            </div>
          </div>

          {/* Pencil icon on hover */}
          {isHovered && (
            <Pencil className="h-3 w-3 text-[#bba7db] shrink-0" />
          )}
        </div>

        {/* Bottom row: Allowance + Actions */}
        <div className="flex items-center justify-between">
          {/* Allowance or deadline */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {selection.allowance && (
              <span className="flex items-center gap-0.5">
                <DollarSign className="h-2.5 w-2.5" />
                ${(selection.allowance / 100).toFixed(0)}
              </span>
            )}
            {selection.deadline && (
              <span className="flex items-center gap-0.5">
                <CalendarIcon className="h-2.5 w-2.5" />
                {format(new Date(selection.deadline), 'MMM d')}
              </span>
            )}
          </div>

          {/* Actions dropdown */}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-5 w-5 rounded-md hover-elevate active-elevate-2 flex items-center justify-center" data-testid={`button-actions-${selection.id}`}>
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onClick()}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(selection)}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Draggable Selection Card for Kanban
interface DraggableSelectionCardProps {
  selection: Selection;
  columnId: string;
  onClick: () => void;
  onEdit: (selection: Selection) => void;
  onDelete: (id: string) => void;
}

function DraggableSelectionCard({ selection, columnId, onClick, onEdit, onDelete }: DraggableSelectionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: selection.id,
    data: { 
      type: 'card',
      columnId: columnId,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SelectionCardCompact
        selection={selection}
        onClick={onClick}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={isDragging}
      />
    </div>
  );
}

// Kanban Column Component
interface KanbanColumnProps {
  column: { id: string; title: string; color: string };
  selections: Selection[];
  onCardClick: (id: string) => void;
  onEdit: (selection: Selection) => void;
  onDelete: (id: string) => void;
}

function KanbanColumn({ column, selections, onCardClick, onEdit, onDelete }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 rounded-lg bg-muted/30 ${isOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
    >
      {/* Column Header */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: column.color }}
            />
            <span className="text-sm font-medium">{column.title}</span>
          </div>
          <Badge variant="secondary" className="text-xs h-5">
            {selections.length}
          </Badge>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        <SortableContext id={column.id} items={selections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {selections.map((selection) => (
            <DraggableSelectionCard
              key={selection.id}
              selection={selection}
              columnId={column.id}
              onClick={() => onCardClick(selection.id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
        
        {selections.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">
            No selections
          </div>
        )}
      </div>
    </div>
  );
}

export default function Selections() {
  const [isAddingSelection, setIsAddingSelection] = useState(false);
  const [editingSelection, setEditingSelection] = useState<Selection | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'room' | 'status'>('none');
  const [showGroupingMenu, setShowGroupingMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [showSelections, setShowSelections] = useState(true);
  const [showDesign, setShowDesign] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();

  // Fetch selections for the current project
  const { data: selections = [], isLoading } = useQuery<Selection[]>({
    queryKey: ["/api/selections", currentProject?.id],
    queryFn: () => apiRequest(`/api/selections?projectId=${currentProject?.id}`, "GET"),
    enabled: !!currentProject?.id,
  });

  // Fetch selection categories
  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  // Fetch room/location options
  const { data: locationCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.room"],
  });

  // Create selection mutation
  const createSelectionMutation = useMutation({
    mutationFn: async (selection: InsertSelection) => {
      return await apiRequest("/api/selections", "POST", selection);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      setIsAddingSelection(false);
      toast({
        title: "Selection created",
        description: "Your new selection has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update selection mutation
  const updateSelectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSelection> }) => {
      return await apiRequest(`/api/selections/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      setEditingSelection(null);
      toast({
        title: "Selection updated",
        description: "Your selection has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete selection mutation
  const deleteSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/selections/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      toast({
        title: "Selection deleted",
        description: "The selection has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Form for creating/editing selections
  const form = useForm<InsertSelection>({
    resolver: zodResolver(insertSelectionSchema),
    defaultValues: {
      projectId: currentProject?.id || "",
      name: "",
      description: "",
      category: "",
      room: "",
      selectionType: "selection",
      status: "draft",
      deadline: undefined,
      allowance: undefined,
      clientCanChange: true,
      clientCanSeePrice: false,
    },
  });

  // Reset form when dialog opens/closes
  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingSelection(false);
      setEditingSelection(null);
      form.reset();
    }
  };

  // Handle form submission
  const onSubmit = (data: InsertSelection) => {
    if (editingSelection) {
      updateSelectionMutation.mutate({ id: editingSelection.id, data });
    } else {
      createSelectionMutation.mutate({
        ...data,
        projectId: currentProject?.id || "",
      });
    }
  };

  // Handle editing
  const handleEdit = (selection: Selection) => {
    setEditingSelection(selection);
    form.reset({
      name: selection.name,
      description: selection.description || "",
      category: selection.category || "",
      room: selection.room || "",
      selectionType: (selection as any).selectionType || "selection",
      status: selection.status,
      deadline: selection.deadline || undefined,
      allowance: selection.allowance || undefined,
      clientCanChange: selection.clientCanChange,
      clientCanSeePrice: selection.clientCanSeePrice,
    });
  };

  // Filter selections based on search, type toggles, and category/location filters
  const filteredSelections = (selections || []).filter((selection: Selection) => {
    // Type filter (showSelections/showDesign)
    const selectionType = (selection as any).selectionType || 'selection';
    if (!showSelections && selectionType === 'selection') return false;
    if (!showDesign && selectionType === 'design') return false;
    
    // Search filter
    const matchesSearch = 
      selection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      selection.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      selection.category?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Category filter
    const matchesCategory = !categoryFilter || selection.category === categoryFilter;
    
    // Location filter
    const matchesLocation = !locationFilter || selection.room === locationFilter;
    
    return matchesSearch && matchesCategory && matchesLocation;
  });

  // Group selections based on selected grouping
  const groupedSelections = React.useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Selections': filteredSelections };
    }

    const groups: Record<string, Selection[]> = {};
    
    filteredSelections.forEach((selection) => {
      let groupKey = 'Ungrouped';
      
      switch (groupBy) {
        case 'category':
          groupKey = selection.category || 'No Category';
          break;
        case 'room':
          groupKey = selection.room || 'No Location';
          break;
        case 'status':
          groupKey = selection.status?.charAt(0).toUpperCase() + selection.status?.slice(1) || 'No Status';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(selection);
    });
    
    // Sort groups by name
    const sortedGroups: Record<string, Selection[]> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [filteredSelections, groupBy]);

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      draft: { icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
      pending: { icon: AlertCircle, color: "text-blue-600 bg-blue-50 border-blue-200" },
      approved: { icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
      completed: { icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    };
    
    const { icon: Icon, color } = config[status as keyof typeof config] || config.draft;
    
    return (
      <Badge variant="outline" className={`${color} capitalize`}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  // DnD sensors for Kanban board
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Kanban columns
  const kanbanColumns = [
    { id: 'draft', title: 'Draft', color: '#eab308' },
    { id: 'pending', title: 'Pending', color: '#3b82f6' },
    { id: 'approved', title: 'Approved', color: '#22c55e' },
    { id: 'completed', title: 'Completed', color: '#16a34a' },
  ];

  // Get selections by status for Kanban
  const getSelectionsByStatus = (status: string) => {
    return filteredSelections.filter(s => s.status === status);
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Handle drag end - update selection status
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeSelection = filteredSelections.find(s => s.id === active.id);
    if (!activeSelection) return;

    const overId = over.id as string;

    // Determine target column - either directly on column or on a card within a column
    let targetColumnId: string | undefined;
    
    // Check if dropped directly on a column
    const directColumn = kanbanColumns.find(col => col.id === overId);
    if (directColumn) {
      targetColumnId = directColumn.id;
    } else {
      // Dropped on a card - get the destination column from the sortable containerId
      // or from the over card's stored columnId
      const overData = over.data?.current as any;
      if (overData?.sortable?.containerId) {
        targetColumnId = overData.sortable.containerId;
      } else if (overData?.columnId) {
        targetColumnId = overData.columnId;
      }
    }
    
    // Update status if dropped on a different column
    if (targetColumnId && activeSelection.status !== targetColumnId) {
      updateSelectionMutation.mutate({
        id: activeSelection.id,
        data: { status: targetColumnId }
      });
    }
  };

  // Get the active selection for drag overlay
  const activeSelection = activeId ? filteredSelections.find(s => s.id === activeId) : null;

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Please select a project to view selections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Row 1 - Breadcrumbs & Add Button (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Project Name (Breadcrumb style) */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {currentProject.name} / Selections
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-selection-count">
            {filteredSelections.length} items
          </Badge>
        </div>

        {/* Right: Add Selection Button */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsAddingSelection(true)}
            data-testid="button-add-selection"
          >
            <Plus className="w-3 h-3" />
            <span>Add Selection</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search, Filters & Type Toggles (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search + Filters + Divider + Type Toggles */}
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-selections"
            />
          </div>

          {/* Category Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Category</span>
                {categoryFilter && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setCategoryFilter("")}>
                <span className={!categoryFilter ? "font-medium" : ""}>All Categories</span>
              </DropdownMenuItem>
              {selectionCategories?.options?.map(option => (
                <DropdownMenuItem 
                  key={option.key} 
                  onClick={() => setCategoryFilter(option.name)}
                  className={categoryFilter === option.name ? "bg-accent" : ""}
                >
                  {option.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Location Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Location</span>
                {locationFilter && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setLocationFilter("")}>
                <span className={!locationFilter ? "font-medium" : ""}>All Locations</span>
              </DropdownMenuItem>
              {locationCategories?.options?.map(option => (
                <DropdownMenuItem 
                  key={option.key} 
                  onClick={() => setLocationFilter(option.name)}
                  className={locationFilter === option.name ? "bg-accent" : ""}
                >
                  {option.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Subtle Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* Selections Toggle */}
          <button
            onClick={() => setShowSelections(!showSelections)}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              showSelections 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-toggle-selections"
          >
            <Boxes className="w-3 h-3" />
            <span>Selections</span>
          </button>

          {/* Design Toggle */}
          <button
            onClick={() => setShowDesign(!showDesign)}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              showDesign 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-toggle-design"
          >
            <Palette className="w-3 h-3" />
            <span>Design</span>
          </button>

          {/* Subtle Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`h-5 w-5 rounded flex items-center justify-center ${
                viewMode === 'list' 
                  ? 'bg-[#bba7db] text-white' 
                  : 'hover-elevate text-muted-foreground'
              }`}
              data-testid="button-view-list"
              title="List View"
            >
              <LayoutList className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`h-5 w-5 rounded flex items-center justify-center ${
                viewMode === 'board' 
                  ? 'bg-[#bba7db] text-white' 
                  : 'hover-elevate text-muted-foreground'
              }`}
              data-testid="button-view-board"
              title="Board View"
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Grouping Toggle (only in list view) */}
        <DropdownMenu open={showGroupingMenu} onOpenChange={setShowGroupingMenu}>
          <DropdownMenuTrigger asChild>
            <button 
              className={`h-6 w-6 text-xs border rounded-md ${
                groupBy !== 'none' 
                  ? 'bg-[#bba7db] text-white border-[#bba7db]/20' 
                  : 'hover-elevate'
              } active-elevate-2 flex items-center justify-center`}
              data-testid="button-grouping"
            >
              <Layers className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setGroupBy('none')}>
              <span className={groupBy === 'none' ? "font-medium" : ""}>No Grouping</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroupBy('category')}>
              <span className={groupBy === 'category' ? "font-medium" : ""}>Group by Category</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroupBy('room')}>
              <span className={groupBy === 'room' ? "font-medium" : ""}>Group by Location</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGroupBy('status')}>
              <span className={groupBy === 'status' ? "font-medium" : ""}>Group by Status</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-3">
        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="h-20 animate-pulse rounded-xl">
                <CardContent className="p-2 h-full flex flex-col justify-between">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSelections.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No selections found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? "Try adjusting your search terms." : "Create your first selection to get started."}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsAddingSelection(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Selection
              </Button>
            )}
          </div>
        ) : viewMode === 'board' ? (
          /* Kanban Board View */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {kanbanColumns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  selections={getSelectionsByStatus(column.id)}
                  onCardClick={(id) => setLocation(`/selections/${id}`)}
                  onEdit={handleEdit}
                  onDelete={(id) => deleteSelectionMutation.mutate(id)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeSelection && (
                <SelectionCardCompact
                  selection={activeSelection}
                  onClick={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          /* List View with Compact Cards */
          <div className="space-y-6">
            {Object.entries(groupedSelections).map(([groupName, groupSelections]) => (
              <div key={groupName} className="space-y-2">
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">{groupName}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {groupSelections.length}
                    </Badge>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {groupSelections.map((selection) => (
                    <SelectionCardCompact
                      key={selection.id}
                      selection={selection}
                      onClick={() => setLocation(`/selections/${selection.id}`)}
                      onEdit={handleEdit}
                      onDelete={(id) => deleteSelectionMutation.mutate(id)}
                      showCategory={groupBy !== 'category'}
                      showRoom={groupBy !== 'room'}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Selection Dialog */}
      <Dialog 
        open={isAddingSelection || !!editingSelection} 
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingSelection ? "Edit Selection" : "Create New Selection"}
            </DialogTitle>
            <DialogDescription>
              {editingSelection 
                ? "Update the selection details below."
                : "Create a new selection for your project. You can add options and details later."
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selection Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Kitchen Splashback Tiles"
                        {...field}
                        data-testid="input-selection-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-selection-category">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectionCategories?.options?.map((option) => (
                            <SelectItem key={option.key} value={option.name}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="selectionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "selection"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-selection-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="selection">
                            <div className="flex items-center gap-2">
                              <Boxes className="w-3 h-3" />
                              <span>Selection</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="design">
                            <div className="flex items-center gap-2">
                              <Palette className="w-3 h-3" />
                              <span>Design Option</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room/Location</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-selection-room">
                          <SelectValue placeholder="Select a room" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locationCategories?.options?.map((option) => (
                          <SelectItem key={option.key} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe what this selection is for..."
                        rows={3}
                        {...field}
                        value={field.value || ""}
                        data-testid="input-selection-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-selection-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Decision Deadline</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-selection-deadline"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When does the client need to make their selection?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="allowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Allowance</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <Input 
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="pl-10 [&::-webkit-outer-spin-button]:[-webkit-appearance:none] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:[-webkit-appearance:none] [&::-webkit-inner-spin-button]:m-0 [-moz-appearance:textfield]"
                          {...field}
                          value={field.value ? (field.value / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value ? Math.round(parseFloat(value) * 100) : undefined);
                          }}
                          data-testid="input-selection-allowance"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Budget allocated for this selection (in AUD)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="font-medium">Client Permissions</h4>
                
                <FormField
                  control={form.control}
                  name="clientCanChange"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Allow Changes
                        </FormLabel>
                        <FormDescription>
                          Client can change their selection after choosing
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-client-can-change"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clientCanSeePrice"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Show Pricing
                        </FormLabel>
                        <FormDescription>
                          Client can see pricing information for options
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-client-can-see-price"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleDialogChange(false)}
                  data-testid="button-cancel-selection"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createSelectionMutation.isPending || updateSelectionMutation.isPending}
                  data-testid="button-save-selection"
                >
                  {(createSelectionMutation.isPending || updateSelectionMutation.isPending) && (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  )}
                  {editingSelection ? "Update Selection" : "Create Selection"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}