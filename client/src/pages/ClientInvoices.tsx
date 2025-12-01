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
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  LayoutList,
  Calendar,
  DollarSign,
} from "lucide-react";
import { type ClientInvoice, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export default function ClientInvoices() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }
  if (selectedStatus !== "all") {
    queryParams.status = selectedStatus;
  }

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<ClientInvoice[]>({
    queryKey: ["/api/client-invoices", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/client-invoices?${queryString}` : "/api/client-invoices";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const currentProject = useMemo(() => {
    if (!projectIdFromUrl) return null;
    return projects.find((p) => p.id === projectIdFromUrl);
  }, [projects, projectIdFromUrl]);

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
  };

  const getStatusBadge = (status: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "h-4 px-1.5 text-[10px]" : "";
    const iconClass = size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1";
    
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" className={sizeClass} data-testid={`badge-status-draft`}>
            <FileText className={iconClass} />
            Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="default" className={sizeClass} data-testid={`badge-status-sent`}>
            <Clock className={iconClass} />
            Sent
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="outline" className={`border-yellow-500 text-yellow-700 ${sizeClass}`} data-testid={`badge-status-partial`}>
            <AlertCircle className={iconClass} />
            Partial
          </Badge>
        );
      case "paid":
        return (
          <Badge variant="outline" className={`border-green-500 text-green-700 ${sizeClass}`} data-testid={`badge-status-paid`}>
            <CheckCircle className={iconClass} />
            Paid
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive" className={sizeClass} data-testid={`badge-status-overdue`}>
            <AlertCircle className={iconClass} />
            Overdue
          </Badge>
        );
      default:
        return <Badge variant="outline" className={sizeClass} data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          invoice.invoiceNumber.toLowerCase().includes(query) ||
          getProjectName(invoice.projectId).toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [invoices, searchQuery]);

  const statusCounts = useMemo(() => {
    return {
      all: invoices.length,
      draft: invoices.filter((i) => i.status === "draft").length,
      sent: invoices.filter((i) => i.status === "sent").length,
      partial: invoices.filter((i) => i.status === "partial").length,
      paid: invoices.filter((i) => i.status === "paid").length,
      overdue: invoices.filter((i) => i.status === "overdue").length,
    };
  }, [invoices]);

  const summary = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const paid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const balance = total - paid;

    const contractPrice = invoices
      .filter((inv) => inv.invoicingMethod === "progress_payments")
      .reduce((sum, inv) => sum + inv.subtotal, 0);
    
    const variations = invoices.reduce((sum, inv) => sum + (inv.markupAmount || 0), 0);
    
    const costPlusTotal = invoices
      .filter((inv) => inv.invoicingMethod === "cost_plus")
      .reduce((sum, inv) => sum + inv.subtotal, 0);

    const paidPercent = total > 0 ? (paid / total) * 100 : 0;
    const invoicedPercent = 100;
    const remainingPercent = total > 0 ? (balance / total) * 100 : 0;

    return {
      total,
      paid,
      balance,
      contractPrice,
      variations,
      costPlusTotal,
      paidPercent,
      invoicedPercent,
      remainingPercent,
    };
  }, [invoices]);

  const handleRowClick = (invoiceId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/client-invoices/${invoiceId}`);
    } else {
      setLocation(`/client-invoices/${invoiceId}`);
    }
  };

  const handleCreateInvoice = () => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/client-invoices/new`);
    } else {
      setLocation(`/client-invoices/new`);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="page-client-invoices">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Client Invoices
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-invoice-count">
            {filteredInvoices.length} invoices
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleCreateInvoice}
            data-testid="button-create-invoice"
          >
            <Plus className="w-3 h-3" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Filters & Search (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
            data-testid="button-list-view"
          >
            <LayoutList className="w-3 h-3" />
            <span>Table</span>
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search"
            />
          </div>

          {/* Status Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-status-popover"
              >
                <span>Status</span>
                {selectedStatus !== "all" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status.value}
                    onClick={() => setSelectedStatus(status.value)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${
                      selectedStatus === status.value ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-status-${status.value}`}
                  >
                    <span>{status.label}</span>
                    {statusCounts[status.value as keyof typeof statusCounts] > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {statusCounts[status.value as keyof typeof statusCounts]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Summary totals */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span data-testid="text-summary-total">Total: <span className="font-medium text-foreground">{formatCurrency(summary.total)}</span></span>
          <span data-testid="text-summary-paid">Paid: <span className="font-medium text-green-600">{formatCurrency(summary.paid)}</span></span>
          <span data-testid="text-summary-balance">Balance: <span className="font-medium text-foreground">{formatCurrency(summary.balance)}</span></span>
        </div>
      </div>

      {/* Summary Banner - Compact */}
      <div className="flex-shrink-0 px-2 py-2">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-600 p-3 text-white" data-testid="summary-banner">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium opacity-90 mb-0.5" data-testid="text-total-label">
                  Total Amount
                </div>
                <div className="text-xl font-bold" data-testid="text-total-amount">
                  {formatCurrency(summary.total)}
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* Breakdown */}
                <div className="text-right">
                  <div className="text-[10px] font-medium opacity-90 mb-1">Breakdown</div>
                  <div className="space-y-0.5 text-xs">
                    {currentProject?.invoicingMethod === "cost_plus" ? (
                      <>
                        <div className="flex items-center justify-end gap-2">
                          <span className="opacity-90">Bills/Timesheets</span>
                          <span className="font-semibold">{formatCurrency(summary.costPlusTotal)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <span className="opacity-90">Markup</span>
                          <span className="font-semibold">{formatCurrency(summary.variations)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-end gap-2">
                          <span className="opacity-90">Contract</span>
                          <span className="font-semibold">{formatCurrency(summary.contractPrice)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <span className="opacity-90">Variations</span>
                          <span className="font-semibold">{formatCurrency(summary.variations)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4">
                  <div className="text-center" data-testid="metric-paid">
                    <div className="text-lg font-bold">{summary.paidPercent.toFixed(0)}%</div>
                    <div className="text-[10px] opacity-90">Paid</div>
                  </div>
                  <div className="text-center" data-testid="metric-invoiced">
                    <div className="text-lg font-bold">{summary.invoicedPercent.toFixed(0)}%</div>
                    <div className="text-[10px] opacity-90">Invoiced</div>
                  </div>
                  <div className="text-center" data-testid="metric-remaining">
                    <div className="text-lg font-bold">{summary.remainingPercent.toFixed(0)}%</div>
                    <div className="text-[10px] opacity-90">Remaining</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {invoicesLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground text-sm">
              {invoices.length === 0 ? "No invoices found" : "No matching invoices"}
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
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs" data-testid="table-header-id">ID</TableHead>
                  <TableHead className="text-xs" data-testid="table-header-name">Name</TableHead>
                  {!projectIdFromUrl && <TableHead className="text-xs" data-testid="table-header-project">Project</TableHead>}
                  <TableHead className="text-xs" data-testid="table-header-creation-date">Created</TableHead>
                  <TableHead className="text-xs" data-testid="table-header-due-date">Due</TableHead>
                  <TableHead className="text-xs text-right" data-testid="table-header-total">Total</TableHead>
                  <TableHead className="text-xs text-right" data-testid="table-header-paid">Paid</TableHead>
                  <TableHead className="text-xs text-right" data-testid="table-header-balance">Balance</TableHead>
                  <TableHead className="text-xs text-center w-10" data-testid="table-header-sync">Sync</TableHead>
                  <TableHead className="text-xs" data-testid="table-header-status">Status</TableHead>
                  <TableHead className="text-xs w-16" data-testid="table-header-actions"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleRowClick(invoice.id)}
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    <TableCell className="font-medium text-xs" data-testid={`cell-id-${invoice.id}`}>
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`cell-name-${invoice.id}`}>
                      Invoice {invoice.invoiceNumber}
                    </TableCell>
                    {!projectIdFromUrl && (
                      <TableCell data-testid={`cell-project-${invoice.id}`}>
                        <div className="flex items-center gap-1.5">
                          <ProjectIcon
                            icon={projects.find(p => p.id === invoice.projectId)?.icon || 'Briefcase'}
                            color={projects.find(p => p.id === invoice.projectId)?.color || '#3b82f6'}
                            className="w-3 h-3"
                          />
                          <span className="text-xs">{getProjectName(invoice.projectId)}</span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-xs" data-testid={`cell-creation-date-${invoice.id}`}>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        {formatDate(invoice.invoiceDate)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`cell-due-date-${invoice.id}`}>
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-right" data-testid={`cell-total-${invoice.id}`}>
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-right text-green-600" data-testid={`cell-paid-${invoice.id}`}>
                      {formatCurrency(invoice.paidAmount)}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-right" data-testid={`cell-balance-${invoice.id}`}>
                      {formatCurrency(invoice.balanceAmount)}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`cell-sync-${invoice.id}`}>
                      {invoice.sentDate ? (
                        <CheckCircle className="h-3 w-3 text-green-600 inline" data-testid={`icon-synced-${invoice.id}`} />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground inline" data-testid={`icon-not-synced-${invoice.id}`} />
                      )}
                    </TableCell>
                    <TableCell data-testid={`cell-status-${invoice.id}`}>
                      {getStatusBadge(invoice.status, "sm")}
                    </TableCell>
                    <TableCell data-testid={`cell-actions-${invoice.id}`}>
                      <div className="flex items-center gap-1">
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
                            <button className="h-6 w-6 rounded hover-elevate flex items-center justify-center" data-testid={`button-menu-${invoice.id}`}>
                              <MoreVertical className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-testid={`menu-${invoice.id}`}>
                            <DropdownMenuItem data-testid={`menu-edit-${invoice.id}`}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-duplicate-${invoice.id}`}>
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-delete-${invoice.id}`} className="text-destructive">
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
