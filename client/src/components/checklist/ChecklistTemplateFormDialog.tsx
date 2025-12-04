import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertChecklistTemplateSchema, FieldCategoryWithOptions } from "@shared/schema";
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

const formSchema = insertChecklistTemplateSchema.extend({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

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

  const { data: checklistTypesCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ['/api/field-categories/by-key', 'checklist.type'],
  });

  const checklistTypes = checklistTypesCategory?.options?.filter(o => o.isActive) || [];
  const defaultType = checklistTypes.find(t => t.isDefault)?.key || checklistTypes[0]?.key || "Task";

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      type: defaultType,
    },
  });

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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-template-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {checklistTypes.length > 0 ? (
                        checklistTypes.map((type) => (
                          <SelectItem key={type.id} value={type.key}>
                            {type.name}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="Task">Task</SelectItem>
                          <SelectItem value="Job">Job</SelectItem>
                          <SelectItem value="Estimation">Estimation</SelectItem>
                          <SelectItem value="Lead">Lead</SelectItem>
                        </>
                      )}
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
                disabled={createMutation.isPending}
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
