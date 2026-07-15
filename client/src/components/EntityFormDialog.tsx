import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCostCategorySchema, insertCostCodeSchema, type CostCategory, type CostCode } from "@shared/schema";
import { z } from "zod";

export type EntityFormKind = "category" | "costCode";
export type EntityFormMode = "add" | "edit";

type FormValues = Record<string, any>;

type FieldDef =
  | { type: "text"; name: string; label: string; placeholder: string; testId: string }
  | {
      type: "categorySelect";
      name: string;
      label: string;
      testId: string;
      /** Include an explicit "Uncategorized" option that maps to null */
      includeNone: boolean;
      /** Only offer active categories */
      activeOnly: boolean;
      description?: string;
    }
  | {
      type: "boolean";
      name: string;
      variant: "switch" | "checkbox";
      label: string;
      description?: string;
      testId: string;
    }
  | { type: "xeroTracking"; name: string; testId: string };

type DialogConfig = {
  dialogTestId: string;
  dialogClassName?: string;
  title: string;
  description: string;
  schema: z.ZodTypeAny;
  defaultValues: FormValues;
  fields: FieldDef[];
  /** Maps the entity being edited to form values (edit mode only) */
  editDefaults?: (entity: any) => FormValues;
  /** Builds the request target; may throw if the entity is missing */
  request: (entity: any) => { url: string; method: "POST" | "PATCH" };
  invalidateKeys: string[];
  successToast: { title: string; description: string };
  errorTitle: string;
  errorFallback: string;
  cancelTestId: string;
  submitTestId: string;
  submitLabel: string;
  pendingLabel: string;
  needsCategories: boolean;
  needsXero: boolean;
};

const categoryFormSchema = insertCostCategorySchema.pick({ code: true, title: true });

const costCodeAddSchema = insertCostCodeSchema.pick({
  code: true,
  title: true,
  categoryId: true,
  availableInTimesheets: true,
  isLabour: true,
});

const costCodeEditSchema = z.object({
  code: z.string().min(1, "Cost code is required"),
  title: z.string().min(1, "Title is required"),
  categoryId: z.string().nullable(),
  availableInTimesheets: z.boolean(),
  isLabour: z.boolean(),
  xeroTrackingOptionId: z.string().nullable().optional(),
  xeroTrackingOptionName: z.string().nullable().optional(),
});

const configs: Record<`${EntityFormKind}-${EntityFormMode}`, DialogConfig> = {
  "category-add": {
    dialogTestId: "dialog-add-category",
    dialogClassName: "sm:max-w-md",
    title: "Add Cost Category",
    description: "Create a new cost category to organize your cost codes.",
    schema: categoryFormSchema,
    defaultValues: { code: "", title: "" },
    fields: [
      { type: "text", name: "code", label: "Category Code *", placeholder: "e.g., 001", testId: "input-category-code" },
      { type: "text", name: "title", label: "Category Title *", placeholder: "e.g., Preliminaries", testId: "input-category-title" },
    ],
    request: () => ({ url: "/api/cost-categories", method: "POST" }),
    invalidateKeys: ["/api/cost-categories"],
    successToast: { title: "Category created", description: "The cost category has been created successfully." },
    errorTitle: "Failed to create category",
    errorFallback: "An error occurred while creating the category.",
    cancelTestId: "button-cancel-add-category",
    submitTestId: "button-submit-add-category",
    submitLabel: "Create Category",
    pendingLabel: "Creating...",
    needsCategories: false,
    needsXero: false,
  },
  "category-edit": {
    dialogTestId: "dialog-edit-category",
    dialogClassName: "sm:max-w-md",
    title: "Edit Cost Category",
    description: "Update the cost category code and title.",
    schema: categoryFormSchema,
    defaultValues: { code: "", title: "" },
    fields: [
      { type: "text", name: "code", label: "Category Code *", placeholder: "e.g., 001", testId: "input-category-code" },
      { type: "text", name: "title", label: "Category Title *", placeholder: "e.g., Preliminaries", testId: "input-category-title" },
    ],
    editDefaults: (category: CostCategory) => ({ code: category.code, title: category.title }),
    request: (category: CostCategory | null) => {
      if (!category) throw new Error("No category selected");
      return { url: `/api/cost-categories/${category.id}`, method: "PATCH" };
    },
    invalidateKeys: ["/api/cost-categories"],
    successToast: { title: "Category updated", description: "The cost category has been updated successfully." },
    errorTitle: "Failed to update category",
    errorFallback: "An error occurred while updating the category.",
    cancelTestId: "button-cancel-edit-category",
    submitTestId: "button-submit-edit-category",
    submitLabel: "Update Category",
    pendingLabel: "Updating...",
    needsCategories: false,
    needsXero: false,
  },
  "costCode-add": {
    dialogTestId: "dialog-add-cost-code",
    dialogClassName: "sm:max-w-md",
    title: "Add Cost Code",
    description: "Create a new cost code for estimates, bills, and timesheets.",
    schema: costCodeAddSchema,
    defaultValues: { code: "", title: "", categoryId: null, availableInTimesheets: true, isLabour: false },
    fields: [
      { type: "text", name: "code", label: "Cost Code *", placeholder: "e.g., 100", testId: "input-cost-code" },
      { type: "text", name: "title", label: "Cost Code Title *", placeholder: "e.g., Site Establishment", testId: "input-cost-code-title" },
      {
        type: "categorySelect",
        name: "categoryId",
        label: "Category (Optional)",
        testId: "select-category",
        includeNone: false,
        activeOnly: false,
        description: "Leave blank for uncategorized cost codes",
      },
      {
        type: "boolean",
        name: "availableInTimesheets",
        variant: "switch",
        label: "Available in Timesheets",
        description: "Allow this cost code to be used in timesheet entries",
        testId: "switch-timesheet-available",
      },
      {
        type: "boolean",
        name: "isLabour",
        variant: "switch",
        label: "Labour Cost Code",
        description: "Hours estimated against this cost code feed the project's labour hours budget.",
        testId: "switch-is-labour",
      },
    ],
    request: () => ({ url: "/api/cost-codes", method: "POST" }),
    invalidateKeys: ["/api/cost-codes"],
    successToast: { title: "Cost code created", description: "The cost code has been created successfully." },
    errorTitle: "Failed to create cost code",
    errorFallback: "An error occurred while creating the cost code.",
    cancelTestId: "button-cancel-add-cost-code",
    submitTestId: "button-submit-add-cost-code",
    submitLabel: "Create Cost Code",
    pendingLabel: "Creating...",
    needsCategories: true,
    needsXero: false,
  },
  "costCode-edit": {
    dialogTestId: "dialog-edit-cost-code",
    title: "Edit Cost Code",
    description: "Update the cost code details and category assignment.",
    schema: costCodeEditSchema,
    defaultValues: {
      code: "",
      title: "",
      categoryId: null,
      availableInTimesheets: false,
      isLabour: false,
      xeroTrackingOptionId: null,
      xeroTrackingOptionName: null,
    },
    fields: [
      { type: "text", name: "code", label: "Cost Code *", placeholder: "e.g., 1.01", testId: "input-edit-cost-code" },
      { type: "text", name: "title", label: "Title *", placeholder: "e.g., Site Preparation", testId: "input-edit-cost-code-title" },
      {
        type: "categorySelect",
        name: "categoryId",
        label: "Category",
        testId: "select-edit-cost-code-category",
        includeNone: true,
        activeOnly: true,
      },
      { type: "xeroTracking", name: "xeroTrackingOptionId", testId: "select-edit-xero-tracking-option" },
      {
        type: "boolean",
        name: "availableInTimesheets",
        variant: "checkbox",
        label: "Available in Timesheets",
        testId: "checkbox-edit-cost-code-timesheets",
      },
      {
        type: "boolean",
        name: "isLabour",
        variant: "checkbox",
        label: "Labour Cost Code",
        description: "Hours estimated against this cost code feed the labour hours budget.",
        testId: "checkbox-edit-cost-code-labour",
      },
    ],
    editDefaults: (costCode: CostCode) => ({
      code: costCode.code,
      title: costCode.title,
      categoryId: costCode.categoryId,
      availableInTimesheets: costCode.availableInTimesheets ?? false,
      isLabour: costCode.isLabour ?? false,
      xeroTrackingOptionId: (costCode as any).xeroTrackingOptionId ?? null,
      xeroTrackingOptionName: (costCode as any).xeroTrackingOptionName ?? null,
    }),
    request: (costCode: CostCode | null) => ({ url: `/api/cost-codes/${costCode?.id}`, method: "PATCH" }),
    invalidateKeys: ["/api/cost-codes"],
    successToast: { title: "Cost code updated", description: "The cost code has been updated successfully." },
    errorTitle: "Error",
    errorFallback: "Failed to update cost code.",
    cancelTestId: "button-cancel-edit-cost-code",
    submitTestId: "button-save-cost-code",
    submitLabel: "Save Changes",
    pendingLabel: "Saving...",
    needsCategories: true,
    needsXero: true,
  },
};

type EntityFormDialogProps = {
  kind: EntityFormKind;
  mode: EntityFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The entity being edited (edit mode only) */
  entity?: CostCategory | CostCode | null;
};

export default function EntityFormDialog({ kind, mode, open, onOpenChange, entity = null }: EntityFormDialogProps) {
  const config = configs[`${kind}-${mode}`];
  const { toast } = useToast();

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
    enabled: config.needsCategories,
  });

  const { data: xeroStatus } = useQuery<any>({
    queryKey: ["/api/xero/status"],
    enabled: config.needsXero,
  });

  const xeroConnected = xeroStatus?.connected === true;
  const trackingCategory1Id = xeroStatus?.trackingCategory1Id;

  const { data: trackingCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/xero/tracking-categories"],
    enabled: config.needsXero && xeroConnected,
  });

  const trackingCategory1 = trackingCategories.find(
    (tc: any) => tc.trackingCategoryId === trackingCategory1Id
  );
  const trackingOptions: { trackingOptionId: string; name: string }[] =
    trackingCategory1?.options || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(config.schema as any),
    defaultValues: config.defaultValues,
  });

  useEffect(() => {
    if (mode === "edit" && entity && open && config.editDefaults) {
      form.reset(config.editDefaults(entity));
    }
  }, [entity, open, form, mode, config]);

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const { url, method } = config.request(entity);
      return apiRequest(url, method, data);
    },
    onSuccess: () => {
      config.invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
      form.reset();
      onOpenChange(false);

      toast({
        title: config.successToast.title,
        description: config.successToast.description,
      });
    },
    onError: (error: any) => {
      toast({
        title: config.errorTitle,
        description: error.message || config.errorFallback,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  const activeCategories = categories.filter((cat) => cat.isActive);

  const renderField = (fieldDef: FieldDef) => {
    switch (fieldDef.type) {
      case "text":
        return (
          <FormField
            key={fieldDef.name}
            control={form.control}
            name={fieldDef.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{fieldDef.label}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={fieldDef.placeholder}
                    data-testid={fieldDef.testId}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        );
      case "categorySelect": {
        const options = fieldDef.activeOnly ? activeCategories : categories;
        return (
          <FormField
            key={fieldDef.name}
            control={form.control}
            name={fieldDef.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{fieldDef.label}</FormLabel>
                {fieldDef.includeNone ? (
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(value) =>
                      field.onChange(value === "__none__" ? null : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger data-testid={fieldDef.testId}>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Uncategorized</SelectItem>
                      {options.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.code} - {category.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid={fieldDef.testId}>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {options.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.code} - {category.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {fieldDef.description && <FormDescription>{fieldDef.description}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );
      }
      case "boolean":
        if (fieldDef.variant === "switch") {
          return (
            <FormField
              key={fieldDef.name}
              control={form.control}
              name={fieldDef.name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{fieldDef.label}</FormLabel>
                    {fieldDef.description && (
                      <FormDescription>{fieldDef.description}</FormDescription>
                    )}
                  </div>
                  <FormControl>
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      data-testid={fieldDef.testId}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          );
        }
        return (
          <FormField
            key={fieldDef.name}
            control={form.control}
            name={fieldDef.name}
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                    data-testid={fieldDef.testId}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>{fieldDef.label}</FormLabel>
                  {fieldDef.description && (
                    <p className="text-xs text-muted-foreground">{fieldDef.description}</p>
                  )}
                </div>
              </FormItem>
            )}
          />
        );
      case "xeroTracking":
        if (!xeroConnected || trackingOptions.length === 0) return null;
        return (
          <FormField
            key={fieldDef.name}
            control={form.control}
            name={fieldDef.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Xero Tracking Option{trackingCategory1 ? ` (${trackingCategory1.name})` : ""}
                </FormLabel>
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(value) => {
                    if (value === "__none__") {
                      field.onChange(null);
                      form.setValue("xeroTrackingOptionName", null);
                    } else {
                      field.onChange(value);
                      const option = trackingOptions.find(
                        (o) => o.trackingOptionId === value
                      );
                      form.setValue("xeroTrackingOptionName", option?.name ?? null);
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger data-testid={fieldDef.testId}>
                      <SelectValue placeholder="Select tracking option" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {trackingOptions.map((option) => (
                      <SelectItem key={option.trackingOptionId} value={option.trackingOptionId}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={config.dialogClassName} data-testid={config.dialogTestId}>
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {config.fields.map(renderField)}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid={config.cancelTestId}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid={config.submitTestId}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {config.pendingLabel}
                  </>
                ) : (
                  config.submitLabel
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
