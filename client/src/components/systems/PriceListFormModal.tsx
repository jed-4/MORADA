import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Building2, HardHat, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { PriceList, Contact } from "@shared/schema";

type Kind = "supplier" | "labour" | "internal";

const KINDS: Array<{ value: Kind; label: string; icon: typeof Building2; hint: string }> = [
  { value: "supplier", label: "Supplier", icon: Building2, hint: "Someone else's price book — what you pay" },
  { value: "labour", label: "Labour", icon: HardHat, hint: "Your own rate card — cost vs charge" },
  { value: "internal", label: "Internal", icon: Package, hint: "Your own items — what you charge" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: PriceList | null;
}

/** Date <-> yyyy-mm-dd for the native date inputs. */
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function PriceListFormModal({ open, onOpenChange, list }: Props) {
  const { toast } = useToast();
  const isEditing = !!list;

  const [form, setForm] = useState({
    name: "",
    kind: "supplier" as Kind,
    supplierId: "",
    description: "",
    effectiveFrom: "",
    effectiveTo: "",
    sourceNote: "",
    isDefault: false,
  });

  // Suppliers come from CONTACTS (contactType='supplier'). The legacy `suppliers`
  // table is deprecated, and price_lists.supplier_id FKs contacts.id — the old
  // picker wrote a suppliers.id into that column, which could never resolve.
  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", "supplier"],
    queryFn: () => apiRequest("/api/contacts?contactType=supplier", "GET"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (list) {
      setForm({
        name: list.name || "",
        kind: (list.kind as Kind) || "supplier",
        supplierId: list.supplierId || "",
        description: list.description || "",
        effectiveFrom: toDateInput(list.effectiveFrom),
        effectiveTo: toDateInput(list.effectiveTo),
        sourceNote: list.sourceNote || "",
        isDefault: list.isDefault ?? false,
      });
    } else {
      setForm({
        name: "", kind: "supplier", supplierId: "", description: "",
        effectiveFrom: "", effectiveTo: "", sourceNote: "", isDefault: false,
      });
    }
  }, [open, list]);

  const save = useMutation({
    mutationFn: (payload: any) =>
      isEditing
        ? apiRequest(`/api/price-lists/${list!.id}`, "PATCH", payload)
        : apiRequest("/api/price-lists", "POST", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists"] });
      toast({ title: isEditing ? "Price list updated" : "Price list created" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: isEditing ? "Failed to update price list" : "Failed to create price list",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    save.mutate({
      name: form.name.trim(),
      kind: form.kind,
      // Only a supplier list is bound to a contact.
      supplierId: form.kind === "supplier" ? (form.supplierId || null) : null,
      description: form.description || null,
      effectiveFrom: form.effectiveFrom || null,
      effectiveTo: form.effectiveTo || null,
      sourceNote: form.sourceNote || null,
      isDefault: form.isDefault,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-testid="modal-price-list">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm">
            {isEditing ? "Edit Price List" : "New Price List"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-data text-muted-foreground mb-0.5 block">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="The Plaster Shop"
              className="h-7 text-table"
              data-testid="input-list-name"
            />
          </div>

          {/* Kind drives which fields the items inside this list will show. */}
          <div>
            <Label className="text-data text-muted-foreground mb-1 block">Type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {KINDS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, kind: value }))}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs hover-elevate active-elevate-2 ${
                    form.kind === value ? "bg-primary/10 text-primary border-primary/30" : ""
                  }`}
                  data-testid={`button-kind-${value}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-label text-muted-foreground mt-1">
              {KINDS.find(k => k.value === form.kind)?.hint}
            </p>
          </div>

          {form.kind === "supplier" && (
            <div>
              <Label className="text-data text-muted-foreground mb-0.5 block">Supplier</Label>
              <Select
                value={form.supplierId || "none"}
                onValueChange={(v) => setForm(f => ({ ...f, supplierId: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="h-7 text-table" data-testid="select-list-supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-table">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-table">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-data text-muted-foreground mb-0.5 block">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Trade account pricing"
              className="text-table min-h-[40px] resize-none"
              rows={2}
              data-testid="input-list-description"
            />
          </div>

          {/* Supplier price books are dated — keep last quarter's for audit. */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-data text-muted-foreground mb-0.5 block">Effective from</Label>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                className="h-7 text-table"
                data-testid="input-effective-from"
              />
            </div>
            <div>
              <Label className="text-data text-muted-foreground mb-0.5 block">Effective to</Label>
              <Input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm(f => ({ ...f, effectiveTo: e.target.value }))}
                className="h-7 text-table"
                data-testid="input-effective-to"
              />
            </div>
          </div>

          <div>
            <Label className="text-data text-muted-foreground mb-0.5 block">Source</Label>
            <Input
              value={form.sourceNote}
              onChange={(e) => setForm(f => ({ ...f, sourceNote: e.target.value }))}
              placeholder="Q3 2026 trade price book (PDF)"
              className="h-7 text-table"
              data-testid="input-source-note"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <label className="flex items-center gap-2 text-table cursor-pointer">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm(f => ({ ...f, isDefault: v }))}
                className="h-4 w-7 data-[state=checked]:bg-primary"
                data-testid="switch-is-default"
              />
              <span className="text-muted-foreground">Default for estimating</span>
            </label>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-table"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-list"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-table"
                disabled={save.isPending}
                data-testid="button-save-list"
              >
                {save.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {isEditing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
