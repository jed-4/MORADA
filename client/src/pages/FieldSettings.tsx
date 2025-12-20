import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, Settings as SettingsIcon, GripVertical, List, ArrowLeft, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FieldOption, FieldCategory, SupplierLabel, PriceListCategory } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

const STATUS_COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#eab308", label: "Yellow" },
  { value: "#84cc16", label: "Lime" },
  { value: "#22c55e", label: "Green" },
  { value: "#10b981", label: "Emerald" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#a855f7", label: "Purple" },
  { value: "#d946ef", label: "Fuchsia" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f43f5e", label: "Rose" },
  { value: "#6b7280", label: "Gray" },
];

interface SortableRowProps {
  option: FieldOption;
  onEdit: (option: FieldOption) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string, isDefault: boolean) => void;
  onToggleCompleted: (id: string, isCompleted: boolean) => void;
  onToggleActionable: (id: string, isActionable: boolean) => void;
  parentOptions: FieldOption[];
  supportsHierarchy: boolean;
  showDoneColumn: boolean;
  showActionableColumn: boolean;
}

function SortableRow({ option, onEdit, onDelete, onToggleDefault, onToggleCompleted, onToggleActionable, parentOptions, supportsHierarchy, showDoneColumn, showActionableColumn }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: option.id,
    animateLayoutChanges: () => false, // Disable animations for smoother drag
  });

  // Only use Y-axis transform to prevent horizontal shifting
  const style: React.CSSProperties = {
    transform: transform ? `translateY(${Math.round(transform.y)}px)` : undefined,
    transition: transition || 'transform 150ms ease',
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  const parentOption = parentOptions.find(p => p.id === option.parentId);

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`row-option-${option.id}`}>
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>
        <div className={option.parentId && supportsHierarchy ? "pl-8" : ""}>
          {option.name}
        </div>
      </TableCell>
      <TableCell>
        {option.color && (
          <Badge style={{ backgroundColor: option.color }}>
            {option.name}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Checkbox
          checked={option.isDefault}
          onCheckedChange={(checked) => onToggleDefault(option.id, !!checked)}
          aria-label={`Set ${option.name} as default`}
          data-testid={`checkbox-default-${option.id}`}
        />
      </TableCell>
      {showDoneColumn && (
        <TableCell className="text-center">
          <Checkbox
            checked={option.isCompleted}
            onCheckedChange={(checked) => onToggleCompleted(option.id, !!checked)}
            aria-label={`Mark ${option.name} as done status`}
            data-testid={`checkbox-completed-${option.id}`}
          />
        </TableCell>
      )}
      {showActionableColumn && (
        <TableCell className="text-center">
          <Checkbox
            checked={option.isActionable}
            onCheckedChange={(checked) => onToggleActionable(option.id, !!checked)}
            aria-label={`Mark ${option.name} as requiring action`}
            data-testid={`checkbox-actionable-${option.id}`}
          />
        </TableCell>
      )}
      {supportsHierarchy && (
        <TableCell>
          {parentOption ? (
            <Badge variant="outline">{parentOption.name}</Badge>
          ) : option.parentId ? (
            <span className="text-sm text-muted-foreground">Unknown Parent</span>
          ) : (
            <span className="text-sm text-muted-foreground">Parent</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(option)}
            data-testid={`button-edit-${option.id}`}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(option.id)}
            data-testid={`button-delete-${option.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function FieldSettings() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [showSupplierLabels, setShowSupplierLabels] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<FieldOption | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#3b82f6",
    parentId: null as string | null,
  });
  
  // Supplier Labels state
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<SupplierLabel | null>(null);
  const [labelFormData, setLabelFormData] = useState({
    name: "",
    color: "#bba7db",
    description: "",
  });

  // Price List Categories state
  const [showPriceListCategories, setShowPriceListCategories] = useState(false);
  const [isPLCategoryDialogOpen, setIsPLCategoryDialogOpen] = useState(false);
  const [editingPLCategory, setEditingPLCategory] = useState<PriceListCategory | null>(null);
  const [plCategoryFormData, setPLCategoryFormData] = useState({
    name: "",
    color: "#3b82f6",
    description: "",
  });

  // Fetch field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategory[]>({
    queryKey: ['/api/field-categories'],
  });

  // Fetch supplier labels
  const { data: supplierLabels = [] } = useQuery<SupplierLabel[]>({
    queryKey: ['/api/supplier-labels'],
    enabled: showSupplierLabels,
  });

  // Fetch price list categories
  const { data: priceListCategories = [] } = useQuery<PriceListCategory[]>({
    queryKey: ['/api/price-list/categories'],
    enabled: showPriceListCategories,
  });

  // Auto-select first category if none selected
  useEffect(() => {
    if (fieldCategories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(fieldCategories[0].id);
    }
  }, [fieldCategories, selectedCategoryId]);

  const selectedCategory = useMemo(
    () => fieldCategories.find((c) => c.id === selectedCategoryId),
    [fieldCategories, selectedCategoryId]
  );

  // Determine if the selected category supports hierarchy (parentId)
  const supportsHierarchy = useMemo(
    () => selectedCategory?.key === 'project.status',
    [selectedCategory]
  );

  // Show "Done" column for status-type categories where marking completion makes sense
  const showDoneColumn = useMemo(
    () => selectedCategory?.key === 'task.status',
    [selectedCategory]
  );

  // Show "Actionable" column for estimate and schedule status categories
  const showActionableColumn = useMemo(
    () => ['estimate.status', 'schedule.status', 'task.status'].includes(selectedCategory?.key || ''),
    [selectedCategory]
  );

  // Fetch field options for selected category
  const { data: allOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', selectedCategoryId],
    enabled: !!selectedCategoryId,
    queryFn: async () => {
      if (!selectedCategoryId) return [];
      return await apiRequest(`/api/field-categories/${selectedCategoryId}/options`, 'GET') as FieldOption[];
    },
  });

  // Separate parent and sub options (for hierarchical categories)
  const parentOptions = useMemo(
    () => allOptions.filter(o => !o.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allOptions]
  );

  const subOptions = useMemo(
    () => allOptions.filter(o => o.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allOptions]
  );

  // Combined list for display (parents with their children for hierarchical)
  const displayOptions = useMemo(() => {
    if (!supportsHierarchy) {
      return allOptions.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const result: FieldOption[] = [];
    parentOptions.forEach(parent => {
      result.push(parent);
      const children = subOptions.filter(s => s.parentId === parent.id);
      result.push(...children);
    });
    // Add orphaned sub-options at the end
    const orphaned = subOptions.filter(s => !parentOptions.find(p => p.id === s.parentId));
    result.push(...orphaned);
    return result;
  }, [allOptions, parentOptions, subOptions, supportsHierarchy]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; parentId: string | null }) => {
      if (!selectedCategoryId) throw new Error("No category selected");
      
      const maxSortOrder = Math.max(...allOptions.map(o => o.sortOrder), -1);
      
      return await apiRequest('/api/field-options', 'POST', {
        categoryId: selectedCategoryId,
        key: data.name.toLowerCase().replace(/\s+/g, '_'),
        name: data.name,
        color: data.color,
        parentId: supportsHierarchy ? data.parentId : null,
        sortOrder: maxSortOrder + 1,
        isActive: true,
        isDefault: false,
        isCompleted: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Option created",
        description: "The field option has been created successfully.",
      });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create field option.",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FieldOption> }) => {
      return await apiRequest(`/api/field-options/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Option updated",
        description: "The field option has been updated successfully.",
      });
      setIsCreateDialogOpen(false);
      setEditingOption(null);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update field option.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/field-options/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Option deleted",
        description: "The field option has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete field option.",
        variant: "destructive",
      });
    },
  });

  // Toggle default mutation - when setting one as default, unset others first
  const toggleDefaultMutation = useMutation({
    mutationFn: async ({ id, isDefault }: { id: string; isDefault: boolean }) => {
      if (isDefault) {
        // Unset all others in category first, then set this one
        const unsetPromises = allOptions
          .filter(opt => opt.id !== id && opt.isDefault)
          .map(opt => apiRequest(`/api/field-options/${opt.id}`, 'PATCH', { isDefault: false }));
        await Promise.all(unsetPromises);
      }
      return await apiRequest(`/api/field-options/${id}`, 'PATCH', { isDefault });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Default updated",
        description: "The default option has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update default option.",
        variant: "destructive",
      });
    },
  });

  const handleToggleDefault = (id: string, isDefault: boolean) => {
    toggleDefaultMutation.mutate({ id, isDefault });
  };

  // Toggle completed mutation - marks a status as a "done" state
  const toggleCompletedMutation = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      return await apiRequest(`/api/field-options/${id}`, 'PATCH', { isCompleted });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Done status updated",
        description: "The done status flag has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update done status.",
        variant: "destructive",
      });
    },
  });

  const handleToggleCompleted = (id: string, isCompleted: boolean) => {
    toggleCompletedMutation.mutate({ id, isCompleted });
  };

  // Toggle actionable mutation - marks a status as requiring action
  const toggleActionableMutation = useMutation({
    mutationFn: async ({ id, isActionable }: { id: string; isActionable: boolean }) => {
      return await apiRequest(`/api/field-options/${id}`, 'PATCH', { isActionable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      toast({
        title: "Actionable status updated",
        description: "The actionable flag has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update actionable status.",
        variant: "destructive",
      });
    },
  });

  const handleToggleActionable = (id: string, isActionable: boolean) => {
    toggleActionableMutation.mutate({ id, isActionable });
  };

  // Reorder mutation with optimistic updates to prevent snapback
  const reorderMutation = useMutation({
    mutationFn: async (options: FieldOption[]) => {
      const updates = options.map((option, index) => 
        apiRequest(`/api/field-options/${option.id}`, 'PATCH', { sortOrder: index })
      );
      return await Promise.all(updates);
    },
    onMutate: async (newOptions) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      
      // Snapshot previous value
      const previousOptions = queryClient.getQueryData(['/api/field-options', selectedCategoryId]);
      
      // Optimistically update with new order (with updated sortOrder)
      const optionsWithNewOrder = newOptions.map((opt, index) => ({
        ...opt,
        sortOrder: index,
      }));
      queryClient.setQueryData(['/api/field-options', selectedCategoryId], optionsWithNewOrder);
      
      return { previousOptions };
    },
    onError: (err, newOptions, context) => {
      // Rollback on error
      if (context?.previousOptions) {
        queryClient.setQueryData(['/api/field-options', selectedCategoryId], context.previousOptions);
      }
      toast({
        title: "Error",
        description: "Failed to reorder options.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Background sync to ensure consistency (but don't invalidate immediately)
      // Only refetch after a delay to avoid fighting with optimistic state
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/field-options', selectedCategoryId] });
      }, 500);
    },
  });

  // Supplier Label mutations
  const createLabelMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      return await apiRequest('/api/supplier-labels', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-labels'] });
      toast({
        title: "Label created",
        description: "The supplier label has been created successfully.",
      });
      setIsLabelDialogOpen(false);
      resetLabelForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create supplier label.",
        variant: "destructive",
      });
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierLabel> }) => {
      return await apiRequest(`/api/supplier-labels/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-labels'] });
      toast({
        title: "Label updated",
        description: "The supplier label has been updated successfully.",
      });
      setIsLabelDialogOpen(false);
      setEditingLabel(null);
      resetLabelForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update supplier label.",
        variant: "destructive",
      });
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/supplier-labels/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-labels'] });
      toast({
        title: "Label deleted",
        description: "The supplier label has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete supplier label.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      color: "#3b82f6",
      parentId: null,
    });
  };

  const resetLabelForm = () => {
    setLabelFormData({
      name: "",
      color: "#bba7db",
      description: "",
    });
  };

  const handleEditLabel = (label: SupplierLabel) => {
    setEditingLabel(label);
    setLabelFormData({
      name: label.name,
      color: label.color || "#bba7db",
      description: label.description || "",
    });
    setIsLabelDialogOpen(true);
  };

  const handleDeleteLabel = (id: string) => {
    if (confirm("Are you sure you want to delete this supplier label?")) {
      deleteLabelMutation.mutate(id);
    }
  };

  const handleSubmitLabel = () => {
    if (!labelFormData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Label name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingLabel) {
      updateLabelMutation.mutate({
        id: editingLabel.id,
        data: {
          name: labelFormData.name,
          color: labelFormData.color,
          description: labelFormData.description || null,
        },
      });
    } else {
      createLabelMutation.mutate(labelFormData);
    }
  };

  // Price List Category mutations
  const createPLCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      return await apiRequest('/api/price-list/categories', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-list/categories'] });
      toast({
        title: "Category created",
        description: "The price list category has been created successfully.",
      });
      setIsPLCategoryDialogOpen(false);
      resetPLCategoryForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create price list category.",
        variant: "destructive",
      });
    },
  });

  const updatePLCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PriceListCategory> }) => {
      return await apiRequest(`/api/price-list/categories/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-list/categories'] });
      toast({
        title: "Category updated",
        description: "The price list category has been updated successfully.",
      });
      setIsPLCategoryDialogOpen(false);
      setEditingPLCategory(null);
      resetPLCategoryForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update price list category.",
        variant: "destructive",
      });
    },
  });

  const deletePLCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/price-list/categories/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-list/categories'] });
      toast({
        title: "Category deleted",
        description: "The price list category has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete price list category.",
        variant: "destructive",
      });
    },
  });

  const resetPLCategoryForm = () => {
    setPLCategoryFormData({
      name: "",
      color: "#3b82f6",
      description: "",
    });
  };

  const handleEditPLCategory = (category: PriceListCategory) => {
    setEditingPLCategory(category);
    setPLCategoryFormData({
      name: category.name,
      color: category.color || "#3b82f6",
      description: category.description || "",
    });
    setIsPLCategoryDialogOpen(true);
  };

  const handleDeletePLCategory = (id: string) => {
    if (confirm("Are you sure you want to delete this price list category?")) {
      deletePLCategoryMutation.mutate(id);
    }
  };

  const handleSubmitPLCategory = () => {
    if (!plCategoryFormData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Category name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingPLCategory) {
      updatePLCategoryMutation.mutate({
        id: editingPLCategory.id,
        data: {
          name: plCategoryFormData.name,
          color: plCategoryFormData.color,
          description: plCategoryFormData.description || null,
        },
      });
    } else {
      createPLCategoryMutation.mutate(plCategoryFormData);
    }
  };

  const handleEdit = (option: FieldOption) => {
    setEditingOption(option);
    setFormData({
      name: option.name,
      color: option.color || "#3b82f6",
      parentId: option.parentId,
    });
    setIsCreateDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this field option?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Field option name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingOption) {
      updateMutation.mutate({
        id: editingOption.id,
        data: {
          name: formData.name,
          color: formData.color,
          parentId: supportsHierarchy ? formData.parentId : null,
        },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Clear active drag state
    setActiveId(null);
    
    if (!over || active.id === over.id) return;

    const oldIndex = displayOptions.findIndex(o => o.id === active.id);
    const newIndex = displayOptions.findIndex(o => o.id === over.id);

    const reordered = arrayMove(displayOptions, oldIndex, newIndex);
    reorderMutation.mutate(reordered);
  };

  // Get the active option for the DragOverlay
  const activeOption = activeId ? displayOptions.find(o => o.id === activeId) : null;

  useEffect(() => {
    if (!isCreateDialogOpen) {
      setEditingOption(null);
      resetForm();
    }
  }, [isCreateDialogOpen]);

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Categories */}
      <div className="w-64 border-r bg-card">
        <div className="p-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/settings")}
            className="mb-4 w-full justify-start"
            data-testid="button-back-to-settings"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
          <h1 className="text-2xl font-bold tracking-tight mb-6">Field Settings</h1>
          <nav className="space-y-1">
            {fieldCategories.map((category) => {
              const isActive = selectedCategoryId === category.id && !showSupplierLabels && !showPriceListCategories;
              
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    setSelectedCategoryId(category.id);
                    setShowSupplierLabels(false);
                    setShowPriceListCategories(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover-elevate"
                  }`}
                  data-testid={`category-${category.key}`}
                >
                  <List className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{category.label}</span>
                </button>
              );
            })}
            
            <div className="pt-4 pb-2">
              <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Suppliers & Trades
              </span>
            </div>
            
            <button
              onClick={() => {
                setShowSupplierLabels(true);
                setShowPriceListCategories(false);
                setSelectedCategoryId("");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                showSupplierLabels 
                  ? "bg-[#bba7db] text-white" 
                  : "text-muted-foreground hover-elevate"
              }`}
              data-testid="category-supplier-labels"
            >
              <Tag className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">Supplier Labels</span>
            </button>

            <div className="pt-4 pb-2">
              <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Resources
              </span>
            </div>
            
            <button
              onClick={() => {
                setShowPriceListCategories(true);
                setShowSupplierLabels(false);
                setSelectedCategoryId("");
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                showPriceListCategories 
                  ? "bg-[#bba7db] text-white" 
                  : "text-muted-foreground hover-elevate"
              }`}
              data-testid="category-price-list-categories"
            >
              <Tag className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">Price List Categories</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content - Options for Selected Category */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {showSupplierLabels ? (
              <div className="space-y-6">
                {/* Supplier Labels Header */}
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Supplier Labels</h1>
                  <p className="text-muted-foreground mt-2">
                    Create custom labels to categorize and filter your suppliers and trades
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Labels</CardTitle>
                      <Dialog open={isLabelDialogOpen} onOpenChange={(open) => {
                        if (!open) {
                          setEditingLabel(null);
                          resetLabelForm();
                        }
                        setIsLabelDialogOpen(open);
                      }}>
                        <DialogTrigger asChild>
                          <Button className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white" data-testid="button-add-label">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Label
                          </Button>
                        </DialogTrigger>
                        <DialogContent data-testid="dialog-label-form">
                          <DialogHeader>
                            <DialogTitle>
                              {editingLabel ? "Edit Label" : "Create New Label"}
                            </DialogTitle>
                            <DialogDescription>
                              {editingLabel
                                ? "Update the label details below."
                                : "Add a new label for categorizing suppliers and trades."}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="label-name">Label Name</Label>
                              <Input
                                id="label-name"
                                value={labelFormData.name}
                                onChange={(e) => setLabelFormData({ ...labelFormData, name: e.target.value })}
                                placeholder="e.g., Preferred, Local, Licensed"
                                data-testid="input-label-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="label-color">Color</Label>
                              <Select
                                value={labelFormData.color}
                                onValueChange={(value) => setLabelFormData({ ...labelFormData, color: value })}
                              >
                                <SelectTrigger id="label-color" data-testid="select-label-color">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_COLORS.map((color) => (
                                    <SelectItem key={color.value} value={color.value}>
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-4 h-4 rounded"
                                          style={{ backgroundColor: color.value }}
                                        />
                                        {color.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="label-description">Description (Optional)</Label>
                              <Input
                                id="label-description"
                                value={labelFormData.description}
                                onChange={(e) => setLabelFormData({ ...labelFormData, description: e.target.value })}
                                placeholder="Brief description of this label"
                                data-testid="input-label-description"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setIsLabelDialogOpen(false)}
                              data-testid="button-cancel-label"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSubmitLabel}
                              disabled={createLabelMutation.isPending || updateLabelMutation.isPending}
                              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                              data-testid="button-save-label"
                            >
                              {editingLabel ? "Update" : "Create"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierLabels.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              No labels configured. Click "Add Label" to create one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          supplierLabels.map((label) => (
                            <TableRow key={label.id} data-testid={`row-label-${label.id}`}>
                              <TableCell className="font-medium">{label.name}</TableCell>
                              <TableCell>
                                <Badge style={{ backgroundColor: label.color || "#bba7db", color: "white" }}>
                                  {label.name}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {label.description || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleEditLabel(label)}
                                    data-testid={`button-edit-label-${label.id}`}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDeleteLabel(label.id)}
                                    data-testid={`button-delete-label-${label.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : showPriceListCategories ? (
              <div className="space-y-6">
                {/* Price List Categories Header */}
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Price List Categories</h1>
                  <p className="text-muted-foreground mt-2">
                    Create categories to organize your price list items
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Categories</CardTitle>
                      <Dialog open={isPLCategoryDialogOpen} onOpenChange={(open) => {
                        if (!open) {
                          setEditingPLCategory(null);
                          resetPLCategoryForm();
                        }
                        setIsPLCategoryDialogOpen(open);
                      }}>
                        <DialogTrigger asChild>
                          <Button className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white" data-testid="button-add-pl-category">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Category
                          </Button>
                        </DialogTrigger>
                        <DialogContent data-testid="dialog-pl-category-form">
                          <DialogHeader>
                            <DialogTitle>
                              {editingPLCategory ? "Edit Category" : "Create New Category"}
                            </DialogTitle>
                            <DialogDescription>
                              {editingPLCategory
                                ? "Update the category details below."
                                : "Add a new category for organizing price list items."}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="pl-category-name">Category Name</Label>
                              <Input
                                id="pl-category-name"
                                value={plCategoryFormData.name}
                                onChange={(e) => setPLCategoryFormData({ ...plCategoryFormData, name: e.target.value })}
                                placeholder="e.g., Timber, Hardware, Paint"
                                data-testid="input-pl-category-name"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="pl-category-color">Color</Label>
                              <Select
                                value={plCategoryFormData.color}
                                onValueChange={(value) => setPLCategoryFormData({ ...plCategoryFormData, color: value })}
                              >
                                <SelectTrigger id="pl-category-color" data-testid="select-pl-category-color">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_COLORS.map((color) => (
                                    <SelectItem key={color.value} value={color.value}>
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-4 h-4 rounded"
                                          style={{ backgroundColor: color.value }}
                                        />
                                        {color.label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="pl-category-description">Description (Optional)</Label>
                              <Input
                                id="pl-category-description"
                                value={plCategoryFormData.description}
                                onChange={(e) => setPLCategoryFormData({ ...plCategoryFormData, description: e.target.value })}
                                placeholder="Brief description of this category"
                                data-testid="input-pl-category-description"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setIsPLCategoryDialogOpen(false)}
                              data-testid="button-cancel-pl-category"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSubmitPLCategory}
                              disabled={createPLCategoryMutation.isPending || updatePLCategoryMutation.isPending}
                              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                              data-testid="button-save-pl-category"
                            >
                              {editingPLCategory ? "Update" : "Create"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceListCategories.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              No categories configured. Click "Add Category" to create one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          priceListCategories.map((category) => (
                            <TableRow key={category.id} data-testid={`row-pl-category-${category.id}`}>
                              <TableCell className="font-medium">{category.name}</TableCell>
                              <TableCell>
                                <Badge style={{ backgroundColor: category.color || "#3b82f6", color: "white" }}>
                                  {category.name}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {category.description || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleEditPLCategory(category)}
                                    data-testid={`button-edit-pl-category-${category.id}`}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDeletePLCategory(category.id)}
                                    data-testid={`button-delete-pl-category-${category.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : selectedCategory ? (
              <div className="space-y-6">
                {/* Page Header */}
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">{selectedCategory.label}</h1>
                  <p className="text-muted-foreground mt-2">
                    {selectedCategory.description || "Manage field options for this category"}
                  </p>
                </div>

                <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Options</CardTitle>
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-add-option">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Option
                        </Button>
                      </DialogTrigger>
                      <DialogContent data-testid="dialog-option-form">
                        <DialogHeader>
                          <DialogTitle>
                            {editingOption ? "Edit Option" : "Create New Option"}
                          </DialogTitle>
                          <DialogDescription>
                            {editingOption
                              ? "Update the option details below."
                              : `Add a new option to ${selectedCategory.label}.`}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="option-name">Option Name</Label>
                            <Input
                              id="option-name"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              placeholder="e.g., In Progress"
                              data-testid="input-option-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="option-color">Color</Label>
                            <Select
                              value={formData.color}
                              onValueChange={(value) => setFormData({ ...formData, color: value })}
                            >
                              <SelectTrigger id="option-color" data-testid="select-option-color">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_COLORS.map((color) => (
                                  <SelectItem key={color.value} value={color.value}>
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-4 h-4 rounded"
                                        style={{ backgroundColor: color.value }}
                                      />
                                      {color.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {supportsHierarchy && (
                            <div className="space-y-2">
                              <Label htmlFor="parent-option">Parent (Optional)</Label>
                              <Select
                                value={formData.parentId || "none"}
                                onValueChange={(value) =>
                                  setFormData({ ...formData, parentId: value === "none" ? null : value })
                                }
                              >
                                <SelectTrigger id="parent-option" data-testid="select-parent-option">
                                  <SelectValue placeholder="None (Parent Option)" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None (Parent Option)</SelectItem>
                                  {parentOptions.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsCreateDialogOpen(false)}
                            data-testid="button-cancel"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || updateMutation.isPending}
                            data-testid="button-save-option"
                          >
                            {editingOption ? "Update" : "Create"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead className="text-center w-16">Default</TableHead>
                          {showDoneColumn && <TableHead className="text-center w-16">Done</TableHead>}
                          {showActionableColumn && <TableHead className="text-center w-20">Actionable</TableHead>}
                          {supportsHierarchy && <TableHead>Type</TableHead>}
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayOptions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5 + (supportsHierarchy ? 1 : 0) + (showDoneColumn ? 1 : 0) + (showActionableColumn ? 1 : 0)} className="text-center text-muted-foreground py-8">
                              No options configured. Click "Add Option" to create one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <SortableContext
                            items={displayOptions.map(o => o.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {displayOptions.map((option) => (
                              <SortableRow
                                key={option.id}
                                option={option}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onToggleDefault={handleToggleDefault}
                                onToggleCompleted={handleToggleCompleted}
                                onToggleActionable={handleToggleActionable}
                                parentOptions={parentOptions}
                                supportsHierarchy={supportsHierarchy}
                                showDoneColumn={showDoneColumn}
                                showActionableColumn={showActionableColumn}
                              />
                            ))}
                          </SortableContext>
                        )}
                      </TableBody>
                    </Table>
                    
                    {/* Drag overlay for better visual feedback */}
                    <DragOverlay>
                      {activeOption ? (
                        <div className="bg-card border rounded-md shadow-lg p-3 flex items-center gap-3">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{activeOption.name}</span>
                          {activeOption.color && (
                            <Badge style={{ backgroundColor: activeOption.color }}>
                              {activeOption.name}
                            </Badge>
                          )}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </CardContent>
              </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">Select a category to manage its options</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
