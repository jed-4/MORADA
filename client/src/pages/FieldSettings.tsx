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
import { Plus, Edit2, Trash2, Settings, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FieldOption, FieldCategory } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  status: FieldOption;
  onEdit: (status: FieldOption) => void;
  onDelete: (id: string) => void;
  parentStatuses: FieldOption[];
}

function SortableRow({ status, onEdit, onDelete, parentStatuses }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const parentStatus = parentStatuses.find(p => p.id === status.parentId);

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`row-status-${status.id}`}>
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>
        <div className={status.parentId ? "pl-8" : ""}>
          {status.name}
        </div>
      </TableCell>
      <TableCell>
        <Badge style={{ backgroundColor: status.color || "#6b7280" }}>
          {status.name}
        </Badge>
      </TableCell>
      <TableCell>
        {parentStatus ? (
          <Badge variant="outline">{parentStatus.name}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Parent Status</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(status)}
            data-testid={`button-edit-${status.id}`}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(status.id)}
            data-testid={`button-delete-${status.id}`}
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<FieldOption | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#3b82f6",
    parentId: null as string | null,
  });

  // Fetch field categories to get project status category
  const { data: fieldCategories = [] } = useQuery<FieldCategory[]>({
    queryKey: ['/api/field-categories'],
  });

  const statusCategory = useMemo(
    () => fieldCategories.find((c) => c.key === 'project.status'),
    [fieldCategories]
  );

  // Fetch field options for project status
  const { data: allStatuses = [] } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', statusCategory?.id],
    enabled: !!statusCategory?.id,
    queryFn: async () => {
      if (!statusCategory?.id) return [];
      return await apiRequest(`/api/field-categories/${statusCategory.id}/options`, 'GET') as FieldOption[];
    },
  });

  // Separate parent and sub statuses
  const parentStatuses = useMemo(
    () => allStatuses.filter(s => !s.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allStatuses]
  );

  const subStatuses = useMemo(
    () => allStatuses.filter(s => s.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allStatuses]
  );

  // Combined list for display (parents with their children)
  const displayStatuses = useMemo(() => {
    const result: FieldOption[] = [];
    parentStatuses.forEach(parent => {
      result.push(parent);
      const children = subStatuses.filter(s => s.parentId === parent.id);
      result.push(...children);
    });
    // Add orphaned sub-statuses at the end
    const orphaned = subStatuses.filter(s => !parentStatuses.find(p => p.id === s.parentId));
    result.push(...orphaned);
    return result;
  }, [parentStatuses, subStatuses]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; parentId: string | null }) => {
      if (!statusCategory?.id) throw new Error("Status category not found");
      
      const maxSortOrder = Math.max(...allStatuses.map(s => s.sortOrder), -1);
      
      return await apiRequest('/api/field-options', 'POST', {
        categoryId: statusCategory.id,
        key: data.name.toLowerCase().replace(/\s+/g, '_'),
        name: data.name,
        color: data.color,
        parentId: data.parentId,
        sortOrder: maxSortOrder + 1,
        isActive: true,
        isDefault: false,
        isCompleted: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', statusCategory?.id] });
      toast({
        title: "Status created",
        description: "The status has been created successfully.",
      });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create status.",
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
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', statusCategory?.id] });
      toast({
        title: "Status updated",
        description: "The status has been updated successfully.",
      });
      setEditingStatus(null);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update status.",
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
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', statusCategory?.id] });
      toast({
        title: "Status deleted",
        description: "The status has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete status.",
        variant: "destructive",
      });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (statuses: FieldOption[]) => {
      // Update sort orders for all statuses
      const updates = statuses.map((status, index) => 
        apiRequest(`/api/field-options/${status.id}`, 'PATCH', { sortOrder: index })
      );
      return await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field-options', statusCategory?.id] });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      color: "#3b82f6",
      parentId: null,
    });
  };

  const handleEdit = (status: FieldOption) => {
    setEditingStatus(status);
    setFormData({
      name: status.name,
      color: status.color || "#3b82f6",
      parentId: status.parentId,
    });
    setIsCreateDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this status?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Status name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingStatus) {
      updateMutation.mutate({
        id: editingStatus.id,
        data: {
          name: formData.name,
          color: formData.color,
          parentId: formData.parentId,
        },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = displayStatuses.findIndex(s => s.id === active.id);
    const newIndex = displayStatuses.findIndex(s => s.id === over.id);

    const reordered = arrayMove(displayStatuses, oldIndex, newIndex);
    reorderMutation.mutate(reordered);
  };

  useEffect(() => {
    if (!isCreateDialogOpen) {
      setEditingStatus(null);
      resetForm();
    }
  }, [isCreateDialogOpen]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Field Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage project status fields and their hierarchies
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Project Statuses
              </CardTitle>
              <CardDescription>
                Configure parent statuses and sub-statuses for project tracking
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-status">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Status
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-status-form">
                <DialogHeader>
                  <DialogTitle>
                    {editingStatus ? "Edit Status" : "Create New Status"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingStatus
                      ? "Update the status details below."
                      : "Add a new parent status or sub-status to the project status hierarchy."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="status-name">Status Name</Label>
                    <Input
                      id="status-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., In Progress"
                      data-testid="input-status-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status-color">Color</Label>
                    <Select
                      value={formData.color}
                      onValueChange={(value) => setFormData({ ...formData, color: value })}
                    >
                      <SelectTrigger id="status-color" data-testid="select-status-color">
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
                    <Label htmlFor="parent-status">Parent Status (Optional)</Label>
                    <Select
                      value={formData.parentId || "none"}
                      onValueChange={(value) =>
                        setFormData({ ...formData, parentId: value === "none" ? null : value })
                      }
                    >
                      <SelectTrigger id="parent-status" data-testid="select-parent-status">
                        <SelectValue placeholder="None (Parent Status)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Parent Status)</SelectItem>
                        {parentStatuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            {status.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    data-testid="button-save-status"
                  >
                    {editingStatus ? "Update" : "Create"}
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
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayStatuses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No statuses configured. Click "Add Status" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  <SortableContext
                    items={displayStatuses.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {displayStatuses.map((status) => (
                      <SortableRow
                        key={status.id}
                        status={status}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        parentStatuses={parentStatuses}
                      />
                    ))}
                  </SortableContext>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}
