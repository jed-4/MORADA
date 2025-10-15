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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      await apiRequest('DELETE', `/api/checklist-template-groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: "Group deleted",
        description: "The group has been deleted successfully.",
      });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest('DELETE', `/api/checklist-template-items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: "Item deleted",
        description: "The item has been deleted successfully.",
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
                <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add groups to organize your checklist items
                </p>
                <Button onClick={() => setIsAddingGroup(true)} data-testid="button-create-first-group">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Group
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Groups Column */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <Card className="flex flex-col h-full mr-3">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Groups</CardTitle>
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
                  <div className="space-y-1">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={`flex items-center justify-between gap-2 py-2 px-2 rounded border cursor-pointer hover-elevate ${
                          selectedGroupId === group.id 
                            ? 'bg-accent border-accent' 
                            : 'bg-card border-border'
                        }`}
                        onClick={() => setSelectedGroupId(group.id)}
                        data-testid={`group-item-${group.id}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate text-sm">{group.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteGroupMutation.mutate(group.id);
                          }}
                          data-testid={`button-delete-group-${group.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
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
                          No items in this group
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
                          .map((item) => (
                            <div
                              key={item.id}
                              className="py-2 px-2 rounded border hover-elevate"
                              data-testid={`item-${item.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-sm">{item.description}</span>
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
                            </div>
                          ))}
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
    </div>
  );
}

// Group Form Dialog
const groupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
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

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiRequest('POST', "/api/checklist-template-groups", {
        templateId,
        name: data.name,
        order: 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", templateId, "groups"] });
      toast({
        title: "Group created",
        description: "The group has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
  });

  const onSubmit = (data: { name: string }) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Edit" : "Add"} Group</DialogTitle>
          <DialogDescription>
            {group ? "Update" : "Create"} a group to organize checklist items
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Site Preparation" 
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
                disabled={createMutation.isPending}
                data-testid="button-save-group"
              >
                {createMutation.isPending ? "Saving..." : group ? "Update" : "Create"}
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
});

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

  const form = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      description: item?.description || "",
      tooltip: item?.tooltip || "",
    },
  });

  // Reset form when item changes
  useEffect(() => {
    if (open) {
      form.reset({
        description: item?.description || "",
        tooltip: item?.tooltip || "",
      });
    }
  }, [item, open, form]);

  const createMutation = useMutation({
    mutationFn: async (data: { description: string; tooltip?: string }) => {
      const res = await apiRequest(item ? 'PATCH' : 'POST', 
        item ? `/api/checklist-template-items/${item.id}` : "/api/checklist-template-items", 
        item ? data : {
          groupId,
          description: data.description,
          tooltip: data.tooltip || null,
          order: 0,
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-template-items", templateId] });
      toast({
        title: "Item created",
        description: "The item has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
  });

  const onSubmit = (data: { description: string; tooltip?: string }) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
                      rows={3}
                      {...field} 
                      data-testid="input-item-tooltip"
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
