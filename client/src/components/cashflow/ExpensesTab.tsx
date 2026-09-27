import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Loader2, MoreVertical, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { BusinessExpense } from "@shared/schema";
import { FREQUENCIES, TIMES_PER_YEAR, toDateKey, type Frequency } from "@shared/cashflow";
import { EXPENSES_KEY, invalidateCashflow, money, shortDate } from "./cashflowShared";
import { SuggestionsBanner, SuggestionsPanel, useExpenseSuggestions } from "./ExpenseSuggestions";
import { PnlPanel } from "./PnlImport";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: "Once",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/** Starter groups, offered alongside the ones already in use. */
const STARTER_GROUPS = ["Premises", "People", "Vehicles", "Insurance", "Software", "Finance", "Admin", "Marketing"];
const UNGROUPED = "Uncategorised";
const groupOf = (e: Pick<BusinessExpense, "category">) => e.category?.trim() || UNGROUPED;

type RegisterRow =
  | { kind: "group"; id: string; label: string; count: number; monthlyCents: number; open: boolean }
  | { kind: "item"; id: string; e: BusinessExpense };

/** Average cost per month, for comparing items that repeat differently. */
function perMonthCents(e: Pick<BusinessExpense, "amountCents" | "frequency">): number {
  return Math.round((e.amountCents * (TIMES_PER_YEAR[e.frequency as Frequency] ?? 0)) / 12);
}

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name"),
    category: z.string().trim(),
    amountDollars: z.number({ invalid_type_error: "Enter an amount" }).min(0),
    hasGst: z.boolean(),
    frequency: z.enum(FREQUENCIES),
    nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    endDate: z.string(),
    isActive: z.boolean(),
    notes: z.string(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.nextDate, { path: ["endDate"], message: "Ends before it starts" });
type FormValues = z.infer<typeof formSchema>;

function blankForm(): FormValues {
  return {
    name: "",
    category: "",
    amountDollars: 0,
    hasGst: true,
    frequency: "monthly",
    nextDate: toDateKey(new Date())!,
    endDate: "",
    isActive: true,
    notes: "",
  };
}

function ExpenseDialog({
  open,
  expense,
  onClose,
  groupOptions,
}: {
  open: boolean;
  expense: BusinessExpense | null;
  onClose: () => void;
  /** Groups already in use, then the starters — for the Category field. */
  groupOptions: string[];
}) {
  const { toast } = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: blankForm() });

  useEffect(() => {
    if (!open) return;
    form.reset(
      expense
        ? {
            name: expense.name,
            category: expense.category ?? "",
            amountDollars: expense.amountCents / 100,
            hasGst: expense.hasGst,
            frequency: expense.frequency as Frequency,
            nextDate: expense.nextDate,
            endDate: expense.endDate ?? "",
            isActive: expense.isActive,
            notes: expense.notes ?? "",
          }
        : blankForm(),
    );
  }, [open, expense, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name: v.name,
        category: v.category || null,
        amountCents: Math.round(v.amountDollars * 100),
        hasGst: v.hasGst,
        frequency: v.frequency,
        nextDate: v.nextDate,
        endDate: v.frequency === "once" || !v.endDate ? null : v.endDate,
        isActive: v.isActive,
        notes: v.notes || null,
      };
      return expense
        ? apiRequest(`/api/cashflow/expenses/${expense.id}`, "PATCH", body)
        : apiRequest("/api/cashflow/expenses", "POST", body);
    },
    onSuccess: () => {
      invalidateCashflow();
      onClose();
    },
    onError: () => toast({ title: "Couldn't save the expense", variant: "destructive" }),
  });

  const frequency = form.watch("frequency");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add a business expense"}</DialogTitle>
          <DialogDescription>Something the business pays that isn't a job cost — rent, wages, insurance, software.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What is it?</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Yard rent" data-testid="input-expense-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="amountDollars"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Each payment ($)</FormLabel>
                    <FormControl>
                      <NumericInput
                        value={field.value}
                        min={0}
                        emptyValue={0}
                        onCommit={(v) => field.onChange(v ?? 0)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                        data-testid="input-expense-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How often</FormLabel>
                    <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v); }}>
                      <FormControl>
                        <SelectTrigger data-testid="select-expense-frequency"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="nextDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{frequency === "once" ? "Paid on" : "Next paid"}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-expense-next-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {frequency !== "once" && (
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last payment</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-expense-end-date" />
                      </FormControl>
                      <FormDescription>Leave empty if ongoing.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input {...field} list="expense-groups" placeholder="Pick a group or type a new one" autoComplete="off" data-testid="input-expense-category" />
                  </FormControl>
                  <datalist id="expense-groups">
                    {groupOptions.map((g) => <option key={g} value={g} />)}
                  </datalist>
                  <FormDescription>Expenses are grouped by this on the register and the forecast.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hasGst"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Includes GST</FormLabel>
                    <FormDescription>Off for wages, super and anything GST-free.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-expense-gst" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={save.isPending} data-testid="button-save-expense">
                {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {expense ? "Save" : "Add expense"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesTab() {
  const { toast } = useToast();
  const canAdd = usePermission("business.cashflow", "add");
  const canEdit = usePermission("business.cashflow", "edit");
  const canDelete = usePermission("business.cashflow", "delete");
  const { data: expenses = [], isLoading, error } = useQuery<BusinessExpense[]>({ queryKey: EXPENSES_KEY });
  const { data: suggestions } = useExpenseSuggestions();
  const hasPanel = !!suggestions?.suggestions.some((s) => s.status !== "accepted");
  const [dialog, setDialog] = useState<{ open: boolean; expense: BusinessExpense | null }>({ open: false, expense: null });
  const [toDelete, setToDelete] = useState<BusinessExpense | null>(null);

  const toggleActive = useMutation({
    mutationFn: (e: BusinessExpense) => apiRequest(`/api/cashflow/expenses/${e.id}`, "PATCH", { isActive: !e.isActive }),
    onSuccess: () => invalidateCashflow(),
    onError: () => toast({ title: "Couldn't save that change", variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/cashflow/expenses/${id}`, "DELETE"),
    onSuccess: () => invalidateCashflow(),
    onError: () => toast({ title: "Couldn't delete the expense", variant: "destructive" }),
  });

  const active = expenses.filter((e) => e.isActive);
  const monthly = active.reduce((s, e) => s + perMonthCents(e), 0);

  // Grouped by category: A–Z, "Uncategorised" last; soonest payment first within.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const rows = useMemo<RegisterRow[]>(() => {
    const byGroup = new Map<string, BusinessExpense[]>();
    for (const e of expenses) {
      const g = groupOf(e);
      byGroup.set(g, [...(byGroup.get(g) ?? []), e]);
    }
    const labels = Array.from(byGroup.keys()).sort((a, b) =>
      a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b),
    );
    const out: RegisterRow[] = [];
    for (const label of labels) {
      const items = byGroup.get(label)!.sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : a.name.localeCompare(b.name)));
      const open = !closed.has(label);
      out.push({
        kind: "group",
        id: `group:${label}`,
        label,
        count: items.length,
        monthlyCents: items.filter((e) => e.isActive).reduce((s, e) => s + perMonthCents(e), 0),
        open,
      });
      if (open) for (const e of items) out.push({ kind: "item", id: e.id, e });
    }
    return out;
  }, [expenses, closed]);
  const groupOptions = useMemo(() => {
    const used = Array.from(new Set(expenses.map((e) => e.category?.trim()).filter((c): c is string => !!c)));
    return [...used.sort(), ...STARTER_GROUPS.filter((g) => !used.some((u) => u.toLowerCase() === g.toLowerCase()))];
  }, [expenses]);

  const columns = useMemo<ColumnDef<RegisterRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Item",
        accessorFn: (r) => (r.kind === "group" ? r.label : r.e.name),
        cell: ({ row }) => {
          const r = row.original;
          if (r.kind === "group") {
            return (
              <div className="flex items-center gap-1.5 h-full min-w-0" data-testid={`row-expense-group-${r.label}`}>
                {r.open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                <span className="text-xs font-semibold truncate">{r.label}</span>
                <span className="text-data text-muted-foreground">{r.count}</span>
              </div>
            );
          }
          return (
            <div className="flex flex-col justify-center h-full min-w-0 py-1 pl-5">
              <span className="text-xs font-medium truncate">{r.e.name}</span>
              {r.e.xeroAccountCode && (
                <span className="text-data text-muted-foreground">
                  {r.e.source === "pnl_remainder" ? "Remainder of " : "Xero "}{r.e.xeroAccountCode}
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
        size: 240,
        meta: { defaultWidth: 240, headerLabel: "Item", flex: true } satisfies DataTableColumnMeta,
      },
      {
        id: "amount",
        header: "Amount",
        accessorFn: (r) => (r.kind === "group" ? null : r.e.amountCents),
        cell: ({ row }) => row.original.kind === "group" ? null : <span className="text-xs tabular-nums">{money(row.original.e.amountCents)}</span>,
        enableSorting: false,
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Amount" } satisfies DataTableColumnMeta,
      },
      {
        id: "frequency",
        header: "How often",
        accessorFn: (r) => (r.kind === "group" ? null : r.e.frequency),
        cell: ({ row }) => row.original.kind === "group" ? null : <span className="text-xs">{FREQUENCY_LABELS[row.original.e.frequency as Frequency] ?? row.original.e.frequency}</span>,
        enableSorting: false,
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "How often" } satisfies DataTableColumnMeta,
      },
      {
        id: "next",
        header: "Next paid",
        accessorFn: (r) => (r.kind === "group" ? null : r.e.nextDate),
        cell: ({ row }) => row.original.kind === "group" ? null : (
          <span className="text-xs">
            {shortDate(row.original.e.nextDate)}
            {row.original.e.endDate && <span className="text-muted-foreground"> → {shortDate(row.original.e.endDate)}</span>}
          </span>
        ),
        enableSorting: false,
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Next paid" } satisfies DataTableColumnMeta,
      },
      {
        id: "perMonth",
        header: "Per month",
        accessorFn: (r) => (r.kind === "group" ? r.monthlyCents : perMonthCents(r.e)),
        cell: ({ row }) =>
          row.original.kind === "group" ? (
            <span className="text-xs tabular-nums font-semibold">{money(row.original.monthlyCents)}</span>
          ) : row.original.e.frequency === "once" ? (
            <span className="text-xs text-muted-foreground">one-off</span>
          ) : (
            <span className="text-xs tabular-nums font-medium">{money(perMonthCents(row.original.e))}</span>
          ),
        enableSorting: false,
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Per month" } satisfies DataTableColumnMeta,
      },
      {
        id: "gst",
        header: "GST",
        accessorFn: (r) => (r.kind === "group" ? null : (r.e.hasGst ? 1 : 0)),
        cell: ({ row }) => row.original.kind === "group" ? null : <span className="text-xs text-muted-foreground">{row.original.e.hasGst ? "Inc GST" : "No GST"}</span>,
        enableSorting: false,
        size: 80,
        meta: { defaultWidth: 80, headerLabel: "GST" } satisfies DataTableColumnMeta,
      },
      {
        id: "status",
        header: "On forecast",
        accessorFn: (r) => (r.kind === "group" ? null : (r.e.isActive ? 1 : 0)),
        cell: ({ row }) => {
          const r = row.original;
          if (r.kind === "group") return null;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center h-full">
              <Switch
                checked={r.e.isActive}
                disabled={!canEdit}
                onCheckedChange={() => toggleActive.mutate(r.e)}
                aria-label="On the forecast"
                data-testid={`switch-expense-active-${r.e.id}`}
              />
            </div>
          );
        },
        enableSorting: false,
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "On forecast" } satisfies DataTableColumnMeta,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.kind === "group") return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button size="icon" variant="ghost" aria-label="Expense actions"><MoreVertical className="w-3 h-3" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!canEdit} onClick={() => setDialog({ open: true, expense: r.e })}>
                  <Pencil className="w-3.5 h-3.5 mr-2" />Edit
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canDelete} className="text-destructive" onClick={() => setToDelete(r.e)}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        size: 44,
        meta: { defaultWidth: 44 } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) return <p className="py-16 text-center text-sm text-muted-foreground">Couldn't load business expenses.</p>;

  const register = (
    <Card className="overflow-hidden min-w-0" data-testid="card-cashflow-expenses">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Business expenses</h3>
          <p className="text-xs text-muted-foreground">
            Everything the business pays that isn't a job cost, and when. Unpaid business bills in Morada are counted separately — set a next date after any bill you've already entered.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setDialog({ open: true, expense: null })}
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            data-testid="button-add-expense"
          >
            <Plus className="w-3.5 h-3.5" />Add expense
          </button>
        )}
      </div>
      {expenses.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No business expenses yet.</p>
          <p className="text-xs text-muted-foreground max-w-sm">Add rent, office wages, insurance and software so the forecast knows what goes out every month.</p>
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          storageKey="cashflow-expenses"
          rowKey={(r) => r.id}
          rowHeight={44}
          rowClassName={(r) => (r.kind === "group" ? "bg-muted/60 cursor-pointer" : cn(!r.e.isActive && "opacity-50"))}
          onRowClick={(r) => {
            if (r.kind === "group") toggleGroup(r.label);
            else if (canEdit) setDialog({ open: true, expense: r.e });
          }}
        />
      )}
      {expenses.length > 0 && (
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-t border-border bg-muted/40 text-xs">
        <span className="text-muted-foreground">{active.length} on the forecast</span>
        <span className="font-semibold">
          <Badge variant="secondary" className="mr-2 no-default-active-elevate">average</Badge>
          {money(monthly)} a month · {money(monthly * 12)} a year
        </span>
      </div>
      )}
      <ExpenseDialog open={dialog.open} expense={dialog.expense} groupOptions={groupOptions} onClose={() => setDialog({ open: false, expense: null })} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        description="It comes off the forecast. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <PnlPanel />
      {suggestions && <SuggestionsBanner data={suggestions} />}
      {/* Side by side only when there's room for the register's columns; otherwise the suggestions sit above it. */}
      <div className={cn("grid gap-4 items-start", hasPanel && "2xl:grid-cols-[1fr_380px]")}>
        {register}
        {suggestions && hasPanel && (
          <div className="order-first 2xl:order-none">
            <SuggestionsPanel data={suggestions} />
          </div>
        )}
      </div>
    </div>
  );
}
