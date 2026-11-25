import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Boxes, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AssemblyWithComponents, EstimateGroup } from "@shared/schema";
import { assemblyRateBreakdown, previewAssemblyCostExTax } from "@shared/assemblies";
import { dollarsToCents, formatCents } from "@shared/money";

interface AssemblyPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  groups: EstimateGroup[];
  /** Where the assembly lands unless the user picks another group. */
  defaultGroupId?: string | null;
}

/** Every group as "Parent > Child", in tree order, for the destination picker. */
function groupOptions(groups: EstimateGroup[]): Array<{ id: string; label: string }> {
  const byParent = new Map<string | null, EstimateGroup[]>();
  for (const g of groups) {
    const k = g.parentGroupId ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), g]);
  }
  const out: Array<{ id: string; label: string }> = [];
  const walk = (parent: string | null, prefix: string, depth: number) => {
    if (depth > 10) return; // corrupt cycles in legacy data
    for (const g of (byParent.get(parent) ?? []).sort((a, b) => a.order - b.order)) {
      const label = prefix ? `${prefix} > ${g.name}` : g.name;
      out.push({ id: g.id, label });
      walk(g.id, label, depth + 1);
    }
  };
  walk(null, "", 0);
  return out;
}

/**
 * Pick a Library assembly and drop it into the estimate: one assembly line
 * with its components underneath (POST /api/estimates/:id/assemblies).
 */
export function AssemblyPickerDialog({ open, onOpenChange, estimateId, groups, defaultGroupId }: AssemblyPickerDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState("1");
  const [groupId, setGroupId] = useState<string>("");

  const { data: assemblies = [], isLoading } = useQuery<AssemblyWithComponents[]>({
    queryKey: ["/api/assemblies", { includeArchived: false }],
    queryFn: async () => {
      const res = await fetch("/api/assemblies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assemblies");
      return res.json();
    },
    enabled: open,
  });

  const options = useMemo(() => groupOptions(groups), [groups]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedId(null);
    setQtyText("1");
    setGroupId(defaultGroupId ?? options[0]?.id ?? "");
    // Reset each time it opens, not as groups refetch underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter((a) => a.name.toLowerCase().includes(q) || a.components.some((c) => c.name.toLowerCase().includes(q)));
  }, [assemblies, search]);

  const selected = assemblies.find((a) => a.id === selectedId) ?? null;
  const qty = Number(qtyText.replace(/,/g, ""));
  const qtyValid = qtyText.trim() !== "" && Number.isFinite(qty) && qty >= 0;

  const add = useMutation({
    mutationFn: () => apiRequest(`/api/estimates/${estimateId}/assemblies`, "POST", {
      assemblyId: selectedId,
      quantity: qty,
      groupId: groupId || null,
    }),
    onSuccess: (lines: unknown[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId] });
      toast({
        title: `${selected?.name ?? "Assembly"} added`,
        description: `${Math.max(0, (lines?.length ?? 1) - 1)} components under one line. Change its quantity and they rescale.`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't add the assembly", description: e.message, variant: "destructive" }),
  });

  const money = (dollars: number) => formatCents(dollarsToCents(dollars), { alwaysShowDecimals: true });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" />Add an assembly</DialogTitle>
          <DialogDescription>
            One line that brings its components with it. Set up assemblies under Templates → Assemblies.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assemblies…"
            className="h-8 pl-7 text-xs"
            autoFocus
            data-testid="input-search-assembly-picker"
          />
        </div>

        <div className="max-h-72 overflow-auto rounded-md border border-border divide-y divide-border/60">
          {isLoading ? (
            <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              {assemblies.length === 0 ? "No assemblies yet — create one under Templates → Assemblies." : "Nothing matches."}
            </div>
          ) : (
            filtered.map((a) => {
              const { perUnitExTax, fixedExTax } = assemblyRateBreakdown(a.components);
              const active = a.id === selectedId;
              return (
                <button
                  key={a.id}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-3 hover:bg-primary/5 ${active ? "bg-primary/10" : ""}`}
                  onClick={() => setSelectedId(a.id)}
                  data-testid={`option-assembly-${a.id}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="text-muted-foreground truncate">
                      {a.components.length} components · {a.components.slice(0, 3).map((c) => c.name).join(", ")}
                      {a.components.length > 3 ? "…" : ""}
                    </div>
                  </div>
                  <div className="text-right tabular-nums whitespace-nowrap">
                    {money(perUnitExTax)} / {a.unitType}
                    {fixedExTax > 0 && <div className="text-muted-foreground">+ {money(fixedExTax)} fixed</div>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {selected && (
          <div className="grid grid-cols-[140px_1fr] gap-3 items-end">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Quantity ({selected.unitType})</span>
              <Input
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                inputMode="decimal"
                className="h-8 text-xs text-right"
                data-testid="input-assembly-qty"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Add to</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                data-testid="select-assembly-group"
              >
                <option value="">No group</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {qtyValid && (
              <div className="col-span-2 text-xs text-muted-foreground">
                Costs {money(previewAssemblyCostExTax(selected.components, qty))} ex GST before your margin. A take-off measurement can drive the quantity once it's in — type it in the line's quantity cell.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => add.mutate()}
            disabled={!selected || !qtyValid || add.isPending}
            data-testid="button-add-assembly"
          >
            {add.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Add assembly
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
