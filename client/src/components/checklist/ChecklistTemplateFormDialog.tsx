import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertChecklistTemplateSchema, FieldCategoryWithOptions } from "@shared/schema";
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
import { Loader2 } from "lucide-react";

type FormData = {
  name: string;
  description?: string;
  type: string;
};

export function ChecklistTemplateFormDialog({
  open,
  onOpenChange,
  onTemplateCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTemplateCreated?: (templateId: string) => void;
}) {
  const { toast } = useToast();

  const { data: checklistTypesCategory, isLoading: isLoadingTypes } = useQuery<FieldCategoryWithOptions>({
    queryKey: ['/api/field-categories/by-key', 'checklist.type'],
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
    }),
    [validTypeKeys]
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "",
    },
  });

  useEffect(() => {
    if (defaultType && !form.getValues("type")) {
      form.setValue("type", defaultType);
    }
  }, [defaultType, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const template = await apiRequest("/api/checklist-templates", "POST", {
        name: data.name,
        description: data.description,
        type: data.type,
      });
      return template;
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist created",
        description: "The checklist has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
      if (onTemplateCreated) {
        onTemplateCreated(template.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create checklist.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Checklist</DialogTitle>
          <DialogDescription>
            Create a new checklist template. You can add checklists and items after creation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checklist Name</FormLabel>
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
                    disabled={isLoadingTypes || checklistTypes.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-template-type">
                        {isLoadingTypes ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading types...
                          </span>
                        ) : (
                          <SelectValue placeholder="Select type" />
                        )}
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
                disabled={createMutation.isPending || isLoadingTypes || checklistTypes.length === 0}
                data-testid="button-save-template"
              >
                {createMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
