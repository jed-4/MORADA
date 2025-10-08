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
import { useToast } from "@/hooks/use-toast";
import { CustomFieldBuilder } from "@/components/site-diary/CustomFieldBuilder";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    });
  }, [template, open, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertSiteDiaryTemplate) => {
      return await apiRequest('POST', "/api/site-diary-templates", data);
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
      return await apiRequest('PATCH', `/api/site-diary-templates/${template?.id}`, data);
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
    // Update order values to match array position
    const fieldsWithOrder = fields.map((field, index) => ({
      ...field,
      order: index,
    }));

    const payload: InsertSiteDiaryTemplate = {
      name: data.name,
      description: data.description || undefined,
      fields: fieldsWithOrder,
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle data-testid="dialog-title-template">
            {template ? "Edit Template" : "Create Template"}
          </DialogTitle>
          <DialogDescription>
            {template
              ? "Update your site diary template details and custom fields."
              : "Create a new site diary template with custom fields for your team."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
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

              <div className="space-y-2">
                <FormLabel>Custom Fields</FormLabel>
                <CustomFieldBuilder
                  fields={fields}
                  onChange={setFields}
                />
              </div>
            </form>
          </Form>
        </ScrollArea>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
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
