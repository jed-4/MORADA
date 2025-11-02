import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit2, Trash2, GripVertical, Tag, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TaskTag, TaskTemplateStatus } from "@shared/schema";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TAG_COLORS = [
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

interface SortableTagRowProps {
  tag: TaskTag;
  onEdit: (tag: TaskTag) => void;
  onDelete: (id: string) => void;
}

function SortableTagRow({ tag, onEdit, onDelete }: SortableTagRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`row-tag-${tag.id}`}>
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>{tag.name}</TableCell>
      <TableCell>
        <Badge style={{ backgroundColor: tag.color }} className="text-white">
          {tag.name}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(tag)}
            data-testid={`button-edit-tag-${tag.id}`}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(tag.id)}
            data-testid={`button-delete-tag-${tag.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface SortableStatusRowProps {
  status: TaskTemplateStatus;
  onEdit: (status: TaskTemplateStatus) => void;
  onDelete: (id: string) => void;
}

function SortableStatusRow({ status, onEdit, onDelete }: SortableStatusRowProps) {
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

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`row-status-${status.id}`}>
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>{status.name}</TableCell>
      <TableCell>
        <Badge style={{ backgroundColor: status.color }} className="text-white">
          {status.name}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(status)}
            data-testid={`button-edit-status-${status.id}`}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(status.id)}
            data-testid={`button-delete-status-${status.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function TaskSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("tags");
  
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TaskTag | null>(null);
  const [tagFormData, setTagFormData] = useState({ name: "", color: "#3b82f6" });

  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TaskTemplateStatus | null>(null);
  const [statusFormData, setStatusFormData] = useState({ name: "", color: "#3b82f6" });

  const { data: taskTags = [] } = useQuery<TaskTag[]>({ queryKey: ['/api/task-tags'] });
  const { data: taskTemplateStatuses = [] } = useQuery<TaskTemplateStatus[]>({ queryKey: ['/api/task-template-statuses'] });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => await apiRequest('/api/task-tags', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-tags'] });
      toast({ title: "Tag created", description: "The task tag has been created successfully." });
      setIsTagDialogOpen(false);
      setTagFormData({ name: "", color: "#3b82f6" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create task tag.", variant: "destructive" }),
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskTag> }) => await apiRequest(`/api/task-tags/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-tags'] });
      toast({ title: "Tag updated", description: "The task tag has been updated successfully." });
      setEditingTag(null);
      setIsTagDialogOpen(false);
      setTagFormData({ name: "", color: "#3b82f6" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update task tag.", variant: "destructive" }),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest(`/api/task-tags/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-tags'] });
      toast({ title: "Tag deleted", description: "The task tag has been deleted successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete task tag.", variant: "destructive" }),
  });

  const reorderTagsMutation = useMutation({
    mutationFn: async (tags: TaskTag[]) => {
      const updates = tags.map((tag, index) => ({ id: tag.id, displayOrder: index }));
      return await apiRequest('/api/task-tags/reorder', 'POST', { updates });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/task-tags'] }),
  });

  const createStatusMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => await apiRequest('/api/task-template-statuses', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-template-statuses'] });
      toast({ title: "Status created", description: "The task template status has been created successfully." });
      setIsStatusDialogOpen(false);
      setStatusFormData({ name: "", color: "#3b82f6" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create task template status.", variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskTemplateStatus> }) => await apiRequest(`/api/task-template-statuses/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-template-statuses'] });
      toast({ title: "Status updated", description: "The task template status has been updated successfully." });
      setEditingStatus(null);
      setIsStatusDialogOpen(false);
      setStatusFormData({ name: "", color: "#3b82f6" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update task template status.", variant: "destructive" }),
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest(`/api/task-template-statuses/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/task-template-statuses'] });
      toast({ title: "Status deleted", description: "The task template status has been deleted successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete task template status.", variant: "destructive" }),
  });

  const reorderStatusesMutation = useMutation({
    mutationFn: async (statuses: TaskTemplateStatus[]) => {
      const updates = statuses.map((status, index) => ({ id: status.id, displayOrder: index }));
      return await apiRequest('/api/task-template-statuses/reorder', 'POST', { updates });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/task-template-statuses'] }),
  });

  const handleEditTag = (tag: TaskTag) => {
    setEditingTag(tag);
    setTagFormData({ name: tag.name, color: tag.color });
    setIsTagDialogOpen(true);
  };

  const handleDeleteTag = (id: string) => {
    if (confirm("Are you sure you want to delete this task tag?")) {
      deleteTagMutation.mutate(id);
    }
  };

  const handleSubmitTag = () => {
    if (!tagFormData.name.trim()) {
      toast({ title: "Validation error", description: "Tag name is required.", variant: "destructive" });
      return;
    }
    if (editingTag) {
      updateTagMutation.mutate({ id: editingTag.id, data: tagFormData });
    } else {
      createTagMutation.mutate(tagFormData);
    }
  };

  const handleEditStatus = (status: TaskTemplateStatus) => {
    setEditingStatus(status);
    setStatusFormData({ name: status.name, color: status.color });
    setIsStatusDialogOpen(true);
  };

  const handleDeleteStatus = (id: string) => {
    if (confirm("Are you sure you want to delete this task template status?")) {
      deleteStatusMutation.mutate(id);
    }
  };

  const handleSubmitStatus = () => {
    if (!statusFormData.name.trim()) {
      toast({ title: "Validation error", description: "Status name is required.", variant: "destructive" });
      return;
    }
    if (editingStatus) {
      updateStatusMutation.mutate({ id: editingStatus.id, data: statusFormData });
    } else {
      createStatusMutation.mutate(statusFormData);
    }
  };

  const handleTagDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = taskTags.findIndex(t => t.id === active.id);
    const newIndex = taskTags.findIndex(t => t.id === over.id);
    const reordered = arrayMove(taskTags, oldIndex, newIndex);
    reorderTagsMutation.mutate(reordered);
  };

  const handleStatusDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = taskTemplateStatuses.findIndex(s => s.id === active.id);
    const newIndex = taskTemplateStatuses.findIndex(s => s.id === over.id);
    const reordered = arrayMove(taskTemplateStatuses, oldIndex, newIndex);
    reorderStatusesMutation.mutate(reordered);
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Task Management</h1>
                <p className="text-muted-foreground mt-2">
                  Manage task tags and template statuses for your organization
                </p>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="tags" data-testid="tab-task-tags">
                    <Tag className="h-4 w-4 mr-2" />
                    Task Tags
                  </TabsTrigger>
                  <TabsTrigger value="statuses" data-testid="tab-template-statuses">
                    <ListChecks className="h-4 w-4 mr-2" />
                    Template Statuses
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tags">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Task Tags</CardTitle>
                          <CardDescription className="mt-2">
                            Create colored tags to categorize and filter tasks in your calendar
                          </CardDescription>
                        </div>
                        <Button onClick={() => setIsTagDialogOpen(true)} data-testid="button-add-tag">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Tag
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTagDragEnd}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Preview</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {taskTags.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                  No task tags yet. Create your first tag to get started.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <SortableContext items={taskTags.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                {taskTags.map((tag) => (
                                  <SortableTagRow key={tag.id} tag={tag} onEdit={handleEditTag} onDelete={handleDeleteTag} />
                                ))}
                              </SortableContext>
                            )}
                          </TableBody>
                        </Table>
                      </DndContext>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="statuses">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Task Template Statuses</CardTitle>
                          <CardDescription className="mt-2">
                            Define custom statuses for task templates (e.g., Active, Draft, Archived)
                          </CardDescription>
                        </div>
                        <Button onClick={() => setIsStatusDialogOpen(true)} data-testid="button-add-status">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Status
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStatusDragEnd}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Preview</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {taskTemplateStatuses.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                  No template statuses yet. Create your first status to get started.
                                </TableCell>
                              </TableRow>
                            ) : (
                              <SortableContext items={taskTemplateStatuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                {taskTemplateStatuses.map((status) => (
                                  <SortableStatusRow key={status.id} status={status} onEdit={handleEditStatus} onDelete={handleDeleteStatus} />
                                ))}
                              </SortableContext>
                            )}
                          </TableBody>
                        </Table>
                      </DndContext>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isTagDialogOpen} onOpenChange={(open) => {
        setIsTagDialogOpen(open);
        if (!open) {
          setEditingTag(null);
          setTagFormData({ name: "", color: "#3b82f6" });
        }
      }}>
        <DialogContent data-testid="dialog-tag-form">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Task Tag" : "Create Task Tag"}</DialogTitle>
            <DialogDescription>{editingTag ? "Update the tag details below." : "Add a new tag to categorize tasks."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag Name</Label>
              <Input
                id="tag-name"
                value={tagFormData.name}
                onChange={(e) => setTagFormData({ ...tagFormData, name: e.target.value })}
                placeholder="e.g., System, Project Management"
                data-testid="input-tag-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-color">Color</Label>
              <Select value={tagFormData.color} onValueChange={(value) => setTagFormData({ ...tagFormData, color: value })}>
                <SelectTrigger id="tag-color" data-testid="select-tag-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: color.value }} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTagDialogOpen(false)} data-testid="button-cancel-tag">Cancel</Button>
            <Button onClick={handleSubmitTag} disabled={createTagMutation.isPending || updateTagMutation.isPending} data-testid="button-save-tag">
              {editingTag ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusDialogOpen} onOpenChange={(open) => {
        setIsStatusDialogOpen(open);
        if (!open) {
          setEditingStatus(null);
          setStatusFormData({ name: "", color: "#3b82f6" });
        }
      }}>
        <DialogContent data-testid="dialog-status-form">
          <DialogHeader>
            <DialogTitle>{editingStatus ? "Edit Template Status" : "Create Template Status"}</DialogTitle>
            <DialogDescription>{editingStatus ? "Update the status details below." : "Add a new status for task templates."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status-name">Status Name</Label>
              <Input
                id="status-name"
                value={statusFormData.name}
                onChange={(e) => setStatusFormData({ ...statusFormData, name: e.target.value })}
                placeholder="e.g., Active, Draft, Archived"
                data-testid="input-status-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-color">Color</Label>
              <Select value={statusFormData.color} onValueChange={(value) => setStatusFormData({ ...statusFormData, color: value })}>
                <SelectTrigger id="status-color" data-testid="select-status-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAG_COLORS.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: color.value }} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)} data-testid="button-cancel-status">Cancel</Button>
            <Button onClick={handleSubmitStatus} disabled={createStatusMutation.isPending || updateStatusMutation.isPending} data-testid="button-save-status">
              {editingStatus ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
