import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertSiteDiaryTemplateSchema, type SiteDiaryTemplate, type InsertSiteDiaryTemplate, type TemplateFieldDefinition } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CustomFieldBuilder } from "@/components/site-diary/CustomFieldBuilder";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star } from "lucide-react";

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: SiteDiaryTemplate | null;
  onSuccess?: () => void;
}

export function TemplateFormDialog({ open, onOpenChange, template, onSuccess }: TemplateFormDialogProps) {
  const { toast } = useToast();
  const templateFields = (template?.fields as TemplateFieldDefinition[]) || [];
  const [fields, setFields] = useState<TemplateFieldDefinition[]>(templateFields);

  type FormData = Omit<InsertSiteDiaryTemplate, 'fields'> & {
    fields: TemplateFieldDefinition[];
  };

  const form = useForm<FormData>({
    resolver: zodResolver(insertSiteDiaryTemplateSchema),
    defaultValues: {
      name: template?.name || "",
      description: template?.description || "",
      fields: templateFields,
      isDefault: template?.isDefault || false,
    },
  });

  // Sync fields and form when template changes or dialog opens/closes
  useEffect(() => {
    const newFields = (template?.fields as TemplateFieldDefinition[]) || [];
    setFields(newFields);
    form.reset({
      name: template?.name || "",
      description: template?.description || "",
      fields: newFields,
      isDefault: template?.isDefault || false,
    });
  }, [template, open, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertSiteDiaryTemplate) => {
      return await apiRequest("/api/site-diary-templates", 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      toast({
        title: "Template created",
        description: "Your site diary template has been created successfully.",
      });
      form.reset();
      setFields([]);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<InsertSiteDiaryTemplate>) => {
      return await apiRequest(`/api/site-diary-templates/${template?.id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      toast({
        title: "Template updated",
        description: "Your site diary template has been updated successfully.",
      });
      form.reset();
      setFields([]);
      onSuccess?.();
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
    const fieldsWithOrder = fields.map((field, index) => ({
      ...field,
      order: index,
    }));

    const payload: InsertSiteDiaryTemplate = {
      name: data.name,
      description: data.description || undefined,
      fields: fieldsWithOrder,
      isDefault: data.isDefault || false,
    };

    if (template) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle data-testid="dialog-title-template">
            {template ? "Edit Template" : "Create Template"}
          </DialogTitle>
          <DialogDescription>
            {template
              ? "Update your site diary template details and custom fields."
              : "Create a new site diary template with custom fields for your team."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Daily Site Diary, Safety Inspection"
                        {...field}
                        data-testid="input-template-name"
                      />
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
                      <Textarea
                        placeholder="Brief description of when to use this template"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-template-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 text-[#bba7db]" />
                        Set as Default Template
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        This template will be pre-selected when creating new site diary entries
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                        data-testid="switch-default-template"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Custom Fields</FormLabel>
                <CustomFieldBuilder
                  fields={fields}
                  onChange={setFields}
                />
              </div>
            </form>
          </Form>
        </div>

        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            data-testid="button-cancel-template"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isLoading}
            data-testid="button-save-template"
          >
            {isLoading ? "Saving..." : template ? "Update Template" : "Create Template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
