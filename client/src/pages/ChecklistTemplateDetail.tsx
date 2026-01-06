import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  type ChecklistTemplate,
  type ChecklistTemplateGroup,
  type ChecklistTemplateItem,
} from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  ChevronLeft,
  Plus,
  Trash2,
  GripVertical,
  CheckSquare,
  FileText,
  Type,
  CircleDot,
  ListChecks,
  X,
  MoreVertical,
  Edit3,
  FolderInput,
} from "lucide-react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChecklistTemplateFormDialog } from "@/components/checklist/ChecklistTemplateFormDialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export default function ChecklistTemplateDetail() {
  const [, params] = useRoute("/checklist-templates/:id");
  const [, setLocation] = useLocation();
  const templateId = params?.id;
  const { toast } = useToast();
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChecklistTemplateGroup | null>(null);
  const [addingItemToGroup, setAddingItemToGroup] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistTemplateItem | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [movingGroup, setMovingGroup] = useState<ChecklistTemplateGroup | null>(null);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch template
  const { data: template, isLoading: templateLoading } = useQuery<ChecklistTemplate>({
    queryKey: ["/api/checklist-templates", templateId],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!templateId,
  });

  // Fetch groups
  const { data: groups = [] } = useQuery<ChecklistTemplateGroup[]>({
    queryKey: ["/api/checklist-templates", templateId, "groups"],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-templates/${templateId}/groups`);
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: !!templateId,
  });

  // Fetch items for all groups
  const { data: allItems = [] } = useQuery<ChecklistTemplateItem[]>({
    queryKey: ["/api/checklist-template-items", templateId],
    queryFn: async () => {
      if (groups.length === 0) return [];
      const itemPromises = groups.map(async (group) => {
        const res = await fetch(`/api/checklist-template-groups/${group.id}/items`);
        if (!res.ok) throw new Error("Failed to fetch items");
        return res.json();
      });
      const results = await Promise.all(itemPromises);
      return results.flat();
    },
    enabled: groups.length > 0,
  });

  // Auto-select first group when groups load or when selected group is deleted
  useEffect(() => {
    if (groups.length > 0) {
      // If no group is selected or the selected group no longer exists, select the first one
      const selectedExists = groups.some(g => g.id === selectedGroupId);
      if (!selectedGroupId || !selectedExists) {
        setSelectedGroupId(groups[0].id);
      }
    } else {
      // No groups available, clear selection
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

  // Delete group mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await apiRequest(`/api/checklist-template-groups/${groupId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: "Checklist deleted",
        description: "The checklist has been deleted successfully.",
      });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest(`/api/checklist-template-items/${itemId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: "Item deleted",
        description: "The item has been deleted successfully.",
      });
    },
  });

  // Reorder groups mutation
  const reorderGroupsMutation = useMutation({
    mutationFn: async (orderedGroupIds: string[]) => {
      return await apiRequest(`/api/checklist-templates/${templateId}/groups/reorder`, 'POST', {
        orderedGroupIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
    },
  });

  // Sensors for drag and drop
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

  // Handle drag end for groups
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((g) => g.id === active.id);
      const newIndex = groups.findIndex((g) => g.id === over.id);

      const newOrder = arrayMove(groups, oldIndex, newIndex);
      const orderedIds = newOrder.map((g) => g.id);

      // Optimistic update
      queryClient.setQueryData(
        ["/api/checklist-templates", templateId, "groups"],
        newOrder
      );

      reorderGroupsMutation.mutate(orderedIds);
    }
  };

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/checklist-templates/${templateId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist group deleted",
        description: "The checklist group and all its contents have been deleted.",
      });
      setLocation("/checklist-templates");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete checklist group.",
        variant: "destructive",
      });
    },
  });

  if (templateLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-muted-foreground">Template not found</div>
        <Button onClick={() => setLocation("/checklist-templates")} variant="outline">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/checklist-templates")}
              data-testid="button-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{template.name}</h1>
                <Badge variant="secondary" data-testid="badge-template-type">{template.type}</Badge>
              </div>
              {template.description && (
                <p className="text-muted-foreground mt-1">{template.description}</p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-template-menu">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setIsEditingTemplate(true)}
                  data-testid="button-edit-template"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="text-destructive"
                  data-testid="button-delete-template"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Card className="border-dashed max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No checklists yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add checklists to organize your items
                </p>
                <Button onClick={() => setIsAddingGroup(true)} data-testid="button-create-first-group">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Checklist
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Checklists Column */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <Card className="flex flex-col h-full mr-3">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Checklists</CardTitle>
                    <Button 
                      onClick={() => setIsAddingGroup(true)} 
                      size="sm"
                      data-testid="button-add-group"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={groups.map((g) => g.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1">
                        {groups.map((group) => (
                          <SortableGroupItem
                            key={group.id}
                            group={group}
                            isSelected={selectedGroupId === group.id}
                            onSelect={() => setSelectedGroupId(group.id)}
                            onEdit={() => setEditingGroup(group)}
                            onMove={() => setMovingGroup(group)}
                            onDelete={() => deleteGroupMutation.mutate(group.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </CardContent>
              </Card>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Items Column */}
            <ResizablePanel defaultSize={65} minSize={50}>
              {selectedGroupId && (
                <Card className="flex flex-col h-full ml-3">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Items</CardTitle>
                      <Button 
                        onClick={() => setAddingItemToGroup(selectedGroupId)} 
                        size="sm"
                        data-testid="button-add-item"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {allItems.filter(item => item.groupId === selectedGroupId).length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <CheckSquare className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground mb-3">
                          No items in this checklist
                        </p>
                        <Button 
                          onClick={() => setAddingItemToGroup(selectedGroupId)} 
                          size="sm"
                          data-testid="button-add-first-item"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Item
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {allItems
                          .filter(item => item.groupId === selectedGroupId)
                          .map((item) => {
                            const responseType = (item.responseType as string) || "checkbox";
                            const responseOptions = (item.responseOptions as string[]) || [];
                            const ResponseIcon = responseType === "checkbox" ? CheckSquare 
                              : responseType === "text" ? Type 
                              : responseType === "single_choice" ? CircleDot 
                              : ListChecks;
                            
                            return (
                              <div
                                key={item.id}
                                className="py-2 px-2 rounded border hover-elevate"
                                data-testid={`item-${item.id}`}
                              >
                                <div className="flex items-center gap-2">
                                  <ResponseIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="flex-1 text-sm">{item.description}</span>
                                  {responseType !== "checkbox" && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                      {responseType === "text" ? "Text" : responseType === "single_choice" ? "Single" : "Multiple"}
                                    </Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => setEditingItem(item)}
                                    data-testid={`button-edit-item-${item.id}`}
                                  >
                                    <FileText className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => deleteItemMutation.mutate(item.id)}
                                    data-testid={`button-delete-item-${item.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                {item.tooltip && (
                                  <div className="ml-6 mt-1 text-xs text-muted-foreground">
                                    {item.tooltip}
                                  </div>
                                )}
                                {responseOptions.length > 0 && (
                                  <div className="ml-6 mt-1 flex flex-wrap gap-1">
                                    {responseOptions.map((opt, i) => (
                                      <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {opt}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {/* Add/Edit Group Dialog */}
      <GroupFormDialog
        open={isAddingGroup || !!editingGroup}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingGroup(false);
            setEditingGroup(null);
          }
        }}
        group={editingGroup}
        templateId={templateId!}
      />

      {/* Add/Edit Item Dialog */}
      <ItemFormDialog
        open={!!addingItemToGroup || !!editingItem}
        onOpenChange={(open) => {
          if (!open) {
            setAddingItemToGroup(null);
            setEditingItem(null);
          }
        }}
        item={editingItem}
        groupId={addingItemToGroup || editingItem?.groupId || ""}
        templateId={templateId!}
      />

      {/* Move to Group Dialog */}
      <MoveToGroupDialog
        open={!!movingGroup}
        onOpenChange={(open) => {
          if (!open) setMovingGroup(null);
        }}
        sourceGroup={movingGroup}
        currentTemplateId={templateId!}
      />

      {/* Edit Template Dialog */}
      <ChecklistTemplateFormDialog
        open={isEditingTemplate}
        onOpenChange={setIsEditingTemplate}
        template={template}
        onTemplateUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId] });
        }}
      />

      {/* Delete Template Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{template.name}"? This will permanently remove this checklist group along with all its checklists and items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Sortable Group Item Component
function SortableGroupItem({
  group,
  isSelected,
  onSelect,
  onEdit,
  onMove,
  onDelete,
}: {
  group: ChecklistTemplateGroup;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 py-2 px-2 rounded border cursor-pointer hover-elevate group/item ${
        isSelected 
          ? 'bg-accent border-accent' 
          : 'bg-card border-border'
      }`}
      onClick={onSelect}
      data-testid={`group-item-${group.id}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div 
          {...attributes} 
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <span className="font-medium truncate text-sm">{group.name}</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 group-hover/item:opacity-100"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-menu-group-${group.id}`}
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            data-testid={`button-edit-group-${group.id}`}
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
            data-testid={`button-move-group-${group.id}`}
          >
            <FolderInput className="h-4 w-4 mr-2" />
            Move to Checklist Group
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive"
            data-testid={`button-delete-group-${group.id}`}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Checklist Form Dialog (formerly Group)
const groupSchema = z.object({
  name: z.string().min(1, "Checklist name is required"),
});

function GroupFormDialog({
  open,
  onOpenChange,
  group,
  templateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: ChecklistTemplateGroup | null;
  templateId: string;
}) {
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: group?.name || "",
    },
  });

  useEffect(() => {
    if (group) {
      form.reset({ name: group.name });
    } else {
      form.reset({ name: "" });
    }
  }, [group, form]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await apiRequest("/api/checklist-template-groups", 'POST', {
        templateId,
        name: data.name,
        order: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
      toast({
        title: "Checklist created",
        description: "The checklist has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await apiRequest(`/api/checklist-template-groups/${group!.id}`, 'PATCH', {
        name: data.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
      toast({
        title: "Checklist updated",
        description: "The checklist has been updated successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
  });

  const onSubmit = (data: { name: string }) => {
    if (group) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Edit" : "Add"} Checklist</DialogTitle>
          <DialogDescription>
            {group ? "Update" : "Create"} a checklist to organize items
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checklist Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., ITP001 - Site Preparation" 
                      {...field} 
                      data-testid="input-group-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-testid="button-save-group"
              >
                {isPending ? "Saving..." : group ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Item Form Dialog
const itemSchema = z.object({
  description: z.string().min(1, "Item description is required"),
  tooltip: z.string().optional(),
  responseType: z.enum(["checkbox", "text", "single_choice", "multiple_choice"]).default("checkbox"),
  responseOptions: z.array(z.string()).optional().default([]),
});

type ItemFormData = z.infer<typeof itemSchema>;

function ItemFormDialog({
  open,
  onOpenChange,
  item,
  groupId,
  templateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ChecklistTemplateItem | null;
  groupId: string;
  templateId: string;
}) {
  const { toast } = useToast();
  const [newOption, setNewOption] = useState("");

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: item?.description || "",
      tooltip: item?.tooltip || "",
      responseType: (item?.responseType as ItemFormData["responseType"]) || "checkbox",
      responseOptions: (item?.responseOptions as string[]) || [],
    },
  });

  const responseType = form.watch("responseType");
  const responseOptions = form.watch("responseOptions") || [];

  // Reset form when item changes
  useEffect(() => {
    if (open) {
      form.reset({
        description: item?.description || "",
        tooltip: item?.tooltip || "",
        responseType: (item?.responseType as ItemFormData["responseType"]) || "checkbox",
        responseOptions: (item?.responseOptions as string[]) || [],
      });
      setNewOption("");
    }
  }, [item, open, form]);

  const addOption = () => {
    if (newOption.trim()) {
      const current = form.getValues("responseOptions") || [];
      form.setValue("responseOptions", [...current, newOption.trim()]);
      setNewOption("");
    }
  };

  const removeOption = (index: number) => {
    const current = form.getValues("responseOptions") || [];
    form.setValue("responseOptions", current.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async (data: ItemFormData) => {
      const url = item ? `/api/checklist-template-items/${item.id}` : "/api/checklist-template-items";
      const method = item ? 'PATCH' : 'POST';
      const body = item ? {
        description: data.description,
        tooltip: data.tooltip || null,
        responseType: data.responseType,
        responseOptions: data.responseOptions || [],
      } : {
        groupId,
        description: data.description,
        tooltip: data.tooltip || null,
        responseType: data.responseType,
        responseOptions: data.responseOptions || [],
        order: 0,
      };
      return await apiRequest(url, method, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: item ? "Item updated" : "Item created",
        description: `The item has been ${item ? "updated" : "created"} successfully.`,
      });
      onOpenChange(false);
      form.reset();
    },
  });

  const onSubmit = (data: ItemFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit" : "Add"} Item</DialogTitle>
          <DialogDescription>
            {item ? "Update" : "Create"} a checklist item
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checklist Item</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Check soil conditions" 
                      {...field} 
                      data-testid="input-item-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tooltip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add extra details or notes..."
                      className="resize-none"
                      rows={2}
                      {...field} 
                      data-testid="input-item-tooltip"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Response Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-response-type">
                        <SelectValue placeholder="Select response type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="checkbox">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4" />
                          <span>Checkbox (Yes/No)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="text">
                        <div className="flex items-center gap-2">
                          <Type className="h-4 w-4" />
                          <span>Text Response</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="single_choice">
                        <div className="flex items-center gap-2">
                          <CircleDot className="h-4 w-4" />
                          <span>Single Choice</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="multiple_choice">
                        <div className="flex items-center gap-2">
                          <ListChecks className="h-4 w-4" />
                          <span>Multiple Choice</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(responseType === "single_choice" || responseType === "multiple_choice") && (
              <div className="space-y-2">
                <FormLabel>Answer Options</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Pass, Fail, N/A"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    data-testid="input-new-option"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon"
                    onClick={addOption}
                    data-testid="button-add-option"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {responseOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {responseOptions.map((option, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary"
                        className="pl-2 pr-1 py-1 flex items-center gap-1"
                      >
                        {option}
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="ml-1 hover:bg-muted rounded-full p-0.5"
                          data-testid={`button-remove-option-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {(responseType === "single_choice" || responseType === "multiple_choice") && responseOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add at least 2 options for {responseType === "single_choice" ? "single" : "multiple"} choice
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-save-item"
              >
                {createMutation.isPending ? "Saving..." : item ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MoveToGroupDialog({
  open,
  onOpenChange,
  sourceGroup,
  currentTemplateId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceGroup: ChecklistTemplateGroup | null;
  currentTemplateId: string;
}) {
  const { toast } = useToast();
  const [targetTemplateId, setTargetTemplateId] = useState<string>("");

  // Fetch all checklist groups (templates), excluding current one
  const { data: templates = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
    enabled: open,
    staleTime: 30000,
  });

  // Filter out the current template - we only want to show OTHER checklist groups
  const availableTemplates = templates.filter((t) => t.id !== currentTemplateId);

  const selectedTemplate = availableTemplates.find((t) => t.id === targetTemplateId);

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!sourceGroup || !targetTemplateId) return;
      // Move the checklist (group) to a different checklist group (template)
      return await apiRequest(`/api/checklist-template-groups/${sourceGroup.id}/move-to-template`, 'POST', {
        targetTemplateId,
      });
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", currentTemplateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", currentTemplateId] });
      if (selectedTemplate) {
        queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", selectedTemplate.id, "groups"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", selectedTemplate.id] });
      }
      toast({
        title: "Checklist moved",
        description: `"${sourceGroup?.name}" has been moved to "${selectedTemplate?.name}".`,
      });
      onOpenChange(false);
      setTargetTemplateId("");
    },
    onError: () => {
      toast({
        title: "Move failed",
        description: "Failed to move the checklist. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Checklist Group</DialogTitle>
          <DialogDescription>
            Move "{sourceGroup?.name}" to a different checklist group.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select destination checklist group</label>
            <Select value={targetTemplateId} onValueChange={setTargetTemplateId} disabled={isLoading}>
              <SelectTrigger data-testid="select-target-group">
                <SelectValue placeholder={isLoading ? "Loading..." : "Choose a checklist group..."} />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <p className="text-muted-foreground">
                "{sourceGroup?.name}" will be moved to "{selectedTemplate.name}"
              </p>
            </div>
          )}

          {!isLoading && availableTemplates.length === 0 && (
            <div className="p-3 bg-muted rounded-md text-sm text-center">
              <p className="text-muted-foreground">
                No other checklist groups available. Create another checklist group first.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-move">
            Cancel
          </Button>
          <Button
            onClick={() => moveMutation.mutate()}
            disabled={!targetTemplateId || moveMutation.isPending}
            data-testid="button-confirm-move"
          >
            {moveMutation.isPending ? "Moving..." : "Move"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
