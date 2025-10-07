import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [dateFilter, setDateFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");

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
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount / 100);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" data-testid={`badge-status-draft`}>
            <FileText className="w-3 h-3 mr-1" />
            Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge variant="default" data-testid={`badge-status-sent`}>
            <Clock className="w-3 h-3 mr-1" />
            Sent
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700" data-testid={`badge-status-partial`}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case "paid":
        return (
          <Badge variant="outline" className="border-green-500 text-green-700" data-testid={`badge-status-paid`}>
            <CheckCircle className="w-3 h-3 mr-1" />
            Paid
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive" data-testid={`badge-status-overdue`}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Overdue
          </Badge>
        );
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
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

  const summary = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const paid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const balance = total - paid;

    // Calculate breakdown based on invoicing method
    const contractPrice = invoices
      .filter((inv) => inv.invoicingMethod === "progress_payments")
      .reduce((sum, inv) => sum + inv.subtotal, 0);
    
    const variations = invoices.reduce((sum, inv) => sum + (inv.markupAmount || 0), 0);
    
    // For cost plus, we'd show bills/timesheets instead
    const costPlusTotal = invoices
      .filter((inv) => inv.invoicingMethod === "cost_plus")
      .reduce((sum, inv) => sum + inv.subtotal, 0);

    const paidPercent = total > 0 ? (paid / total) * 100 : 0;
    const invoicedPercent = 100; // All invoices are already invoiced
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
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-client-invoices">
      {/* Header */}
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Client Invoices
          </h1>
          <Button onClick={handleCreateInvoice} data-testid="button-create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="flex-none px-6 pt-6">
        <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-600 p-6 text-white" data-testid="summary-banner">
          <div className="relative z-10">
            <div className="mb-6">
              <div className="text-sm font-medium opacity-90 mb-2" data-testid="text-total-label">
                Total Amount
              </div>
              <div className="text-4xl font-bold" data-testid="text-total-amount">
                {formatCurrency(summary.total)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Breakdown */}
              <div>
                <div className="text-sm font-medium opacity-90 mb-3" data-testid="text-breakdown-label">
                  Breakdown
                </div>
                <div className="space-y-2">
                  {currentProject?.invoicingMethod === "cost_plus" ? (
                    <>
                      <div className="flex items-center justify-between" data-testid="breakdown-bills">
                        <span className="text-sm opacity-90">Bills/Timesheets</span>
                        <span className="font-semibold">{formatCurrency(summary.costPlusTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between" data-testid="breakdown-markup">
                        <span className="text-sm opacity-90">Markup</span>
                        <span className="font-semibold">{formatCurrency(summary.variations)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between" data-testid="breakdown-contract">
                        <span className="text-sm opacity-90">Contract Price</span>
                        <span className="font-semibold">{formatCurrency(summary.contractPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between" data-testid="breakdown-variations">
                        <span className="text-sm opacity-90">Variations</span>
                        <span className="font-semibold">{formatCurrency(summary.variations)}</span>
                      </div>
                      <div className="flex items-center justify-between" data-testid="breakdown-allowances">
                        <span className="text-sm opacity-90">Allowances Difference</span>
                        <span className="font-semibold">{formatCurrency(0)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div className="md:col-span-2">
                <div className="text-sm font-medium opacity-90 mb-3" data-testid="text-metrics-label">
                  Metrics
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div data-testid="metric-paid">
                    <div className="text-2xl font-bold">{summary.paidPercent.toFixed(0)}%</div>
                    <div className="text-sm opacity-90">Paid</div>
                    <div className="text-xs mt-1 font-medium">{formatCurrency(summary.paid)}</div>
                  </div>
                  <div data-testid="metric-invoiced">
                    <div className="text-2xl font-bold">{summary.invoicedPercent.toFixed(0)}%</div>
                    <div className="text-sm opacity-90">Invoiced</div>
                    <div className="text-xs mt-1 font-medium">{formatCurrency(summary.total)}</div>
                  </div>
                  <div data-testid="metric-remaining">
                    <div className="text-2xl font-bold">{summary.remainingPercent.toFixed(0)}%</div>
                    <div className="text-sm opacity-90">Remaining</div>
                    <div className="text-xs mt-1 font-medium">{formatCurrency(summary.balance)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-none px-6 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]" data-testid="select-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status.value} value={status.value} data-testid={`select-status-${status.value}`}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-date">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-date-all">All Dates</SelectItem>
              <SelectItem value="this-month" data-testid="select-date-this-month">This Month</SelectItem>
              <SelectItem value="last-month" data-testid="select-date-last-month">Last Month</SelectItem>
              <SelectItem value="this-year" data-testid="select-date-this-year">This Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={syncFilter} onValueChange={setSyncFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-sync">
              <SelectValue placeholder="Sync" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-sync-all">All</SelectItem>
              <SelectItem value="synced" data-testid="select-sync-synced">Synced</SelectItem>
              <SelectItem value="not-synced" data-testid="select-sync-not-synced">Not Synced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pt-6 pb-6">
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead data-testid="table-header-id">ID</TableHead>
                <TableHead data-testid="table-header-name">Name</TableHead>
                {!projectIdFromUrl && <TableHead data-testid="table-header-project">Project</TableHead>}
                <TableHead data-testid="table-header-creation-date">Creation Date</TableHead>
                <TableHead data-testid="table-header-due-date">Due Date</TableHead>
                <TableHead data-testid="table-header-total">Total</TableHead>
                <TableHead data-testid="table-header-paid">Paid</TableHead>
                <TableHead data-testid="table-header-due">Due</TableHead>
                <TableHead data-testid="table-header-sync">Sync</TableHead>
                <TableHead data-testid="table-header-status">Status</TableHead>
                <TableHead data-testid="table-header-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={projectIdFromUrl ? 10 : 11} className="text-center py-8">
                    <span className="text-muted-foreground" data-testid="text-loading">Loading invoices...</span>
                  </TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={projectIdFromUrl ? 10 : 11} className="text-center py-8">
                    <span className="text-muted-foreground" data-testid="text-no-invoices">No invoices found</span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleRowClick(invoice.id)}
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    <TableCell data-testid={`cell-id-${invoice.id}`}>
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell data-testid={`cell-name-${invoice.id}`}>
                      Invoice {invoice.invoiceNumber}
                    </TableCell>
                    {!projectIdFromUrl && (
                      <TableCell data-testid={`cell-project-${invoice.id}`}>
                        <div className="flex items-center gap-2">
                          <ProjectIcon
                            icon={projects.find(p => p.id === invoice.projectId)?.icon || 'Briefcase'}
                            color={projects.find(p => p.id === invoice.projectId)?.color || '#3b82f6'}
                            className="w-4 h-4"
                          />
                          <span>{getProjectName(invoice.projectId)}</span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell data-testid={`cell-creation-date-${invoice.id}`}>
                      {formatDate(invoice.invoiceDate)}
                    </TableCell>
                    <TableCell data-testid={`cell-due-date-${invoice.id}`}>
                      {formatDate(invoice.dueDate)}
                    </TableCell>
                    <TableCell data-testid={`cell-total-${invoice.id}`}>
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>
                    <TableCell data-testid={`cell-paid-${invoice.id}`}>
                      {formatCurrency(invoice.paidAmount)}
                    </TableCell>
                    <TableCell data-testid={`cell-balance-${invoice.id}`}>
                      {formatCurrency(invoice.balanceAmount)}
                    </TableCell>
                    <TableCell data-testid={`cell-sync-${invoice.id}`}>
                      <div className="flex items-center justify-center">
                        {invoice.sentDate ? (
                          <CheckCircle className="h-4 w-4 text-green-600" data-testid={`icon-synced-${invoice.id}`} />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" data-testid={`icon-not-synced-${invoice.id}`} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`cell-status-${invoice.id}`}>
                      {getStatusBadge(invoice.status)}
                    </TableCell>
                    <TableCell data-testid={`cell-actions-${invoice.id}`}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(invoice.id);
                          }}
                          data-testid={`button-view-${invoice.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" data-testid={`button-menu-${invoice.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
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
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
