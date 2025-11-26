import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCostCodeSchema, type CostCode, type CostCategory } from "@shared/schema";
import { z } from "zod";

type AddCostCodeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const formSchema = insertCostCodeSchema.pick({ 
  code: true, 
  title: true, 
  categoryId: true, 
  availableInTimesheets: true 
});

type FormData = z.infer<typeof formSchema>;

export default function AddCostCodeDialog({ open, onOpenChange }: AddCostCodeDialogProps) {
  const { toast } = useToast();
  
  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      title: "",
      categoryId: null,
      availableInTimesheets: true,
    },
  });

  const createCostCodeMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("/api/cost-codes", "POST", data) as Promise<CostCode>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
      form.reset();
      onOpenChange(false);
      
      toast({
        title: "Cost code created",
        description: "The cost code has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create cost code",
        description: error.message || "An error occurred while creating the cost code.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createCostCodeMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-add-cost-code">
        <DialogHeader>
          <DialogTitle>Add Cost Code</DialogTitle>
          <DialogDescription>
            Create a new cost code for estimates, bills, and timesheets.
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
                      placeholder="e.g., 100"
                      data-testid="input-cost-code"
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
                  <FormLabel>Cost Code Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Site Establishment"
                      data-testid="input-cost-code-title"
                      {...field}
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
                  <FormLabel>Category (Optional)</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.code} - {category.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Leave blank for uncategorized cost codes
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="availableInTimesheets"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Available in Timesheets</FormLabel>
                    <FormDescription>
                      Allow this cost code to be used in timesheet entries
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-timesheet-available"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-add-cost-code"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCostCodeMutation.isPending}
                data-testid="button-submit-add-cost-code"
              >
                {createCostCodeMutation.isPending ? "Creating..." : "Create Cost Code"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
