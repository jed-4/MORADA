// The three "import into this variation" pickers, lifted out of
// VariationDetail. Each owns its own search text and in-progress selection and
// hands the parent a final list on confirm, so the editor page no longer
// carries six pieces of modal state that only these dialogs read.

import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { centsToDollars, exGstFromInc, formatCents, toNumber } from "@shared/money";
import {
  allowanceAdjustmentDescription,
  describeAllowanceUse,
  isFinalisedAllowance,
  type AllowanceUse,
} from "@shared/allowanceUsage";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";
import { queryClient } from "@/lib/queryClient";
import {
  groupAllowanceRows,
  readGroupItemsPreference,
  resolveAllowanceEstimateId,
  writeGroupItemsPreference,
} from "@/lib/allowanceView";

const headCell =
  "text-data uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2";

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-8 h-8 text-sm"
      />
    </div>
  );
}

function SelectionBox({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center",
        checked ? "bg-primary border-primary" : "border-input",
      )}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </div>
  );
}

/** Selection state that resets to the caller's current selection each time the
 *  dialog is opened, so cancelling never leaks a half-made choice. */
function useDialogSelection(open: boolean, initial: string[]) {
  const [ids, setIds] = useState<string[]>(initial);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (open) {
      setIds([...initial]);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toggle = (id: string) =>
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return { ids, toggle, search, setSearch };
}

export function ImportBillsDialog({
  open,
  onOpenChange,
  bills,
  selectedIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: any[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const { ids, toggle, search, setSearch } = useDialogSelection(open, selectedIds);

  const filtered = bills.filter((b: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.billNumber || "").toLowerCase().includes(q) ||
      (b.supplierName || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="dialog-bills">
        <DialogHeader>
          <DialogTitle>Import Bills</DialogTitle>
          <DialogDescription>Select bills to include in this variation.</DialogDescription>
        </DialogHeader>
        <SearchField value={search} onChange={setSearch} placeholder="Search by bill number or supplier..." />
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-8 py-0 px-2" />
                  <TableHead className={headCell}>Bill No.</TableHead>
                  <TableHead className={headCell}>Supplier</TableHead>
                  <TableHead className={headCell}>Date</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No bills found for this project.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((b: any) => {
                    const isChecked = ids.includes(b.id);
                    return (
                      <TableRow
                        key={b.id}
                        className="h-9 hover-elevate cursor-pointer"
                        onClick={() => toggle(b.id)}
                      >
                        <TableCell className="w-8 py-1 px-2">
                          <SelectionBox checked={isChecked} />
                        </TableCell>
                        <TableCell className="text-sm font-medium py-1 px-2">{b.billNumber}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-1 px-2">
                          {b.supplierName || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground py-1 px-2">
                          {b.billDate ? format(new Date(b.billDate), "d MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium py-1 px-2">
                          {formatCents(b.total || 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm([...ids]);
              onOpenChange(false);
            }}
          >
            Add {ids.length > 0 ? `${ids.length} ` : ""}to Variation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImportLabourDialog({
  open,
  onOpenChange,
  timesheets,
  selectedIds,
  getUserName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timesheets: any[];
  selectedIds: string[];
  getUserName: (userId: string) => string;
  onConfirm: (ids: string[]) => void;
}) {
  const { ids, toggle, search, setSearch } = useDialogSelection(open, selectedIds);

  const filtered = timesheets.filter((t: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = getUserName(t.userId).toLowerCase();
    const dateStr = t.date ? format(new Date(t.date), "d MMM yy").toLowerCase() : "";
    return name.includes(q) || dateStr.includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="dialog-labour">
        <DialogHeader>
          <DialogTitle>Import Labour</DialogTitle>
          <DialogDescription>
            Select approved timesheets to include in this variation.
          </DialogDescription>
        </DialogHeader>
        <SearchField value={search} onChange={setSearch} placeholder="Search by staff name or date..." />
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-8 py-0 px-2" />
                  <TableHead className={headCell}>Date</TableHead>
                  <TableHead className={headCell}>Staff</TableHead>
                  <TableHead className={headCell}>Status</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Hours</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No timesheets found for this project.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered
                    .filter((t: any) => t.status === "approved" || t.status === "submitted")
                    .map((t: any) => {
                      const isApproved = t.status === "approved";
                      const isChecked = ids.includes(t.id);
                      return (
                        <TableRow
                          key={t.id}
                          className={cn(
                            "h-9",
                            isApproved ? "hover-elevate cursor-pointer" : "opacity-40 cursor-not-allowed",
                          )}
                          onClick={() => {
                            if (isApproved) toggle(t.id);
                          }}
                        >
                          <TableCell className="w-8 py-1 px-2">
                            <SelectionBox checked={isChecked && isApproved} />
                          </TableCell>
                          <TableCell className="text-sm tabular-nums py-1 px-2">
                            {t.date ? format(new Date(t.date), "d MMM yy") : "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium py-1 px-2">{getUserName(t.userId)}</TableCell>
                          <TableCell className="py-1 px-2">
                            <span className="flex items-center gap-1 text-xs">
                              <div
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                  isApproved ? "bg-sage" : "bg-amber",
                                )}
                              />
                              {isApproved ? "Approved" : "Pending"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums py-1 px-2">
                            {Number(t.duration).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium py-1 px-2">
                            {formatCents(Math.round(toNumber(t.total) * 100))}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm([...ids]);
              onOpenChange(false);
            }}
            disabled={ids.length === 0}
          >
            Add {ids.length > 0 ? `${ids.length} ` : ""}to Variation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Why an allowance row can't be ticked, or null when it can. */
function allowanceBlockReason(
  a: any,
  ctx: { variationId: string | null; onThis: Set<string>; onThisDescriptions: Set<string>; statusName: string },
): string | null {
  const item = a.item;
  if (ctx.onThis.has(item.id) || ctx.onThisDescriptions.has(allowanceAdjustmentDescription(item.name))) {
    return "Already on this variation";
  }
  const other = ((a.usedOn ?? []) as AllowanceUse[]).find(
    (u) => u.kind === "variation" && u.id !== ctx.variationId,
  );
  if (other) return `On ${describeAllowanceUse(other)}`;
  if (!isFinalisedAllowance(item.allowanceStatus)) return `${ctx.statusName} — not finalised`;
  return null;
}

export function ImportAllowancesDialog({
  open,
  onOpenChange,
  projectId,
  allowances,
  variationId,
  onThisVariation,
  onThisVariationDescriptions,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null | undefined;
  allowances: any[];
  /** The variation being edited (null while it's still being created). */
  variationId: string | null;
  /** Allowances already on this variation in the editor (saved or not). */
  onThisVariation: string[];
  /** Descriptions of this variation's allowance lines — recognises lines
   *  imported before they carried a link to their allowance. */
  onThisVariationDescriptions: string[];
  onConfirm: (lines: Array<{ description: string; amount: number; sourceEstimateItemId: string }>) => void;
}) {
  const { ids, toggle, search, setSearch } = useDialogSelection(open, []);
  const [grouped, setGrouped] = useState<boolean>(() => readGroupItemsPreference());
  useEffect(() => {
    if (!open) return;
    setGrouped(readGroupItemsPreference());
    // staleTime is Infinity app-wide: refresh which allowances are finalised
    // or already used before the user picks.
    if (projectId) queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/allowances`] });
  }, [open, projectId]);
  const { getStatusInfo } = useAllowanceStatusOptions();

  // Same estimate the Allowances page is showing for this project.
  const { data: estimates = [] } = useQuery<any[]>({
    queryKey: ["/api/estimates", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/estimates?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch estimates");
      return response.json();
    },
    enabled: open && !!projectId,
  });
  const estimateId = resolveAllowanceEstimateId(projectId, estimates);
  const estimateName = estimates.find((e: any) => e.id === estimateId)?.name;

  const onThis = new Set(onThisVariation);
  const onThisDescriptions = new Set(onThisVariationDescriptions);

  const scoped = allowances.filter(
    (a: any) => !!a?.item && (!estimateId || a.item.estimateId === estimateId),
  );
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? scoped
    : scoped.filter(
        (a: any) =>
          (a.item.name || "").toLowerCase().includes(q) ||
          (a.item.description || "").toLowerCase().includes(q) ||
          (a.item.groupName || "").toLowerCase().includes(q),
      );
  const groups = groupAllowanceRows(filtered, grouped);

  const reasonFor = (a: any) =>
    allowanceBlockReason(a, {
      variationId,
      onThis,
      onThisDescriptions,
      statusName: getStatusInfo(a.item.allowanceStatus || "pending").name,
    });

  const varianceOf = (a: any): number =>
    a.variance ?? (a.actualCost || 0) - (a.item?.priceIncTax || 0);

  const confirm = () => {
    const chosen = scoped.filter((a: any) => ids.includes(a.item.id) && !reasonFor(a));
    onConfirm(
      chosen.map((a: any) => ({
        description: allowanceAdjustmentDescription(a.item.name),
        // Variance is inc-GST cents (allowance tables are inc-GST);
        // adjustment lines are stored ex-GST and taxed like any other line,
        // so strip the GST here to keep the client total equal to the variance.
        amount: centsToDollars(exGstFromInc(varianceOf(a))),
        sourceEstimateItemId: a.item.id,
      })),
    );
    onOpenChange(false);
  };

  const setView = (v: boolean) => {
    setGrouped(v);
    writeGroupItemsPreference(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="dialog-allowances">
        <DialogHeader>
          <DialogTitle>Import Allowances</DialogTitle>
          <DialogDescription>
            Select finalised allowances to add their cost difference to this variation.
            {estimateName ? ` Showing ${estimateName}, as on the Allowances page.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SearchField value={search} onChange={setSearch} placeholder="Search by name, description or group..." />
          </div>
          <div className="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Order">
            {[
              { v: true, label: "Grouped" },
              { v: false, label: "A–Z" },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setView(opt.v)}
                className={cn(
                  "px-2.5 h-7 rounded-sm",
                  grouped === opt.v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover-elevate",
                )}
                aria-pressed={grouped === opt.v}
                data-testid={`button-allowance-view-${opt.v ? "grouped" : "az"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="h-6 bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-8 py-0 px-2" />
                  <TableHead className={headCell}>Allowance</TableHead>
                  <TableHead className={cn(headCell, "w-12")}>Type</TableHead>
                  <TableHead className={headCell}>Status</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Budgeted</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Actual</TableHead>
                  <TableHead className={cn(headCell, "text-right")}>Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      {scoped.length === 0
                        ? "No allowances (PC/PS) on this project's estimate."
                        : "No allowances match your search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map(([groupName, rows]) => (
                    <Fragment key={groupName || "all"}>
                      {grouped && (
                        <TableRow className="h-7 bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium text-muted-foreground">
                            {groupName}
                            <span className="ml-1.5 text-muted-foreground/60">{rows.length}</span>
                          </TableCell>
                        </TableRow>
                      )}
                      {rows.map((a: any) => {
                        const item = a.item;
                        const reason = reasonFor(a);
                        const blocked = !!reason;
                        const isChecked = !blocked && ids.includes(item.id);
                        const budgetedCents = item.priceIncTax || 0;
                        const actualCents = a.actualCost || 0;
                        const varianceCents = varianceOf(a);
                        const status = getStatusInfo(item.allowanceStatus || "pending");
                        const finalised = isFinalisedAllowance(item.allowanceStatus);
                        return (
                          <TableRow
                            key={item.id}
                            className={cn(
                              "h-9",
                              blocked ? "opacity-40 cursor-not-allowed" : "hover-elevate cursor-pointer",
                            )}
                            onClick={() => {
                              if (!blocked) toggle(item.id);
                            }}
                            aria-disabled={blocked}
                            title={reason ?? undefined}
                            data-testid={`allowance-option-${item.id}`}
                          >
                            <TableCell className="w-8 py-1 px-2">
                              <SelectionBox checked={isChecked} />
                            </TableCell>
                            <TableCell className="py-1 px-2 max-w-[280px]">
                              <div className="text-sm font-medium truncate">{item.name}</div>
                              {reason && !reason.endsWith("not finalised") ? (
                                <div className="text-xs text-muted-foreground truncate">{reason}</div>
                              ) : item.description ? (
                                <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="py-1 px-2">
                              <Badge variant="outline" className="text-data">
                                {item.allowance === "Prime Cost" ? "PC" : "PS"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1 px-2">
                              <span className="flex items-center gap-1 text-xs whitespace-nowrap">
                                <span
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                    finalised ? "bg-sage" : "bg-amber",
                                  )}
                                />
                                {status.name}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums py-1 px-2">
                              {formatCents(budgetedCents)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums py-1 px-2">
                              {formatCents(actualCents)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-right text-sm font-medium tabular-nums py-1 px-2",
                                varianceCents > 0
                                  ? "text-status-warning"
                                  : varianceCents < 0
                                    ? "text-status-success"
                                    : "",
                              )}
                            >
                              {varianceCents > 0 ? "+" : ""}
                              {formatCents(varianceCents)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={ids.length === 0} data-testid="button-confirm-allowances">
            Add {ids.length > 0 ? `${ids.length} ` : ""}to Variation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
