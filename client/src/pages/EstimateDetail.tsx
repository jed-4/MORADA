import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Lock, 
  Unlock, 
  FileText, 
  Calculator,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  FolderPlus,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  GripVertical,
  Filter,
  Download,
  Upload
} from "lucide-react";
import { type Estimate, type EstimateItem, type EstimateSummary, type Project, type InsertEstimateItem, insertEstimateItemSchema, type EstimateGroup, type InsertEstimateGroup, insertEstimateGroupSchema, type FieldCategoryWithOptions, type CompanySettings } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { logActivity } from "@/lib/activityLogger";
import { ImportEstimateItemsDialog } from "@/components/estimates/ImportEstimateItemsDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface EstimateDetailParams {
  id?: string;
  estimateId?: string;
  projectId?: string;
}

// Sortable Row Component for drag & drop
interface SortableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  isDraggable?: boolean;
}

function SortableRow({ id, children, className, isDraggable = true }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`${className} group`}
      data-testid={`row-item-${id}`}
    >
      <TableCell className="py-0.5 px-1" style={{ width: '40px' }}>
        {isDraggable && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </TableCell>
      {children}
    </TableRow>
  );
}

// Sortable Group Component for drag & drop groups
interface SortableGroupProps {
  id: string;
  children: (dragHandleProps: { attributes: any; listeners: any }) => React.ReactNode;
  className?: string;
}

function SortableGroup({ id, children, className }: SortableGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners })}
    </div>
  );
}

export default function EstimateDetail() {
  const { id, estimateId, projectId: projectIdFromParams } = useParams<EstimateDetailParams>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Normalize estimate ID - prioritize estimateId (from project-scoped routes), fall back to id (from global routes)
  const effectiveEstimateId = estimateId || id;
  
  // Check if we're creating a new estimate (check location path since /estimates/new doesn't have :id param)
  const isNewEstimate = location === '/estimates/new' || location.includes('/estimates/new') || effectiveEstimateId === 'new';
  
  // Get project ID - prioritize route params for project-scoped routes, fall back to query params for backwards compatibility
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromQuery = urlParams.get('projectId');
  const effectiveProjectId = projectIdFromParams || projectIdFromQuery;
  
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isEditingMarkup, setIsEditingMarkup] = useState(false);
  const [editingMarkup, setEditingMarkup] = useState("");
  
  // Summary expansion state
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  
  // Add item modal state
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  
  // Add group modal state
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  
  // Import items modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // New estimate creation state
  const [newEstimateName, setNewEstimateName] = useState("");

  // Inline editing state for table cells
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>("");

  // Column configuration state
  type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };
  const defaultColumns: ColumnConfig[] = [
    { id: 'costCode', label: 'Cost Code', visible: true, widthPx: 120 },
    { id: 'item', label: 'Item', visible: true, widthPx: 180 },
    { id: 'description', label: 'Description', visible: true, widthPx: 220 },
    { id: 'proposalVisible', label: 'Proposal', visible: true, widthPx: 100 },
    { id: 'shownAs', label: 'Shown As', visible: true, widthPx: 180 },
    { id: 'allowance', label: 'Allowance', visible: true, widthPx: 140 },
    { id: 'quantity', label: 'Quantity', visible: true, widthPx: 100 },
    { id: 'unitType', label: 'Unit', visible: true, widthPx: 80 },
    { id: 'builderCost', label: "Builder's Cost ex Tax", visible: true, widthPx: 150 },
    { id: 'builderCostIncTax', label: "Builder's Cost inc Tax", visible: true, widthPx: 150 },
    { id: 'markup', label: 'Markup %', visible: true, widthPx: 100 },
    { id: 'clientPriceExTax', label: 'Amount ex Tax', visible: true, widthPx: 130 },
    { id: 'clientTax', label: 'Tax', visible: true, widthPx: 100 },
    { id: 'clientPriceIncTax', label: 'Amount inc Tax', visible: true, widthPx: 130 },
    { id: 'notes', label: 'Notes', visible: true, widthPx: 80 },
  ];
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);

  // Filter state
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Mutation for reordering items
  const reorderItemsMutation = useMutation({
    mutationFn: async ({ items }: { items: { id: string; order: number }[] }) => {
      return apiRequest("PATCH", "/api/estimate-items/reorder", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
    },
    onError: (error) => {
      console.error('[DRAG] Reorder mutation failed:', error);
    },
  });

  // Mutation for reordering groups
  const reorderGroupsMutation = useMutation({
    mutationFn: async ({ groups }: { groups: { id: string; order: number }[] }) => {
      return apiRequest("PATCH", "/api/estimate-groups/reorder", { groups });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
    },
  });

  // Handle drag end for reordering items, groups, and cross-group moves
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log('[DRAG] Drag end - active:', active.id, 'over:', over?.id);
    
    if (!over || active.id === over.id) return;
    
    // Check if dragging a group (groups have IDs prefixed with "group-")
    const isDraggingGroup = String(active.id).startsWith('group-');
    const isOverGroup = String(over.id).startsWith('group-');
    
    if (isDraggingGroup) {
      // Handle group reordering
      const { sortedGroups } = organizeItemsByGroups();
      const oldIndex = sortedGroups.findIndex(g => `group-${g.id}` === active.id);
      const newIndex = sortedGroups.findIndex(g => `group-${g.id}` === over.id);
      
      if (oldIndex === -1 || newIndex === -1) return;
      
      const reorderedGroups = arrayMove(sortedGroups, oldIndex, newIndex);
      const updates = reorderedGroups.map((group, index) => ({
        id: group.id,
        order: index
      }));
      
      console.log('[DRAG] Reordering groups:', updates);
      reorderGroupsMutation.mutate({ groups: updates });
      return;
    }
    
    // Handle item reordering and cross-group moves
    const { ungroupedItems, groupedItems } = organizeItemsByGroups();
    const allItems = [...ungroupedItems];
    Object.values(groupedItems).forEach(groupItems => {
      allItems.push(...groupItems);
    });
    
    console.log('[DRAG] All items count:', allItems.length);
    console.log('[DRAG] All item IDs:', allItems.map(i => i.id));
    
    const oldIndex = allItems.findIndex(item => item.id === active.id);
    
    // Check if dropping onto a group (not an item)
    if (isOverGroup) {
      const targetGroupId = String(over.id).replace('group-', '');
      console.log('[DRAG] Dropping item onto group:', targetGroupId);
      
      if (oldIndex === -1) return;
      
      const draggedItem = allItems[oldIndex];
      const oldGroupId = draggedItem.groupId;
      
      // If same group, do nothing
      if (targetGroupId === oldGroupId) return;
      
      // Move item to the end of the target group
      const targetGroupItems = groupedItems[targetGroupId] || [];
      const newOrder = targetGroupItems.length > 0 
        ? Math.max(...targetGroupItems.map(i => i.order || 0)) + 1
        : 0;
      
      console.log('[DRAG] Moving item to group', targetGroupId, 'with order', newOrder);
      
      // Update just this item's group and order
      updateItemMutation.mutate({
        itemId: draggedItem.id,
        data: {
          groupId: targetGroupId,
          order: newOrder
        }
      });
      return;
    }
    
    const newIndex = allItems.findIndex(item => item.id === over.id);
    
    console.log('[DRAG] Old index:', oldIndex, 'New index:', newIndex);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const draggedItem = allItems[oldIndex];
    const targetItem = allItems[newIndex];
    
    // Check if item is being moved to a different group
    const newGroupId = targetItem.groupId;
    const oldGroupId = draggedItem.groupId;
    
    console.log('[DRAG] Moving item', draggedItem.id, 'from group', oldGroupId, 'to group', newGroupId);
    
    // Reorder items
    const reorderedItems = arrayMove(allItems, oldIndex, newIndex);
    
    // Build updates array with new order for all items, and groupId for moved item
    const updates = reorderedItems.map((item, index) => {
      const update: any = {
        id: item.id,
        order: index
      };
      
      // If this is the dragged item and group changed, update groupId
      if (item.id === draggedItem.id && newGroupId !== oldGroupId) {
        update.groupId = newGroupId || null;
        console.log('[DRAG] Item', item.id, 'will update groupId to', update.groupId);
      }
      
      return update;
    });
    
    console.log('[DRAG] Sending reorder mutation with', updates.length, 'items');
    console.log('[DRAG] Updates:', JSON.stringify(updates, null, 2));
    
    reorderItemsMutation.mutate({ items: updates });
  };

  const [filterGroup, setFilterGroup] = useState<string>('all');

  // Resizing state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Load column config from localStorage
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate) {
      const savedColumns = localStorage.getItem(`estimateTable_${effectiveEstimateId}_columns`);
      if (savedColumns) {
        try {
          const parsed = JSON.parse(savedColumns);
          // Merge with defaultColumns to add any new columns that didn't exist before
          const savedColumnIds = new Set(parsed.map((col: ColumnConfig) => col.id));
          const newColumns = defaultColumns.filter(col => !savedColumnIds.has(col.id));
          
          if (newColumns.length > 0) {
            // Add new columns at their default positions
            const mergedColumns = [...defaultColumns];
            parsed.forEach((savedCol: ColumnConfig) => {
              const index = mergedColumns.findIndex(col => col.id === savedCol.id);
              if (index !== -1) {
                mergedColumns[index] = savedCol;
              }
            });
            setColumns(mergedColumns);
          } else {
            setColumns(parsed);
          }
        } catch (e) {
          console.error('Failed to parse saved column config:', e);
        }
      }

      const savedFilters = localStorage.getItem(`estimateTable_${effectiveEstimateId}_filters`);
      if (savedFilters) {
        try {
          const filters = JSON.parse(savedFilters);
          setFilterType(filters.type || 'all');
          setFilterStatus(filters.status || 'all');
          setFilterGroup(filters.group || 'all');
        } catch (e) {
          console.error('Failed to parse saved filters:', e);
        }
      }
    }
  }, [effectiveEstimateId, isNewEstimate]);

  // Save column config to localStorage (skip during active resizing)
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate && !resizingColumn) {
      localStorage.setItem(`estimateTable_${effectiveEstimateId}_columns`, JSON.stringify(columns));
    }
  }, [columns, effectiveEstimateId, isNewEstimate, resizingColumn]);

  // Save filters to localStorage
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate) {
      localStorage.setItem(`estimateTable_${effectiveEstimateId}_filters`, JSON.stringify({
        type: filterType,
        status: filterStatus,
        group: filterGroup
      }));
    }
  }, [filterType, filterStatus, filterGroup, effectiveEstimateId, isNewEstimate]);

  // Early validation - show error if invalid ID for non-new estimates
  if (!effectiveEstimateId && !isNewEstimate) {
    return <div>Invalid estimate ID</div>;
  }

  // Fetch all projects for project selection
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isNewEstimate && !effectiveProjectId,
  });

  // Mutation for creating new estimate
  const createEstimateMutation = useMutation({
    mutationFn: async (data: { name: string; projectId: string }) => {
      const response = await apiRequest("POST", `/api/estimates`, data);
      return response.json();
    },
    onSuccess: async (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "New estimate created successfully.",
      });

      logActivity({
        projectId: newEstimate.projectId,
        userId: "current-user",
        activityType: "estimate",
        action: "created",
        description: `User created estimate '${newEstimate.name}'`,
        entityId: newEstimate.id,
        entityName: newEstimate.name,
        metadata: {}
      });

      // Redirect to the newly created estimate
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create estimate.",
        variant: "destructive",
      });
    },
  });

  // Handler for creating new estimate
  const handleCreateEstimate = () => {
    if (!newEstimateName.trim() || !effectiveProjectId) return;
    
    createEstimateMutation.mutate({
      name: newEstimateName.trim(),
      projectId: effectiveProjectId
    });
  };

  // For new estimates without project ID, show project selection
  if (isNewEstimate && !effectiveProjectId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>
        
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium mb-2">Select Project</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which project to create the estimate for.
                </p>
              </div>
              
              <div className="space-y-3">
                {projectsLoading ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">Loading projects...</div>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">No projects available</div>
                  </div>
                ) : (
                  projects.map((project) => (
                    <Card 
                      key={project.id}
                      className="hover-elevate cursor-pointer p-4"
                      onClick={() => setLocation(`/estimates/new?projectId=${project.id}`)}
                      data-testid={`button-select-project-${project.id}`}
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-muted-foreground">{project.description || 'No description'}</div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mutation for updating estimate name
  const updateEstimateMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("PATCH", `/api/estimates/${effectiveEstimateId}`, data);
      return response.json();
    },
    onSuccess: async (updatedEstimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Estimate name updated successfully.",
      });

      if (updatedEstimate.projectId) {
        logActivity({
          projectId: updatedEstimate.projectId,
          userId: "current-user",
          activityType: "estimate",
          action: "updated",
          description: `User updated estimate '${updatedEstimate.name}'`,
          entityId: updatedEstimate.id,
          entityName: updatedEstimate.name,
          metadata: {}
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate name.",
        variant: "destructive",
      });
      // Reset to original name on error
      setEditingName(estimate?.name || "");
    },
  });

  // Mutation for updating markup percentage
  const updateMarkupMutation = useMutation({
    mutationFn: async (data: { projectMarkupPercent: number }) => {
      const response = await apiRequest("PATCH", `/api/estimates/${effectiveEstimateId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Markup percentage updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update markup percentage.",
        variant: "destructive",
      });
      // Reset to original markup on error
      setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    },
  });

  // Mutation for adding estimate items
  const addItemMutation = useMutation({
    mutationFn: async (data: InsertEstimateItem) => {
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setIsAddItemOpen(false);
      toast({
        title: "Success",
        description: "Estimate item added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate item.",
        variant: "destructive",
      });
    },
  });

  // Mutation for adding estimate groups
  const addGroupMutation = useMutation({
    mutationFn: async (data: InsertEstimateGroup) => {
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/groups`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setIsAddGroupOpen(false);
      groupForm.reset();
      toast({
        title: "Success",
        description: "Estimate group added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate group.",
        variant: "destructive",
      });
    },
  });

  // Mutation for toggling estimate lock status
  const toggleLockMutation = useMutation({
    mutationFn: async () => {
      const endpoint = estimate?.isLocked ? "unlock" : "lock";
      console.log(`Making ${endpoint} request for estimate ${effectiveEstimateId}`);
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/${endpoint}`);
      const data = await response.json();
      console.log(`${endpoint} response:`, data);
      return data;
    },
    onSuccess: (updatedEstimate: Estimate) => {
      console.log("Lock mutation success, invalidating queries...");
      console.log("Updated estimate:", updatedEstimate);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: updatedEstimate.isLocked ? "Estimate locked successfully." : "Estimate unlocked successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Lock mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle estimate lock status.",
        variant: "destructive",
      });
    },
  });

  // Mutation for toggling group collapse state
  const toggleGroupCollapseMutation = useMutation({
    mutationFn: async ({ groupId, isCollapsed }: { groupId: string; isCollapsed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/estimate-groups/${groupId}`, { isCollapsed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle group collapse state.",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating estimate items
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<InsertEstimateItem> }) => {
      const response = await apiRequest("PATCH", `/api/estimate-items/${itemId}`, data);
      return response.json();
    },
    onMutate: async ({ itemId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<EstimateItem[]>(["/api/estimates", effectiveEstimateId, "items"]);
      
      // Optimistically update to the new value
      queryClient.setQueryData<EstimateItem[]>(
        ["/api/estimates", effectiveEstimateId, "items"],
        (old) => old?.map(item => item.id === itemId ? { ...item, ...data } : item)
      );
      
      // Return context with the previous value
      return { previousItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
    },
    onError: (error: any, _variables, context) => {
      // Rollback to previous value on error
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "items"], context.previousItems);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update item.",
        variant: "destructive",
      });
    },
  });

  // Handlers for inline name editing
  const handleNameEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingName(estimate?.name || "");
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    if (!isEditingName || !estimate) return;
    
    const trimmedName = editingName.trim();
    if (trimmedName === estimate.name) {
      // No changes, just exit edit mode
      setIsEditingName(false);
      return;
    }
    
    if (trimmedName === "") {
      toast({
        title: "Invalid Name",
        description: "Estimate name cannot be empty.",
        variant: "destructive",
      });
      setEditingName(estimate.name);
      return;
    }
    
    // Optimistic update
    setIsEditingName(false);
    updateEstimateMutation.mutate({ name: trimmedName });
  };

  const handleNameCancel = () => {
    setEditingName(estimate?.name || "");
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleNameCancel();
    }
  };

  // Handlers for inline markup editing
  const handleMarkupEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(true);
  };

  const handleMarkupSave = () => {
    if (!isEditingMarkup || !estimate) return;
    
    const trimmedMarkup = editingMarkup.trim();
    const markupNumber = parseFloat(trimmedMarkup);
    
    // Validation
    if (trimmedMarkup === "" || isNaN(markupNumber)) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a valid number for markup percentage.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber < 0 || markupNumber > 100) {
      toast({
        title: "Invalid Range",
        description: "Markup percentage must be between 0 and 100.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber === estimate.projectMarkupPercent) {
      // No changes, just exit edit mode
      setIsEditingMarkup(false);
      return;
    }
    
    // Optimistic update
    setIsEditingMarkup(false);
    updateMarkupMutation.mutate({ projectMarkupPercent: markupNumber });
  };

  const handleMarkupCancel = () => {
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(false);
  };

  const handleMarkupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleMarkupSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleMarkupCancel();
    }
  };

  // Handlers for inline cell editing
  const handleCellEdit = (item: EstimateItem, field: string) => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    
    setEditingCell({ itemId: item.id, field });
    
    // Set initial value based on field type
    switch (field) {
      case 'quantity':
        // Convert from stored precision (cents) to actual value
        setEditingValue((item.quantity / 100).toFixed(2));
        break;
      case 'unitCostExTax':
        // Convert cents to dollars for display
        setEditingValue((item.unitCostExTax / 100).toFixed(2));
        break;
      case 'markupPercent':
        // Show markup percentage (10 = 10%)
        setEditingValue(item.markupPercent ?? estimate?.projectMarkupPercent ?? 0);
        break;
      case 'name':
        setEditingValue(item.name);
        break;
      case 'description':
        setEditingValue(item.description || '');
        break;
      case 'costCode':
        setEditingValue(item.costCode || '');
        break;
      case 'shownAs':
        setEditingValue(item.shownAs || '');
        break;
      case 'unitType':
        setEditingValue(item.unitType || '');
        break;
      case 'allowance':
        setEditingValue(item.allowance || 'None');
        break;
      default:
        setEditingValue('');
    }
  };

  const handleCellSave = (item: EstimateItem, field: string) => {
    if (!editingCell) return;
    
    // Validate based on field type
    if (field === 'quantity' || field === 'unitCostExTax' || field === 'markupPercent') {
      const numValue = parseFloat(editingValue);
      if (isNaN(numValue) || numValue < 0) {
        toast({
          title: "Invalid Value",
          description: "Please enter a valid positive number.",
          variant: "destructive",
        });
        // Reset to original value
        if (field === 'unitCostExTax') {
          setEditingValue(((item as any)[field] / 100).toFixed(2));
        } else if (field === 'markupPercent') {
          setEditingValue(item.markupPercent ?? estimate?.projectMarkupPercent ?? 0);
        } else {
          setEditingValue((item as any)[field]);
        }
        return;
      }
    }
    
    if (field === 'name' && !editingValue.trim()) {
      toast({
        title: "Invalid Name",
        description: "Item name cannot be empty.",
        variant: "destructive",
      });
      setEditingValue(item.name);
      return;
    }
    
    // Prepare update data
    let valueToSave: any;
    let fieldToUpdate = field;
    
    if (field === 'unitCostExTax') {
      // Convert dollars to cents
      valueToSave = Math.round(parseFloat(editingValue) * 100);
      
      // Check if value actually changed (compare cents to cents)
      if (valueToSave === (item as any)[field]) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'markupPercent') {
      // Save markup as number (supports decimals like 12.5%)
      const markup = parseFloat(editingValue);
      valueToSave = Number.isNaN(markup) ? null : markup;
      
      // Check if value actually changed
      if (valueToSave === (item.markupPercent ?? null)) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'quantity') {
      // Send actual value to backend (backend will multiply by 100)
      valueToSave = parseFloat(editingValue);
      
      // Check if value actually changed (compare actual to stored cents)
      if (Math.round(valueToSave * 100) === item.quantity) {
        setEditingCell(null);
        return;
      }
    } else {
      valueToSave = editingValue;
      if (valueToSave === (item as any)[field]) {
        setEditingCell(null);
        return;
      }
    }
    
    const updateData: Partial<InsertEstimateItem> = {
      [fieldToUpdate]: valueToSave
    };
    
    // Clear editing state first (optimistic update)
    setEditingCell(null);
    
    // Update the item
    updateItemMutation.mutate({ itemId: item.id, data: updateData });
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, item: EstimateItem, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCellSave(item, field);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCellCancel();
    }
  };

  // Form setup for adding items
  const addItemFormSchema = insertEstimateItemSchema.omit({ 
    estimateId: true,
    taxAmount: true, // Calculated by backend
    priceIncTax: true, // Calculated by backend
  }).extend({
    unitCostExTax: z.number().min(0, "Cost must be positive"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
    markupPercent: z.number().min(0).optional().nullable(),
  });

  const form = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      type: "material",
      quantity: 1,
      unitType: "ea",
      unitCostExTax: 0,
      markupPercent: 0,
      status: "pending",
      groupId: undefined,
      costCode: undefined,
      allowance: "None",
      attachmentUrl: "",
      requestForQuote: false,
      isSelection: false,
      proposalVisible: true,
      shownAs: "price",
      order: 0,
    },
  });

  // Separate form for editing items
  const editForm = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      type: "material",
      quantity: 1,
      unitType: "ea",
      unitCostExTax: 0,
      markupPercent: 0,
      status: "pending",
      groupId: undefined,
      costCode: undefined,
      allowance: "None",
      attachmentUrl: "",
      requestForQuote: false,
      isSelection: false,
      proposalVisible: true,
      shownAs: "price",
      order: 0,
    },
  });

  // Form setup for adding groups
  const addGroupFormSchema = insertEstimateGroupSchema.omit({ 
    estimateId: true 
  });

  const groupForm = useForm<z.infer<typeof addGroupFormSchema>>({
    resolver: zodResolver(addGroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
      isCollapsed: false,
    },
  });

  // Handlers for adding items
  const handleAddItem = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Item",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddItemOpen(true);
  };

  const handleSubmitItem = (data: z.infer<typeof addItemFormSchema>) => {
    if (!estimate) return;
    
    // Backend will recalculate taxAmount and priceIncTax based on markup
    const itemData: InsertEstimateItem = {
      ...data,
      estimateId: estimate.id,
      taxAmount: 0, // Backend will recalculate
      priceIncTax: 0, // Backend will recalculate
    };
    
    addItemMutation.mutate(itemData);
  };

  const handleCloseAddItem = () => {
    setIsAddItemOpen(false);
    form.reset();
  };

  // Handlers for adding groups
  const handleAddGroup = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Group",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddGroupOpen(true);
  };

  // Handler for toggling lock status
  const handleToggleLock = () => {
    if (!estimate) return;
    toggleLockMutation.mutate();
  };

  // Helper function to escape CSV fields
  const escapeCsvField = (field: string): string => {
    return `"${field.replace(/"/g, '""')}"`;
  };

  // Handler for exporting estimate items to CSV
  const handleExportEstimate = () => {
    if (!estimate || !items) return;
    
    // Get all column headers (not filtering by visibility)
    const headers = columns.map(col => col.label);
    const csvRows = [headers.join(',')];
    
    // Add data rows for items
    items.forEach((item) => {
      const row: string[] = [];
      
      columns.forEach(col => {
        switch (col.id) {
          case 'costCode':
            row.push(escapeCsvField(item.costCode || ''));
            break;
          case 'item':
            row.push(escapeCsvField(item.name || ''));
            break;
          case 'description':
            row.push(escapeCsvField(item.description || ''));
            break;
          case 'proposalVisible':
            row.push(item.proposalVisible ? 'Shown' : 'Hidden');
            break;
          case 'shownAs':
            row.push(escapeCsvField(item.shownAs || ''));
            break;
          case 'quantity':
            row.push(item.quantity?.toString() || '0');
            break;
          case 'allowance':
            row.push(escapeCsvField(item.allowance || 'None'));
            break;
          case 'unitType':
            row.push(escapeCsvField(item.unitType || ''));
            break;
          case 'builderCost':
            const pricingVals = calculatePricingValues(item);
            row.push((pricingVals.builderCost / 100).toFixed(2));
            break;
          case 'builderCostIncTax':
            const pricingValsIncTax = calculatePricingValues(item);
            row.push((pricingValsIncTax.builderCostIncTax / 100).toFixed(2));
            break;
          case 'markup':
            const pricingValues = calculatePricingValues(item);
            row.push(pricingValues.markupPercent?.toString() ?? '');
            break;
          case 'clientPriceExTax':
            const pricing1 = calculatePricingValues(item);
            row.push((pricing1.clientPriceExTax / 100).toFixed(2));
            break;
          case 'clientTax':
            const pricing2 = calculatePricingValues(item);
            row.push((pricing2.clientTax / 100).toFixed(2));
            break;
          case 'clientPriceIncTax':
            const pricing3 = calculatePricingValues(item);
            row.push((pricing3.clientPriceIncTax / 100).toFixed(2));
            break;
          case 'notes':
            row.push(escapeCsvField(item.notes || ''));
            break;
          default:
            row.push('');
        }
      });
      
      csvRows.push(row.join(','));
    });
    
    // Create and download the file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${estimate.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Success",
      description: `Exported ${items.length} items to CSV.`,
    });
  };

  // Handler for toggling group collapse
  const handleToggleGroupCollapse = (groupId: string, currentIsCollapsed: boolean) => {
    toggleGroupCollapseMutation.mutate({ 
      groupId, 
      isCollapsed: !currentIsCollapsed 
    });
  };

  // Handler for collapse/expand all groups
  const handleToggleAllGroups = async () => {
    if (!estimate || groups.length === 0) return;
    
    // Determine if we should collapse all or expand all
    // If any group is expanded, collapse all. Otherwise, expand all.
    const anyExpanded = groups.some(group => !group.isCollapsed);
    const targetState = anyExpanded; // true = collapse all, false = expand all
    
    // Update all groups
    const updatePromises = groups.map(group => 
      apiRequest("PATCH", `/api/estimate-groups/${group.id}`, { isCollapsed: targetState })
    );
    
    try {
      await Promise.all(updatePromises);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      toast({
        title: "Success",
        description: targetState ? "All groups collapsed." : "All groups expanded.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update groups.",
        variant: "destructive",
      });
    }
  };

  const handleSubmitGroup = (data: z.infer<typeof addGroupFormSchema>) => {
    if (!estimate) return;
    
    const groupData: InsertEstimateGroup = {
      ...data,
      estimateId: estimate.id,
    };
    
    addGroupMutation.mutate(groupData);
  };

  const handleCloseAddGroup = () => {
    setIsAddGroupOpen(false);
    groupForm.reset();
  };

  // Column visibility toggle handler
  const toggleColumn = (columnId: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    const currentWidth = columns.find(col => col.id === columnId)?.widthPx || 100;
    
    setResizingColumn(columnId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(currentWidth);
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  // Handle resize effect
  React.useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(80, resizeStartWidth + diff);
      
      setColumns(prev => prev.map(col => {
        if (col.id === resizingColumn) {
          return { ...col, widthPx: newWidth };
        }
        return col;
      }));
    };

    const handleMouseUp = () => {
      // Clear resizing state - this will trigger the localStorage save via useEffect
      setResizingColumn(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // Fetch estimate details
  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ["/api/estimates", effectiveEstimateId],
    enabled: !isNewEstimate,
  });

  // Fetch estimate items
  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "items"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch estimate summary
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", effectiveEstimateId, "summary"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch project details
  const projectId = isNewEstimate ? effectiveProjectId : estimate?.projectId;
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch estimate groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<EstimateGroup[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "groups"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch estimate item status field category options
  const { data: estimateItemStatusCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.status"],
  });

  // Fetch estimate item unit field category options
  const { data: estimateItemUnitCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.unit"],
  });

  // Fetch company settings for tax rate
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Get tax rate from company settings (default to 10% if not set)
  const taxRate = companySettings?.taxRate ? parseFloat(companySettings.taxRate.toString()) : 10;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount / 100); // Convert cents to dollars
  };

  // Helper function to calculate two-tier pricing values
  const calculatePricingValues = (item: EstimateItem) => {
    // Builder's cost (what builder pays)
    const builderCost = Math.round((item.unitCostExTax * item.quantity) / 100); // in cents
    
    // Builder's cost with tax
    const taxRate = estimate?.taxRate ?? 10;
    const builderCostTax = Math.round((builderCost * taxRate) / 100); // in cents
    const builderCostIncTax = builderCost + builderCostTax; // in cents
    
    // Markup percentage (item level or project level)
    const markupPercent = item.markupPercent ?? estimate?.projectMarkupPercent ?? 0;
    
    // Client pricing (calculated by backend, or fallback for legacy items)
    const clientTax = item.taxAmount ?? 0; // in cents
    const clientPriceIncTax = item.priceIncTax ?? 0; // in cents
    const clientPriceExTax = clientPriceIncTax - clientTax; // in cents
    
    return {
      builderCost, // in cents
      builderCostIncTax, // in cents
      markupPercent, // percentage (10 = 10%)
      clientPriceExTax, // in cents
      clientTax, // in cents
      clientPriceIncTax // in cents
    };
  };

  const formatQuantity = (quantity: number, unitType: string | null) => {
    const actualQty = (quantity / 100).toFixed(2).replace(/\.?0+$/, '');
    return `${actualQty}${unitType ? ` ${unitType}` : ''}`;
  };

  // Filter items based on current filter state
  const getFilteredItems = () => {
    return items.filter(item => {
      // Type filter
      if (filterType !== 'all' && item.type !== filterType) return false;
      
      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      
      // Group filter
      if (filterGroup !== 'all') {
        if (filterGroup === 'ungrouped' && item.groupId) return false;
        if (filterGroup !== 'ungrouped' && item.groupId !== filterGroup) return false;
      }
      
      return true;
    });
  };

  // State to track collapsed parent items
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());

  // Edit item dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Populate edit form when editing item changes
  React.useEffect(() => {
    if (editingItemId && items) {
      const item = items.find(i => i.id === editingItemId);
      if (item) {
        editForm.reset({
          name: item.name,
          description: item.description || '',
          type: item.type,
          quantity: item.quantity,
          unitType: item.unitType || 'ea',
          unitCostExTax: item.unitCostExTax,
          markupPercent: item.markupPercent || undefined,
          groupId: item.groupId || undefined,
          costCode: item.costCode || '',
          status: item.status || 'pending',
          notes: item.notes || '',
          attachmentUrl: item.attachmentUrl || '',
          requestForQuote: item.requestForQuote || false,
          isSelection: item.isSelection || false,
          proposalVisible: item.proposalVisible ?? true,
          shownAs: item.shownAs || 'price',
          allowance: item.allowance || 'None',
          order: item.order || 0,
        });
      }
    }
  }, [editingItemId, items, editForm]);

  // Helper function to get sub-items for a parent item
  const getSubItems = (parentItemId: string): EstimateItem[] => {
    const subItems = items.filter(item => item.parentItemId === parentItemId);
    return subItems.sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id); // Stable sort by ID when order is same
    });
  };

  // Toggle parent item collapse
  const handleToggleItemCollapse = (itemId: string) => {
    setCollapsedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Column reordering functions
  const moveColumnUp = (columnId: string) => {
    setColumns(prev => {
      const index = prev.findIndex(col => col.id === columnId);
      if (index > 0) {
        const newColumns = [...prev];
        [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
        const effectiveEstimateId = estimate?.id || estimateId;
        if (effectiveEstimateId) {
          localStorage.setItem(`estimateTable_${effectiveEstimateId}_columns`, JSON.stringify(newColumns));
        }
        return newColumns;
      }
      return prev;
    });
  };

  const moveColumnDown = (columnId: string) => {
    setColumns(prev => {
      const index = prev.findIndex(col => col.id === columnId);
      if (index < prev.length - 1) {
        const newColumns = [...prev];
        [newColumns[index + 1], newColumns[index]] = [newColumns[index], newColumns[index + 1]];
        const effectiveEstimateId = estimate?.id || estimateId;
        if (effectiveEstimateId) {
          localStorage.setItem(`estimateTable_${effectiveEstimateId}_columns`, JSON.stringify(newColumns));
        }
        return newColumns;
      }
      return prev;
    });
  };

  // Helper function to render an item row with its sub-items
  const renderItemWithSubItems = (item: EstimateItem) => {
    const subItems = getSubItems(item.id);
    const isCollapsed = collapsedItems.has(item.id);
    const isLocked = estimate?.isLocked;
    
    const rows = [
      // Parent item row
      <SortableRow key={item.id} id={item.id} className="min-h-8" isDraggable={!isLocked}>
        {columns.filter(col => col.visible).map(column => (
          <React.Fragment key={column.id}>
            {renderCell(item, column.id)}
          </React.Fragment>
        ))}
        <TableCell className="py-0.5" style={{ width: '80px' }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0" 
                data-testid={`button-actions-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => {
                  if (estimate?.isLocked) return;
                  form.reset({
                    name: '',
                    type: 'Material',
                    quantity: 1,
                    unitCostExTax: 0,
                    markupPercent: 0,
                    groupId: item.groupId || undefined,
                    parentItemId: item.id,
                    status: 'pending',
                    description: '',
                    costCode: '',
                    notes: '',
                    attachmentUrl: '',
                    requestForQuote: false,
                    isSelection: false,
                    proposalVisible: true,
                    shownAs: 'price',
                    order: 0,
                  });
                  setIsAddItemOpen(true);
                }}
                data-testid={`button-add-subitem-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Sub-Item
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  setEditingItemId(item.id);
                  setIsEditDialogOpen(true);
                }}
                data-testid={`button-edit-item-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Item
              </DropdownMenuItem>
              <DropdownMenuItem 
                data-testid={`button-delete-item-${item.id}`} 
                className="text-destructive"
                disabled={estimate?.isLocked}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </SortableRow>
    ];
    
    // Add sub-items if not collapsed
    if (!isCollapsed) {
      subItems.forEach(subItem => {
        rows.push(
          <SortableRow key={subItem.id} id={subItem.id} className="min-h-8 bg-muted/20" isDraggable={!isLocked}>
            {columns.filter(col => col.visible).map(column => (
              <React.Fragment key={column.id}>
                {renderCell(subItem, column.id)}
              </React.Fragment>
            ))}
            <TableCell className="py-0.5" style={{ width: '80px' }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0" 
                    data-testid={`button-actions-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => {
                      setEditingItemId(subItem.id);
                      setIsEditDialogOpen(true);
                    }}
                    data-testid={`button-edit-item-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Item
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    data-testid={`button-delete-item-${subItem.id}`} 
                    className="text-destructive"
                    disabled={estimate?.isLocked}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </SortableRow>
        );
      });
    }
    
    return rows;
  };

  // Organize items by groups for display (including sub-items)
  const organizeItemsByGroups = () => {
    const filteredItems = getFilteredItems();
    const groupedItems: { [key: string]: EstimateItem[] } = {};
    const ungroupedItems: EstimateItem[] = [];

    // Sort groups by order
    const sortedGroups = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Initialize group containers
    sortedGroups.forEach(group => {
      groupedItems[group.id] = [];
    });

    // First, filter only parent items (items without parentItemId)
    const parentItems = filteredItems.filter(item => !item.parentItemId);
    
    // Organize parent items into groups
    parentItems.forEach(item => {
      if (item.groupId && groupedItems[item.groupId]) {
        groupedItems[item.groupId].push(item);
      } else {
        ungroupedItems.push(item);
      }
    });

    // Sort items within each group by order, then by ID for stability
    Object.keys(groupedItems).forEach(groupId => {
      groupedItems[groupId].sort((a, b) => {
        const orderDiff = (a.order || 0) - (b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return a.id.localeCompare(b.id); // Stable sort by ID when order is same
      });
    });

    // Sort ungrouped items by order, then by ID for stability
    ungroupedItems.sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id); // Stable sort by ID when order is same
    });

    return { sortedGroups, groupedItems, ungroupedItems };
  };

  // Render cell based on column ID
  const renderCell = (item: EstimateItem, columnId: string) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === columnId;
    const isLocked = estimate?.isLocked;
    const pricingValues = calculatePricingValues(item);

    switch (columnId) {
      case 'costCode':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'costCode')}
                onBlur={() => handleCellSave(item, 'costCode')}
                className="h-7 text-sm border-primary"
                autoFocus
                data-testid={`input-edit-costCode-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'costCode')}
            data-testid={`cell-costCode-${item.id}`}
          >
            {item.costCode || '-'}
          </TableCell>
        );
      
      case 'item':
        const subItems = getSubItems(item.id);
        const hasSubItems = subItems.length > 0;
        const isCollapsed = collapsedItems.has(item.id);
        const isSubItem = !!item.parentItemId;
        const indentClass = isSubItem ? 'pl-16' : 'pl-8';
        
        if (isEditing) {
          return (
            <TableCell className={`py-0.5 ${indentClass}`}>
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'name')}
                onBlur={() => handleCellSave(item, 'name')}
                className="h-7 text-sm border-primary"
                autoFocus
                data-testid={`input-edit-name-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 ${indentClass} ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={(e) => {
              // Don't trigger edit if clicking on a button or already in a tooltip trigger
              const target = e.target as HTMLElement;
              if (target.closest('button') || target.closest('[role="button"]')) {
                return;
              }
              if (!isLocked) {
                handleCellEdit(item, 'name');
              }
            }}
            data-testid={`cell-name-${item.id}`}
          >
            <div className="flex items-center gap-2">
              {hasSubItems && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 -ml-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleItemCollapse(item.id);
                  }}
                  data-testid={`button-toggle-item-${item.id}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium text-sm truncate max-w-[180px] block">
                      {item.name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-[300px]">
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </TableCell>
        );
      
      case 'description':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'description')}
                onBlur={() => handleCellSave(item, 'description')}
                className="h-7 text-sm border-primary"
                autoFocus
                data-testid={`input-edit-description-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'description')}
            data-testid={`cell-description-${item.id}`}
          >
            <span className="truncate block max-w-[200px]">
              {item.description || '-'}
            </span>
          </TableCell>
        );
      
      case 'proposalVisible':
        return (
          <TableCell className="py-0.5 text-center" data-testid={`cell-proposalVisible-${item.id}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                if (isLocked) {
                  toast({
                    title: "Cannot Edit",
                    description: "This estimate is locked and cannot be modified.",
                    variant: "destructive",
                  });
                  return;
                }
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { proposalVisible: !item.proposalVisible }
                });
              }}
              disabled={isLocked}
              data-testid={`button-toggle-proposalVisible-${item.id}`}
            >
              {item.proposalVisible ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-30" />}
            </Button>
          </TableCell>
        );
      
      case 'shownAs':
        const shownAsOptions = ['empty', 'price', 'included', 'excluded'];
        const currentShownAs = item.shownAs || 'price';
        const currentIndex = shownAsOptions.indexOf(currentShownAs);
        const validIndex = currentIndex >= 0 ? currentIndex : 1; // Default to 'price' if invalid
        
        return (
          <TableCell className="py-0.5 text-sm" key={`${item.id}-shownAs`} data-testid={`cell-shownAs-${item.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs capitalize"
              onClick={() => {
                if (isLocked) return;
                // Cycle through options
                const nextIndex = (validIndex + 1) % shownAsOptions.length;
                const nextShownAs = shownAsOptions[nextIndex];
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { shownAs: nextShownAs }
                });
              }}
              disabled={isLocked}
              data-testid={`button-toggle-shownAs-${item.id}`}
            >
              {currentShownAs}
            </Button>
          </TableCell>
        );
      
      case 'allowance':
        const allowanceType = item.allowance || 'None';
        return (
          <TableCell className="py-0.5 text-sm" key={`${item.id}-allowance`} data-testid={`cell-allowance-${item.id}`}>
            <Button
              variant={allowanceType === 'None' ? 'outline' : 'default'}
              size="sm"
              className={`h-6 px-2 text-xs ${
                allowanceType === 'Prime Cost' ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' :
                allowanceType === 'Provisional Sum' ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' :
                'text-muted-foreground'
              } ${!isLocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              onClick={() => {
                if (isLocked) return;
                // Cycle through: None -> Prime Cost -> Provisional Sum -> None
                const nextAllowance = 
                  item.allowance === 'None' ? 'Prime Cost' :
                  item.allowance === 'Prime Cost' ? 'Provisional Sum' : 'None';
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { allowance: nextAllowance }
                });
              }}
              disabled={isLocked}
              data-testid={`button-toggle-allowance-${item.id}`}
            >
              {allowanceType === 'Prime Cost' ? 'PC' : allowanceType === 'Provisional Sum' ? 'PS' : ''}
            </Button>
          </TableCell>
        );
      
      case 'quantity':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'quantity')}
                onBlur={() => handleCellSave(item, 'quantity')}
                className="h-7 text-sm border-primary"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-quantity-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'quantity')}
            data-testid={`cell-quantity-${item.id}`}
          >
            {(item.quantity / 100).toFixed(2).replace(/\.?0+$/, '')}
          </TableCell>
        );
      
      case 'unitType':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Select
                value={editingValue}
                onValueChange={(value) => {
                  setEditingValue(value);
                  // Auto-save on selection
                  updateItemMutation.mutate({
                    itemId: item.id,
                    data: { unitType: value }
                  });
                  setEditingCell(null);
                }}
                data-testid={`select-edit-unitType-${item.id}`}
              >
                <SelectTrigger className="h-7 text-sm border-primary">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {estimateItemUnitCategory?.options
                    ?.filter(opt => opt.isActive)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(option => (
                      <SelectItem key={option.id} value={option.name}>
                        {option.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'unitType')}
            data-testid={`cell-unitType-${item.id}`}
          >
            {item.unitType || '-'}
          </TableCell>
        );
      
      case 'builderCost':
        return (
          <TableCell className="py-0.5 text-sm" data-testid={`cell-builderCost-${item.id}`}>
            {formatCurrency(pricingValues.builderCost)}
          </TableCell>
        );
      
      case 'builderCostIncTax':
        return (
          <TableCell className="py-0.5 text-sm" data-testid={`cell-builderCostIncTax-${item.id}`}>
            {formatCurrency(pricingValues.builderCostIncTax)}
          </TableCell>
        );
      
      case 'markup':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'markupPercent')}
                onBlur={() => handleCellSave(item, 'markupPercent')}
                className="h-7 text-sm border-primary"
                autoFocus
                min="0"
                step="1"
                data-testid={`input-edit-markup-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'markupPercent')}
            data-testid={`cell-markup-${item.id}`}
          >
            {pricingValues.markupPercent != null ? `${pricingValues.markupPercent}%` : 
             (estimate?.projectMarkupPercent != null ? `${estimate.projectMarkupPercent}% (project)` : '-')}
          </TableCell>
        );
      
      case 'clientPriceExTax':
        return (
          <TableCell className="py-0.5 text-sm" data-testid={`cell-clientPriceExTax-${item.id}`}>
            {formatCurrency(pricingValues.clientPriceExTax)}
          </TableCell>
        );
      
      case 'clientTax':
        return (
          <TableCell className="py-0.5 text-sm" data-testid={`cell-clientTax-${item.id}`}>
            {formatCurrency(pricingValues.clientTax)}
          </TableCell>
        );
      
      case 'clientPriceIncTax':
        return (
          <TableCell className="py-0.5 text-sm font-medium" data-testid={`cell-clientPriceIncTax-${item.id}`}>
            {formatCurrency(pricingValues.clientPriceIncTax)}
          </TableCell>
        );
      
      case 'notes':
        return (
          <TableCell className="py-0.5 text-center" data-testid={`cell-notes-${item.id}`}>
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 ${item.notes ? 'text-primary' : 'text-muted-foreground/30'}`}
                      disabled={isLocked}
                      data-testid={`button-notes-${item.id}`}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                {item.notes && (
                  <TooltipContent>
                    <p className="max-w-xs">{`${item.notes.substring(0, 100)}${item.notes.length > 100 ? '...' : ''}`}</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <PopoverContent className="w-96" align="start">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Notes - {item.name}</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const notes = formData.get('notes') as string;
                    updateItemMutation.mutate({
                      itemId: item.id,
                      data: { notes }
                    });
                  }}>
                    <Textarea
                      name="notes"
                      defaultValue={item.notes || ''}
                      placeholder="Enter notes..."
                      rows={6}
                      data-testid={`textarea-notes-${item.id}`}
                    />
                    <div className="flex justify-end space-x-2 mt-3">
                      <Button
                        type="submit"
                        size="sm"
                        data-testid={`button-save-notes-${item.id}`}
                      >
                        Save
                      </Button>
                    </div>
                  </form>
                </div>
              </PopoverContent>
            </Popover>
          </TableCell>
        );
      
      default:
        return <TableCell className="py-0.5"></TableCell>;
    }
  };

  if (estimateLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div className="h-6 bg-gray-300 rounded w-48 animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-300 rounded"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if ((estimateError || !estimate) && !isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
            <p className="text-muted-foreground">
              The estimate you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle new estimate creation
  if (isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>

        {/* Creation Form */}
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Project</label>
                <p className="text-base font-medium text-muted-foreground">
                  {project?.name || 'Loading project...'}
                </p>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="estimate-name" className="text-sm font-medium block">
                  Estimate Name *
                </label>
                <Input
                  id="estimate-name"
                  placeholder="Enter estimate name..."
                  value={newEstimateName}
                  onChange={(e) => setNewEstimateName(e.target.value)}
                  data-testid="input-new-estimate-name"
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={handleCreateEstimate}
                  disabled={!newEstimateName.trim() || createEstimateMutation.isPending}
                  data-testid="button-create-estimate"
                >
                  {createEstimateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Estimate
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLocation("/estimates")} data-testid="button-cancel-create-estimate">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked v{estimate.version}</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Draft v{estimate.version}</Badge>;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-950 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")} data-testid="button-back-to-estimates">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div>
              {isEditingName ? (
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleNameSave}
                  className="text-2xl font-semibold bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  data-testid="input-estimate-name"
                  autoFocus
                />
              ) : (
                <h1 
                  className="text-2xl font-semibold cursor-pointer hover:text-blue-600 transition-colors" 
                  data-testid="text-estimate-title"
                  onClick={handleNameEdit}
                  title="Click to edit estimate name"
                >
                  {estimate?.name || 'Loading...'}
                </h1>
              )}
              <p className="text-sm text-muted-foreground" data-testid="text-project-name">
                Project: {project?.name || 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {estimate && getStatusBadge(estimate)}
            <Button variant="outline" size="sm" data-testid="button-edit-estimate">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportEstimate}
              disabled={!items || items.length === 0}
              data-testid="button-export-estimate"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            {estimate && (
              <Button 
                variant={estimate.isLocked ? "destructive" : "outline"} 
                size="sm" 
                data-testid="button-toggle-lock"
                onClick={handleToggleLock}
                disabled={toggleLockMutation.isPending}
              >
                {estimate.isLocked ? (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  {toggleLockMutation.isPending ? "Unlocking..." : "Unlock"}
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  {toggleLockMutation.isPending ? "Locking..." : "Lock"}
                </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6 min-w-0">
          {/* Collapsible Summary */}
          {summary && (
            <Card>
              <CardHeader className="cursor-pointer hover-elevate py-3" onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5"
                      data-testid="button-toggle-summary"
                    >
                      {isSummaryExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </Button>
                    <CardTitle className="flex items-center text-sm font-medium">
                      <Calculator className="w-4 h-4 mr-1" />
                      Estimate Total
                    </CardTitle>
                  </div>
                  <div className="text-xl font-bold text-primary" data-testid="text-total">
                    {formatCurrency(summary.total)}
                  </div>
                </div>
              </CardHeader>
              
              {isSummaryExpanded && (
                <CardContent className="pt-0 pb-3 space-y-2">
                  <Separator />
                  
                  {/* Builder Cost Subtotal */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Builder Cost Subtotal</span>
                    <span className="font-semibold" data-testid="text-builder-cost-subtotal">
                      {formatCurrency(summary.subtotal)}
                    </span>
                  </div>

                  {/* Markup Line */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Markup (
                      {isEditingMarkup ? (
                        <Input
                          value={editingMarkup}
                          onChange={(e) => setEditingMarkup(e.target.value)}
                          onKeyDown={handleMarkupKeyDown}
                          onBlur={handleMarkupSave}
                          className="inline-block w-12 h-5 text-xs bg-transparent border-b border-primary p-0 px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                          data-testid="input-markup-percentage"
                          autoFocus
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:text-primary transition-colors underline decoration-dotted"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkupEdit();
                          }}
                          title="Click to edit markup percentage"
                          data-testid="text-markup-percentage"
                        >
                          {estimate?.projectMarkupPercent || 0}
                        </span>
                      )}
                      %)
                    </span>
                    <span className="font-semibold" data-testid="text-markup">
                      {formatCurrency(summary.markupAmount)}
                    </span>
                  </div>

                  {/* Amount Ex Tax */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Amount (ex-tax)</span>
                    <span className="font-semibold" data-testid="text-client-price-ex-tax">
                      {formatCurrency(summary.subtotalWithMarkup)}
                    </span>
                  </div>

                  {/* GST Line */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">GST ({estimate?.taxRate || 10}%)</span>
                    <span className="font-semibold" data-testid="text-tax">
                      {formatCurrency(summary.taxAmount)}
                    </span>
                  </div>

                  <Separator className="my-2" />

                  {/* Total Line (Amount Inc Tax) */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-medium">Amount (inc. GST)</span>
                    <span className="text-lg font-bold text-primary" data-testid="text-total-inc-tax">
                      {formatCurrency(summary.total)}
                    </span>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Items Table */}
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Estimate Items ({items.length})
              </CardTitle>
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-column-visibility"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <div className="px-2 py-1.5 text-sm font-semibold">Show columns</div>
                    {columns.map(column => (
                      <DropdownMenuItem 
                        key={column.id}
                        onClick={(e) => {
                          e.preventDefault();
                        }}
                      >
                        <Checkbox
                          checked={column.visible}
                          onCheckedChange={() => toggleColumn(column.id)}
                          className="mr-2"
                        />
                        {column.label}
                      </DropdownMenuItem>
                    ))}
                    <Separator className="my-2" />
                    <div className="px-2 py-1.5 text-sm font-semibold">Reorder columns</div>
                    {columns.map((column, index) => (
                      <DropdownMenuItem 
                        key={`reorder-${column.id}`}
                        onClick={(e) => e.preventDefault()}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">{column.label}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveColumnUp(column.id);
                            }}
                            disabled={index === 0}
                            data-testid={`button-move-up-${column.id}`}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveColumnDown(column.id);
                            }}
                            disabled={index === columns.length - 1}
                            data-testid={`button-move-down-${column.id}`}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button 
                  size="sm" 
                  data-testid="button-add-group" 
                  onClick={handleAddGroup}
                  disabled={estimate?.isLocked}
                  variant={estimate?.isLocked ? "secondary" : "outline"}
                >
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Add Group
                </Button>
                <Button 
                  size="sm" 
                  data-testid="button-add-item" 
                  onClick={handleAddItem}
                  disabled={estimate?.isLocked}
                  variant={estimate?.isLocked ? "secondary" : "default"}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New item
                </Button>
              </div>
            </CardHeader>
            
            {/* Filter Bar */}
            <div className="px-6 py-3 border-b flex items-center gap-3">
              {groups.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={handleToggleAllGroups}
                    data-testid="button-toggle-all-groups"
                  >
                    {groups.some(group => !group.isCollapsed) ? (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-2" />
                        Expand All
                      </>
                    )}
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Array.from(new Set(items.map(item => item.type))).map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((opt: any) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-group">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  <SelectItem value="ungrouped">Ungrouped</SelectItem>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {(filterType !== 'all' || filterStatus !== 'all' || filterGroup !== 'all') && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8"
                  onClick={() => {
                    setFilterType('all');
                    setFilterStatus('all');
                    setFilterGroup('all');
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear All
                </Button>
              )}
            </div>
            
            <CardContent className="p-0 overflow-x-auto">
              <div className="p-6">
                {itemsLoading || groupsLoading ? (
                  <div className="animate-pulse space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-32 bg-gray-300 rounded-lg"></div>
                    ))}
                  </div>
                ) : items.length === 0 && groups.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No items or groups added yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Add a group to organize items, or add items directly.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button 
                        data-testid="button-add-first-group" 
                        onClick={handleAddGroup}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Add Group
                      </Button>
                      <Button 
                        data-testid="button-add-first-item" 
                        onClick={handleAddItem}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "default"}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Item
                      </Button>
                      <Button 
                        data-testid="button-import-items" 
                        onClick={() => setIsImportOpen(true)}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import Items
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="space-y-4">
{(() => {
                      const { sortedGroups, groupedItems, ungroupedItems } = organizeItemsByGroups();
                      
                      // Create sortable IDs: group IDs prefixed with "group-" and item IDs
                      const groupIds = sortedGroups.map(g => `group-${g.id}`);
                      const allItemIds = [...ungroupedItems.map(i => i.id)];
                      Object.values(groupedItems).forEach(groupItems => {
                        allItemIds.push(...groupItems.map(i => i.id));
                      });
                      const allSortableIds = [...groupIds, ...allItemIds];
                      
                      const tableWidth = columns.filter(col => col.visible).reduce((sum, col) => sum + col.widthPx, 0) + 80 + 40;
                      
                      return (
                        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                          {/* Render ungrouped items first (if any) - NO CARD */}
                          {ungroupedItems.length > 0 && (
                            <Table style={{ 
                              display: 'table',
                              tableLayout: 'fixed',
                              width: `${tableWidth}px`,
                              minWidth: `${tableWidth}px`
                            }} data-testid="table-ungrouped-items">
                              <colgroup>
                                <col style={{ width: '40px' }} />
                                {columns.filter(col => col.visible).map(column => (
                                  <col key={column.id} style={{ width: `${column.widthPx}px`, minWidth: `${column.widthPx}px` }} />
                                ))}
                                <col style={{ width: '80px' }} />
                              </colgroup>
                              <TableHeader>
                                <TableRow className="h-8">
                                  <TableHead className="py-1 text-xs font-medium" style={{ width: '40px' }}></TableHead>
                                  {columns.filter(col => col.visible).map(column => (
                                    <TableHead 
                                      key={column.id}
                                      className="py-1 text-xs font-medium relative group"
                                      style={{ width: `${column.widthPx}px` }}
                                    >
                                      <div className="flex items-center gap-1">
                                        <span>{column.label}</span>
                                      </div>
                                      <div
                                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        style={{ pointerEvents: 'auto', touchAction: 'none' }}
                                        onMouseDown={(e) => handleResizeStart(e, column.id)}
                                        data-testid={`resize-handle-${column.id}`}
                                      />
                                    </TableHead>
                                  ))}
                                  <TableHead className="py-1 text-xs font-medium" style={{ width: '80px' }}>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody data-testid="tbody-ungrouped-items">
                                {ungroupedItems.map((item) => (
                                  <React.Fragment key={`item-wrapper-${item.id}`}>
                                    {renderItemWithSubItems(item)}
                                  </React.Fragment>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                          
                          {/* Render each group as a card bubble */}
                          {sortedGroups.map((group) => (
                            <SortableGroup key={`group-${group.id}`} id={`group-${group.id}`}>
                              {({ attributes, listeners }) => (
                                <Card className="border" data-testid={`card-group-${group.id}`}>
                                  <CardHeader className="py-3 px-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-2">
                                        <div
                                          {...attributes}
                                          {...listeners}
                                          className="cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity -ml-2 mr-1"
                                          data-testid={`drag-handle-group-${group.id}`}
                                        >
                                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={() => handleToggleGroupCollapse(group.id, group.isCollapsed || false)}
                                          data-testid={`button-toggle-group-${group.id}`}
                                        >
                                          {group.isCollapsed ? (
                                            <ChevronRight className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </Button>
                                        <span className="font-medium text-sm">{group.name}</span>
                                        {group.description && (
                                          <span className="text-xs text-muted-foreground">- {group.description}</span>
                                        )}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {groupedItems[group.id]?.length || 0} items
                                      </span>
                                    </div>
                                  </CardHeader>
                              {!group.isCollapsed && groupedItems[group.id] && groupedItems[group.id].length > 0 && (
                                <CardContent className="p-0">
                                  <Table style={{ 
                                    display: 'table',
                                    tableLayout: 'fixed',
                                    width: `${tableWidth}px`,
                                    minWidth: `${tableWidth}px`
                                  }}>
                                    <colgroup>
                                      <col style={{ width: '40px' }} />
                                      {columns.filter(col => col.visible).map(column => (
                                        <col key={column.id} style={{ width: `${column.widthPx}px`, minWidth: `${column.widthPx}px` }} />
                                      ))}
                                      <col style={{ width: '80px' }} />
                                    </colgroup>
                                    <TableHeader>
                                      <TableRow className="h-8">
                                        <TableHead className="py-1 text-xs font-medium" style={{ width: '40px' }}></TableHead>
                                        {columns.filter(col => col.visible).map(column => (
                                          <TableHead 
                                            key={column.id}
                                            className="py-1 text-xs font-medium relative group"
                                            style={{ width: `${column.widthPx}px` }}
                                          >
                                            <div className="flex items-center gap-1">
                                              <span>{column.label}</span>
                                            </div>
                                            <div
                                              className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                              style={{ pointerEvents: 'auto', touchAction: 'none' }}
                                              onMouseDown={(e) => handleResizeStart(e, column.id)}
                                              data-testid={`resize-handle-${column.id}`}
                                            />
                                          </TableHead>
                                        ))}
                                        <TableHead className="py-1 text-xs font-medium" style={{ width: '80px' }}>Actions</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {groupedItems[group.id].map((item) => (
                                        <React.Fragment key={`item-wrapper-${item.id}`}>
                                          {renderItemWithSubItems(item)}
                                        </React.Fragment>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </CardContent>
                              )}
                                </Card>
                              )}
                            </SortableGroup>
                          ))}
                        </SortableContext>
                      );
                    })()}
                  </div>
                </DndContext>
              )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Estimate Item</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitItem)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Premium Kitchen Cabinets" {...field} data-testid="input-item-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional details about this item..." {...field} value={field.value || ""} data-testid="input-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-item-group">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None (ungrouped)</SelectItem>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
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
                  name="costCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Code (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined} disabled>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-costcode">
                            <SelectValue placeholder="Not configured" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="labour">Labour</SelectItem>
                          <SelectItem value="equipment">Equipment</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0.01"
                          placeholder="1"
                          {...field}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 0;
                            const rounded = Math.round(qty * 100) / 100;
                            field.onChange(rounded);
                          }}
                          data-testid="input-item-quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-unit">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {estimateItemUnitCategory?.options
                            ?.filter(opt => opt.isActive)
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map(option => (
                              <SelectItem key={option.id} value={option.name}>
                                {option.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unitCostExTax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Builder's Cost (Ex Tax)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          {...field}
                          onChange={(e) => {
                            const cost = parseFloat(e.target.value) || 0;
                            const rounded = Math.round(cost * 100) / 100;
                            field.onChange(rounded);
                          }}
                          data-testid="input-item-builder-cost"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="markupPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Markup % (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.1" 
                          min="0"
                          placeholder="0% (default)"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === '' ? undefined : parseFloat(value) || 0);
                          }}
                          data-testid="input-item-markup"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Internal notes for the team..." {...field} value={field.value || ""} data-testid="input-item-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowance</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-allowance">
                          <SelectValue placeholder="Select allowance type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Prime Cost">Prime Cost</SelectItem>
                        <SelectItem value="Provisional Sum">Provisional Sum</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachmentUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attachment URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-item-attachment" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requestForQuote"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-request-for-quote"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Request for Quote</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isSelection"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-is-selection"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Link to Selections</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Proposal Settings</h4>
                
                <FormField
                  control={form.control}
                  name="proposalVisible"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-visible-in-proposal"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Show in client proposal</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shownAs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show as in proposal</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-show-as-in-proposal">
                            <SelectValue placeholder="Select display format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="empty">Empty (no price)</SelectItem>
                          <SelectItem value="price">Show price</SelectItem>
                          <SelectItem value="included">Included</SelectItem>
                          <SelectItem value="excluded">Excluded</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAddItem} data-testid="button-cancel-add-item">
                  Cancel
                </Button>
                <Button type="submit" disabled={addItemMutation.isPending} data-testid="button-submit-add-item">
                  {addItemMutation.isPending ? "Adding..." : "New item"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      {(() => {
        const editingItem = items.find(item => item.id === editingItemId);
        if (!editingItem) return null;
        
        return (
          <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingItemId(null);
            }
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Estimate Item</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit((data) => {
                  updateItemMutation.mutate(
                    { itemId: editingItem.id, data },
                    {
                      onSuccess: () => {
                        setIsEditDialogOpen(false);
                        setEditingItemId(null);
                      }
                    }
                  );
                })} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Premium Kitchen Cabinets" {...field} data-testid="input-edit-item-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional details about this item..." {...field} value={field.value || ""} data-testid="input-edit-item-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="groupId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Group (Optional)</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                            value={field.value || "none"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-group">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None (ungrouped)</SelectItem>
                              {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="costCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost Code (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined} disabled>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-costcode">
                                <SelectValue placeholder="Not configured" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labour">Labour</SelectItem>
                              <SelectItem value="equipment">Equipment</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-status">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                                <SelectItem key={option.key} value={option.key}>
                                  {option.name}
                                </SelectItem>
                              )) || (
                                <>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="quoted">Quoted</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0.01"
                              placeholder="1"
                              {...field}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                const rounded = Math.round(qty * 100) / 100;
                                field.onChange(rounded);
                              }}
                              data-testid="input-edit-item-quantity"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="unitType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-unit">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {estimateItemUnitCategory?.options
                                ?.filter(opt => opt.isActive)
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map(option => (
                                  <SelectItem key={option.id} value={option.name}>
                                    {option.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="unitCostExTax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Builder's Cost (Ex Tax)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0"
                              placeholder="0.00"
                              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...field}
                              onChange={(e) => {
                                const cost = parseFloat(e.target.value) || 0;
                                const rounded = Math.round(cost * 100) / 100;
                                field.onChange(rounded);
                              }}
                              data-testid="input-edit-item-builder-cost"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="markupPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Markup % (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.1" 
                              min="0"
                              placeholder="0% (default)"
                              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === '' ? undefined : parseFloat(value) || 0);
                              }}
                              data-testid="input-edit-item-markup"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-4" />

                  <FormField
                    control={editForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Internal notes for the team..." {...field} value={field.value || ""} data-testid="input-edit-item-notes" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="allowance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowance</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-item-allowance">
                              <SelectValue placeholder="Select allowance type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="None">None</SelectItem>
                            <SelectItem value="Prime Cost">Prime Cost</SelectItem>
                            <SelectItem value="Provisional Sum">Provisional Sum</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="attachmentUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attachment URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-edit-item-attachment" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="requestForQuote"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-request-for-quote"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Request for Quote</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="isSelection"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-is-selection"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Link to Selections</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Proposal Settings</h4>
                    
                    <FormField
                      control={editForm.control}
                      name="proposalVisible"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-visible-in-proposal"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Show in client proposal</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="shownAs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Show as in proposal</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-show-as-in-proposal">
                                <SelectValue placeholder="Select display format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="empty">Empty (no price)</SelectItem>
                              <SelectItem value="price">Show price</SelectItem>
                              <SelectItem value="included">Included</SelectItem>
                              <SelectItem value="excluded">Excluded</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditDialogOpen(false);
                        setEditingItemId(null);
                      }}
                      data-testid="button-cancel-edit-item"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateItemMutation.isPending} data-testid="button-submit-edit-item">
                      {updateItemMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Add Group Dialog */}
      <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Estimate Group</DialogTitle>
          </DialogHeader>
          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(handleSubmitGroup)} className="space-y-4">
              <FormField
                control={groupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Kitchen Work" {...field} data-testid="input-group-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={groupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional details about this group..." {...field} value={field.value || ""} data-testid="input-group-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={groupForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-group-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAddGroup} data-testid="button-cancel-add-group">
                  Cancel
                </Button>
                <Button type="submit" disabled={addGroupMutation.isPending} data-testid="button-submit-add-group">
                  {addGroupMutation.isPending ? "Adding..." : "Add Group"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Import Items Dialog */}
      {effectiveEstimateId && !isNewEstimate && (
        <ImportEstimateItemsDialog
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          estimateId={effectiveEstimateId}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/estimates/${effectiveEstimateId}/items`] });
            queryClient.invalidateQueries({ queryKey: [`/api/estimates/${effectiveEstimateId}/summary`] });
          }}
        />
      )}
    </div>
  );
}