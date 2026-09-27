import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { PnlProposal } from "@shared/cashflow";
import { invalidateCashflow, money, shortDate } from "./cashflowShared";

export const PNL_KEY = ["/api/cashflow/pnl"];

interface PnlOverview {
  xeroConnected: boolean;
  fromMonth?: string;
  toMonth?: string;
  proposals: PnlProposal[];
  excluded: { accountCode: string; accountName: string; yearExCents: number; reason: string }[];
  coverage?: {
    accounts: { accountCode: string; accountName: string; pnlYearExCents: number; registerYearExCents: number; gapYearExCents: number }[];
    pnlYearExCents: number;
    coveredYearExCents: number;
    percent: number;
    notOnPnlYearExCents: number;
  };
  error?: string;
}

const perMonth = (yearCents: number) => money(Math.round(yearCents / 12));
const monthLabel = (ym?: string) => (ym ? shortDate(`${ym}-01`).replace(/^1 /, "") : "");
const EVERY: Record<string, string> = { monthly: "a month", quarterly: "a quarter", yearly: "a year", fortnightly: "a fortnight", weekly: "a week", once: "once" };

async function refreshAll() {
  await Promise.all([queryClient.invalidateQueries({ queryKey: PNL_KEY }), invalidateCashflow()]);
}

/** Choose which P&L accounts become register lines. */
function ImportDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: PnlOverview }) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showExcluded, setShowExcluded] = useState(false);
  useEffect(() => {
    if (open) setPicked(new Set(data.proposals.map((p) => p.accountCode)));
  }, [open, data.proposals]);

  const run = useMutation({
    mutationFn: () => apiRequest("/api/cashflow/pnl/import", "POST", { accountCodes: Array.from(picked) }),
    onSuccess: async (res: any) => {
      await refreshAll();
      toast({ title: `${res?.count ?? picked.size} expense${(res?.count ?? picked.size) === 1 ? "" : "s"} added from the P&L` });
      onClose();
    },
    onError: (e: any) => toast({ title: e?.message?.replace(/^\d+:\s*/, "") || "Couldn't import from the P&L", variant: "destructive" }),
  });

  const byGroup = useMemo(() => {
    const m = new Map<string, PnlProposal[]>();
    for (const p of data.proposals) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return Array.from(m.entries());
  }, [data.proposals]);
  const pickedYear = data.proposals.filter((p) => picked.has(p.accountCode)).reduce((s, p) => s + p.yearExCents, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add business expenses from your P&L</DialogTitle>
          <DialogDescription>
            One line per overhead account, from {monthLabel(data.fromMonth)} to {monthLabel(data.toMonth)}. How often each is paid is read
            from last year's pattern, and GST is added back where the account pays it. Check the dates after — the P&L doesn't say which day.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border" data-testid="list-pnl-proposals">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0">
              <tr>
                <th className="w-8 px-2 py-1.5">
                  <Checkbox
                    checked={picked.size === data.proposals.length && data.proposals.length > 0}
                    onCheckedChange={(v) => setPicked(v === true ? new Set(data.proposals.map((p) => p.accountCode)) : new Set())}
                    aria-label="All accounts"
                  />
                </th>
                <th className="text-left font-medium py-1.5">Account</th>
                <th className="text-left font-medium">How it's paid</th>
                <th className="text-right font-medium">Each payment</th>
                <th className="text-right font-medium pr-3">Per month (ex GST)</th>
              </tr>
            </thead>
            <tbody>
              {byGroup.map(([group, items]) => (
                <FragmentRows key={group} group={group}>
                  {items.map((p) => (
                    <tr key={p.accountCode} className="border-t border-border/60">
                      <td className="px-2 py-1">
                        <Checkbox
                          checked={picked.has(p.accountCode)}
                          onCheckedChange={(v) => {
                            const next = new Set(picked);
                            if (v === true) next.add(p.accountCode);
                            else next.delete(p.accountCode);
                            setPicked(next);
                          }}
                          aria-label={p.name}
                          data-testid={`checkbox-pnl-${p.accountCode}`}
                        />
                      </td>
                      <td className="py-1">
                        {p.name} <span className="text-muted-foreground">{p.accountCode}</span>
                      </td>
                      <td>
                        {p.pattern}
                        <span className="text-muted-foreground"> · next {shortDate(p.nextDate)}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {money(p.amountCents)} <span className="text-muted-foreground">{EVERY[p.frequency]}</span>
                        {!p.hasGst && <span className="text-muted-foreground"> · no GST</span>}
                      </td>
                      <td className="text-right tabular-nums pr-3">{perMonth(p.yearExCents)}</td>
                    </tr>
                  ))}
                </FragmentRows>
              ))}
              {data.proposals.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Every overhead account is already in the register.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data.excluded.length > 0 && (
          <div className="text-xs">
            <button type="button" className="flex items-center gap-1 text-muted-foreground" onClick={() => setShowExcluded((v) => !v)}>
              {showExcluded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {data.excluded.length} account{data.excluded.length === 1 ? "" : "s"} left out
            </button>
            {showExcluded && (
              <ul className="mt-1 space-y-0.5 pl-4">
                {data.excluded.map((e) => (
                  <li key={e.accountCode}>
                    {e.accountName} <span className="text-muted-foreground">{e.accountCode} · {perMonth(e.yearExCents)}/mo · {e.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {picked.size} of {data.proposals.length} · {perMonth(pickedYear)} a month ex GST
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => run.mutate()} disabled={picked.size === 0 || run.isPending} data-testid="button-pnl-import">
              {run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add {picked.size}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FragmentRows({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-muted/50 border-t border-border">
        <td />
        <td colSpan={4} className="py-1 font-semibold">{group}</td>
      </tr>
      {children}
    </>
  );
}

/**
 * The register's link to the P&L: how much of the P&L's overheads the
 * register accounts for, the accounts with a gap (and a remainder line to
 * close it), and the import.
 */
export function PnlPanel() {
  const { toast } = useToast();
  const canAdd = usePermission("business.cashflow", "add");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery<PnlOverview>({ queryKey: PNL_KEY });
  const remainder = useMutation({
    mutationFn: (accountCode: string) => apiRequest("/api/cashflow/pnl/remainder", "POST", { accountCode }),
    onSuccess: refreshAll,
    onError: (e: any) => toast({ title: e?.message?.replace(/^\d+:\s*/, "") || "Couldn't add the remainder", variant: "destructive" }),
  });
  const recheck = async () => {
    await queryClient.fetchQuery({ queryKey: PNL_KEY, queryFn: () => fetch("/api/cashflow/pnl?fresh=1", { credentials: "include" }).then((r) => r.json()) });
    refetch();
  };

  if (isLoading) return null;
  if (!data?.xeroConnected) return null; // the Xero suggestions banner already says to connect
  if (data.error) {
    return <p className="text-xs text-destructive px-1" data-testid="text-pnl-error">{data.error}</p>;
  }
  const cov = data.coverage;
  const gaps = (cov?.accounts ?? []).filter((a) => a.gapYearExCents > 0).sort((a, b) => b.gapYearExCents - a.gapYearExCents);
  const over = (cov?.accounts ?? []).filter((a) => a.gapYearExCents < 0);
  const full = cov && cov.percent >= 100 && data.proposals.length === 0;

  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-2" data-testid="panel-pnl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {cov && cov.pnlYearExCents > 0 ? `${cov.percent}% of your P&L overheads accounted for` : "Build the register from your Xero P&L"}
            </p>
            <p className="text-xs text-muted-foreground">
              {cov && cov.pnlYearExCents > 0
                ? `P&L overheads ${perMonth(cov.pnlYearExCents)}/mo · register covers ${perMonth(cov.coveredYearExCents)}/mo (ex GST, ${monthLabel(data.fromMonth)}–${monthLabel(data.toMonth)})`
                : "Every overhead account on your P&L becomes a line, timed from last year's pattern."}
              {cov && cov.notOnPnlYearExCents > 0 && ` · plus ${perMonth(cov.notOnPnlYearExCents)}/mo not on the P&L (e.g. loans)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={recheck} disabled={isFetching} title="Read Xero again">
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />Re-check
          </Button>
          {canAdd && data.proposals.length > 0 && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)} data-testid="button-open-pnl-import">
              Import {data.proposals.length} from P&L
            </Button>
          )}
        </div>
      </div>
      {cov && cov.pnlYearExCents > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div className={cn("h-full", full ? "bg-status-success" : "bg-primary")} style={{ width: `${Math.min(100, cov.percent)}%` }} />
        </div>
      )}
      {(gaps.length > 0 || over.length > 0) && (
        <div className="text-xs">
          <button type="button" className="flex items-center gap-1 text-muted-foreground" onClick={() => setShowGaps((v) => !v)} data-testid="button-toggle-pnl-gaps">
            {showGaps ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {gaps.length > 0 && `${gaps.length} account${gaps.length === 1 ? "" : "s"} not fully accounted for`}
            {gaps.length > 0 && over.length > 0 && " · "}
            {over.length > 0 && `${over.length} above last year`}
          </button>
          {showGaps && (
            <ul className="mt-1 space-y-1 pl-4">
              {gaps.map((a) => (
                <li key={a.accountCode} className="flex items-center gap-2 flex-wrap">
                  <span>{a.accountName} <span className="text-muted-foreground">{a.accountCode}</span></span>
                  <span className="text-muted-foreground">{perMonth(a.gapYearExCents)}/mo not covered</span>
                  {canAdd && (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      disabled={remainder.isPending}
                      onClick={() => remainder.mutate(a.accountCode)}
                      data-testid={`button-pnl-remainder-${a.accountCode}`}
                    >
                      Add remainder
                    </button>
                  )}
                </li>
              ))}
              {over.map((a) => (
                <li key={a.accountCode}>
                  {a.accountName} <span className="text-muted-foreground">{a.accountCode} · register is {perMonth(-a.gapYearExCents)}/mo above the P&L</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {data && <ImportDialog open={dialogOpen} onClose={() => setDialogOpen(false)} data={data} />}
    </div>
  );
}
