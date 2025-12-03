import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  FileText,
  Paperclip,
  Circle,
  Mail,
  Copy,
  ChevronDown,
  Search,
  DollarSign,
  Calendar,
  Building2,
  LayoutList,
} from "lucide-react";
import { type Bill, type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid", label: "Paid" },
];

export default function Bills() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const statusFromUrl = searchParams.get("status") || "all";
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Bills" });

  const [selectedStatus, setSelectedStatus] = useState<string>(statusFromUrl);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [setupInstructionsOpen, setSetupInstructionsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhases, setSelectedPhases] = useState<string[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    setSelectedStatus(statusFromUrl);
  }, [statusFromUrl]);

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/bills?${queryString}` : "/api/bills";
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

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  const getSupplierName = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier?.name || "Unknown Supplier";
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

  // Get project's system phase for filtering
  const getProjectPhase = (projId: string): string => {
    const project = projects.find((p) => p.id === projId);
    return project?.currentSystemPhase || "lead";
  };

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      if (selectedStatus !== "all" && bill.status !== selectedStatus) {
        return false;
      }
      if (searchTerm) {
        const supplier = suppliers.find(s => s.id === bill.supplierId);
        const project = projects.find(p => p.id === bill.projectId);
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          bill.billNumber?.toLowerCase().includes(searchLower) ||
          bill.billReference?.toLowerCase().includes(searchLower) ||
          supplier?.name?.toLowerCase().includes(searchLower) ||
          project?.name?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      // Phase filter
      if (selectedPhases.length > 0) {
        const projectPhase = getProjectPhase(bill.projectId);
        if (!selectedPhases.includes(projectPhase)) return false;
      }
      return true;
    });
  }, [bills, selectedStatus, searchTerm, suppliers, projects, selectedPhases]);

  const statusCounts = useMemo(() => {
    return {
      all: bills.length,
      draft: bills.filter((b) => b.status === "draft").length,
      awaiting_approval: bills.filter((b) => b.status === "awaiting_approval").length,
      awaiting_payment: bills.filter((b) => b.status === "awaiting_payment").length,
      paid: bills.filter((b) => b.status === "paid").length,
    };
  }, [bills]);

  const statusTotals = useMemo(() => {
    const totals = {
      draft: 0,
      awaiting_approval: 0,
      awaiting_payment: 0,
      paid: 0,
    };

    bills.forEach((bill) => {
      const amount = bill.total / 100;
      if (bill.status === "draft") {
        totals.draft += amount;
      } else if (bill.status === "awaiting_approval") {
        totals.awaiting_approval += amount;
      } else if (bill.status === "awaiting_payment") {
        totals.awaiting_payment += amount;
      } else if (bill.status === "paid") {
        totals.paid += amount;
      }
    });

    return totals;
  }, [bills]);

  const getStatusBadge = (status: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "h-4 px-1.5 text-[10px]" : "";
    
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className={sizeClass} data-testid={`badge-status-draft`}>Draft</Badge>;
      case "awaiting_approval":
        return <Badge variant="destructive" className={sizeClass} data-testid={`badge-status-awaiting-approval`}>Awaiting Approval</Badge>;
      case "awaiting_payment":
        return <Badge variant="default" className={sizeClass} data-testid={`badge-status-awaiting-payment`}>Awaiting Payment</Badge>;
      case "paid":
        return <Badge variant="outline" className={`border-green-500 text-green-700 ${sizeClass}`} data-testid={`badge-status-paid`}>Paid</Badge>;
      default:
        return <Badge variant="outline" className={sizeClass} data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBills(new Set(filteredBills.map((b) => b.id)));
    } else {
      setSelectedBills(new Set());
    }
  };

  const handleSelectBill = (billId: string, checked: boolean) => {
    const newSelected = new Set(selectedBills);
    if (checked) {
      newSelected.add(billId);
    } else {
      newSelected.delete(billId);
    }
    setSelectedBills(newSelected);
  };

  const handleRowClick = (billId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/bills/${billId}`);
    } else {
      setLocation(`/bills/${billId}`);
    }
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    const params = new URLSearchParams();
    if (status !== "all") {
      params.set("status", status);
    }
    if (projectIdFromUrl) {
      params.set("projectId", projectIdFromUrl);
    }
    const queryString = params.toString();
    setLocation(queryString ? `/bills?${queryString}` : "/bills");
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/email-invoice`;

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copied to clipboard",
      description: "Webhook URL has been copied to your clipboard.",
    });
  };

  return (
    <div className="flex flex-col h-full" data-testid="page-bills">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-bill-count">
            {filteredBills.length} bills
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-email-setup"
              >
                <Mail className="w-3 h-3" />
                <span>Email Setup</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="max-w-[min(500px,90vw)] w-full" align="end" data-testid="popover-email-setup">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold mb-1 text-sm" data-testid="text-email-to-bill-heading">
                    Email-to-Bill Feature
                  </h3>
                  <p className="text-xs text-muted-foreground" data-testid="text-email-to-bill-description">
                    Forward invoices to auto-create bills
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-xs flex-1 h-7"
                    data-testid="input-webhook-url"
                  />
                  <button
                    className="h-6 w-6 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                    onClick={handleCopyWebhookUrl}
                    data-testid="button-copy-webhook-url"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>

                <Collapsible
                  open={setupInstructionsOpen}
                  onOpenChange={setSetupInstructionsOpen}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      data-testid="button-toggle-setup-instructions"
                    >
                      Setup Instructions
                      <ChevronDown className={`h-3 w-3 transition-transform ${setupInstructionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3" data-testid="content-setup-instructions">
                    <div className="space-y-3 text-xs">
                      <div>
                        <h4 className="font-semibold mb-1" data-testid="text-sendgrid-heading">
                          For SendGrid Inbound Parse:
                        </h4>
                        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                          <li>Go to SendGrid → Settings → Inbound Parse</li>
                          <li>Add your domain and set the URL to the webhook</li>
                          <li>Forward invoices to your configured email address</li>
                        </ol>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-1" data-testid="text-manual-testing-heading">
                          For manual testing:
                        </h4>
                        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                          <li>Use tools like Postman to POST to the webhook</li>
                          <li>Include email data with attachments in SendGrid format</li>
                        </ol>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </PopoverContent>
          </Popover>

          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setLocation("/bills/new")}
            data-testid="button-create-bill"
          >
            <Plus className="w-3 h-3" />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Filters & Search (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* View indicator */}
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
              placeholder="Search bills..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="bills-search-input"
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
                    key={status.key}
                    onClick={() => handleStatusChange(status.key)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${
                      selectedStatus === status.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-status-${status.key}`}
                  >
                    <span>{status.label}</span>
                    {statusCounts[status.key as keyof typeof statusCounts] > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {statusCounts[status.key as keyof typeof statusCounts]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Phase Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className={`h-6 w-auto px-2 py-0 text-xs rounded-md flex items-center gap-0.5 ${
                  selectedPhases.length > 0 
                    ? "bg-[#bba7db]/10 text-[#bba7db] border border-[#bba7db]/30 font-medium" 
                    : "border hover-elevate active-elevate-2"
                }`}
                data-testid="filter-phase-popover"
              >
                <span>Phase</span>
                {selectedPhases.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {selectedPhases.length}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                {[
                  { key: "lead", name: "Lead" },
                  { key: "pre_construction", name: "Pre-Construction" },
                  { key: "construction", name: "Construction" },
                  { key: "post_construction", name: "Post-Construction" },
                  { key: "archive", name: "Archive" },
                ].map((phase) => (
                  <button
                    key={phase.key}
                    onClick={() => {
                      const newPhases = selectedPhases.includes(phase.key)
                        ? selectedPhases.filter(p => p !== phase.key)
                        : [...selectedPhases, phase.key];
                      setSelectedPhases(newPhases);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                      selectedPhases.includes(phase.key) ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-phase-${phase.key}`}
                  >
                    <Checkbox
                      checked={selectedPhases.includes(phase.key)}
                      onCheckedChange={() => {}}
                      className="pointer-events-none"
                    />
                    {phase.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Status totals summary */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span data-testid="text-total-draft">Draft: <span className="font-medium text-foreground">{formatCurrency(statusTotals.draft * 100)}</span></span>
          <span data-testid="text-total-awaiting-approval">Approval: <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_approval * 100)}</span></span>
          <span data-testid="text-total-awaiting-payment">Payment: <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_payment * 100)}</span></span>
          <span data-testid="text-total-paid">Paid: <span className="font-medium text-foreground">{formatCurrency(statusTotals.paid * 100)}</span></span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {billsLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading bills...</p>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground text-sm">
              {bills.length === 0 ? "No bills found" : "No matching bills"}
            </p>
            {bills.length === 0 && (
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={() => setLocation("/bills/new")}
                data-testid="button-add-first-bill"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Bill
              </button>
            )}
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedBills.size === filteredBills.length && filteredBills.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-xs" data-testid="header-id">ID</TableHead>
                  <TableHead className="text-xs" data-testid="header-status">Status</TableHead>
                  <TableHead className="text-xs" data-testid="header-supplier">Supplier</TableHead>
                  {!projectIdFromUrl && <TableHead className="text-xs" data-testid="header-project">Project</TableHead>}
                  <TableHead className="text-xs" data-testid="header-reference">Reference</TableHead>
                  <TableHead className="text-xs" data-testid="header-date">Date</TableHead>
                  <TableHead className="text-xs text-right" data-testid="header-total">Total</TableHead>
                  <TableHead className="text-xs text-center w-10" data-testid="header-sync">Sync</TableHead>
                  <TableHead className="text-xs text-right" data-testid="header-due">Due</TableHead>
                  <TableHead className="text-xs text-center w-10" data-testid="header-attachments">
                    <Paperclip className="h-3 w-3 inline" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((bill) => {
                  const project = getProject(bill.projectId);
                  const dueAmount = bill.total - bill.paidAmount;
                  const attachmentCount = Array.isArray(bill.attachmentUrls) ? bill.attachmentUrls.length : 0;

                  return (
                    <TableRow
                      key={bill.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleRowClick(bill.id)}
                      data-testid={`row-bill-${bill.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedBills.has(bill.id)}
                          onCheckedChange={(checked) =>
                            handleSelectBill(bill.id, checked as boolean)
                          }
                          data-testid={`checkbox-bill-${bill.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-xs" data-testid={`text-bill-number-${bill.id}`}>
                        {bill.billNumber}
                      </TableCell>
                      <TableCell data-testid={`badge-bill-status-${bill.id}`}>
                        {getStatusBadge(bill.status, "sm")}
                      </TableCell>
                      <TableCell className="text-xs" data-testid={`text-supplier-name-${bill.id}`}>
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          {getSupplierName(bill.supplierId)}
                        </div>
                      </TableCell>
                      {!projectIdFromUrl && (
                        <TableCell data-testid={`text-project-${bill.id}`}>
                          {project && (
                            <div className="flex items-center gap-1.5">
                              <ProjectIcon
                                icon={project.icon}
                                color={project.color}
                                className="w-3 h-3"
                              />
                              <span className="text-xs">{project.name}</span>
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-reference-${bill.id}`}>
                        {bill.billReference || "-"}
                      </TableCell>
                      <TableCell className="text-xs" data-testid={`text-date-${bill.id}`}>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {formatDate(bill.billDate)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-medium text-right" data-testid={`text-total-${bill.id}`}>
                        {formatCurrency(bill.total)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`icon-sync-${bill.id}`}>
                        {bill.xeroInvoiceId && (
                          <Circle className="h-3 w-3 inline fill-blue-500 text-blue-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-right" data-testid={`text-due-${bill.id}`}>
                        {formatCurrency(dueAmount)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-attachments-${bill.id}`}>
                        {attachmentCount > 0 && (
                          <div className="flex items-center justify-center gap-0.5">
                            <FileText className="h-3 w-3" />
                            <span className="text-xs">{attachmentCount}</span>
                          </div>
                        )}
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
