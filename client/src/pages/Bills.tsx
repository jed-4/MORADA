import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
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
  X,
  FileText,
  Paperclip,
  Circle,
  Mail,
  Copy,
  ChevronDown,
} from "lucide-react";
import { type Bill, type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Bills() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const statusFromUrl = searchParams.get("status") || "all";
  const projectIdFromUrl = params.projectId || "";

  const [selectedStatus, setSelectedStatus] = useState<string>(statusFromUrl);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [setupInstructionsOpen, setSetupInstructionsOpen] = useState(false);
  const [filters, setFilters] = useState({
    costCode: "",
    status: "",
    type: "",
    vendor: "",
    date: "",
    invoiced: "",
    sync: "",
  });

  const { toast } = useToast();

  useEffect(() => {
    setSelectedStatus(statusFromUrl);
  }, [statusFromUrl]);

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }
  if (selectedStatus !== "all") {
    queryParams.status = selectedStatus;
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
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount / 100);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
  };

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      if (selectedStatus !== "all" && bill.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [bills, selectedStatus]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" data-testid={`badge-status-draft`}>Draft</Badge>;
      case "awaiting_approval":
        return <Badge variant="destructive" data-testid={`badge-status-awaiting-approval`}>Awaiting Approval</Badge>;
      case "awaiting_payment":
        return <Badge variant="default" data-testid={`badge-status-awaiting-payment`}>Awaiting Payment</Badge>;
      case "paid":
        return <Badge variant="outline" data-testid={`badge-status-paid`}>Paid</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
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

  const handleResetFilters = () => {
    setFilters({
      costCode: "",
      status: "",
      type: "",
      vendor: "",
      date: "",
      invoiced: "",
      sync: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  const webhookUrl = `${window.location.origin}/api/webhooks/email-invoice`;

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copied to clipboard",
      description: "Webhook URL has been copied to your clipboard.",
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-bills">
      <div className="flex-none p-6 border-b">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Bills</h1>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-email-setup">
                  <Mail className="h-4 w-4 mr-2" />
                  Email Setup
                </Button>
              </PopoverTrigger>
              <PopoverContent className="max-w-[min(500px,90vw)] w-full" align="end" data-testid="popover-email-setup">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold mb-1" data-testid="text-email-to-bill-heading">
                      Email-to-Bill Feature
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-email-to-bill-description">
                      Forward invoices to auto-create bills
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={webhookUrl}
                      readOnly
                      className="font-mono text-sm flex-1"
                      data-testid="input-webhook-url"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyWebhookUrl}
                      data-testid="button-copy-webhook-url"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <Collapsible
                    open={setupInstructionsOpen}
                    onOpenChange={setSetupInstructionsOpen}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-0 h-auto font-normal text-sm hover:bg-transparent"
                        data-testid="button-toggle-setup-instructions"
                      >
                        Setup Instructions
                        <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${setupInstructionsOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3" data-testid="content-setup-instructions">
                      <div className="space-y-4 text-sm">
                        <div>
                          <h4 className="font-semibold mb-2" data-testid="text-sendgrid-heading">
                            For SendGrid Inbound Parse:
                          </h4>
                          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                            <li data-testid="text-sendgrid-step-1">
                              Go to SendGrid → Settings → Inbound Parse
                            </li>
                            <li data-testid="text-sendgrid-step-2">
                              Add your domain and set the URL to the webhook
                            </li>
                            <li data-testid="text-sendgrid-step-3">
                              Forward invoices to your configured email address
                            </li>
                          </ol>
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2" data-testid="text-manual-testing-heading">
                            For manual testing:
                          </h4>
                          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                            <li data-testid="text-manual-step-1">
                              Use tools like Postman to POST to the webhook
                            </li>
                            <li data-testid="text-manual-step-2">
                              Include email data with attachments in SendGrid format
                            </li>
                          </ol>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </PopoverContent>
            </Popover>
            <Button onClick={() => setLocation("/bills/new")} data-testid="button-create-bill">
              <Plus className="h-4 w-4 mr-2" />
              New Bill
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        value={selectedStatus}
        onValueChange={(status) => {
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
        }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="flex-none border-b px-6">
          <TabsList className="bg-transparent border-0 p-0 h-auto gap-6" data-testid="tabs-bill-status">
            <TabsTrigger
              value="all"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-all"
            >
              All
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-all">
                {statusCounts.all}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="draft"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-draft"
            >
              Draft
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-draft">
                {statusCounts.draft}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="awaiting_approval"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-awaiting-approval"
            >
              Awaiting Approval
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-awaiting-approval">
                {statusCounts.awaiting_approval}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="awaiting_payment"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-awaiting-payment"
            >
              Awaiting Payment
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-awaiting-payment">
                {statusCounts.awaiting_payment}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="paid"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-paid"
            >
              Paid
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-paid">
                {statusCounts.paid}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-none border-b">
          <div className="flex flex-row gap-2 overflow-x-auto px-6 py-3" data-testid="container-filters">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-cost-code">
                  Cost Code
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Cost Code</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All Cost Codes</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-status">
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All Statuses</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-type">
                  Type
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All Types</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-suppliers">
                  Suppliers
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Suppliers</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All Suppliers</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-date">
                  Date
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Date Range</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All Dates</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-invoiced">
                  Invoiced
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Invoiced Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-filter-sync">
                  Sync
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Xero Sync</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                data-testid="button-reset-filters"
              >
                <X className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>

        <TabsContent value={selectedStatus} className="flex-1 overflow-auto m-0 p-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedBills.size === filteredBills.length && filteredBills.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead data-testid="header-id">ID</TableHead>
                  <TableHead data-testid="header-status">Status</TableHead>
                  <TableHead data-testid="header-name">Name</TableHead>
                  <TableHead data-testid="header-pay-to">Pay to</TableHead>
                  <TableHead data-testid="header-project">Project</TableHead>
                  <TableHead data-testid="header-reference">Reference</TableHead>
                  <TableHead data-testid="header-date">Date</TableHead>
                  <TableHead data-testid="header-total">Total</TableHead>
                  <TableHead className="text-center" data-testid="header-sync">Sync</TableHead>
                  <TableHead data-testid="header-due">Due</TableHead>
                  <TableHead className="text-center" data-testid="header-attachments">
                    <Paperclip className="h-4 w-4 inline" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billsLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Loading bills...
                    </TableCell>
                  </TableRow>
                ) : filteredBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No bills found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBills.map((bill) => {
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
                        <TableCell className="font-medium" data-testid={`text-bill-number-${bill.id}`}>
                          {bill.billNumber}
                        </TableCell>
                        <TableCell data-testid={`badge-bill-status-${bill.id}`}>
                          {getStatusBadge(bill.status)}
                        </TableCell>
                        <TableCell data-testid={`text-supplier-name-${bill.id}`}>
                          {getSupplierName(bill.supplierId)}
                        </TableCell>
                        <TableCell data-testid={`text-pay-to-${bill.id}`}>
                          {getSupplierName(bill.supplierId)}
                        </TableCell>
                        <TableCell data-testid={`text-project-${bill.id}`}>
                          {project && (
                            <div className="flex items-center gap-2">
                              <ProjectIcon
                                icon={project.icon}
                                color={project.color}
                              />
                              <span>{project.name}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-reference-${bill.id}`}>
                          {bill.billReference || "-"}
                        </TableCell>
                        <TableCell data-testid={`text-date-${bill.id}`}>
                          {formatDate(bill.billDate)}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-total-${bill.id}`}>
                          {formatCurrency(bill.total)}
                        </TableCell>
                        <TableCell className="text-center" data-testid={`icon-sync-${bill.id}`}>
                          {bill.xeroInvoiceId && (
                            <Circle className="h-4 w-4 inline fill-blue-500 text-blue-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-due-${bill.id}`}>
                          {formatCurrency(dueAmount)}
                        </TableCell>
                        <TableCell className="text-center" data-testid={`text-attachments-${bill.id}`}>
                          {attachmentCount > 0 && (
                            <div className="flex items-center justify-center gap-1">
                              <FileText className="h-4 w-4" />
                              <span className="text-sm">{attachmentCount}</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-6 text-muted-foreground">
              <div data-testid="text-total-draft">
                Draft: <span className="font-medium text-foreground">{formatCurrency(statusTotals.draft * 100)}</span>
              </div>
              <div data-testid="text-total-awaiting-approval">
                Awaiting Approval: <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_approval * 100)}</span>
              </div>
              <div data-testid="text-total-awaiting-payment">
                Awaiting Payment: <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_payment * 100)}</span>
              </div>
              <div data-testid="text-total-paid">
                Paid: <span className="font-medium text-foreground">{formatCurrency(statusTotals.paid * 100)}</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
