import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertChecklistTemplateSchema, FieldCategoryWithOptions, ChecklistTemplate, UserRole } from "@shared/schema";
import { z } from "zod";
import { useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock } from "lucide-react";

type FormData = {
  name: string;
  description?: string;
  type: string;
  visibleToRoles: string[];
};

export function ChecklistTemplateFormDialog({
  open,
  onOpenChange,
  onTemplateCreated,
  onTemplateUpdated,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateCreated?: (templateId: string) => void;
  onTemplateUpdated?: (template: ChecklistTemplate) => void;
  template?: ChecklistTemplate | null;
}) {
  const { toast } = useToast();
  const isEditMode = !!template;

  const { data: checklistTypesCategory, isLoading: isLoadingTypes } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/checklist.type"],
    staleTime: 60000,
  });

  const { data: allRoles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/roles"],
  });

  const checklistTypes = useMemo(() => 
    checklistTypesCategory?.options?.filter(o => o.isActive) || [],
    [checklistTypesCategory]
  );

  const defaultType = useMemo(() => 
    checklistTypes.find(t => t.isDefault)?.key || checklistTypes[0]?.key || "",
    [checklistTypes]
  );

  const validTypeKeys = useMemo(() => 
    checklistTypes.map(t => t.key),
    [checklistTypes]
  );

  const formSchema = useMemo(() => 
    insertChecklistTemplateSchema.extend({
      name: z.string().min(1, "Name is required"),
      type: validTypeKeys.length > 0 
        ? z.enum(validTypeKeys as [string, ...string[]])
        : z.string().min(1, "Type is required"),
      description: z.string().optional(),
      visibleToRoles: z.array(z.string()).default([]),
    }),
    [validTypeKeys]
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      type: template?.type || "",
      visibleToRoles: (template?.visibleToRoles as string[]) || [],
    },
  });

  // Set default type for new templates
  useEffect(() => {
    if (!isEditMode && defaultType && !form.getValues("type")) {
      form.setValue("type", defaultType);
    }
  }, [defaultType, form, isEditMode]);

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: template?.name || "",
        description: template?.description || "",
        type: template?.type || defaultType || "",
        visibleToRoles: (template?.visibleToRoles as string[]) || [],
      });
    } else {
      form.reset({
        name: "",
        description: "",
        type: defaultType || "",
        visibleToRoles: [],
      });
    }
  }, [open, template, form, defaultType]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const result = await apiRequest("/api/checklist-templates", "POST", {
        name: data.name,
        description: data.description,
        type: data.type,
        visibleToRoles: data.visibleToRoles,
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist group created",
        description: "The checklist group has been created successfully.",
      });
      onOpenChange(false);
      if (onTemplateCreated) {
        onTemplateCreated(result.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create checklist group.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const result = await apiRequest(`/api/checklist-templates/${template!.id}`, "PATCH", {
        name: data.name,
        description: data.description,
        type: data.type,
        visibleToRoles: data.visibleToRoles,
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates", template!.id] });
      toast({
        title: "Checklist group updated",
        description: "The checklist group has been updated successfully.",
      });
      onOpenChange(false);
      if (onTemplateUpdated) {
        onTemplateUpdated(result);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update checklist group.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (isEditMode) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Checklist Group" : "Create Checklist Group"}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? "Update the details of this checklist group."
              : "Create a new checklist group. You can add checklists and items after creation."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checklist Group Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., New Home ITP Checklist" {...field} data-testid="input-template-name" />
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
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={isLoadingTypes}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-template-type">
                        <SelectValue placeholder={isLoadingTypes ? "Loading types..." : "Select type"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {checklistTypes.map((type) => (
                        <SelectItem key={type.id} value={type.key}>
                          {type.name}
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

            {/* Visible To Roles */}
            <FormField
              control={form.control}
              name="visibleToRoles"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    Visible To Roles
                  </FormLabel>
                  <div className="text-xs text-muted-foreground mb-2">
                    Leave empty to show this checklist group to all roles. Select specific roles to restrict visibility.
                  </div>
                  {allRoles.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No roles configured</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1" data-testid="roles-checklist">
                      {allRoles.map((role) => {
                        const checked = field.value.includes(role.id);
                        return (
                          <label
                            key={role.id}
                            className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover-elevate"
                            data-testid={`role-checkbox-${role.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                if (c) {
                                  field.onChange([...field.value, role.id]);
                                } else {
                                  field.onChange(field.value.filter((id: string) => id !== role.id));
                                }
                              }}
                            />
                            <span className="truncate">{role.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
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
                disabled={isPending || isLoadingTypes}
                data-testid="button-save-template"
              >
                {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : isEditMode ? "Save Changes" : "Create Checklist Group"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
