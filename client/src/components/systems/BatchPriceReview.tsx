import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCents } from "@shared/money";
import type { BillPriceComparison, LineVerdict } from "@shared/priceList";
import type { Contact, PriceList } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, HelpCircle, CircleSlash, Check } from "lucide-react";

/** One line as the batch endpoint reports it. */
type BatchLine = {
  line: {
    lineId: string;
    description: string;
    unitPrice: number;
    billNumber: string;
    billDate: string | null;
    supplierName: string | null;
  };
  verdict: LineVerdict;
  comparison: BillPriceComparison | null;
  alreadyLinked: boolean;
  candidates: Array<{ id: string; name: string; code: string | null; score: number; reason: string }>;
};

type BatchResult = {
  results: BatchLine[];
  summary: Partial<Record<LineVerdict, number>>;
  billsScanned: number;
  linesScanned: number;
  catalogueSize: number;
};

/** Verdicts worth acting on come first; unmatched is noise until you want it. */
const VERDICT_ORDER: LineVerdict[] = ["moved", "ambiguous", "unchanged", "unmatched"];

const VERDICT_LABEL: Record<LineVerdict, string> = {
  moved: "Price changed",
  ambiguous: "Needs a decision",
  unchanged: "Price matches",
  unmatched: "Not in the price list",
};

const VERDICT_HINT: Record<LineVerdict, string> = {
  moved: "The supplier charged something other than the catalogue price.",
  ambiguous: "More than one item fits this description — pick the right one.",
  unchanged: "Charged exactly what the catalogue says. Nothing to do.",
  unmatched: "Nothing in the catalogue looks like this line.",
};

function VerdictIcon({ verdict, direction }: { verdict: LineVerdict; direction?: "up" | "down" | "same" }) {
  if (verdict === "moved") {
    return direction === "down"
      ? <TrendingDown className="h-3.5 w-3.5 text-sage" />
      : <TrendingUp className="h-3.5 w-3.5 text-coral" />;
  }
  if (verdict === "ambiguous") return <HelpCircle className="h-3.5 w-3.5 text-amber" />;
  if (verdict === "unchanged") return <Check className="h-3.5 w-3.5 text-sage" />;
  return <CircleSlash className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function BatchPriceReview({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [priceListId, setPriceListId] = useState("");
  const [supplierId, setSupplierId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<BatchResult | null>(null);
  /** Lines whose price the reviewer has accepted this run, so the row settles. */
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const { data: priceLists = [] } = useQuery<Array<PriceList & { itemCount: number }>>({
    queryKey: ['/api/price-lists'],
  });
  const { data: suppliers = [] } = useQuery<Contact[]>({
    queryKey: ['/api/contacts', 'supplier'],
    queryFn: () => apiRequest('/api/contacts?contactType=supplier', 'GET'),
  });

  const effectiveListId = priceListId || priceLists[0]?.id || "";

  const runReview = useMutation({
    mutationFn: async (): Promise<BatchResult> =>
      apiRequest('/api/price-list/review/batch', 'POST', {
        priceListId: effectiveListId,
        supplierId: supplierId === "all" ? undefined : supplierId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    onSuccess: (data) => {
      setApplied(new Set());
      setResult(data);
    },
  });

  const applyPrice = useMutation({
    mutationFn: async ({ priceListItemId, billLineItemId }: { priceListItemId: string; billLineItemId: string }) =>
      apiRequest('/api/price-list/review/apply-price', 'POST', { priceListItemId, billLineItemId }),
    onSuccess: (_data, vars) => {
      setApplied((prev) => new Set(prev).add(vars.billLineItemId));
      queryClient.invalidateQueries({ queryKey: ['/api/price-list/items'] });
    },
  });

  const moved = result?.results.filter((r) => r.verdict === "moved") ?? [];
  const totalMovement = moved.reduce((sum, r) => sum + (r.comparison?.deltaCents ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review bill prices</DialogTitle>
          <DialogDescription>
            Check what suppliers actually charged against your price list. Nothing changes
            until you accept it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Price list</label>
            <Select value={effectiveListId} onValueChange={setPriceListId}>
              <SelectTrigger className="h-8 w-48 text-xs" data-testid="select-batch-price-list">
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Supplier</label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-8 w-48 text-xs" data-testid="select-batch-supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36 text-xs" data-testid="input-batch-date-from" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36 text-xs" data-testid="input-batch-date-to" />
          </div>

          <Button
            className="h-8 bg-primary hover:bg-primary/90"
            disabled={!effectiveListId || runReview.isPending}
            onClick={() => runReview.mutate()}
            data-testid="button-run-batch-review"
          >
            {runReview.isPending
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Reading bills...</>
              : "Review bills"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!result && !runReview.isPending && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Pick a price list and run a review to see how supplier prices compare.
            </p>
          )}

          {result && (
            <div className="space-y-4 py-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p>
                  Read <span className="font-medium">{result.linesScanned}</span> line
                  {result.linesScanned === 1 ? "" : "s"} across{" "}
                  <span className="font-medium">{result.billsScanned}</span> bill
                  {result.billsScanned === 1 ? "" : "s"} against{" "}
                  <span className="font-medium">{result.catalogueSize}</span> catalogue item
                  {result.catalogueSize === 1 ? "" : "s"}.
                </p>
                {moved.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {moved.length} price{moved.length === 1 ? "" : "s"} moved, worth{" "}
                    <span className={totalMovement > 0 ? "text-coral" : "text-sage"}>
                      {totalMovement > 0 ? "+" : "−"}{formatCents(Math.abs(totalMovement))}
                    </span>{" "}
                    per unit in total.
                  </p>
                )}
              </div>

              {VERDICT_ORDER.map((verdict) => {
                const rows = result.results.filter((r) => r.verdict === verdict);
                if (!rows.length) return null;
                return (
                  <div key={verdict} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <VerdictIcon verdict={verdict} />
                      <h4 className="text-sm font-medium">{VERDICT_LABEL[verdict]}</h4>
                      <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{VERDICT_HINT[verdict]}</p>

                    <div className="rounded-md border border-border bg-card">
                      {rows.map((r, i) => (
                        <div
                          key={r.line.lineId}
                          className={`flex items-center gap-3 px-3 py-2 text-sm ${
                            i > 0 ? "border-t border-border" : ""
                          }`}
                          data-testid={`batch-row-${r.line.lineId}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{r.line.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.line.billNumber}
                              {r.line.supplierName ? ` · ${r.line.supplierName}` : ""}
                              {r.candidates[0] ? ` · ${r.candidates[0].name}` : ""}
                            </p>
                          </div>

                          {r.comparison && verdict === "moved" && (
                            <div className="flex-shrink-0 text-right tabular-nums">
                              <p className="text-xs text-muted-foreground">
                                {formatCents(r.comparison.catalogueExCents)} &rarr;{" "}
                                {formatCents(r.comparison.billExCents)}
                              </p>
                              <p className={r.comparison.direction === "up" ? "text-coral text-xs" : "text-sage text-xs"}>
                                {r.comparison.deltaCents > 0 ? "+" : "−"}
                                {formatCents(Math.abs(r.comparison.deltaCents))}
                                {r.comparison.deltaPercent !== null &&
                                  ` (${r.comparison.deltaPercent > 0 ? "+" : "−"}${Math.abs(r.comparison.deltaPercent).toFixed(1)}%)`}
                              </p>
                            </div>
                          )}

                          {verdict === "moved" && (
                            applied.has(r.line.lineId) ? (
                              <span className="flex flex-shrink-0 items-center gap-1 text-xs text-sage">
                                <Check className="h-3.5 w-3.5" />Updated
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 flex-shrink-0 text-xs"
                                disabled={!r.candidates[0] || applyPrice.isPending}
                                onClick={() => r.candidates[0] && applyPrice.mutate({
                                  priceListItemId: r.candidates[0].id,
                                  billLineItemId: r.line.lineId,
                                })}
                                data-testid={`button-accept-${r.line.lineId}`}
                              >
                                Update
                              </Button>
                            )
                          )}

                          {verdict === "ambiguous" && (
                            <span className="flex-shrink-0 text-xs text-muted-foreground">
                              {r.candidates.length} possible match{r.candidates.length === 1 ? "" : "es"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BatchPriceReview;
