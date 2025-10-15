import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCostCategorySchema, type CostCategory } from "@shared/schema";
import { z } from "zod";
import { useEffect } from "react";

type EditCategoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CostCategory | null;
};

const formSchema = insertCostCategorySchema.pick({ code: true, title: true });

type FormData = z.infer<typeof formSchema>;

export default function EditCategoryDialog({ open, onOpenChange, category }: EditCategoryDialogProps) {
  const { toast } = useToast();
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      title: "",
    },
  });

  useEffect(() => {
    if (category && open) {
      form.reset({
        code: category.code,
        title: category.title,
      });
    }
  }, [category, open, form]);

  const updateCategoryMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!category) throw new Error("No category selected");
      const response = await apiRequest("PATCH", `/api/cost-categories/${category.id}`, data);
      return response.json() as Promise<CostCategory>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-categories"] });
      form.reset();
      onOpenChange(false);
      
      toast({
        title: "Category updated",
        description: "The cost category has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update category",
        description: error.message || "An error occurred while updating the category.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateCategoryMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-edit-category">
        <DialogHeader>
          <DialogTitle>Edit Cost Category</DialogTitle>
          <DialogDescription>
            Update the cost category code and title.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Code *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 001"
                      data-testid="input-category-code"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Preliminaries"
                      data-testid="input-category-title"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-edit-category"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateCategoryMutation.isPending}
                data-testid="button-submit-edit-category"
              >
                {updateCategoryMutation.isPending ? "Updating..." : "Update Category"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
