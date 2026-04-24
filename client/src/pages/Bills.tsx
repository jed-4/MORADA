import { useState, useMemo, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileText,
  Paperclip,
  Circle,
  Mail,
  Copy,
  ChevronDown,
  Search,
  Calendar,
  Building2,
  Trash2,
  Settings2,
  GripVertical,
  Lock,
  CheckCircle2,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { type Bill, type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "needs_review", label: "Needs Review" },
  { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid", label: "Paid" },
];

const BILL_COLUMN_LABELS: { id: string; label: string; pinned?: boolean }[] = [
  { id: "checkbox", label: "Select", pinned: true },
  { id: "billNumber", label: "ID" },
  { id: "status", label: "Status" },
  { id: "supplier", label: "Supplier" },
  { id: "project", label: "Project" },
  { id: "reference", label: "Reference" },
  { id: "date", label: "Date" },
  { id: "total", label: "Total" },
  { id: "xero", label: "Xero" },
  { id: "due", label: "Due" },
  { id: "attachments", label: "Files" },
];

type XeroBillPreview = {
  xeroInvoiceId: string;
  invoiceNumber?: string;
  reference?: string;
  contactName?: string;
  date?: string;
  dueDate?: string;
  status?: string;
  total?: number;
  amountDue?: number;
  amountPaid?: number;
  alreadyImported: boolean;
  localBillId?: string | null;
};

function ImportFromXeroDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onProjectChange,
  selectedIds,
  onSelectedIdsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  defaultProjectId: string;
  onProjectChange: (id: string) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}) {
  const { toast } = useToast();
  const [sinceDate, setSinceDate] = useState<string>("");
  const [unmappedAction, setUnmappedAction] = useState<"skip" | "create">("skip");
  const [importStatus, setImportStatus] = useState<"draft" | "awaiting_approval" | "from_xero">("draft");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const { data: previewData, isLoading, error, refetch } = useQuery<{ bills: XeroBillPreview[]; page: number }>({
    queryKey: ["/api/xero/bills/import-preview", sinceDate],
    queryFn: async () => {
      const qs = sinceDate ? `?since=${encodeURIComponent(sinceDate)}` : "";
      const res = await fetch(`/api/xero/bills/import-preview${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load Xero bills");
      return res.json();
    },
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: async (payload: { xeroInvoiceIds: string[]; projectId: string; unmappedSupplierAction: "skip" | "create"; importStatus: "draft" | "awaiting_approval" | "from_xero" }) => {
      return await apiRequest("/api/xero/bills/import", "POST", payload);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Import complete",
        description: `${data.imported} imported, ${data.skipped} skipped, ${data.failed} failed.`,
      });
      onSelectedIdsChange(new Set());
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
    },
    onError: (e: Error) => {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  const allXeroBills = previewData?.bills || [];
  const xeroBills = supplierFilter
    ? allXeroBills.filter(b => (b.contactName || "").toLowerCase().includes(supplierFilter.toLowerCase()))
    : allXeroBills;
  const importableBills = xeroBills.filter(b => !b.alreadyImported);

  const toggleAll = (checked: boolean) => {
    if (checked) {
      onSelectedIdsChange(new Set(importableBills.map(b => b.xeroInvoiceId)));
    } else {
      onSelectedIdsChange(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    onSelectedIdsChange(next);
  };

  // Xero ships dates as either "/Date(1234567890)/" or ISO. Normalise the
  // legacy form, then defer to the shared formatter.
  const formatXeroDate = (d?: string) => {
    if (!d) return "—";
    const match = d.match(/\/Date\((\d+)/);
    return formatDate(match ? new Date(parseInt(match[1])) : d, "dd MMM yyyy");
  };

  // Xero amounts are already in dollars (not cents).
  const formatMoney = (n?: number) => formatCurrency(n, { fromDollars: true });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col" data-testid="dialog-import-xero-bills">
        <DialogHeader>
          <DialogTitle>Import bills from Xero</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="text-xs text-muted-foreground">Assign to project:</span>
          <Select value={defaultProjectId} onValueChange={onProjectChange}>
            <SelectTrigger className="h-8 w-56" data-testid="select-import-project">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">From date:</span>
          <Input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="h-8 w-40"
            data-testid="input-import-since"
          />
          <span className="text-xs text-muted-foreground ml-2">Unmapped suppliers:</span>
          <Select value={unmappedAction} onValueChange={(v) => setUnmappedAction(v as "skip" | "create")}>
            <SelectTrigger className="h-8 w-36" data-testid="select-unmapped-action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Skip</SelectItem>
              <SelectItem value="create">Auto-create</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">Supplier:</span>
          <Input
            type="text"
            placeholder="Filter by name..."
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-8 w-44"
            data-testid="input-supplier-filter"
          />
          <span className="text-xs text-muted-foreground ml-2">Import as:</span>
          <Select value={importStatus} onValueChange={(v) => setImportStatus(v as any)}>
            <SelectTrigger className="h-8 w-44" data-testid="select-import-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
              <SelectItem value="from_xero">Match Xero status</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="ml-auto">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-md min-h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading Xero bills...
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {(error as Error).message || "Failed to load Xero bills"}
            </div>
          ) : xeroBills.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No bills found in Xero.</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={importableBills.length > 0 && importableBills.every(b => selectedIds.has(b.xeroInvoiceId))}
                      onCheckedChange={(c) => toggleAll(!!c)}
                      data-testid="checkbox-import-select-all"
                    />
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xeroBills.map((b) => (
                  <TableRow key={b.xeroInvoiceId} className={b.alreadyImported ? "opacity-50" : ""}>
                    <TableCell>
                      <Checkbox
                        disabled={b.alreadyImported}
                        checked={selectedIds.has(b.xeroInvoiceId)}
                        onCheckedChange={(c) => toggleOne(b.xeroInvoiceId, !!c)}
                        data-testid={`checkbox-import-${b.xeroInvoiceId}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs font-mono">{b.invoiceNumber || "—"}</TableCell>
                    <TableCell className="text-xs">{b.contactName || "—"}</TableCell>
                    <TableCell className="text-xs">{b.reference || "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(b.date)}</TableCell>
                    <TableCell>
                      {b.alreadyImported ? (
                        <Badge variant="outline" className="text-[10px]">Already imported</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{b.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">{formatMoney(b.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <span className="text-xs text-muted-foreground mr-auto">{selectedIds.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={selectedIds.size === 0 || !defaultProjectId || importMutation.isPending}
            onClick={() => importMutation.mutate({ xeroInvoiceIds: Array.from(selectedIds), projectId: defaultProjectId, unmappedSupplierAction: unmappedAction, importStatus })}
            data-testid="button-confirm-import"
          >
            {importMutation.isPending ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Importing...</> : `Import ${selectedIds.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [changeProjectDialogOpen, setChangeProjectDialogOpen] = useState(false);
  const [changeSupplierDialogOpen, setChangeSupplierDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string>("");
  const [selectedXeroBillIds, setSelectedXeroBillIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  const bulkDeleteMutation = useMutation({
    mutationFn: async (billIds: string[]) => {
      const results = await Promise.allSettled(billIds.map((id) => apiRequest(`/api/bills/${id}`, "DELETE")));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} of ${billIds.length} bills failed to delete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setSelectedBills(new Set());
      setDeleteDialogOpen(false);
      toast({ title: "Bills deleted", description: `Successfully deleted ${selectedBills.size} bill(s).` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Partial failure", description: error.message, variant: "destructive" });
    },
  });

  const bulkChangeProjectMutation = useMutation({
    mutationFn: async ({ billIds, projectId }: { billIds: string[]; projectId: string }) => {
      const results = await Promise.allSettled(billIds.map((id) => apiRequest(`/api/bills/${id}`, "PATCH", { projectId })));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} of ${billIds.length} bills failed to update`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setSelectedBills(new Set());
      setChangeProjectDialogOpen(false);
      setSelectedProjectId("");
      toast({ title: "Project updated", description: `Successfully updated project for ${selectedBills.size} bill(s).` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Partial failure", description: error.message, variant: "destructive" });
    },
  });

  const bulkChangeSupplierMutation = useMutation({
    mutationFn: async ({ billIds, supplierId }: { billIds: string[]; supplierId: string }) => {
      const results = await Promise.allSettled(billIds.map((id) => apiRequest(`/api/bills/${id}`, "PATCH", { supplierId })));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} of ${billIds.length} bills failed to update`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setSelectedBills(new Set());
      setChangeSupplierDialogOpen(false);
      setSelectedSupplierId("");
      toast({ title: "Supplier updated", description: `Successfully updated supplier for ${selectedBills.size} bill(s).` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Partial failure", description: error.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (billIds: string[]) => {
      const results = await Promise.allSettled(billIds.map((id) => apiRequest(`/api/bills/${id}`, "PATCH", { status: "awaiting_payment" })));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} of ${billIds.length} bills failed to approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      const count = selectedBills.size;
      setSelectedBills(new Set());
      toast({ title: "Bills approved", description: `Successfully approved ${count} bill(s).` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Partial failure", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    setSelectedStatus(statusFromUrl);
  }, [statusFromUrl]);

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) queryParams.projectId = projectIdFromUrl;

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills", queryParams],
    queryFn: async () => {
      const p = new URLSearchParams(queryParams);
      const qs = p.toString();
      const url = qs ? `/api/bills?${qs}` : "/api/bills";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);
  const getSupplierName = (supplierId: string, bill?: any) => {
    if (bill?.supplierName) return bill.supplierName;
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier?.name || "—";
  };

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      if (selectedStatus !== "all" && bill.status !== selectedStatus) return false;
      if (searchTerm) {
        const supplier = suppliers.find(s => s.id === bill.supplierId);
        const project = projects.find(p => p.id === bill.projectId);
        const searchLower = searchTerm.toLowerCase();
        const supplierName = (bill as any).supplierName || supplier?.name || "";
        const matchesSearch =
          bill.billNumber?.toLowerCase().includes(searchLower) ||
          bill.billReference?.toLowerCase().includes(searchLower) ||
          supplierName.toLowerCase().includes(searchLower) ||
          project?.name?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [bills, selectedStatus, searchTerm, suppliers, projects]);

  const statusCounts = useMemo(() => ({
    all: bills.length,
    draft: bills.filter((b) => b.status === "draft").length,
    needs_review: bills.filter((b) => b.status === "needs_review").length,
    awaiting_approval: bills.filter((b) => b.status === "awaiting_approval").length,
    awaiting_payment: bills.filter((b) => b.status === "awaiting_payment").length,
    paid: bills.filter((b) => b.status === "paid").length,
  }), [bills]);

  const statusTotals = useMemo(() => {
    const totals = { draft: 0, needs_review: 0, awaiting_approval: 0, awaiting_payment: 0, paid: 0 };
    bills.forEach((bill) => {
      const rawAmount = bill.total / 100;
      const amount = bill.billType === "credit" ? -rawAmount : rawAmount;
      if (bill.status === "draft") totals.draft += amount;
      else if (bill.status === "needs_review") totals.needs_review += amount;
      else if (bill.status === "awaiting_approval") totals.awaiting_approval += amount;
      else if (bill.status === "awaiting_payment") totals.awaiting_payment += amount;
      else if (bill.status === "paid") totals.paid += amount;
    });
    return totals;
  }, [bills]);

  const getStatusBadge = (status: string, _size: "sm" | "md" = "md") => {
    // The new soft pill StatusBadge is already a fixed compact size, so the
    // legacy `size` parameter is intentionally ignored.
    const labelMap: Record<string, string> = {
      draft: "Draft",
      needs_review: "Needs Review",
      awaiting_approval: "Awaiting Approval",
      awaiting_payment: "Awaiting Payment",
      paid: "Paid",
    };
    return <StatusBadge status={status} label={labelMap[status]} />;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedBills(new Set(filteredBills.map((b) => b.id)));
    else setSelectedBills(new Set());
  };

  const handleSelectBill = (billId: string, checked: boolean) => {
    const newSelected = new Set(selectedBills);
    if (checked) newSelected.add(billId);
    else newSelected.delete(billId);
    setSelectedBills(newSelected);
  };

  const handleRowClick = (billId: string) => {
    if (projectIdFromUrl) setLocation(`/projects/${projectIdFromUrl}/bills/${billId}`);
    else setLocation(`/bills/${billId}`);
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (projectIdFromUrl) p.set("projectId", projectIdFromUrl);
    const qs = p.toString();
    setLocation(qs ? `/bills?${qs}` : "/bills");
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/email-invoice`;

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({ title: "Copied to clipboard", description: "Webhook URL has been copied to your clipboard." });
  };

  // ── DataTable column defs ───────────────────────────────────────────────
  const billColumns = useMemo<ColumnDef<Bill, unknown>[]>(() => {
    const cols: (ColumnDef<Bill, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "checkbox",
        header: () => (
          <Checkbox
            checked={filteredBills.length > 0 && selectedBills.size === filteredBills.length}
            onCheckedChange={(c) => handleSelectAll(c as boolean)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedBills.has(row.original.id)}
              onCheckedChange={(c) => handleSelectBill(row.original.id, c as boolean)}
              data-testid={`checkbox-bill-${row.original.id}`}
            />
          </span>
        ),
        enableSorting: false,
        size: 40,
        meta: { defaultWidth: 40, align: "center", pinned: true, headerLabel: "Select" },
      },
      {
        id: "billNumber",
        header: "ID",
        accessorFn: (b) => b.billNumber || "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1 font-medium">
            {row.original.billNumber}
            {row.original.billType === "credit" && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 text-status-success dark:text-green-400 border-green-300 dark:border-green-600">Credit</Badge>
            )}
          </div>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "ID" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (b) => b.status,
        cell: ({ row }) => getStatusBadge(row.original.status, "sm"),
        size: 130,
        meta: { defaultWidth: 130, headerLabel: "Status" },
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (b) => getSupplierName(b.supplierId ?? "", b),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{getSupplierName(row.original.supplierId ?? "", row.original)}</span>
          </div>
        ),
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Supplier" },
      },
      ...(projectIdFromUrl ? [] : [{
        id: "project",
        header: "Project",
        accessorFn: (b: Bill) => getProject(b.projectId)?.name || "",
        cell: ({ row }) => {
          const project = getProject(row.original.projectId);
          return project ? (
            <div className="flex items-center gap-1.5">
              <ProjectIcon icon={project.icon} color={project.color} className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.name}</span>
            </div>
          ) : null;
        },
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Project" },
      } as ColumnDef<Bill, unknown> & { meta: DataTableColumnMeta }]),
      {
        id: "reference",
        header: "Reference",
        accessorFn: (b) => b.billReference || "",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.billReference || "-"}</span>,
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Reference" },
      },
      {
        id: "date",
        header: "Date",
        accessorFn: (b) => (b.billDate ? new Date(b.billDate).getTime() : 0),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            {formatDate(row.original.billDate)}
          </div>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Date" },
      },
      {
        id: "total",
        header: "Total",
        accessorFn: (b) => (b.billType === "credit" ? -b.total : b.total),
        cell: ({ row }) => (
          <span className={cn("font-medium", row.original.billType === "credit" && "text-status-success dark:text-green-400")}>
            {row.original.billType === "credit"
              ? `-${formatCurrency(row.original.total)}`
              : formatCurrency(row.original.total)}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Total" },
      },
      {
        id: "xero",
        header: "Xero",
        enableSorting: false,
        cell: ({ row }) => {
          const bill = row.original;
          const syncStatus = bill.xeroLastSyncStatus;
          const syncErr = bill.xeroLastSyncError;
          const syncAt = bill.xeroLastSyncAt;
          const tip = syncStatus === "failed"
            ? `Last push failed${syncAt ? ` (${new Date(syncAt).toLocaleString()})` : ""}: ${syncErr || "unknown error"}`
            : syncStatus === "success" && syncAt
              ? `Synced ${new Date(syncAt).toLocaleString()}`
              : bill.xeroInvoiceId ? "Linked to Xero" : "";
          return syncStatus === "failed" ? (
            <span title={tip}><AlertCircle className="h-3 w-3 inline text-destructive" /></span>
          ) : bill.xeroInvoiceId ? (
            <span title={tip}><Circle className="h-3 w-3 inline fill-blue-500 text-blue-500" /></span>
          ) : null;
        },
        size: 60,
        meta: { defaultWidth: 60, align: "center", headerLabel: "Xero" },
      },
      {
        id: "due",
        header: "Due",
        accessorFn: (b) => b.total - b.paidAmount,
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.total - row.original.paidAmount)}</span>
        ),
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Due" },
      },
      {
        id: "attachments",
        header: () => <Paperclip className="h-3 w-3 inline" />,
        enableSorting: false,
        cell: ({ row }) => {
          const bill = row.original;
          const attachmentCount = Array.isArray(bill.attachmentUrls) ? bill.attachmentUrls.length : 0;
          if (attachmentCount === 0) return null;
          return (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center justify-center gap-0.5 mx-auto hover-elevate rounded px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                  <FileText className="h-3 w-3" />
                  <span className="text-xs">{attachmentCount}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" align="center" className="w-72 p-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs font-medium text-muted-foreground mb-2">Attachments ({attachmentCount})</p>
                <div className="flex flex-col gap-1">
                  {(bill.attachmentUrls as string[]).map((url, idx) => {
                    const filename = url.split("/").pop()?.split("?")[0] || `Attachment ${idx + 1}`;
                    const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url);
                    return (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md p-1.5 hover-elevate">
                        {isImage ? (
                          <img src={url} alt={filename} className="h-8 w-8 rounded object-cover shrink-0 border border-border" />
                        ) : (
                          <div className="h-8 w-8 rounded border border-border bg-muted flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-xs truncate text-foreground">{decodeURIComponent(filename)}</span>
                      </a>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        size: 50,
        meta: { defaultWidth: 50, align: "center", headerLabel: "Files" },
      },
    ];
    return cols;
  }, [filteredBills.length, selectedBills, projectIdFromUrl, projects, suppliers]);

  const billPickerColumns = useMemo(
    () => BILL_COLUMN_LABELS.filter((c) => !(c.id === "project" && projectIdFromUrl)),
    [projectIdFromUrl],
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-bills">

      {/* ── Unified header card ── */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

        {/* Row 1 — Title & Actions */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-orange-400/70" />
            <h2 className="text-sm font-semibold" data-testid="text-page-title">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Email Setup */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1" data-testid="button-email-setup">
                  <Mail className="w-3 h-3" />
                  <span>Email Setup</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="max-w-[min(500px,90vw)] w-full" align="end" data-testid="popover-email-setup">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold mb-1 text-sm" data-testid="text-email-to-bill-heading">Email-to-Bill Feature</h3>
                    <p className="text-xs text-muted-foreground" data-testid="text-email-to-bill-description">Forward invoices to auto-create bills</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-xs flex-1 h-7" data-testid="input-webhook-url" />
                    <button className="h-6 w-6 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center" onClick={handleCopyWebhookUrl} data-testid="button-copy-webhook-url">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <Collapsible open={setupInstructionsOpen} onOpenChange={setSetupInstructionsOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="button-toggle-setup-instructions">
                        Setup Instructions
                        <ChevronDown className={`h-3 w-3 transition-transform ${setupInstructionsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3" data-testid="content-setup-instructions">
                      <div className="space-y-3 text-xs">
                        <div>
                          <h4 className="font-semibold mb-1" data-testid="text-sendgrid-heading">For SendGrid Inbound Parse:</h4>
                          <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                            <li>Go to SendGrid → Settings → Inbound Parse</li>
                            <li>Add your domain and set the URL to the webhook</li>
                            <li>Forward invoices to your configured email address</li>
                          </ol>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1" data-testid="text-manual-testing-heading">For manual testing:</h4>
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
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
              onClick={() => {
                setImportProjectId(projectIdFromUrl || "");
                setSelectedXeroBillIds(new Set());
                setImportDialogOpen(true);
              }}
              data-testid="button-import-from-xero"
            >
              <Download className="w-3 h-3" />
              <span>Import from Xero</span>
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => setLocation(projectIdFromUrl ? `/projects/${projectIdFromUrl}/bills/new` : "/bills/new")}
              data-testid="button-create-bill"
            >
              <Plus className="w-3 h-3" />
              <span>New Bill</span>
            </button>
          </div>
        </div>

        {/* Row 2 — Status tabs */}
        <div className="flex items-center px-3 border-b border-border/50 overflow-x-auto">
          {STATUS_OPTIONS.map((status) => {
            const isActive = selectedStatus === status.key;
            const showCount = status.key !== "all" && status.key !== "paid";
            const count = statusCounts[status.key as keyof typeof statusCounts];
            return (
              <button
                key={status.key}
                onClick={() => handleStatusChange(status.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
                  isActive ? "text-foreground border-primary" : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {showCount && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full text-[10px] min-w-4 h-4 px-1",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3 — Lilac summary strip (no Paid) */}
        <div className="bg-primary/10 flex items-center px-5 py-2">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground ml-auto">
            <span data-testid="text-total-draft">
              Draft <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.draft * 100)}</span>
            </span>
            <span className="w-px h-3 bg-primary/40 self-center" />
            <span data-testid="text-total-awaiting-approval">
              Awaiting Approval <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.awaiting_approval * 100)}</span>
            </span>
            <span className="w-px h-3 bg-primary/40 self-center" />
            <span data-testid="text-total-awaiting-payment">
              Awaiting Payment <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.awaiting_payment * 100)}</span>
            </span>
          </div>
        </div>

      </div>{/* end header card */}

      {/* ── Bulk selection action bar (floating) ── */}
      {selectedBills.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedBills.size} selected</span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedBills(new Set())}>Deselect</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-xs" style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => setChangeProjectDialogOpen(true)}>Change Project</Button>
            <Button variant="ghost" size="sm" className="text-xs" style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => setChangeSupplierDialogOpen(true)}>Change Supplier</Button>
            <Button variant="ghost" size="sm" className="text-xs" style={{ backgroundColor: "#22c55e", color: "white" }} disabled={bulkApproveMutation.isPending} onClick={() => bulkApproveMutation.mutate(Array.from(selectedBills))}>
              <CheckCircle2 className="w-3 h-3 mr-1" />{bulkApproveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="w-3 h-3 mr-1" />Delete
            </Button>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {selectedBills.size} bill(s)?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. Are you sure you want to delete the selected bills?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={bulkDeleteMutation.isPending} onClick={() => bulkDeleteMutation.mutate(Array.from(selectedBills))}>
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeProjectDialogOpen} onOpenChange={(open) => { setChangeProjectDialogOpen(open); if (!open) setSelectedProjectId(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change project for {selectedBills.size} bill(s)</DialogTitle></DialogHeader>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeProjectDialogOpen(false); setSelectedProjectId(""); }}>Cancel</Button>
            <Button disabled={!selectedProjectId || bulkChangeProjectMutation.isPending} style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => bulkChangeProjectMutation.mutate({ billIds: Array.from(selectedBills), projectId: selectedProjectId })}>
              {bulkChangeProjectMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeSupplierDialogOpen} onOpenChange={(open) => { setChangeSupplierDialogOpen(open); if (!open) setSelectedSupplierId(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change supplier for {selectedBills.size} bill(s)</DialogTitle></DialogHeader>
          <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select a supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeSupplierDialogOpen(false); setSelectedSupplierId(""); }}>Cancel</Button>
            <Button disabled={!selectedSupplierId || bulkChangeSupplierMutation.isPending} style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => bulkChangeSupplierMutation.mutate({ billIds: Array.from(selectedBills), supplierId: selectedSupplierId })}>
              {bulkChangeSupplierMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportFromXeroDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projects={projects}
        defaultProjectId={importProjectId}
        onProjectChange={setImportProjectId}
        selectedIds={selectedXeroBillIds}
        onSelectedIdsChange={setSelectedXeroBillIds}
      />

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">
        {billsLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading bills...</p>
          </div>
        ) : (
          <div className="border border-border rounded-md bg-background overflow-hidden">

            {/* Search / filter row — sticky */}
            <div className="h-9 flex items-center px-3 border-b border-border/50 gap-2 bg-background sticky top-0 z-20">
              {/* Search — left side with thin border */}
              <div className="relative flex-shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Search bills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-2 py-0 h-6 text-xs w-44 border border-border/50"
                  data-testid="bills-search-input"
                />
              </div>

              {/* Column picker — far right */}
              <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 border border-transparent ml-auto flex-shrink-0" data-testid="button-column-picker">
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end">
                  <DataTableColumnPicker storageKey="bills" columns={billPickerColumns} />
                </PopoverContent>
              </Popover>
            </div>

            {/* DataTable */}
            <div className="flex-1 min-h-0">
              {filteredBills.length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-muted-foreground text-sm">
                      {bills.length === 0 ? "No bills found" : "No matching bills"}
                    </p>
                    {bills.length === 0 && (
                      <button
                        className="h-7 px-3 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
                        onClick={() => setLocation(projectIdFromUrl ? `/projects/${projectIdFromUrl}/bills/new` : "/bills/new")}
                        data-testid="button-add-first-bill"
                      >
                        <Plus className="w-3.5 h-3.5" />Add First Bill
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <DataTable
                  storageKey="bills"
                  legacyConfigKey="bills-column-config-v1"
                  data={filteredBills}
                  columns={billColumns}
                  rowKey={(b) => b.id}
                  onRowClick={(b) => handleRowClick(b.id)}
                  className="max-h-[calc(100vh-260px)]"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

