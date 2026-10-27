import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Receipt, Search, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Asset } from "@shared/schema";
import { METER_UNIT, VEHICLE_COST_CATEGORIES, VEHICLE_COST_CATEGORY_LABELS, type MeterType, type VehicleCostCategory } from "@shared/assets";
import { errorText, money, shortDate } from "./assetsShared";

interface CostLine {
  lineId: string;
  billId: string;
  billNumber: string;
  billReference: string | null;
  billDate: string;
  supplierName: string | null;
  description: string;
  incGstCents: number;
  category: VehicleCostCategory;
  billStatus: string;
}

interface CostsResponse {
  lines: CostLine[];
  summary: {
    billsAllTimeCents: number;
    billsLast12Cents: number;
    loggedAllTimeCents: number;
    loggedLast12Cents: number;
    purchaseCents: number | null;
    byCategoryLast12: Record<VehicleCostCategory, number>;
    byFinancialYear: Record<string, number>;
    distanceLast12: { from: string; to: string; amount: number } | null;
    costPerUnitCents: number | null;
    meterType: string;
  };
}

const costsKey = (id: string) => ["/api/assets", id, "costs"] as const;
const suggestionsKey = (id: string) => ["/api/assets", id, "bill-line-suggestions"] as const;

function invalidateCosts(id: string) {
  queryClient.invalidateQueries({ queryKey: costsKey(id) });
  queryClient.invalidateQueries({ queryKey: suggestionsKey(id) });
}

const dateKey = (iso: string) => iso.slice(0, 10);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/**
 * What this asset actually costs, from the bills already in Morada — fuel
 * statements, servicing, rego, insurance — plus anything logged by hand.
 */
export function AssetCostsSection({ asset, canEdit }: { asset: Asset; canEdit: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<CostsResponse>({ queryKey: costsKey(asset.id) });
  const [finding, setFinding] = useState(false);

  const unlink = useMutation({
    mutationFn: (lineId: string) => apiRequest(`/api/assets/${asset.id}/bill-lines/${lineId}`, "DELETE"),
    onSuccess: () => invalidateCosts(asset.id),
    onError: (err) => toast({ title: errorText(err, "Couldn't unlink that line"), variant: "destructive" }),
  });

  const s = data?.summary;
  const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
  const maxCategory = s ? Math.max(1, ...VEHICLE_COST_CATEGORIES.map((c) => Math.abs(s.byCategoryLast12[c] ?? 0))) : 1;
  const tco = s ? (s.purchaseCents ?? 0) + s.billsAllTimeCents + s.loggedAllTimeCents : 0;
  const years = s ? Object.entries(s.byFinancialYear).sort((a, b) => b[0].localeCompare(a[0])) : [];

  return (
    <Card className="overflow-hidden min-w-0 lg:col-span-2" data-testid="card-asset-costs">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Running costs</h3>
            <p className="text-xs text-muted-foreground">From bills linked to this asset, inc GST. Link fuel, servicing, rego and insurance as they come in.</p>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0" onClick={() => setFinding(true)} data-testid="button-find-bills">
            <Search className="w-3.5 h-3.5 mr-1" />Find bills
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : error || !s ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Couldn't load the costs.</p>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 py-3 border-b border-border">
            <Tile label="Last 12 months" value={money(s.billsLast12Cents + s.loggedLast12Cents)} sub={s.loggedLast12Cents ? `${money(s.loggedLast12Cents)} logged by hand` : "from bills"} />
            <Tile
              label={`Cost per ${unit || "unit"}`}
              value={s.costPerUnitCents != null ? `$${(s.costPerUnitCents / 100).toFixed(2)}` : "—"}
              sub={s.distanceLast12 ? `${s.distanceLast12.amount.toLocaleString("en-AU")} ${unit} since ${shortDate(s.distanceLast12.from)}` : "needs readings a month apart"}
            />
            <Tile label="All bills" value={money(s.billsAllTimeCents)} sub={`${data!.lines.length} line${data!.lines.length === 1 ? "" : "s"}`} />
            <Tile label="Cost of ownership" value={money(tco)} sub={s.purchaseCents != null ? `inc ${money(s.purchaseCents)} purchase` : "purchase price not set"} />
          </div>

          {data!.lines.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">
              No bills linked yet. {canEdit ? "Use Find bills — it looks for the rego on bill lines." : ""}
            </p>
          ) : (
            <div className="grid md:grid-cols-[280px_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="px-4 py-3 flex flex-col gap-2">
                <div className="text-[11px] font-medium text-muted-foreground">Last 12 months by type</div>
                {VEHICLE_COST_CATEGORIES.filter((c) => s.byCategoryLast12[c]).map((c) => (
                  <div key={c} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span>{VEHICLE_COST_CATEGORY_LABELS[c]}</span>
                      <span className="tabular-nums">{money(s.byCategoryLast12[c])}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(Math.abs(s.byCategoryLast12[c]) / maxCategory) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {years.length > 0 && (
                  <>
                    <div className="text-[11px] font-medium text-muted-foreground mt-2">By financial year</div>
                    {years.map(([fy, cents]) => (
                      <div key={fy} className="flex justify-between text-xs">
                        <span>{fy}</span>
                        <span className="tabular-nums">{money(cents)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
                {data!.lines.map((l) => (
                  <li key={l.lineId} className="flex items-center gap-3 px-4 py-2" data-testid={`row-cost-${l.lineId}`}>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-16 shrink-0">{shortDate(dateKey(l.billDate))}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{l.description || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[l.supplierName, VEHICLE_COST_CATEGORY_LABELS[l.category]].filter(Boolean).join(" · ")}
                        {" · "}
                        <a href={`/bills/${l.billId}`} className="hover:underline">{l.billReference || l.billNumber}</a>
                      </div>
                    </div>
                    <span className="text-xs tabular-nums shrink-0">{money(l.incGstCents)}</span>
                    {canEdit && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Unlink from this asset" onClick={() => unlink.mutate(l.lineId)}>
                        <Unlink className="w-3 h-3" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <FindBillsDialog asset={asset} open={finding} onClose={() => setFinding(false)} />
    </Card>
  );
}

interface Suggestion extends CostLine {
  reason: "rego" | "supplier";
}

function FindBillsDialog({ asset, open, onClose }: { asset: Asset; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ suggestions: Suggestion[]; hasRego: boolean }>({
    queryKey: suggestionsKey(asset.id),
    enabled: open,
  });
  const suggestions = data?.suggestions ?? [];
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Rego matches start ticked; supplier-only matches are a judgement call.
  useEffect(() => {
    if (open) setPicked(new Set(suggestions.filter((x) => x.reason === "rego").map((x) => x.lineId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  const total = useMemo(() => suggestions.filter((x) => picked.has(x.lineId)).reduce((sum, x) => sum + x.incGstCents, 0), [suggestions, picked]);

  const link = useMutation({
    mutationFn: () => apiRequest(`/api/assets/${asset.id}/bill-lines`, "POST", { lineIds: Array.from(picked) }),
    onSuccess: (r: { linked: number }) => {
      invalidateCosts(asset.id);
      toast({ title: `Linked ${r.linked} bill line${r.linked === 1 ? "" : "s"} to ${asset.name}` });
      onClose();
    },
    onError: (err) => toast({ title: errorText(err, "Couldn't link those"), variant: "destructive" }),
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find bills for {asset.name}</DialogTitle>
          <DialogDescription>
            Bill lines from the last two years that mention {asset.rego ? <span className="font-mono">{asset.rego}</span> : "the rego"}, or come from a supplier already linked to this asset.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : suggestions.length === 0 ? (
          <p className="py-6 text-xs text-muted-foreground text-center">
            {data?.hasRego === false
              ? "Add the rego to this asset first — that's what the search looks for."
              : "Nothing unlinked mentions this rego. Link a line from the bill page and its supplier will be suggested here next time."}
          </p>
        ) : (
          <ul className="divide-y divide-border max-h-[420px] overflow-y-auto border border-border rounded-md">
            {suggestions.map((x) => (
              <li key={x.lineId}>
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={picked.has(x.lineId)} onCheckedChange={() => toggle(x.lineId)} />
                  <span className="text-[11px] text-muted-foreground tabular-nums w-16 shrink-0">{shortDate(dateKey(x.billDate))}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{x.description || "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[x.supplierName, VEHICLE_COST_CATEGORY_LABELS[x.category], x.billReference || x.billNumber].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 no-default-active-elevate">{x.reason === "rego" ? "Rego match" : "Same supplier"}</Badge>
                  <span className="text-xs tabular-nums w-20 text-right shrink-0">{money(x.incGstCents)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="items-center">
          {picked.size > 0 && <span className="text-xs text-muted-foreground mr-auto">{picked.size} selected · {money(total)}</span>}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!picked.size || link.isPending} onClick={() => link.mutate()} data-testid="button-link-bills">
            {link.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
            Link {picked.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
