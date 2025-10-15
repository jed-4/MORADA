import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  type ChecklistTemplate,
  type ChecklistTemplateGroup,
  type ChecklistTemplateItem,
  insertChecklistTemplateSchema,
} from "@shared/schema";
import { z } from "zod";
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
  FormDescription,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Info } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const formSchema = insertChecklistTemplateSchema.extend({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Task", "Job", "Estimation", "Lead"]),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface GroupWithItems {
  id?: string;
  name: string;
  order: number;
  items: {
    id?: string;
    description: string;
    order: number;
  }[];
}

export function ChecklistTemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ChecklistTemplate | null;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithItems[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      type: (template?.type as "Task" | "Job" | "Estimation" | "Lead") || "Task",
    },
  });

  // Fetch existing groups and items if editing
  const { data: existingGroups = [] } = useQuery<ChecklistTemplateGroup[]>({
    queryKey: ["/api/checklist-templates", template?.id, "groups"],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-templates/${template?.id}/groups`);
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
    enabled: !!template?.id,
  });

  const { data: existingItems = [] } = useQuery<ChecklistTemplateItem[]>({
    queryKey: ["/api/checklist-template-items", template?.id],
    queryFn: async () => {
      const itemPromises = existingGroups.map(async (group) => {
        const res = await fetch(`/api/checklist-template-groups/${group.id}/items`);
        if (!res.ok) throw new Error("Failed to fetch items");
        return res.json();
      });
      const results = await Promise.all(itemPromises);
      return results.flat();
    },
    enabled: existingGroups.length > 0,
  });

  // Initialize groups from existing data
  useEffect(() => {
    if (template && existingGroups.length > 0) {
      const groupsWithItems: GroupWithItems[] = existingGroups.map((group) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        items: existingItems
          .filter(item => item.groupId === group.id)
          .map(item => ({
            id: item.id,
            description: item.description,
            order: item.order,
          })),
      }));
      setGroups(groupsWithItems);
    }
  }, [template, existingGroups, existingItems]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData & { groups: GroupWithItems[] }) => {
      // Create template
      const templateRes = await apiRequest('POST', "/api/checklist-templates", {
        name: data.name,
        description: data.description,
        type: data.type,
      });
      const template = await templateRes.json();

      // Create groups and items
      for (const group of data.groups) {
        const groupRes = await apiRequest('POST', "/api/checklist-template-groups", {
          templateId: template.id,
          name: group.name,
          order: group.order,
        });
        const createdGroup = await groupRes.json();

        for (const item of group.items) {
          await apiRequest('POST', "/api/checklist-template-items", {
            groupId: createdGroup.id,
            description: item.description,
            order: item.order,
          });
        }
      }

      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Template created",
        description: "The checklist template has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
      setGroups([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData & { groups: GroupWithItems[] }) => {
      if (!template?.id) throw new Error("Template ID is required");

      // Update template
      await apiRequest('PATCH', `/api/checklist-templates/${template.id}`, {
        name: data.name,
        description: data.description,
        type: data.type,
      });

      // Delete existing groups and items (cascade will handle items)
      for (const group of existingGroups) {
        await apiRequest('DELETE', `/api/checklist-template-groups/${group.id}`);
      }

      // Create new groups and items
      for (const group of data.groups) {
        const groupRes = await apiRequest('POST', "/api/checklist-template-groups", {
          templateId: template.id,
          name: group.name,
          order: group.order,
        });
        const createdGroup = await groupRes.json();

        for (const item of group.items) {
          await apiRequest('POST', "/api/checklist-template-items", {
            groupId: createdGroup.id,
            description: item.description,
            order: item.order,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Template updated",
        description: "The checklist template has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (groups.length === 0) {
      toast({
        title: "No groups added",
        description: "Please add at least one group with items before saving.",
        variant: "destructive",
      });
      return;
    }

    const hasEmptyGroups = groups.some(g => g.items.length === 0);
    if (hasEmptyGroups) {
      toast({
        title: "Empty groups found",
        description: "All groups must have at least one item.",
        variant: "destructive",
      });
      return;
    }

    if (template) {
      updateMutation.mutate({ ...data, groups });
    } else {
      createMutation.mutate({ ...data, groups });
    }
  };

  const addGroup = () => {
    setGroups([...groups, {
      name: "",
      order: groups.length,
      items: [],
    }]);
  };

  const removeGroup = (index: number) => {
    setGroups(groups.filter((_, i) => i !== index));
  };

  const updateGroupName = (index: number, name: string) => {
    const newGroups = [...groups];
    newGroups[index].name = name;
    setGroups(newGroups);
  };

  const addItem = (groupIndex: number) => {
    const newGroups = [...groups];
    newGroups[groupIndex].items.push({
      description: "",
      order: newGroups[groupIndex].items.length,
    });
    setGroups(newGroups);
  };

  const removeItem = (groupIndex: number, itemIndex: number) => {
    const newGroups = [...groups];
    newGroups[groupIndex].items = newGroups[groupIndex].items.filter((_, i) => i !== itemIndex);
    setGroups(newGroups);
  };

  const updateItemDescription = (groupIndex: number, itemIndex: number, description: string) => {
    const newGroups = [...groups];
    newGroups[groupIndex].items[itemIndex].description = description;
    setGroups(newGroups);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit" : "Create"} Checklist Template</DialogTitle>
          <DialogDescription>
            {template ? "Update" : "Create"} a reusable checklist template with groups and items.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Pre-Construction Checklist" {...field} data-testid="input-template-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-template-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Task">Task</SelectItem>
                        <SelectItem value="Job">Job</SelectItem>
                        <SelectItem value="Estimation">Estimation</SelectItem>
                        <SelectItem value="Lead">Lead</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of this checklist template..." 
                      {...field} 
                      data-testid="input-template-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Groups and Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Groups & Items</h3>
                  <p className="text-sm text-muted-foreground">
                    Organize checklist items into groups
                  </p>
                </div>
                <Button type="button" onClick={addGroup} variant="outline" size="sm" data-testid="button-add-group">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Group
                </Button>
              </div>

              {groups.map((group, groupIndex) => (
                <Card key={groupIndex} data-testid={`card-group-${groupIndex}`}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Group name (e.g., Site Preparation)"
                        value={group.name}
                        onChange={(e) => updateGroupName(groupIndex, e.target.value)}
                        className="flex-1"
                        data-testid={`input-group-name-${groupIndex}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeGroup(groupIndex)}
                        data-testid={`button-remove-group-${groupIndex}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="ml-6 space-y-2">
                      {group.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-start gap-2" data-testid={`item-${groupIndex}-${itemIndex}`}>
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              placeholder="Item description..."
                              value={item.description}
                              onChange={(e) => updateItemDescription(groupIndex, itemIndex, e.target.value)}
                              className="flex-1"
                              data-testid={`input-item-description-${groupIndex}-${itemIndex}`}
                            />
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="shrink-0">
                                  <Info className="h-4 w-4" />
                                </Button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80">
                                <p className="text-sm">{item.description || "No description provided"}</p>
                              </HoverCardContent>
                            </HoverCard>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(groupIndex, itemIndex)}
                            data-testid={`button-remove-item-${groupIndex}-${itemIndex}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addItem(groupIndex)}
                        className="mt-2"
                        data-testid={`button-add-item-${groupIndex}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

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
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-template"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
