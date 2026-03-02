import { useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { type ClientInvoice, type Project, type Variation } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
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

const STATUS_CHIP: Record<string, string> = {
  draft:   "bg-muted text-muted-foreground border-transparent",
  sent:    "bg-blue-50   dark:bg-blue-950/60   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-800",
  partial: "bg-amber-50  dark:bg-amber-950/60  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800",
  paid:    "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  overdue: "bg-red-50    dark:bg-red-950/60    text-red-700    dark:text-red-300    border-red-200    dark:border-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", partial: "Partial", paid: "Paid", overdue: "Overdue",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-16 py-0.5 rounded text-[11px] font-medium border",
        STATUS_CHIP[status] ?? "bg-muted text-muted-foreground border-transparent"
      )}
      data-testid={`badge-status-${status}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
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

type SortDir = "asc" | "desc" | null;

const ACTIONS_WIDTH = 56; // w-14
const PROJECT_COL_WIDTH = 160;
const ROW_PADDING = 24; // px-3 both sides
const GAP = 8; // gap-2

// ── Header cell with sort + resize ────────────────────────────────────────

function HeaderCell({
  col,
  width,
  sortCol,
  sortDir,
  onSort,
  onResize,
}: {
  col: ColumnConfig;
  width: number;
  sortCol: ColumnKey | null;
  sortDir: SortDir;
  onSort: (key: ColumnKey) => void;
  onResize: (key: ColumnKey, w: number) => void;
}) {
  const isSortable = SORTABLE_COLUMNS.has(col.key);
  const isActive = sortCol === col.key;
  const dir = isActive ? sortDir : null;
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWRef = useRef(width);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWRef.current = width;

    const onMove = (mv: MouseEvent) => {
      const delta = mv.clientX - startXRef.current;
      const newW = Math.max(col.minWidth, startWRef.current + delta);
      onResize(col.key, newW);
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-0.5 select-none text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex-shrink-0 group/hdr",
        col.align === "right"  && "justify-end",
        col.align === "center" && "justify-center",
        isSortable && "cursor-pointer hover:text-foreground",
      )}
      style={{ width: `${width}px` }}
      onClick={() => isSortable && onSort(col.key)}
    >
      <span className="truncate">{col.label}</span>
      {isSortable && (
        <>
          {dir === "asc"  && <ArrowUp   className="h-2.5 w-2.5 flex-shrink-0" />}
          {dir === "desc" && <ArrowDown  className="h-2.5 w-2.5 flex-shrink-0" />}
          {!dir           && <ArrowUpDown className="h-2.5 w-2.5 flex-shrink-0 opacity-0 group-hover/hdr:opacity-40" />}
        </>
      )}
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center"
        onMouseDown={handleResizeMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cn(
          "w-0.5 h-4 rounded-full transition-colors",
          isResizing ? "bg-primary" : "bg-transparent group-hover/hdr:bg-border"
        )} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ClientInvoices() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Client Invoices" });

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery]       = useState("");
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [colPopoverOpen, setColPopoverOpen]       = useState(false);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);

  // Column widths (pixel values, keyed by ColumnKey)
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(() =>
    Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.key, c.defaultWidth])) as Record<ColumnKey, number>
  );

  // Sort state
  const [sortCol, setSortCol] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = useCallback((key: ColumnKey) => {
    setSortCol((prevCol) => {
      if (prevCol !== key) {
        setSortDir("asc");
        return key;
      }
      // Same column — cycle asc → desc → clear
      setSortDir((prevDir) => {
        if (prevDir === "asc") return "desc";
        // desc → clear: also reset sortCol
        setSortCol(null);
        return null;
      });
      return prevCol;
    });
  }, []);

  const handleResize = useCallback((key: ColumnKey, w: number) => {
    setColWidths((prev) => ({ ...prev, [key]: w }));
  }, []);

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef   = useRef<HTMLDivElement>(null);
  const syncHeaderScroll = useCallback(() => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }, []);

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
        ((inv as any).name || "").toLowerCase().includes(q) ||
        (getProject(inv.projectId)?.name || "").toLowerCase().includes(q)
      );
    });

    if (sortCol && sortDir) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        switch (sortCol) {
          case "invoice_number":
            cmp = (a.invoiceNumber || "").localeCompare(b.invoiceNumber || "");
            break;
          case "name":
            cmp = ((a as any).name || "").localeCompare((b as any).name || "");
            break;
          case "status":
            cmp = (a.status || "").localeCompare(b.status || "");
            break;
          case "invoice_date":
            cmp = new Date(a.invoiceDate ?? 0).getTime() - new Date(b.invoiceDate ?? 0).getTime();
            break;
          case "due_date":
            cmp = new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime();
            break;
          case "total":
            cmp = a.totalAmount - b.totalAmount;
            break;
          case "paid":
            cmp = a.paidAmount - b.paidAmount;
            break;
          case "due":
            cmp = a.balanceAmount - b.balanceAmount;
            break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [invoices, searchQuery, projects, sortCol, sortDir]);

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

    const contractPriceCents      = (currentProject as any)?.contractPrice ?? 0;
    const approvedVariationsTotal = projectVariations.reduce((s, v) => s + (v.totalAmount ?? 0), 0);

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

    const paidPct      = base > 0 ? Math.round((paidTotal    / base) * 100) : 0;
    const invoicedPct  = base > 0 ? Math.round((invoicedTotal / base) * 100) : 0;
    const remainingPct = base > 0 ? Math.round((balanceTotal  / base) * 100) : 0;

    return {
      count: filteredInvoices.length,
      invoicedTotal, paidTotal, balanceTotal,
      contractPriceCents, approvedVariationsTotal,
      allowancesTotal, finalizedAllowances, pendingAllowances, allowancesVariation,
      projectTotal, paidPct, invoicedPct, remainingPct,
    };
  }, [filteredInvoices, currentProject, projectVariations, projectAllowances]);

  // ── Column management ─────────────────────────────────────────────────────

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  const moveColumn = (key: ColumnKey, dir: -1 | 1) => {
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c.key === key);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => prev.map((c) => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  // Total inner width for the min-width wrapper (enables horizontal scroll)
  const totalInnerWidth = useMemo(() => {
    const colsWidth = visibleColumns.reduce((s, c) => s + colWidths[c.key], 0);
    const gapsWidth = Math.max(0, visibleColumns.length - 1) * GAP;
    const projectCol = projectIdFromUrl ? 0 : PROJECT_COL_WIDTH + GAP;
    return ROW_PADDING + colsWidth + gapsWidth + projectCol + GAP + ACTIONS_WIDTH;
  }, [visibleColumns, colWidths, projectIdFromUrl]);

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
            {(invoice as any).name || invoice.invoiceNumber || "—"}
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
      <div
        key={col.key}
        className={cn("flex items-start flex-shrink-0", alignClass)}
        style={{ width: `${colWidths[col.key]}px` }}
      >
        {content}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoices">

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
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
            onClick={handleCreateInvoice}
            data-testid="button-create-invoice"
          >
            <Plus className="w-3 h-3" />
            <span>Create Invoice</span>
          </button>
        </div>

        {/* Row 2 — Finance summary (lilac, bottom section of card) */}
        {!invoicesLoading && (
        <div className="bg-[#bba7db]/10 flex items-center px-5 py-3 gap-8 flex-wrap">

          {/* Left — total project value: big number first, label below */}
          {hasProjectContext && (
            <>
              <div className="flex flex-col">
                <span className="text-2xl font-bold tabular-nums leading-tight">
                  {formatCurrency(financials.projectTotal)}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">Total</span>
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

              <div className="w-px self-stretch bg-[#bba7db]/30 mx-1" />
            </>
          )}

          {/* Right — invoices stats: group label + compact columns, pushed to far right */}
          <div className="flex flex-col gap-1 ml-auto">
            <span className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">Invoices</span>
            <div className="flex items-end gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Paid</span>
                <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-tight">
                  {formatCurrency(financials.paidTotal)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Invoiced</span>
                <span className="text-base font-bold tabular-nums leading-tight">
                  {formatCurrency(financials.invoicedTotal)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Remaining</span>
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
              {!hasProjectContext && (
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Count</span>
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
        <div className="border border-border rounded-md bg-background">

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
                      selectedStatus !== "all" && "border-[#bba7db] text-[#bba7db] bg-[#bba7db]/5"
                    )}
                    data-testid="filter-status-popover"
                  >
                    <span>
                      {selectedStatus === "all" ? "Status" : STATUS_OPTIONS.find((s) => s.value === selectedStatus)?.label}
                    </span>
                    {selectedStatus !== "all" && (
                      <span
                        className="ml-0.5 text-[10px] text-[#bba7db] cursor-pointer"
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
                        selectedStatus === opt.value && "bg-[#bba7db]/10 text-[#bba7db] font-medium"
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
                  <PopoverContent className="w-56 p-2" align="end" data-testid="popover-columns">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 mb-2">Columns</p>
                    <div className="space-y-0.5">
                      {columns.map((col, idx) => (
                        <div key={col.key} className="flex items-center gap-2 px-1 py-1 rounded-md hover-elevate group">
                          <input
                            type="checkbox"
                            checked={col.visible}
                            disabled={col.required}
                            onChange={() => !col.required && toggleColumn(col.key)}
                            className="w-3.5 h-3.5 accent-[#bba7db] flex-shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className={cn("flex-1 text-xs", !col.visible && "text-muted-foreground/60")}>
                            {col.label}
                            {col.inactive && <span className="ml-1 text-[10px] text-muted-foreground/50 italic">soon</span>}
                          </span>
                          <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="h-3 w-4 flex items-center justify-center hover-elevate rounded disabled:opacity-20" onClick={() => moveColumn(col.key, -1)} disabled={idx === 0}>
                              <ChevronUp className="w-2.5 h-2.5 text-muted-foreground" />
                            </button>
                            <button className="h-3 w-4 flex items-center justify-center hover-elevate rounded disabled:opacity-20" onClick={() => moveColumn(col.key, 1)} disabled={idx === columns.length - 1}>
                              <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
          </div>

          {/* Table area — column header extracted for correct sticky behaviour */}

          {/* Column header row — sticky, overflow-hidden so it clips without scrollbar */}
          {!invoicesLoading && filteredInvoices.length > 0 && (
            <div
              ref={headerScrollRef}
              className="overflow-x-hidden sticky top-9 z-10 border-b border-border bg-muted/30"
            >
              <div style={{ minWidth: `${totalInnerWidth}px` }}>
                <div className="h-7 px-3 flex items-center gap-2">
                  {visibleColumns.map((col) => (
                    <HeaderCell
                      key={col.key}
                      col={col}
                      width={colWidths[col.key]}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onResize={handleResize}
                    />
                  ))}
                  {!projectIdFromUrl && (
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex-shrink-0" style={{ width: `${PROJECT_COL_WIDTH}px` }}>
                      Project
                    </div>
                  )}
                  <div className="flex-shrink-0" style={{ width: `${ACTIONS_WIDTH}px` }} />
                </div>
              </div>
            </div>
          )}

          {/* Body — scrolls horizontally; scroll position synced to header */}
          <div ref={bodyScrollRef} onScroll={syncHeaderScroll} className="overflow-x-auto">
            <div style={{ minWidth: `${totalInnerWidth}px` }}>

            {/* Body — loading / empty / rows */}
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
              <>
                {/* Data rows */}
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="min-h-[40px] px-3 flex items-center gap-2 border-b border-border/50 last:border-b-0 cursor-pointer hover-elevate group transition-all duration-100"
                    onClick={() => handleRowClick(invoice.id)}
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    {visibleColumns.map((col) => renderCell(col, invoice))}

                    {!projectIdFromUrl && (() => {
                      const proj = getProject(invoice.projectId);
                      return (
                        <div key="project" className="flex-shrink-0" style={{ width: `${PROJECT_COL_WIDTH}px` }} data-testid={`cell-project-${invoice.id}`}>
                          {proj ? (
                            <div className="flex items-center gap-1.5">
                              <ProjectIcon icon={proj.icon || "Briefcase"} color={proj.color || "#3b82f6"} className="w-3 h-3 flex-shrink-0" />
                              <span className="text-xs text-muted-foreground truncate">{proj.name}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      );
                    })()}

                    <div className="flex-shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: `${ACTIONS_WIDTH}px` }} data-testid={`cell-actions-${invoice.id}`}>
                      <button className="h-6 w-6 rounded hover-elevate flex items-center justify-center" onClick={(e) => { e.stopPropagation(); handleRowClick(invoice.id); }} data-testid={`button-view-${invoice.id}`}>
                        <Eye className="h-3 w-3" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button className="h-6 w-6 rounded hover-elevate flex items-center justify-center" data-testid={`button-menu-${invoice.id}`}>
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid={`menu-${invoice.id}`}>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRowClick(invoice.id); }} data-testid={`menu-edit-${invoice.id}`}>Edit</DropdownMenuItem>
                          <DropdownMenuItem data-testid={`menu-duplicate-${invoice.id}`}>Duplicate</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" data-testid={`menu-delete-${invoice.id}`}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </>
            )}
            </div>{/* end minWidth */}
          </div>{/* end overflow-x-auto body */}
        </div>{/* end card */}
      </div>{/* end flex-1 scroll */}
    </div>
  );
}
