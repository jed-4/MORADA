import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Link2, Loader2, Receipt, Search, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Asset } from "@shared/schema";
import { METER_UNIT, VEHICLE_COST_CATEGORIES, VEHICLE_COST_CATEGORY_LABELS, type MeterType, type VehicleCostCategory } from "@shared/assets";
import { CHIP_BUTTON, SectionHeader, errorText, money, shortDate } from "./assetsShared";
import { BookingDialog, ChargeOutJobs, rechargesKey, type RechargeResponse } from "./AssetRecharge";

interface CostLine {
  lineId: string;
  billId: string;
  billNumber: string;
  billReference: string | null;
  billDate: string;
  supplierName: string | null;
  description: string;
  incGstCents: number;
  exGstCents: number;
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
    repaymentsLast12Cents: number;
    repaymentsLast12Count: number;
    repaymentsToDateCents: number;
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

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "good" && "text-[hsl(var(--status-success-fg))]",
          tone === "bad" && "text-[hsl(var(--status-danger-fg))]",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

const FREQ_SHORT: Record<string, string> = { weekly: "week", fortnightly: "fortnight", monthly: "month" };

/**
 * Everything the asset costs, in one card, ex GST: running costs from the
 * bills already in Morada, finance repayments, and — for a charge-out asset
 * like an excavator — what it has charged to jobs against all of that.
 */
export function AssetCostsSection({ asset, canEdit }: { asset: Asset; canEdit: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<CostsResponse>({ queryKey: costsKey(asset.id) });
  const { data: recharge } = useQuery<RechargeResponse>({ queryKey: rechargesKey(asset.id), enabled: asset.chargeOut });
  const [finding, setFinding] = useState(false);
  const [booking, setBooking] = useState(false);

  const unlink = useMutation({
    mutationFn: (lineId: string) => apiRequest(`/api/assets/${asset.id}/bill-lines/${lineId}`, "DELETE"),
    onSuccess: () => invalidateCosts(asset.id),
    onError: (err) => toast({ title: errorText(err, "Couldn't unlink that line"), variant: "destructive" }),
  });

  const s = data?.summary;
  const unit = METER_UNIT[asset.meterType as MeterType] ?? "";
  const maxCategory = s ? Math.max(1, ...VEHICLE_COST_CATEGORIES.map((c) => Math.abs(s.byCategoryLast12[c] ?? 0))) : 1;
  const years = s ? Object.entries(s.byFinancialYear).sort((a, b) => b[0].localeCompare(a[0])) : [];
  const financed = !!asset.financeRepaymentCents && !!asset.financeFrequency;
  const runningLast12 = s ? s.billsLast12Cents + s.loggedLast12Cents : 0;
  const costLast12 = s ? runningLast12 + s.repaymentsLast12Cents : 0;
  const tco = s ? (s.purchaseCents ?? 0) + s.billsAllTimeCents + s.loggedAllTimeCents : 0;
  const lineCount = data?.lines.length ?? 0;

  const costSplit = s
    ? [runningLast12 ? `${money(runningLast12)} running` : null, s.repaymentsLast12Cents ? `${money(s.repaymentsLast12Cents)} repayments` : null]
        .filter(Boolean)
        .join(" · ") || "nothing linked yet"
    : undefined;
  const perUnit = s && (
    <Tile
      label={`Cost per ${unit || "unit"}`}
      value={s.costPerUnitCents != null ? `$${(s.costPerUnitCents / 100).toFixed(2)}` : "—"}
      sub={s.distanceLast12 ? `${s.distanceLast12.amount.toLocaleString("en-AU")} ${unit} in 12 months` : "needs readings a month apart"}
    />
  );
  const repaymentTile = financed && s && (
    <Tile
      label="Repayments"
      value={`${money(asset.financeRepaymentCents)}/${FREQ_SHORT[asset.financeFrequency!] ?? "period"}`}
      sub={`${money(s.repaymentsLast12Cents)} in 12 months${asset.financeEndDate ? ` · ends ${shortDate(asset.financeEndDate)}` : ""}`}
    />
  );

  return (
    <Card className="overflow-hidden min-w-0" data-testid="card-asset-costs">
      <SectionHeader icon={Receipt} title="Costs" hint="Last 12 months, ex GST">
        {canEdit && asset.chargeOut && (
          <button type="button" className={CHIP_BUTTON} onClick={() => setBooking(true)} data-testid="button-book-asset">
            <CalendarPlus className="w-3 h-3" />Book to job
          </button>
        )}
        {canEdit && (
          <button type="button" className={CHIP_BUTTON} onClick={() => setFinding(true)} data-testid="button-find-bills">
            <Search className="w-3 h-3" />Find bills
          </button>
        )}
      </SectionHeader>

      {isLoading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : error || !s ? (
        <p className="px-3 py-4 text-xs text-muted-foreground text-center">Couldn't load the costs.</p>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-3 py-2 border-b border-border">
            {asset.chargeOut ? (
              <>
                <Tile
                  label="Charged out"
                  value={recharge ? money(recharge.totalCents) : "—"}
                  sub={
                    recharge
                      ? `${recharge.days} day${recharge.days === 1 ? "" : "s"}${asset.dayRateCents ? ` at ${money(asset.dayRateCents)}` : ""}`
                      : asset.dayRateCents ? undefined : "no day rate set"
                  }
                />
                <Tile label="Cost" value={money(costLast12)} sub={costSplit} />
                <Tile
                  label="Net"
                  value={recharge ? money(recharge.totalCents - costLast12) : "—"}
                  tone={recharge && costLast12 > 0 ? (recharge.totalCents >= costLast12 ? "good" : "bad") : undefined}
                  sub={recharge && costLast12 > 0 ? `${Math.round((recharge.totalCents / costLast12) * 100)}% of its cost recovered` : undefined}
                />
                {repaymentTile || perUnit}
              </>
            ) : (
              <>
                <Tile label="Cost" value={money(costLast12)} sub={costSplit} />
                {perUnit}
                {repaymentTile || <Tile label="All bills" value={money(s.billsAllTimeCents)} sub={`${lineCount} line${lineCount === 1 ? "" : "s"}`} />}
                <Tile label="Cost of ownership" value={money(tco)} sub={s.purchaseCents != null ? `inc ${money(s.purchaseCents)} purchase` : "purchase price not set"} />
              </>
            )}
          </div>

          {asset.chargeOut && recharge && (
            <div className="border-b border-border">
              <div className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">Jobs</div>
              <ChargeOutJobs asset={asset} data={recharge} canEdit={canEdit} />
            </div>
          )}

          {lineCount === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              No bills linked yet.{canEdit ? " Find bills looks for the rego on bill lines." : ""}
            </p>
          ) : (
            <div className="grid md:grid-cols-[240px_1fr] divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="px-3 py-2 flex flex-col gap-1.5">
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
                  <li key={l.lineId} className="flex items-center gap-3 px-3 py-1.5" data-testid={`row-cost-${l.lineId}`}>
                    <span className="text-[11px] text-muted-foreground tabular-nums w-16 shrink-0">{shortDate(dateKey(l.billDate))}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{l.description || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[l.supplierName, VEHICLE_COST_CATEGORY_LABELS[l.category]].filter(Boolean).join(" · ")}
                        {" · "}
                        <a href={`/bills/${l.billId}`} className="hover:underline">{l.billReference || l.billNumber}</a>
                      </div>
                    </div>
                    <span className="text-xs tabular-nums shrink-0">{money(l.exGstCents)}</span>
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
      {asset.chargeOut && <BookingDialog asset={asset} open={booking} onClose={() => setBooking(false)} />}
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
