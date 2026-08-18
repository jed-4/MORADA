import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Building2, HardHat, Package } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { PriceList, Contact } from "@shared/schema";

type Kind = "supplier" | "labour" | "internal";

const KINDS: Array<{ value: Kind; label: string; icon: typeof Building2; hint: string }> = [
  { value: "supplier", label: "Supplier", icon: Building2, hint: "Someone else's price book — what you pay" },
  { value: "labour", label: "Labour", icon: HardHat, hint: "Your own rate card — cost vs charge" },
  { value: "internal", label: "Internal", icon: Package, hint: "Your own items — what you charge" },
];

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  kind: z.enum(["supplier", "labour", "internal"]),
  supplierId: z.string().nullable(),
  description: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string(),
  sourceNote: z.string(),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  name: "", kind: "supplier", supplierId: null, description: "",
  effectiveFrom: "", effectiveTo: "", sourceNote: "", isDefault: false,
};

/** Date -> yyyy-mm-dd for the native date inputs. */
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: PriceList | null;
}

export function PriceListFormModal({ open, onOpenChange, list }: Props) {
  const { toast } = useToast();
  const isEditing = !!list;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });

  const kind = form.watch("kind");

  // Suppliers come from CONTACTS (contactType='supplier'). The legacy `suppliers`
  // table is deprecated, and price_lists.supplier_id FKs contacts.id.
  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "supplier"],
    queryFn: () => apiRequest("/api/contacts?contactType=supplier", "GET"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      list
        ? {
            name: list.name || "",
            kind: (list.kind as Kind) || "supplier",
            supplierId: list.supplierId || null,
            description: list.description || "",
            effectiveFrom: toDateInput(list.effectiveFrom),
            effectiveTo: toDateInput(list.effectiveTo),
            sourceNote: list.sourceNote || "",
            isDefault: list.isDefault ?? false,
          }
        : EMPTY,
    );
  }, [open, list, form]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name.trim(),
        kind: values.kind,
        // Only a supplier list is bound to a contact.
        supplierId: values.kind === "supplier" ? values.supplierId : null,
        description: values.description || null,
        effectiveFrom: values.effectiveFrom || null,
        effectiveTo: values.effectiveTo || null,
        sourceNote: values.sourceNote || null,
        isDefault: values.isDefault,
      };
      return isEditing
        ? apiRequest(`/api/price-lists/${list!.id}`, "PATCH", payload)
        : apiRequest("/api/price-lists", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({
        title: isEditing ? "Price list updated" : "Price list created",
        description: isEditing
          ? "The price list has been updated successfully."
          : "The price list has been created successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? "Failed to update price list" : "Failed to create price list",
        description: error.message || "An error occurred while saving the price list.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    form.reset(EMPTY);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        data-testid="modal-price-list"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{isEditing ? "Edit Price List" : "New Price List"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this price list's details."
              : "Create a price list for a supplier, your labour rates, or your own items."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Type first — it decides what the rest of the form means. */}
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {KINDS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => field.onChange(value)}
                        className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs hover-elevate active-elevate-2 ${
                          field.value === value ? "bg-primary/10 text-primary border-primary/20" : "border-border"
                        }`}
                        data-testid={`button-kind-${value}`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <FormDescription>{KINDS.find((k) => k.value === field.value)?.hint}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  {/* A labour rate card has no supplier, so the label follows the type. */}
                  <FormLabel>{kind === "supplier" ? "Supplier name *" : "List name *"}</FormLabel>
                  <FormControl>
                    <Input data-testid="input-list-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {kind === "supplier" && (
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked supplier</FormLabel>
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-list-supplier">
                          <SelectValue placeholder="Select a supplier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No supplier</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Links this book to a contact for bills and orders.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} className="resize-none" data-testid="input-list-description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Supplier price books are dated — keep last quarter's for audit. */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="effectiveFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective from</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-effective-from" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="effectiveTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective to</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-effective-to" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="sourceNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input data-testid="input-source-note" {...field} />
                  </FormControl>
                  <FormDescription>Where these prices came from, for future reference.</FormDescription>
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
                    <FormLabel>Default for estimating</FormLabel>
                    <FormDescription>New items land here unless another list is chosen.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-default"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t pt-4 mt-4">
              <Button type="button" variant="outline" onClick={handleClose} data-testid="button-cancel-list">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-list">
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isEditing ? "Saving..." : "Creating..."}
                  </>
                ) : (
                  isEditing ? "Save Changes" : "Create Price List"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
