import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCents } from "@shared/money";
import type { BillPriceComparison, LineVerdict } from "@shared/priceList";
import { Badge } from "@/components/ui/badge";
import {
  Check, CircleSlash, HelpCircle, Loader2, Plus, Sparkles, TrendingDown, TrendingUp,
} from "lucide-react";

export type BatchLine = {
  line: {
    lineId: string;
    description: string;
    unitPrice: number;
    quantity: number;
    unit: string | null;
    billNumber: string;
    billDate: string | null;
    supplierId: string | null;
    supplierName: string | null;
  };
  verdict: LineVerdict;
  comparison: BillPriceComparison | null;
  /** Set when a newer invoice already priced this item, so this bill must not win. */
  superseded: { billDate: string; billNumber: string | null } | null;
  alreadyLinked: boolean;
  candidates: Array<{ id: string; name: string; code: string | null; score: number; reason: string }>;
};

export type BatchResult = {
  results: BatchLine[];
  summary: Partial<Record<LineVerdict, number>>;
  billsScanned: number;
  linesScanned: number;
  catalogueSize: number;
  skusRead?: number;
};

type Resolution = {
  lineId: string;
  chosenItemId: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

/** Acting-on-it first; the rest is context. */
const VERDICT_ORDER: LineVerdict[] = ["moved", "ambiguous", "unmatched", "unchanged"];

const VERDICT_LABEL: Record<LineVerdict, string> = {
  moved: "Price changed",
  ambiguous: "Needs a decision",
  unmatched: "Not in the price list",
  unchanged: "Price matches",
};

const VERDICT_HINT: Record<LineVerdict, string> = {
  moved: "The supplier charged something other than your price list.",
  ambiguous: "More than one item fits — pick the right one.",
  unmatched: "Nothing in the price list looks like this. Add it and it will be matched next time.",
  unchanged: "Charged exactly what the price list says.",
};

function VerdictIcon({ verdict }: { verdict: LineVerdict }) {
  if (verdict === "moved") return <TrendingUp className="h-3.5 w-3.5 text-coral" />;
  if (verdict === "ambiguous") return <HelpCircle className="h-3.5 w-3.5 text-amber" />;
  if (verdict === "unchanged") return <Check className="h-3.5 w-3.5 text-sage" />;
  return <CircleSlash className="h-3.5 w-3.5 text-muted-foreground" />;
}

/** Chip button, matching the app's standard control tokens. */
function Chip({
  onClick, disabled, testId, children, tone = "default",
}: {
  onClick: () => void; disabled?: boolean; testId?: string;
  children: React.ReactNode; tone?: "default" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 flex-shrink-0 disabled:opacity-50 ${
        tone === "primary"
          ? "bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2"
          : "border-border/50 text-muted-foreground hover-elevate active-elevate-2"
      }`}
    >
      {children}
    </button>
  );
}

export function BillReviewResults({ result, priceListId }: { result: BatchResult; priceListId: string }) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [appliedDelta, setAppliedDelta] = useState<Map<string, BillPriceComparison>>(new Map());
  const [overview, setOverview] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const moved = result.results.filter((r) => r.verdict === "moved");
  const ambiguous = result.results.filter((r) => r.verdict === "ambiguous");
  const totalMovement = moved.reduce((sum, r) => sum + (r.comparison?.deltaCents ?? 0), 0);

  const applyPrice = useMutation({
    mutationFn: async ({ priceListItemId, billLineItemId }: { priceListItemId: string; billLineItemId: string }) =>
      apiRequest("/api/price-list/review/apply-price", "POST", { priceListItemId, billLineItemId }),
    onSuccess: (data: any, vars) => {
      setApplied((prev) => new Set(prev).add(vars.billLineItemId));
      if (data?.comparison) {
        setAppliedDelta((prev) => new Map(prev).set(vars.billLineItemId, data.comparison));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
    },
  });

  const addItem = useMutation({
    mutationFn: async (row: BatchLine) =>
      apiRequest("/api/price-list/items", "POST", {
        name: row.line.description.slice(0, 200),
        priceListId,
        costPrice: row.line.unitPrice,
        unitType: row.line.unit || "each",
        supplierId: row.line.supplierId ?? undefined,
      }),
    onSuccess: (_d, row) => {
      setAdded((prev) => new Set(prev).add(row.line.lineId));
      queryClient.invalidateQueries({ queryKey: ["/api/price-list/items"] });
    },
  });

  const resolveTail = useMutation({
    mutationFn: async (rows: BatchLine[]) =>
      apiRequest("/api/price-list/review/resolve", "POST", {
        lines: rows.map((r) => ({
          lineId: r.line.lineId,
          description: r.line.description,
          supplierName: r.line.supplierName,
          candidates: r.candidates.map((c) => ({ id: c.id })),
        })),
      }),
    onSuccess: (data: any) => {
      setAiUnavailable(data?.configured === false);
      const next = new Map<string, Resolution>();
      for (const r of (data?.resolutions ?? []) as Resolution[]) next.set(r.lineId, r);
      setResolutions(next);
    },
  });

  const summarise = useMutation({
    mutationFn: async () =>
      apiRequest("/api/price-list/review/summary", "POST", {
        billsScanned: result.billsScanned,
        linesScanned: result.linesScanned,
        counts: result.summary,
        movements: moved.map((r) => ({
          item: r.candidates[0]?.name ?? r.line.description,
          supplier: r.line.supplierName,
          fromCents: r.comparison?.catalogueExCents,
          toCents: r.comparison?.billExCents,
          percent: r.comparison?.deltaPercent,
        })),
      }),
    onSuccess: (data: any) => {
      setAiUnavailable(data?.configured === false);
      setOverview(data?.summary ?? null);
    },
  });

  const applyAll = () => {
    for (const r of moved) {
      if (!applied.has(r.line.lineId) && !r.superseded && r.candidates[0]) {
        applyPrice.mutate({ priceListItemId: r.candidates[0].id, billLineItemId: r.line.lineId });
      }
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <p>
          Read <span className="font-medium">{result.linesScanned}</span> line
          {result.linesScanned === 1 ? "" : "s"} across{" "}
          <span className="font-medium">{result.billsScanned}</span> bill
          {result.billsScanned === 1 ? "" : "s"} against{" "}
          <span className="font-medium">{result.catalogueSize}</span> price list item
          {result.catalogueSize === 1 ? "" : "s"}
          {result.skusRead ? <> · <span className="font-medium">{result.skusRead}</span> product code{result.skusRead === 1 ? "" : "s"} read from the documents</> : null}.
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

        {moved.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            {overview ? (
              <p className="flex gap-2 text-muted-foreground">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <span data-testid="text-review-overview">{overview}</span>
              </p>
            ) : (
              <Chip onClick={() => summarise.mutate()} disabled={summarise.isPending} testId="button-summarise-review">
                {summarise.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Reading…</>
                  : <><Sparkles className="h-3 w-3" />Sum this up</>}
              </Chip>
            )}
          </div>
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

              {verdict === "moved" && rows.some((r) => !applied.has(r.line.lineId)) && (
                <div className="ml-auto">
                  <Chip onClick={applyAll} disabled={applyPrice.isPending} testId="button-apply-all" tone="primary">
                    Update all
                  </Chip>
                </div>
              )}
              {verdict === "ambiguous" && (
                <div className="ml-auto">
                  <Chip onClick={() => resolveTail.mutate(ambiguous)} disabled={resolveTail.isPending} testId="button-resolve-tail">
                    {resolveTail.isPending
                      ? <><Loader2 className="h-3 w-3 animate-spin" />Reading…</>
                      : <><Sparkles className="h-3 w-3" />Work these out</>}
                  </Chip>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{VERDICT_HINT[verdict]}</p>
            {verdict === "ambiguous" && aiUnavailable && (
              <p className="text-xs text-coral">
                No Anthropic API key on this server, so these can only be sorted out by hand.
              </p>
            )}

            <div className="rounded-md border border-border">
              {rows.map((r, i) => {
                const res = resolutions.get(r.line.lineId);
                const picked = res?.chosenItemId
                  ? r.candidates.find((c) => c.id === res.chosenItemId)
                  : undefined;
                const delta = appliedDelta.get(r.line.lineId);

                return (
                  <div
                    key={r.line.lineId}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${i > 0 ? "border-t border-border" : ""}`}
                    data-testid={`review-row-${r.line.lineId}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{r.line.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.line.billNumber}
                        {r.line.supplierName ? ` · ${r.line.supplierName}` : ""}
                        {r.candidates[0] && verdict !== "unmatched" ? ` · ${r.candidates[0].name}` : ""}
                        {r.candidates[0]?.reason === "code" ? " · matched on code" : ""}
                      </p>
                    </div>

                    {verdict === "moved" && r.comparison && (
                      <div className="flex-shrink-0 text-right tabular-nums">
                        <p className="text-xs text-muted-foreground">
                          {formatCents(r.comparison.catalogueExCents)} &rarr; {formatCents(r.comparison.billExCents)}
                        </p>
                        <p className={`text-xs ${r.comparison.direction === "up" ? "text-coral" : "text-sage"}`}>
                          {r.comparison.deltaCents > 0 ? "+" : "−"}
                          {formatCents(Math.abs(r.comparison.deltaCents))}
                          {r.comparison.deltaPercent !== null &&
                            ` (${r.comparison.deltaPercent > 0 ? "+" : "−"}${Math.abs(r.comparison.deltaPercent).toFixed(1)}%)`}
                        </p>
                      </div>
                    )}

                    {verdict === "moved" && (
                      r.superseded ? (
                        <span
                          className="max-w-[40%] flex-shrink-0 text-right text-xs text-muted-foreground"
                          data-testid={`superseded-${r.line.lineId}`}
                        >
                          Superseded by a newer invoice
                          {r.superseded.billNumber ? ` (${r.superseded.billNumber})` : ""}
                        </span>
                      ) : applied.has(r.line.lineId) ? (
                        <span className="flex flex-shrink-0 items-center gap-1 text-xs text-sage">
                          <Check className="h-3.5 w-3.5" />Updated
                        </span>
                      ) : (
                        <Chip
                          onClick={() => r.candidates[0] && applyPrice.mutate({
                            priceListItemId: r.candidates[0].id, billLineItemId: r.line.lineId,
                          })}
                          disabled={!r.candidates[0] || applyPrice.isPending}
                          testId={`button-accept-${r.line.lineId}`}
                        >
                          Update
                        </Chip>
                      )
                    )}

                    {verdict === "ambiguous" && (
                      res ? (
                        picked ? (
                          <div className="flex max-w-[52%] flex-shrink-0 items-center gap-2">
                            <div className="min-w-0 text-right">
                              <p className="truncate text-xs">
                                <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                                {picked.name}
                                <span className="ml-1 text-muted-foreground">({res.confidence})</span>
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{res.reason}</p>
                              {delta && (
                                <p className={`text-xs tabular-nums ${delta.direction === "up" ? "text-coral" : "text-sage"}`}>
                                  {formatCents(delta.catalogueExCents)} &rarr; {formatCents(delta.billExCents)}
                                </p>
                              )}
                            </div>
                            {applied.has(r.line.lineId) ? (
                              <span className="flex items-center gap-1 text-xs text-sage">
                                <Check className="h-3.5 w-3.5" />Updated
                              </span>
                            ) : (
                              <Chip
                                onClick={() => applyPrice.mutate({
                                  priceListItemId: res.chosenItemId!, billLineItemId: r.line.lineId,
                                })}
                                disabled={applyPrice.isPending}
                                testId={`button-accept-ai-${r.line.lineId}`}
                              >
                                Use this
                              </Chip>
                            )}
                          </div>
                        ) : (
                          <span className="max-w-[46%] flex-shrink-0 text-right text-xs text-muted-foreground">
                            None of these — {res.reason}
                          </span>
                        )
                      ) : (
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          {r.candidates.length} possible match{r.candidates.length === 1 ? "" : "es"}
                        </span>
                      )
                    )}

                    {verdict === "unmatched" && (
                      <>
                        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatCents(r.line.unitPrice)}
                        </span>
                        {added.has(r.line.lineId) ? (
                          <span className="flex flex-shrink-0 items-center gap-1 text-xs text-sage">
                            <Check className="h-3.5 w-3.5" />Added
                          </span>
                        ) : (
                          <Chip
                            onClick={() => addItem.mutate(r)}
                            disabled={addItem.isPending || !priceListId}
                            testId={`button-add-item-${r.line.lineId}`}
                          >
                            <Plus className="h-3 w-3" />Add
                          </Chip>
                        )}
                      </>
                    )}

                    {verdict === "unchanged" && r.comparison && (
                      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatCents(r.comparison.billExCents)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BillReviewResults;
