import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Send,
  Loader2,
  CreditCard,
} from "lucide-react";
import { type ClientInvoice, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { usePageTitle } from "@/hooks/usePageTitle";
import { format, isPast } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

const STATUS_DOT: Record<string, string> = {
  draft: "bg-muted-foreground/60",
  sent: "bg-blue-400",
  partial: "bg-amber-400",
  paid: "bg-emerald-500",
  overdue: "bg-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 text-[11px] font-medium"
      data-testid={`badge-status-${status}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", STATUS_DOT[status] || "bg-muted-foreground")} />
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

export default function ClientInvoices() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Client Invoices" });

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);

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

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const currentProject = useMemo(
    () => (projectIdFromUrl ? projects.find((p) => p.id === projectIdFromUrl) : null),
    [projects, projectIdFromUrl]
  );

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(dollars);
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (inv.invoiceNumber || "").toLowerCase().includes(q) ||
        ((inv as any).name || "").toLowerCase().includes(q) ||
        (getProject(inv.projectId)?.name || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, projects]);

  const statusCounts = useMemo(
    () =>
      STATUS_OPTIONS.reduce(
        (acc, s) => ({
          ...acc,
          [s.value]:
            s.value === "all"
              ? invoices.length
              : invoices.filter((i) => i.status === s.value).length,
        }),
        {} as Record<string, number>
      ),
    [invoices]
  );

  const summary = useMemo(() => {
    const filtered = filteredInvoices;
    const contractTotal = filtered.reduce((s, i) => s + ((i as any).lockedContractPrice || 0), 0);
    return {
      count: filtered.length,
      total: filtered.reduce((s, i) => s + i.totalAmount, 0),
      paid: filtered.reduce((s, i) => s + i.paidAmount, 0),
      balance: filtered.reduce((s, i) => s + i.balanceAmount, 0),
      contractTotal,
    };
  }, [filteredInvoices]);

  const handleRowClick = (id: string) =>
    projectIdFromUrl
      ? setLocation(`/projects/${projectIdFromUrl}/client-invoices/${id}`)
      : setLocation(`/client-invoices/${id}`);

  const handleCreateInvoice = () =>
    projectIdFromUrl
      ? setLocation(`/projects/${projectIdFromUrl}/client-invoices/new`)
      : setLocation("/client-invoices/new");

  const isDueDateOverdue = (dueDate: Date | string | null | undefined, status: string) => {
    if (!dueDate || status === "paid") return false;
    return isPast(new Date(dueDate));
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "d MMM yyyy");
  };

  const invoiced = summary.total;
  const paid = summary.paid;
  const remaining = summary.balance;
  const paidPct = invoiced > 0 ? Math.round((paid / invoiced) * 100) : 0;

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoices">
      {/* Row 1 — Title & Create */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h2>
        </div>
        <button
          className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
          onClick={handleCreateInvoice}
          data-testid="button-create-invoice"
        >
          <Plus className="w-3 h-3" />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* Row 2 — Buildenr-style summary bar */}
      <div className="h-9 bg-background flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-4">
        {/* Left — Search + Status filter */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="relative w-44">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search invoices…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 h-6 text-xs"
              data-testid="input-search"
            />
          </div>
          <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1",
                  selectedStatus !== "all" && "border-[#bba7db] text-[#bba7db] bg-[#bba7db]/5"
                )}
                data-testid="filter-status-popover"
              >
                <span>
                  {selectedStatus === "all"
                    ? "Status"
                    : STATUS_OPTIONS.find((s) => s.value === selectedStatus)?.label}
                </span>
                {selectedStatus !== "all" && (
                  <span
                    className="ml-0.5 text-[10px] text-[#bba7db] cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStatus("all");
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1.5" align="start">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSelectedStatus(opt.value);
                    setStatusPopoverOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded-md flex items-center justify-between hover-elevate",
                    selectedStatus === opt.value && "bg-[#bba7db]/10 text-[#bba7db] font-medium"
                  )}
                  data-testid={`filter-status-${opt.value}`}
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {statusCounts[opt.value] ?? 0}
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Right — summary stats */}
        {!invoicesLoading && invoices.length > 0 && (
          <div className="flex items-center gap-4 text-[11px]">
            {/* Invoices count */}
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Invoices</span>
              <span className="font-semibold tabular-nums">{summary.count}</span>
            </div>
            <div className="w-px h-5 bg-border" />
            {/* Paid % + amount */}
            <div className="flex flex-col items-end">
              <span className="text-emerald-500 font-semibold tabular-nums">{paidPct}%</span>
              <span className="text-muted-foreground tabular-nums">{formatCurrency(paid)}</span>
            </div>
            <div className="w-px h-5 bg-border" />
            {/* Invoiced */}
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Invoiced</span>
              <span className="font-semibold tabular-nums">{formatCurrency(invoiced)}</span>
            </div>
            <div className="w-px h-5 bg-border" />
            {/* Remaining */}
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Remaining</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  remaining <= 0 ? "text-emerald-600" : "text-foreground"
                )}
              >
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-2 pb-2 pt-2">
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
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={handleCreateInvoice}
                data-testid="button-add-first-invoice"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First Invoice
              </button>
            )}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 h-8">
                  <TableHead className="text-xs font-medium text-muted-foreground w-32">Invoice #</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Name</TableHead>
                  {!projectIdFromUrl && (
                    <TableHead className="text-xs font-medium text-muted-foreground">Project</TableHead>
                  )}
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Invoice Date</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Due Date</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Total</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Paid</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">Balance</TableHead>
                  <TableHead className="text-xs w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const overdue = isDueDateOverdue(invoice.dueDate, invoice.status);
                  const proj = getProject(invoice.projectId);
                  return (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer hover-elevate group h-8"
                      onClick={() => handleRowClick(invoice.id)}
                      data-testid={`row-invoice-${invoice.id}`}
                    >
                      {/* Invoice # */}
                      <TableCell className="py-1" data-testid={`cell-number-${invoice.id}`}>
                        <span className="text-xs font-medium text-foreground">
                          {invoice.invoiceNumber || (
                            <span className="text-muted-foreground italic">No number</span>
                          )}
                        </span>
                      </TableCell>

                      {/* Name */}
                      <TableCell className="py-1" data-testid={`cell-name-${invoice.id}`}>
                        <span className="text-xs text-foreground">
                          {(invoice as any).name || invoice.invoiceNumber || "-"}
                        </span>
                      </TableCell>

                      {/* Project (cross-project view only) */}
                      {!projectIdFromUrl && (
                        <TableCell className="py-1" data-testid={`cell-project-${invoice.id}`}>
                          {proj ? (
                            <div className="flex items-center gap-1.5">
                              <ProjectIcon
                                icon={proj.icon || "Briefcase"}
                                color={proj.color || "#3b82f6"}
                                className="w-3 h-3"
                              />
                              <span className="text-xs text-muted-foreground">{proj.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}

                      {/* Status */}
                      <TableCell className="py-1" data-testid={`cell-status-${invoice.id}`}>
                        <StatusBadge status={invoice.status} />
                      </TableCell>

                      {/* Invoice Date */}
                      <TableCell className="py-1 text-xs text-muted-foreground" data-testid={`cell-invoice-date-${invoice.id}`}>
                        {formatDate(invoice.invoiceDate)}
                      </TableCell>

                      {/* Due Date */}
                      <TableCell
                        className={cn(
                          "py-1 text-xs",
                          overdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}
                        data-testid={`cell-due-date-${invoice.id}`}
                      >
                        {formatDate(invoice.dueDate)}
                        {overdue && <AlertCircle className="inline ml-1 w-3 h-3 text-destructive" />}
                      </TableCell>

                      {/* Total */}
                      <TableCell className="py-1 text-xs font-medium text-right" data-testid={`cell-total-${invoice.id}`}>
                        {formatCurrency(invoice.totalAmount)}
                      </TableCell>

                      {/* Paid */}
                      <TableCell className="py-1 text-xs text-right text-emerald-600 font-medium" data-testid={`cell-paid-${invoice.id}`}>
                        {invoice.paidAmount > 0 ? formatCurrency(invoice.paidAmount) : "-"}
                      </TableCell>

                      {/* Balance */}
                      <TableCell
                        className={cn(
                          "py-1 text-xs font-medium text-right",
                          invoice.balanceAmount <= 0 ? "text-emerald-600" : ""
                        )}
                        data-testid={`cell-balance-${invoice.id}`}
                      >
                        {invoice.balanceAmount <= 0 ? "Paid" : formatCurrency(invoice.balanceAmount)}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-1 text-right" data-testid={`cell-actions-${invoice.id}`}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="h-6 w-6 rounded hover-elevate flex items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(invoice.id);
                            }}
                            data-testid={`button-view-${invoice.id}`}
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                className="h-6 w-6 rounded hover-elevate flex items-center justify-center"
                                data-testid={`button-menu-${invoice.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-testid={`menu-${invoice.id}`}>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowClick(invoice.id);
                                }}
                                data-testid={`menu-edit-${invoice.id}`}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`menu-duplicate-${invoice.id}`}>
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                data-testid={`menu-delete-${invoice.id}`}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
