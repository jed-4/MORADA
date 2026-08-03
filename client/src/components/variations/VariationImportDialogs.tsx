// The three "import into this variation" pickers, lifted out of
// VariationDetail. Each owns its own search text and in-progress selection and
// hands the parent a final list on confirm, so the editor page no longer
// carries six pieces of modal state that only these dialogs read.

import { useEffect, useState } from "react";
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
import { centsToDollars, dollarsToCents, exGstFromInc, formatCents, toNumber } from "@shared/money";

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

export function ImportAllowancesDialog({
  open,
  onOpenChange,
  allowances,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowances: any[];
  onSelect: (line: { description: string; amount: number }) => void;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const filtered = allowances.filter((a: any) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (a.item?.name || "").toLowerCase().includes(q) ||
      (a.item?.description || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-allowances">
        <DialogHeader>
          <DialogTitle>Import Project Allowances</DialogTitle>
          <DialogDescription>
            Select a finalized allowance (PC/PS item) to include the cost difference in this variation.
          </DialogDescription>
        </DialogHeader>
        <SearchField value={search} onChange={setSearch} placeholder="Search allowances..." />
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {allowances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No allowance items (PC/PS) found for this project.
            </p>
          ) : (
            filtered.map((a: any) => {
              const item = a.item;
              const budgetedCents = item?.priceIncTax || 0;
              const actualCents = a.actualCost || 0;
              // An allowance marked "not included" is now budgeted at $0, so the
              // plain variance (actual - budget) would be $0 with no spend —
              // offering nothing to credit. What the client is owed is the
              // ORIGINAL contracted amount back, as a deduction. The stash is
              // dollars inc GST (estimate_items price fields are dollars).
              const notIncludedCreditCents = item?.notIncluded
                ? -dollarsToCents(item?.notIncludedOriginalPriceIncTax ?? 0)
                : null;
              const varianceCents: number =
                notIncludedCreditCents ?? a.variance ?? actualCents - budgetedCents;
              const isOverBudget = varianceCents > 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => {
                    // Variance is inc-GST cents (allowance tables are inc-GST);
                    // adjustment lines are stored ex-GST and taxed like any
                    // other line, so strip the GST here to keep the client
                    // total equal to the variance.
                    onSelect({
                      description: item?.notIncluded
                        ? `${item.name} — not included (credit)`
                        : `${item.name} — allowance adjustment`,
                      amount: centsToDollars(exGstFromInc(varianceCents)),
                    });
                    onOpenChange(false);
                  }}
                  data-testid={`allowance-option-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      <Badge variant="outline" className="text-data flex-shrink-0">
                        {item.allowance}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Budgeted</p>
                      <p className="text-sm font-medium tabular-nums">{formatCents(budgetedCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Actual</p>
                      <p className="text-sm font-medium tabular-nums">{formatCents(actualCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Variance</p>
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          isOverBudget ? "text-status-warning" : varianceCents < 0 ? "text-status-success" : "",
                        )}
                      >
                        {varianceCents >= 0 ? "+" : ""}
                        {formatCents(varianceCents)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {item.allowanceStatus || "pending"}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
