/**
 * "Updates available": what has moved on since these lines were priced
 * (phase 4, shared/assemblyDrift.ts) — catalogue prices and Library recipes —
 * for the estimator to pull in, or not. Nothing reprices on its own.
 *
 * Used by the estimate (server applies) and the template grid (applies
 * client-side); both hand it plans in CENTS.
 */
import { useEffect, useMemo, useState } from "react";
import { Boxes, Loader2, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatCents } from "@shared/money";
import { describeFieldChange, type AssemblyDrift, type PriceDrift } from "@shared/assemblyDrift";

export interface DriftChoice {
  priceItemIds: string[];
  assemblyLineIds: string[];
}

const money = (c: number) => formatCents(c, { alwaysShowDecimals: true });

export function DriftReviewDialog({
  open, onOpenChange, prices, assemblies, onApply, pending, locked, focusItemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prices: PriceDrift[];
  assemblies: AssemblyDrift[];
  onApply: (choice: DriftChoice) => void;
  pending?: boolean;
  locked?: boolean;
  /** Opened from one line's marker: start with only that line ticked. */
  focusItemId?: string | null;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const all = [...assemblies.map((a) => a.itemId), ...prices.map((p) => p.itemId)];
    setTicked(new Set(focusItemId && all.includes(focusItemId) ? [focusItemId] : all));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusItemId]);

  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // A component of an assembly being updated takes the Library's cost; its
  // own price row would only be a second word on the same line.
  const updatingComponents = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assemblies) {
      if (!ticked.has(a.itemId)) continue;
      for (const c of a.components) if (c.kind !== "add") ids.add(c.lineId);
    }
    return ids;
  }, [assemblies, ticked]);

  const count = Array.from(ticked).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Updates available</DialogTitle>
          <DialogDescription>
            These lines were priced from the price list or a Library assembly that has changed since. Nothing changes until you
            update. Quantities typed by hand and lines added by hand are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
          {assemblies.length > 0 && (
            <section className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Assemblies</div>
              {assemblies.map((a) => (
                <label key={a.itemId} className="flex gap-2 items-start rounded-md border border-border p-2 cursor-pointer" data-testid={`drift-assembly-${a.itemId}`}>
                  <Checkbox checked={ticked.has(a.itemId)} onCheckedChange={() => toggle(a.itemId)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      <Boxes className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="truncate">{a.name}</span>
                      <span className="text-muted-foreground font-normal">
                        version {a.fromVersion ?? "?"} → {a.toVersion}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {a.components.map((c, n) => (
                        <li key={n}>
                          {c.kind === "add" && <><span className="text-foreground">+ {c.name}</span> — new in the Library</>}
                          {c.kind === "remove" && <><span className="text-foreground line-through">{c.name}</span> — dropped from the Library</>}
                          {c.kind === "update" && (
                            <><span className="text-foreground">{c.name}</span>: {c.changes.map((x) => describeFieldChange(x, money)).join(", ")}</>
                          )}
                        </li>
                      ))}
                      {a.inputsAdded.length > 0 && <li>New input{a.inputsAdded.length > 1 ? "s" : ""}: {a.inputsAdded.join(", ")} (at the default)</li>}
                      {a.inputsRemoved.length > 0 && <li>Input{a.inputsRemoved.length > 1 ? "s" : ""} no longer used: {a.inputsRemoved.join(", ")}</li>}
                      {a.unitType && <li>Unit → {a.unitType}</li>}
                      {a.components.length === 0 && a.inputsAdded.length === 0 && a.inputsRemoved.length === 0 && !a.unitType && (
                        <li>Nothing this line uses changed — updating just marks it current.</li>
                      )}
                    </ul>
                  </div>
                </label>
              ))}
            </section>
          )}

          {prices.length > 0 && (
            <section className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Price list</div>
              {prices.map((p) => {
                const covered = updatingComponents.has(p.itemId);
                const diff = p.afterCents - p.beforeCents;
                return (
                  <label
                    key={p.itemId}
                    className={`flex gap-2 items-center rounded-md border border-border px-2 py-1.5 cursor-pointer ${covered ? "opacity-50" : ""}`}
                    data-testid={`drift-price-${p.itemId}`}
                  >
                    <Checkbox checked={ticked.has(p.itemId)} onCheckedChange={() => toggle(p.itemId)} disabled={covered} />
                    <Tag className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs truncate flex-1">{p.name}</span>
                    {covered ? (
                      <span className="text-[11px] text-muted-foreground">updated with its assembly</span>
                    ) : (
                      <span className="text-xs tabular-nums">
                        {money(p.beforeCents)} → <span className="font-medium">{money(p.afterCents)}</span>
                        <span className={`ml-1.5 text-[11px] ${diff > 0 ? "text-coral" : "text-sage"}`}>
                          {diff > 0 ? "+" : "−"}{money(Math.abs(diff))}
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
            </section>
          )}

          {assemblies.length === 0 && prices.length === 0 && (
            <p className="text-sm text-muted-foreground">Everything is up to date.</p>
          )}
        </div>

        <DialogFooter>
          {locked && <span className="text-xs text-muted-foreground mr-auto self-center">Locked — unlock the estimate to update.</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button
            onClick={() => onApply({
              priceItemIds: prices.filter((p) => ticked.has(p.itemId) && !updatingComponents.has(p.itemId)).map((p) => p.itemId),
              assemblyLineIds: assemblies.filter((a) => ticked.has(a.itemId)).map((a) => a.itemId),
            })}
            disabled={locked || pending || count === 0}
            data-testid="button-apply-drift"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Update {count > 0 ? count : ""} line{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
