import { useState, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { useLocation, useParams } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  Eye,
  MoreVertical,
  FileText,
  Loader2,
  RefreshCw,
  Columns3,
  ChevronRight,
} from "lucide-react";
import { type ClientInvoice, type Project, type Variation } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { usePageTitle } from "@/hooks/usePageTitle";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";

// ── Status chip colours ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all",     label: "All statuses" },
  { value: "draft",   label: "Draft" },
  { value: "sent",    label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid",    label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", partial: "Partial", paid: "Paid", overdue: "Overdue",
};

function StatusChip({ status }: { status: string }) {
  return <StatusBadge status={status} label={STATUS_LABEL[status]} />;
}

// ── Column configuration ───────────────────────────────────────────────────

type ColumnKey =
  | "invoice_number" | "name" | "status"
  | "invoice_date"   | "due_date" | "total" | "paid"
  | "due"            | "xero"    | "seen";

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
  required?: boolean;
  align?: "left" | "right" | "center";
  inactive?: boolean;
  defaultWidth: number;
  minWidth: number;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "invoice_number", label: "Invoice #",   visible: true,  required: true,  defaultWidth: 88,  minWidth: 60 },
  { key: "name",           label: "Name",         visible: true,  required: true,  defaultWidth: 220, minWidth: 120 },
  { key: "status",         label: "Status",       visible: true,                   defaultWidth: 80,  minWidth: 60 },
  { key: "invoice_date",   label: "Invoice Date", visible: true,                   defaultWidth: 84,  minWidth: 60 },
  { key: "due_date",       label: "Due Date",     visible: true,                   defaultWidth: 84,  minWidth: 60 },
  { key: "total",          label: "Total",        visible: true,  align: "right",  defaultWidth: 104, minWidth: 80 },
  { key: "paid",           label: "Paid",         visible: true,  align: "right",  defaultWidth: 104, minWidth: 80 },
  { key: "due",            label: "Due",          visible: true,  align: "right",  defaultWidth: 96,  minWidth: 80 },
  { key: "xero",           label: "Xero",         visible: true,  align: "center", defaultWidth: 40,  minWidth: 32 },
  { key: "seen",           label: "Seen",         visible: true,  align: "center", defaultWidth: 40,  minWidth: 32, inactive: true },
];

const SORTABLE_COLUMNS = new Set<ColumnKey>([
  "invoice_number", "name", "status", "invoice_date", "due_date", "total", "paid", "due",
]);

const ACTIONS_WIDTH = 72;
const PROJECT_COL_WIDTH = 160;

// ── Main component ─────────────────────────────────────────────────────────

export default function ClientInvoices({ embedded }: { embedded?: boolean } = {}) {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Client Invoices" });

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery]       = useState("");
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [colPopoverOpen, setColPopoverOpen]       = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) queryParams.projectId = projectIdFromUrl;
  if (selectedStatus !== "all") queryParams.status = selectedStatus;

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/client-invoices", queryParams],
    queryFn: async () => {
      const qs = new URLSearchParams(queryParams).toString();
      const url = qs ? `/api/client-invoices?${qs}` : "/api/client-invoices";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const { data: projectVariations = [] } = useQuery<Variation[]>({
    queryKey: ["/api/variations", { projectId: projectIdFromUrl, status: "approved" }],
    enabled: !!projectIdFromUrl,
    queryFn: async () => {
      const res = await fetch(`/api/variations?projectId=${projectIdFromUrl}&status=approved`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: projectAllowances = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectIdFromUrl, "allowances"],
    enabled: !!projectIdFromUrl,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectIdFromUrl}/allowances`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentProject = useMemo(
    () => (projectIdFromUrl ? projects.find((p) => p.id === projectIdFromUrl) : null),
    [projects, projectIdFromUrl]
  );

  // Live original contract price (inc-GST cents) from the selected estimate,
  // not the stamped project.contractPrice snapshot. Only relevant when scoped
  // to a single project.
  const { data: contractMetrics } = useQuery<{ originalContractPriceIncGstCents: number }>({
    queryKey: ["/api/projects", projectIdFromUrl, "contract-metrics"],
    queryFn: () =>
      fetch(`/api/projects/${projectIdFromUrl}/contract-metrics`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!projectIdFromUrl,
  });

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-AU", {
      style: "currency", currency: "AUD",
      minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(dollars);
  };

  const isDueDateOverdue = (dueDate: Date | string | null | undefined, status: string) =>
    !(!dueDate || status === "paid") && isPast(new Date(dueDate));

  const filteredInvoices = useMemo(() => {
    let list = invoices.filter((inv) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (inv.invoiceNumber || "").toLowerCase().includes(q) ||
        (inv.name || "").toLowerCase().includes(q) ||
        (getProject(inv.projectId)?.name || "").toLowerCase().includes(q)
      );
    });

    return list;
  }, [invoices, searchQuery, projects]);

  const statusCounts = useMemo(() =>
    STATUS_OPTIONS.reduce((acc, s) => ({
      ...acc,
      [s.value]: s.value === "all" ? invoices.length : invoices.filter((i) => i.status === s.value).length,
    }), {} as Record<string, number>),
  [invoices]);

  const financials = useMemo(() => {
    const invoicedTotal = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const paidTotal     = filteredInvoices.reduce((s, i) => s + i.paidAmount, 0);
    const balanceTotal  = filteredInvoices.reduce((s, i) => s + i.balanceAmount, 0);

    // Original contract = LIVE total from the selected estimate (inc-GST cents),
    // falling back to the stamped snapshot if metrics haven't loaded.
    const contractPriceCents =
      contractMetrics?.originalContractPriceIncGstCents
      ?? (currentProject as any)?.contractPrice
      ?? 0;
    // Approved variations total (inc-GST cents) — drives the revised contract price.
    const approvedVariationsTotal = projectVariations
      .filter((v) => v.status === "approved" || v.status === "released")
      .reduce((s, v) => s + (v.totalAmount ?? 0), 0);

    const finalizedAllowances = projectAllowances
      .filter((a) => a.item?.allowanceStatus === "finalized")
      .reduce((s, a) => s + Math.round((a.item?.priceIncTax ?? 0) * (a.item?.quantity ?? 0) * 100), 0);
    const pendingAllowances = projectAllowances
      .filter((a) => a.item?.allowanceStatus !== "finalized")
      .reduce((s, a) => s + Math.round((a.item?.priceIncTax ?? 0) * (a.item?.quantity ?? 0) * 100), 0);
    const allowancesTotal    = finalizedAllowances + pendingAllowances;
    const allowancesVariation = finalizedAllowances - pendingAllowances;

    const projectTotal = contractPriceCents + approvedVariationsTotal;
    const base = projectTotal > 0 ? projectTotal : invoicedTotal;
    // Defensive net on top of the per-invoice closing-claim true-up: percentage
    // progress claims are rounded per cent, so a few stray cents can remain even
    // after trueing up. When the project is effectively fully invoiced, treat a
    // residual of a cent or two as $0.00 so it never surfaces as "To Invoice".
    const TO_INVOICE_TOLERANCE_CENTS = 5;
    const rawToInvoice = projectTotal - invoicedTotal;
    const toInvoiceTotal =
      projectTotal > 0 && Math.abs(rawToInvoice) <= TO_INVOICE_TOLERANCE_CENTS
        ? 0
        : Math.max(0, rawToInvoice);

    const paidPct      = base > 0 ? Math.round((paidTotal    / base) * 100) : 0;
    const invoicedPct  = base > 0 ? Math.round((invoicedTotal / base) * 100) : 0;
    const remainingPct = base > 0 ? Math.round((balanceTotal  / base) * 100) : 0;

    return {
      count: filteredInvoices.length,
      invoicedTotal, paidTotal, balanceTotal, toInvoiceTotal,
      contractPriceCents, approvedVariationsTotal,
      allowancesTotal, finalizedAllowances, pendingAllowances, allowancesVariation,
      projectTotal, paidPct, invoicedPct, remainingPct,
    };
  }, [filteredInvoices, currentProject, contractMetrics, projectVariations, projectAllowances]);

  // ── Column management ─────────────────────────────────────────────────────

  // (moved below renderCell — column defs are built from DEFAULT_COLUMNS + renderCell)

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleRowClick = (id: string) =>
    projectIdFromUrl
      ? setLocation(`/projects/${projectIdFromUrl}/client-invoices/${id}`)
      : setLocation(`/client-invoices/${id}`);

  const handleCreateInvoice = () =>
    projectIdFromUrl
      ? setLocation(`/projects/${projectIdFromUrl}/client-invoices/new`)
      : setLocation("/client-invoices/new");

  const hasProjectContext = !!(projectIdFromUrl && currentProject);

  // ── Date renderer — two stacked lines ─────────────────────────────────────

  const renderDate = (
    date: Date | string | null | undefined,
    overdue = false
  ) => {
    if (!date) return <span className="text-muted-foreground/40 text-xs">—</span>;
    const d = new Date(date);
    return (
      <span className={cn("text-xs tabular-nums", overdue ? "text-destructive font-medium" : "text-foreground")}>
        {format(d, "d MMM yyyy")}
      </span>
    );
  };

  // ── Cell content renderer ─────────────────────────────────────────────────

  const renderCell = (col: ColumnConfig, invoice: ClientInvoice): ReactNode => {
    const overdue = isDueDateOverdue(invoice.dueDate, invoice.status);
    const alignClass = col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "";

    let content: ReactNode;
    switch (col.key) {
      case "invoice_number":
        content = (
          <span className="text-xs font-semibold text-foreground" data-testid={`cell-number-${invoice.id}`}>
            {invoice.invoiceNumber || <span className="text-muted-foreground italic font-normal">No number</span>}
          </span>
        );
        break;
      case "name":
        content = (
          <span className="text-xs text-foreground leading-snug" data-testid={`cell-name-${invoice.id}`}>
            {invoice.name || invoice.invoiceNumber || "—"}
          </span>
        );
        break;
      case "status":
        content = <span data-testid={`cell-status-${invoice.id}`}><StatusChip status={invoice.status} /></span>;
        break;
      case "invoice_date":
        content = <div data-testid={`cell-invoice-date-${invoice.id}`}>{renderDate(invoice.invoiceDate)}</div>;
        break;
      case "due_date":
        content = <div data-testid={`cell-due-date-${invoice.id}`}>{renderDate(invoice.dueDate, overdue)}</div>;
        break;
      case "total":
        content = (
          <span className="text-xs font-medium tabular-nums" data-testid={`cell-total-${invoice.id}`}>
            {formatCurrency(invoice.totalAmount)}
          </span>
        );
        break;
      case "paid":
        content = (
          <span className="text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400" data-testid={`cell-paid-${invoice.id}`}>
            {invoice.paidAmount > 0 ? formatCurrency(invoice.paidAmount) : <span className="text-muted-foreground/40">—</span>}
          </span>
        );
        break;
      case "due":
        content = (
          <span
            className={cn("text-xs font-medium tabular-nums", invoice.balanceAmount <= 0 ? "text-emerald-600 dark:text-emerald-400" : "")}
            data-testid={`cell-due-${invoice.id}`}
          >
            {invoice.balanceAmount <= 0 ? "Paid" : formatCurrency(invoice.balanceAmount)}
          </span>
        );
        break;
      case "xero":
        content = (
          <span title="Not synced with Xero" data-testid={`cell-xero-${invoice.id}`}>
            <RefreshCw className="w-3 h-3 text-muted-foreground/30" />
          </span>
        );
        break;
      case "seen":
        content = (
          <span title="Email view tracking coming soon" data-testid={`cell-seen-${invoice.id}`}>
            <Eye className="w-3 h-3 text-muted-foreground/30" />
          </span>
        );
        break;
      default:
        content = null;
    }

    return (
      <div className={cn("flex items-center w-full", alignClass)}>
        {content}
      </div>
    );
  };

  // ── TanStack column defs ─────────────────────────────────────────────────
  const columnDefs = useMemo<ColumnDef<ClientInvoice, unknown>[]>(() => {
    const defs: ColumnDef<ClientInvoice, unknown>[] = DEFAULT_COLUMNS.map((col) => ({
      id: col.key,
      header: col.label,
      enableSorting: SORTABLE_COLUMNS.has(col.key),
      size: col.defaultWidth,
      minSize: col.minWidth,
      accessorFn: (inv) => {
        switch (col.key) {
          case "invoice_number": return inv.invoiceNumber || "";
          case "name":           return inv.name || "";
          case "status":         return inv.status || "";
          case "invoice_date":   return inv.invoiceDate ? new Date(inv.invoiceDate).getTime() : 0;
          case "due_date":       return inv.dueDate ? new Date(inv.dueDate).getTime() : 0;
          case "total":          return inv.totalAmount;
          case "paid":           return inv.paidAmount;
          case "due":            return inv.balanceAmount;
          default:               return "";
        }
      },
      cell: ({ row }) => renderCell(col, row.original),
      meta: {
        defaultWidth: col.defaultWidth,
        align: col.align,
        headerLabel: col.label,
      } satisfies DataTableColumnMeta,
    }));

    if (!projectIdFromUrl) {
      defs.push({
        id: "project",
        header: "Project",
        enableSorting: false,
        size: PROJECT_COL_WIDTH,
        minSize: 100,
        cell: ({ row }) => {
          const proj = getProject(row.original.projectId);
          if (!proj) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1.5" data-testid={`cell-project-${row.original.id}`}>
              <ProjectIcon icon={proj.icon || "Briefcase"} color={proj.color || "#3b82f6"} className="w-3 h-3 flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{proj.name}</span>
            </div>
          );
        },
        meta: { defaultWidth: PROJECT_COL_WIDTH, headerLabel: "Project" } satisfies DataTableColumnMeta,
      });
    }

    defs.push({
      id: "actions",
      header: "",
      enableSorting: false,
      size: ACTIONS_WIDTH,
      minSize: ACTIONS_WIDTH,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1" data-testid={`cell-actions-${row.original.id}`}>
          <button
            className="h-6 w-6 rounded hover-elevate flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); handleRowClick(row.original.id); }}
            data-testid={`button-view-${row.original.id}`}
          >
            <Eye className="h-3 w-3" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="h-6 w-6 rounded hover-elevate flex items-center justify-center" data-testid={`button-menu-${row.original.id}`}>
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-testid={`menu-${row.original.id}`}>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRowClick(row.original.id); }} data-testid={`menu-edit-${row.original.id}`}>Edit</DropdownMenuItem>
              <DropdownMenuItem data-testid={`menu-duplicate-${row.original.id}`}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" data-testid={`menu-delete-${row.original.id}`}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      meta: { defaultWidth: ACTIONS_WIDTH, pinned: true, align: "right", headerLabel: "Actions" } satisfies DataTableColumnMeta,
    });

    return defs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdFromUrl, projects]);

  const pickerColumns = useMemo(
    () => columnDefs
      .filter((c) => c.id !== "actions")
      .map((c) => {
        const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
        return {
          id: c.id as string,
          label: meta.headerLabel ?? (c.id as string),
          pinned: !!meta.pinned || c.id === "invoice_number" || c.id === "name",
        };
      }),
    [columnDefs],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoices">

      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {projectIdFromUrl && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Client Invoices</span>
        </div>
      )}

      {/* Unified header card — title row + finance summary */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

        {/* Row 1 — Title & Create */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold truncate" data-testid="text-page-title">
            {hasProjectContext
              ? <>{currentProject!.name} <span className="text-muted-foreground font-normal">· Client Invoices</span></>
              : pageTitle}
          </h2>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
            onClick={handleCreateInvoice}
            data-testid="button-create-invoice"
          >
            <Plus className="w-3 h-3" />
            <span>Create Invoice</span>
          </button>
        </div>

        {/* Row 2 — Finance summary (lilac, bottom section of card) */}
        {!invoicesLoading && (
        <div className="bg-primary/10 flex items-center px-5 py-3 gap-8 flex-wrap">

          {/* Left — total project value: big number first, label below */}
          {hasProjectContext && (
            <>
              <div className="flex flex-col">
                <span className="text-2xl font-bold tabular-nums leading-tight">
                  {formatCurrency(financials.projectTotal)}
                </span>
                <span className="text-table text-muted-foreground mt-0.5">Total</span>
              </div>

              {/* Middle — breakdown lines with dot separators */}
              <div className="flex flex-col gap-0.5 text-xs">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground">Contract Price</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums font-medium">
                    {financials.contractPriceCents > 0
                      ? formatCurrency(financials.contractPriceCents)
                      : <span className="text-muted-foreground/60 italic">not set</span>}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground">Variations</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">
                    {financials.approvedVariationsTotal > 0
                      ? <span className="text-emerald-600 dark:text-emerald-400">+{formatCurrency(financials.approvedVariationsTotal)}</span>
                      : <span className="text-muted-foreground/50">—</span>}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground">Allowances</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">
                    {financials.allowancesTotal === 0
                      ? <span className="text-muted-foreground/50">—</span>
                      : financials.allowancesVariation !== 0
                      ? <span className={financials.allowancesVariation > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {financials.allowancesVariation > 0 ? "+" : ""}{formatCurrency(financials.allowancesVariation)}
                        </span>
                      : <span className="text-muted-foreground">{formatCurrency(financials.allowancesTotal)}</span>}
                  </span>
                </div>
              </div>

              <div className="w-px self-stretch bg-primary/30 mx-1" />
            </>
          )}

          {/* Right — invoices stats: group label + compact columns, pushed to far right */}
          <div className="flex flex-col gap-1 ml-auto">
            <span className="text-data uppercase tracking-widest font-medium text-muted-foreground/70">Invoices</span>
            <div className="flex items-end gap-6">
              <div className="flex flex-col">
                <span className="text-data text-muted-foreground">Paid</span>
                <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-tight">
                  {formatCurrency(financials.paidTotal)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-data text-muted-foreground">Invoiced</span>
                <span className="text-base font-bold tabular-nums leading-tight">
                  {formatCurrency(financials.invoicedTotal)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-data text-muted-foreground">Outstanding</span>
                <span className={cn(
                  "text-base font-bold tabular-nums leading-tight",
                  financials.balanceTotal <= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : financials.paidTotal > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground"
                )}>
                  {formatCurrency(financials.balanceTotal)}
                </span>
              </div>
              {hasProjectContext && financials.projectTotal > 0 && (
                <div className="flex flex-col">
                  <span className="text-data text-muted-foreground">To Invoice</span>
                  <span className={cn(
                    "text-base font-bold tabular-nums leading-tight",
                    financials.toInvoiceTotal === 0
                      ? "text-muted-foreground/60"
                      : "text-foreground"
                  )}>
                    {formatCurrency(financials.toInvoiceTotal)}
                  </span>
                </div>
              )}
              {!hasProjectContext && (
                <div className="flex flex-col">
                  <span className="text-data text-muted-foreground">Count</span>
                  <span className="text-base font-bold tabular-nums leading-tight">{financials.count}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>{/* end unified header card */}

      {/* Content — table card with search bar as first row */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">
        <div className="border border-border rounded-md bg-background overflow-hidden">

          {/* Search / filter / columns row — full card width, never scrolls horizontally */}
          <div className="h-9 flex items-center px-3 border-b border-border/50 gap-2 bg-background sticky top-0 z-20">
              <div className="relative w-44">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Search invoices…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2 h-6 text-xs border-border/40"
                  data-testid="input-search"
                />
              </div>

              <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "h-6 px-2 text-xs border border-border/40 rounded-md hover-elevate active-elevate-2 flex items-center gap-1",
                      selectedStatus !== "all" && "border-primary text-primary bg-primary/5"
                    )}
                    data-testid="filter-status-popover"
                  >
                    <span>
                      {selectedStatus === "all" ? "Status" : STATUS_OPTIONS.find((s) => s.value === selectedStatus)?.label}
                    </span>
                    {selectedStatus !== "all" && (
                      <span
                        className="ml-0.5 text-data text-primary cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setSelectedStatus("all"); }}
                      >×</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1.5" align="start">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSelectedStatus(opt.value); setStatusPopoverOpen(false); }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center justify-between hover-elevate",
                        selectedStatus === opt.value && "bg-primary/10 text-primary font-medium"
                      )}
                      data-testid={`filter-status-${opt.value}`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{statusCounts[opt.value] ?? 0}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <div className="ml-auto">
                <Popover open={colPopoverOpen} onOpenChange={setColPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border/40 hover-elevate active-elevate-2 text-muted-foreground"
                      title="Configure columns"
                      data-testid="button-column-selector"
                    >
                      <Columns3 className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-0" align="end" data-testid="popover-columns">
                    <DataTableColumnPicker storageKey="client-invoices" columns={pickerColumns} />
                  </PopoverContent>
                </Popover>
              </div>
          </div>

          {/* Table */}
          {invoicesLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <FileText className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {invoices.length === 0 ? "No invoices yet" : "No matching invoices"}
              </p>
              {invoices.length === 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={handleCreateInvoice} data-testid="button-add-first-invoice">
                  <Plus className="w-3 h-3 mr-1" />
                  Create First Invoice
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={filteredInvoices}
              columns={columnDefs}
              storageKey="client-invoices"
              legacyConfigKey="client-invoices-column-config-v1"
              rowKey={(inv) => inv.id}
              onRowClick={(inv) => handleRowClick(inv.id)}
              rowHeight={40}
            />
          )}
        </div>{/* end card */}
      </div>{/* end flex-1 scroll */}
    </div>
  );
}
