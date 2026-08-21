import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
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
import { UnitSelect } from "@/components/UnitSelect";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { dollarsToCents, centsToDollars, incGstFromEx, exGstFromInc, formatCents } from "@shared/money";
import type { PriceListItem, PriceListGroup, Contact, CostCode } from "@shared/schema";

const NONE = "__none__";

/** Dollars in the form, integer cents on the wire — the boundary this feature
 *  has already got wrong once. Blank means "not set", not zero, for sell. */
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string(),
  groupId: z.string().nullable(),
  unitType: z.string().min(1, "Unit is required"),
  cost: z.string(),
  markup: z.string(),
  sell: z.string(),
  nickname: z.string(),
  description: z.string(),
  supplierId: z.string().nullable(),
  supplierCode: z.string(),
  leadTimeDays: z.string(),
  brand: z.string(),
  notes: z.string(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  name: "", code: "", groupId: null, unitType: "ea",
  cost: "", markup: "", sell: "",
  nickname: "", description: "", supplierId: null, supplierCode: "",
  leadTimeDays: "", brand: "", notes: "", isActive: true,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceListItem | null;
  groups: PriceListGroup[];
  suppliers: Contact[];
  costCodes: CostCode[];
  priceListId?: string;
  kind: "supplier" | "labour" | "internal";
}

export function PriceListItemModal({
  open, onOpenChange, item, groups, suppliers, priceListId, kind,
}: Props) {
  const { toast } = useToast();
  const isEditing = !!item;
  const [incGst, setIncGst] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const cost = form.watch("cost");
  const sell = form.watch("sell");

  useEffect(() => {
    if (!open) return;
    setIncGst(false);
    setShowMore(false);
    form.reset(item ? {
      name: item.name ?? "",
      code: item.code ?? "",
      groupId: item.groupId ?? null,
      unitType: item.unitType || "ea",
      cost: item.costPrice ? String(centsToDollars(item.costPrice)) : "",
      markup: item.markupPercent ?? "",
      sell: item.sellPrice ? String(centsToDollars(item.sellPrice)) : "",
      nickname: item.nickname ?? "",
      description: item.description ?? "",
      supplierId: item.supplierId ?? null,
      supplierCode: item.supplierCode ?? "",
      leadTimeDays: item.leadTimeDays ? String(item.leadTimeDays) : "",
      brand: item.brand ?? "",
      notes: item.notes ?? "",
      isActive: item.isActive ?? true,
    } : EMPTY);
  }, [open, item, form]);

  /** Typing a markup fills the sell price from cost; the three stay consistent. */
  const applyMarkup = (pct: string) => {
    const c = parseFloat(cost);
    const m = parseFloat(pct);
    if (Number.isFinite(c) && Number.isFinite(m)) {
      form.setValue("sell", (c * (1 + m / 100)).toFixed(2));
    }
  };

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const payload = {
        ...(priceListId ? { priceListId } : {}),
        name: v.name.trim(),
        code: v.code.trim() || null,
        groupId: v.groupId,
        unitType: v.unitType,
        costPrice: v.cost.trim() ? dollarsToCents(v.cost) : 0,
        sellPrice: v.sell.trim() ? dollarsToCents(v.sell) : null,
        markupPercent: v.markup.trim(),
        nickname: v.nickname.trim() || null,
        description: v.description.trim() || null,
        supplierId: v.supplierId,
        supplierCode: v.supplierCode.trim() || null,
        leadTimeDays: v.leadTimeDays.trim() ? parseInt(v.leadTimeDays, 10) : null,
        brand: v.brand.trim() || null,
        notes: v.notes.trim() || null,
        isActive: v.isActive,
      };
      return isEditing
        ? apiRequest(`/api/price-list/items/${item!.id}`, "PATCH", payload)
        : apiRequest("/api/price-list/items", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: isEditing ? "Item updated" : "Item created" });
      onOpenChange(false);
    },
    onError: (error: any) =>
      toast({
        title: isEditing ? "Failed to update item" : "Failed to create item",
        description: error.message,
        variant: "destructive",
      }),
  });

  /** The converse figure, so entering ex shows inc and vice versa. */
  const converse = (dollars: string) => {
    const n = parseFloat(dollars);
    if (!Number.isFinite(n)) return null;
    const cents = dollarsToCents(n);
    return formatCents(incGst ? exGstFromInc(cents) : incGstFromEx(cents));
  };

  const priceField = (name: "cost" | "sell", label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input type="number" step="0.01" className="pl-6" data-testid={`input-${name}`} {...field} />
            </div>
          </FormControl>
          {converse(field.value) && (
            <FormDescription className="tabular-nums">
              {incGst ? "ex" : "inc"} {converse(field.value)}
            </FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const textField = (name: keyof FormValues, label: string) => (
    <FormField
      control={form.control}
      name={name as any}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input data-testid={`input-${name}`} {...field} value={(field.value as string) ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col overflow-hidden" data-testid="modal-price-list-item">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{isEditing ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>
            {kind === "labour" ? "A line on your rate card." : "A line in this price list."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl><Input data-testid="input-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                {textField("code", "SKU")}
                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <UnitSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        triggerClassName="w-full"
                        data-testid="select-unit-type"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group</FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-group"><SelectValue placeholder="Ungrouped" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Ungrouped</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Cost, markup and sell interlock, so they stay together. */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pricing</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    Ex GST
                    <Switch
                      checked={incGst}
                      onCheckedChange={setIncGst}
                      className="h-4 w-7"
                      data-testid="switch-gst-mode"
                    />
                    Inc GST
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {priceField("cost", kind === "labour" ? "Cost rate" : "Cost")}
                  <FormField
                    control={form.control}
                    name="markup"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Markup</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.1"
                              className="pr-6"
                              data-testid="input-markup"
                              {...field}
                              onChange={(e) => { field.onChange(e); applyMarkup(e.target.value); }}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {priceField("sell", kind === "labour" ? "Charge rate" : "Sell")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-show-more"
              >
                {showMore ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showMore ? "Fewer details" : "More details"}
              </button>

              {/* Everything below is reachable as a grid column too, so it starts
                  collapsed rather than making the common case look complicated. */}
              {showMore && (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    {textField("nickname", "Nickname")}
                    {textField("brand", "Brand")}
                  </div>

                  {kind !== "supplier" && (
                    <FormField
                      control={form.control}
                      name="supplierId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Supplier</FormLabel>
                          <Select
                            value={field.value ?? NONE}
                            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-supplier"><SelectValue placeholder="None" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={NONE}>None</SelectItem>
                              {suppliers.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {kind !== "labour" && (
                    <div className="grid grid-cols-2 gap-3">
                      {textField("supplierCode", "Supplier ref")}
                      {textField("leadTimeDays", "Lead time (days)")}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea rows={2} className="resize-none" data-testid="input-description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal notes</FormLabel>
                        <FormControl>
                          <Textarea rows={2} className="resize-none" data-testid="input-notes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Active</FormLabel>
                          <FormDescription>Inactive items stay in the list but are marked.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-active" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-shrink-0 justify-end gap-3 border-t pt-4 mt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending} data-testid="button-save">
                {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? "Save changes" : "Add item"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
