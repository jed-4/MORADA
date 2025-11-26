import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CostCode, CostCategory } from "@shared/schema";

const editCostCodeSchema = z.object({
  code: z.string().min(1, "Cost code is required"),
  title: z.string().min(1, "Title is required"),
  categoryId: z.string().nullable(),
  availableInTimesheets: z.boolean(),
});

type EditCostCodeFormData = z.infer<typeof editCostCodeSchema>;

type EditCostCodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCode: CostCode | null;
};

export default function EditCostCodeDialog({
  open,
  onOpenChange,
  costCode,
}: EditCostCodeDialogProps) {
  const { toast } = useToast();

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const form = useForm<EditCostCodeFormData>({
    resolver: zodResolver(editCostCodeSchema),
    defaultValues: {
      code: "",
      title: "",
      categoryId: null,
      availableInTimesheets: false,
    },
  });

  useEffect(() => {
    if (costCode && open) {
      form.reset({
        code: costCode.code,
        title: costCode.title,
        categoryId: costCode.categoryId,
        availableInTimesheets: costCode.availableInTimesheets ?? false,
      });
    }
  }, [costCode, open, form]);

  const updateMutation = useMutation({
    mutationFn: (data: EditCostCodeFormData) =>
      apiRequest(`/api/cost-codes/${costCode?.id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      toast({
        title: "Cost code updated",
        description: "The cost code has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update cost code.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditCostCodeFormData) => {
    updateMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  const activeCategories = categories.filter((cat) => cat.isActive);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent data-testid="dialog-edit-cost-code">
        <DialogHeader>
          <DialogTitle>Edit Cost Code</DialogTitle>
          <DialogDescription>
            Update the cost code details and category assignment.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost Code *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., 1.01"
                      data-testid="input-edit-cost-code"
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
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., Site Preparation"
                      data-testid="input-edit-cost-code-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(value) =>
                      field.onChange(value === "__none__" ? null : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-cost-code-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Uncategorized</SelectItem>
                      {activeCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.code} - {category.title}
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
              name="availableInTimesheets"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-edit-cost-code-timesheets"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Available in Timesheets</FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-edit-cost-code"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-cost-code"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
