import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, Settings as SettingsIcon, GripVertical, List, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FieldOption, FieldCategory } from "@shared/schema";
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
  parentOptions: FieldOption[];
  supportsHierarchy: boolean;
}

function SortableRow({ option, onEdit, onDelete, parentOptions, supportsHierarchy }: SortableRowProps) {
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<FieldOption | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#3b82f6",
    parentId: null as string | null,
  });

  // Fetch field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategory[]>({
    queryKey: ['/api/field-categories'],
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

  const resetForm = () => {
    setFormData({
      name: "",
      color: "#3b82f6",
      parentId: null,
    });
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
              const isActive = selectedCategoryId === category.id;
              
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
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
          </nav>
        </div>
      </div>

      {/* Main Content - Options for Selected Category */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {selectedCategory ? (
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
                          {supportsHierarchy && <TableHead>Type</TableHead>}
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayOptions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={supportsHierarchy ? 5 : 4} className="text-center text-muted-foreground py-8">
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
                                parentOptions={parentOptions}
                                supportsHierarchy={supportsHierarchy}
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
