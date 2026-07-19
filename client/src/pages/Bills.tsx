import { useState, useMemo, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { DataTableFilterBar } from "@/components/data-table/DataTableFilterBar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { BulkActionBar } from "@/components/BulkActionBar";
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
  Mail,
  Copy,
  ChevronDown,
  ChevronRight,
  Search,
  Calendar,
  Building2,
  Trash2,
  Settings2,
  Columns3,
  GripVertical,
  Lock,
  CheckCircle2,
  Download,
  Loader2,
  AlertCircle,
  AlertTriangle,
  MoreHorizontal,
  RefreshCw,
  Banknote,
  ScanText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Bill, type Project, type Supplier } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ReimbursementsQueue } from "@/components/bills/ReimbursementsQueue";
import { FilePreviewModal, type PreviewFile } from "@/components/FilePreviewModal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { SupplierSelect } from "@/components/SupplierSelect";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { SiXero } from "react-icons/si";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid", label: "Paid" },
];

// Outstanding amount owed on a bill, in cents. An amount is only "Due" once the
// bill is issued for payment (status `awaiting_payment`); drafts / needs-review /
// awaiting-approval bills are not yet payables, and paid bills owe nothing.
// Credit notes reduce what is owed, so their due is negated to match the Amount
// column and the summary totals. Shared by the Due column and the footer total so
// the two can never drift apart.
const billDueCents = (bill: Pick<Bill, "status" | "total" | "paidAmount" | "billType">) => {
  if (bill.status !== "awaiting_payment") return 0;
  const outstanding = bill.total - bill.paidAmount;
  return bill.billType === "credit" ? -outstanding : outstanding;
};

const BILL_COLUMN_LABELS: { id: string; label: string; pinned?: boolean }[] = [
  { id: "checkbox", label: "Select", pinned: true },
  { id: "billNumber", label: "ID" },
  { id: "status", label: "Status" },
  { id: "supplier", label: "Supplier" },
  { id: "project", label: "Project" },
  { id: "reference", label: "Reference" },
  { id: "date", label: "Date" },
  { id: "due", label: "Due" },
  { id: "total", label: "Total" },
  { id: "xero", label: "Xero" },
  { id: "attachments", label: "Files" },
  { id: "actions", label: "Actions" },
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
  trackingOptionId?: string;
  trackingOptionName?: string;
  multipleTrackingOptions?: boolean;
  trackingOptionNames?: string[];
  supplierId?: string | null;
  supplierName?: string | null;
  suggestedSupplierId?: string | null;
  suggestedSupplierName?: string | null;
  hasAttachment?: boolean;
  alreadyImported: boolean;
  localBillId?: string | null;
};

type XeroTrackingOption = { id: string; name: string };

function ImportFromXeroDialog({
  open,
  onOpenChange,
  projects,
  suppliers,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  suppliers: Supplier[];
  defaultProjectId: string;
}) {
  const { toast } = useToast();
  const [sinceDate, setSinceDate] = useState<string>("");
  const [importStatus, setImportStatus] = useState<"draft" | "awaiting_approval" | "from_xero">("from_xero");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [trackingFilter, setTrackingFilter] = useState<string>("__all__");

  // Per-row project assignments: xeroInvoiceId → projectId
  const [projectMap, setProjectMap] = useState<Map<string, string>>(new Map());
  // Per-row supplier resolution for unmatched Xero contacts:
  // xeroInvoiceId → link to an existing supplier, or create a new one.
  const [supplierMap, setSupplierMap] = useState<Map<string, { mode: "link" | "create"; supplierId?: string }>>(new Map());
  // Tracks which rows the user explicitly overrode (so bulk default changes don't clobber them)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter-first search: the bills query is gated behind an explicit Search
  // press. `search` holds the committed filter values (null = not searched yet).
  // A nonce lets pressing Search re-run even with identical filters.
  const [search, setSearch] = useState<{ since: string; trackingOptionId: string; nonce: number } | null>(null);

  // Tracking (project) options are fetched independently of the bills preview so
  // the dropdown is ready the moment the modal opens — no waiting on a bills load.
  const { data: trackingData } = useQuery<{ trackingOptions: XeroTrackingOption[] }>({
    queryKey: ["/api/xero/project-tracking-options"],
    enabled: open,
  });
  const trackingOptions: XeroTrackingOption[] = trackingData?.trackingOptions || [];

  const { data: previewData, isLoading, isFetching, error } = useQuery<{
    bills: XeroBillPreview[];
    page: number;
    trackingOptions: XeroTrackingOption[];
  }>({
    queryKey: ["/api/xero/bills/import-preview", search?.since, search?.trackingOptionId, search?.nonce],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search?.since) params.set("since", search.since);
      // When a job is selected, ask the server to page through every Xero bill
      // and filter by tracking category — otherwise only the most-recent 100
      // bills are searched and the job's older bills go missing.
      if (search && search.trackingOptionId !== "__all__") params.set("trackingOptionId", search.trackingOptionId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/xero/bills/import-preview${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load Xero bills");
      return res.json();
    },
    enabled: open && !!search,
  });

  const hasSearched = !!search;
  const allXeroBills = previewData?.bills || [];

  const runSearch = () => {
    setSearch({ since: sinceDate, trackingOptionId: trackingFilter, nonce: Date.now() });
  };

  // Seed projectMap when bills load or defaultProjectId changes.
  useEffect(() => {
    if (allXeroBills.length === 0) return;
    setProjectMap(prev => {
      const next = new Map(prev);
      for (const b of allXeroBills) {
        if (!next.has(b.xeroInvoiceId)) {
          next.set(b.xeroInvoiceId, defaultProjectId);
        }
      }
      return next;
    });
  }, [allXeroBills, defaultProjectId]);

  // Seed supplier resolutions from the server's fuzzy suggestions so the common
  // case is a one-glance confirm. Matched / already-imported rows need no entry.
  useEffect(() => {
    if (allXeroBills.length === 0) return;
    setSupplierMap(prev => {
      const next = new Map(prev);
      for (const b of allXeroBills) {
        if (b.alreadyImported || b.supplierId) continue;
        if (!next.has(b.xeroInvoiceId) && b.suggestedSupplierId) {
          next.set(b.xeroInvoiceId, { mode: "link", supplierId: b.suggestedSupplierId });
        }
      }
      return next;
    });
  }, [allXeroBills]);

  // When the dialog opens, reset state — including the gated search, so the
  // results area starts on the prompt/empty state and no bills query runs.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setProjectMap(new Map());
      setSupplierMap(new Map());
      setSupplierFilter("");
      setTrackingFilter("__all__");
      setSinceDate("");
      setSearch(null);
    }
  }, [open]);

  const importMutation = useMutation({
    mutationFn: async (payload: {
      xeroInvoiceIds: string[];
      projectAssignments: Record<string, string>;
      supplierResolution: Record<string, { mode: "link" | "create"; supplierId?: string }>;
      importStatus: "draft" | "awaiting_approval" | "from_xero";
    }) => {
      return await apiRequest("/api/xero/bills/import", "POST", payload);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      if (data.failed > 0) {
        const reasons = (data.results || [])
          .filter((r: any) => !r.ok && r.error)
          .slice(0, 3)
          .map((r: any) => r.error)
          .join("; ");
        toast({
          title: `${data.imported} imported — ${data.failed} couldn't be imported`,
          description: reasons || "Some bills could not be imported. Resolve them and try again.",
          variant: "destructive",
        });
        // Keep the dialog open so the user can fix the flagged rows and retry.
        return;
      }
      const attachmentWarning = (data.results || [])
        .filter((r: any) => r.ok && r.attachmentWarning)
        .map((r: any) => r.attachmentWarning)
        .find(Boolean);
      toast({
        title: "Import complete",
        description: `${data.imported} imported${data.skipped ? `, ${data.skipped} already in Morada` : ""}.${attachmentWarning ? ` ${attachmentWarning}` : ""}`,
        ...(attachmentWarning ? { variant: "default" as const } : {}),
      });
      setSelectedIds(new Set());
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  const visibleBills = useMemo(() => {
    // Tracking is filtered server-side at Search time; the client filter mirrors
    // the COMMITTED search value (not the live dropdown) so changing the dropdown
    // without pressing Search does not silently reshuffle the results.
    const committedTracking = search?.trackingOptionId ?? "__all__";
    const selectedTrackingName = committedTracking !== "__all__"
      ? trackingOptions.find(o => o.id === committedTracking)?.name
      : undefined;
    return allXeroBills.filter(b => {
      if (supplierFilter && !(b.contactName || "").toLowerCase().includes(supplierFilter.toLowerCase())) return false;
      if (committedTracking !== "__all__") {
        const matchById = b.trackingOptionId === committedTracking;
        const matchByName = !b.trackingOptionId && selectedTrackingName
          ? b.trackingOptionName === selectedTrackingName
          : false;
        if (!matchById && !matchByName) return false;
      }
      return true;
    });
  }, [allXeroBills, supplierFilter, search, trackingOptions]);

  const importableBills = visibleBills.filter(b => !b.alreadyImported);

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(importableBills.map(b => b.xeroInvoiceId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const setRowProject = (xeroInvoiceId: string, pid: string) => {
    setProjectMap(prev => new Map(prev).set(xeroInvoiceId, pid));
  };

  const setRowSupplier = (xeroInvoiceId: string, value: string) => {
    setSupplierMap(prev => {
      const next = new Map(prev);
      if (value === "__create__") next.set(xeroInvoiceId, { mode: "create" });
      else next.set(xeroInvoiceId, { mode: "link", supplierId: value });
      return next;
    });
  };

  const setDefaultForAll = (pid: string) => {
    setProjectMap(prev => {
      const next = new Map(prev);
      for (const b of allXeroBills) next.set(b.xeroInvoiceId, pid);
      return next;
    });
  };

  const billById = useMemo(
    () => new Map(allXeroBills.map(b => [b.xeroInvoiceId, b])),
    [allXeroBills],
  );

  // Check if every selected bill has a project assigned.
  const missingProject = Array.from(selectedIds).some(id => !projectMap.get(id));
  // Check that every selected bill that isn't already matched has a supplier
  // (linked to an existing one or set to create) — no silent skips.
  const missingSupplier = Array.from(selectedIds).some(id => {
    const b = billById.get(id);
    if (!b || b.supplierId) return false;
    return !supplierMap.get(id);
  });

  const formatMoney = (n?: number) => formatCurrency(n, { fromDollars: true });

  const handleImport = () => {
    const ids = Array.from(selectedIds);
    const assignments: Record<string, string> = {};
    const supplierResolution: Record<string, { mode: "link" | "create"; supplierId?: string }> = {};
    for (const id of ids) {
      const pid = projectMap.get(id);
      if (pid) assignments[id] = pid;
      const res = supplierMap.get(id);
      if (res) supplierResolution[id] = res;
    }
    importMutation.mutate({
      xeroInvoiceIds: ids,
      projectAssignments: assignments,
      supplierResolution,
      importStatus,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col" data-testid="dialog-import-xero-bills">
        <DialogHeader>
          <DialogTitle>Import bills from Xero</DialogTitle>
        </DialogHeader>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Default project:</span>
            <Select value={projectMap.get("__default__") || defaultProjectId} onValueChange={setDefaultForAll}>
              <SelectTrigger className="h-8 w-48" data-testid="select-import-project">
                <SelectValue placeholder="Set for all rows..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">From date:</span>
            <Input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} className="h-8 w-36" data-testid="input-import-since" />
          </div>
          {trackingOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Tracking:</span>
              <Select value={trackingFilter} onValueChange={setTrackingFilter}>
                <SelectTrigger className="h-8 w-44" data-testid="select-tracking-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All jobs</SelectItem>
                  {trackingOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Supplier:</span>
            <Input type="text" placeholder="Filter..." value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-8 w-36" data-testid="input-supplier-filter" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Import as:</span>
            <Select value={importStatus} onValueChange={(v) => setImportStatus(v as any)}>
              <SelectTrigger className="h-8 w-40" data-testid="select-import-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
                <SelectItem value="from_xero">Match Xero status</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={runSearch} disabled={isFetching} className="ml-auto" data-testid="button-search-xero-bills">
            {isFetching ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Searching…</> : <><Search className="w-3 h-3 mr-2" /> Search</>}
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-md min-h-[200px]">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center text-sm text-muted-foreground" data-testid="text-import-prompt">
              <Search className="w-6 h-6 opacity-60" />
              <span>Set your filters and press Search to load bills from Xero.</span>
            </div>
          ) : isLoading || isFetching ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {search && search.trackingOptionId !== "__all__"
                ? "Searching all Xero bills for this job…"
                : "Loading Xero bills..."}
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {(error as Error).message || "Failed to load Xero bills"}
            </div>
          ) : visibleBills.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No bills found in Xero.</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={importableBills.length > 0 && importableBills.every(b => selectedIds.has(b.xeroInvoiceId))}
                      onCheckedChange={(c) => toggleAll(!!c)}
                      data-testid="checkbox-import-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Supplier</TableHead>
                  <TableHead className="text-xs">Morada supplier</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs w-10 text-center" title="Source document attached in Xero">
                    <Paperclip className="h-3 w-3 inline" />
                  </TableHead>
                  {trackingOptions.length > 0 && <TableHead className="text-xs">Tracking</TableHead>}
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs">Project</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBills.map((b) => {
                  const needsSupplier = !b.alreadyImported && !b.supplierId && !supplierMap.get(b.xeroInvoiceId);
                  return (
                  <TableRow
                    key={b.xeroInvoiceId}
                    className={cn(
                      b.alreadyImported && "opacity-50",
                      needsSupplier && "bg-amber-50 dark:bg-amber-950/30",
                    )}
                    data-testid={`row-import-${b.xeroInvoiceId}`}
                  >
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
                    <TableCell>
                      {b.alreadyImported ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : b.supplierId ? (
                        <span className="text-xs inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                          {b.supplierName}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {needsSupplier && (
                            <span title="Not matched to a Morada supplier — link or create one">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 shrink-0" />
                            </span>
                          )}
                          <Select
                            value={
                              supplierMap.get(b.xeroInvoiceId)?.mode === "create"
                                ? "__create__"
                                : supplierMap.get(b.xeroInvoiceId)?.supplierId || ""
                            }
                            onValueChange={(v) => setRowSupplier(b.xeroInvoiceId, v)}
                          >
                            <SelectTrigger className="h-7 w-44 text-xs" data-testid={`select-supplier-${b.xeroInvoiceId}`}>
                              <SelectValue placeholder="Link or create..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__create__" className="text-xs">
                                + Create "{b.contactName || "supplier"}"
                              </SelectItem>
                              {[...suppliers]
                                .sort((a, b) =>
                                  ((a as any).company || a.name || "").localeCompare(
                                    (b as any).company || b.name || "",
                                    undefined,
                                    { sensitivity: "base" },
                                  ),
                                )
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id} className="text-xs">
                                    {(s as any).company || s.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{b.reference || "—"}</TableCell>
                    <TableCell className="text-center">
                      {b.hasAttachment ? (
                        <span title="Has a source document in Xero — the file is downloaded when you run the import">
                          <Paperclip className="w-3.5 h-3.5 text-muted-foreground inline" />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {trackingOptions.length > 0 && (
                      <TableCell className="text-xs text-muted-foreground">
                        {b.multipleTrackingOptions ? (
                          <span
                            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500"
                            title={`This bill's line items span multiple projects (${(b.trackingOptionNames || []).join(", ")}). Only one project will be assigned — choose it below.`}
                            data-testid={`badge-split-project-${b.xeroInvoiceId}`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {b.trackingOptionName || "—"}
                            <span className="ml-0.5">+{Math.max(0, (b.trackingOptionNames?.length || 1) - 1)}</span>
                          </span>
                        ) : (
                          b.trackingOptionName || "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-xs">{formatDate(b.date)}</TableCell>
                    <TableCell>
                      {b.alreadyImported ? (
                        <Badge variant="outline" className="text-data">Already imported</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-data">{b.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">{formatMoney(b.total)}</TableCell>
                    <TableCell>
                      {b.alreadyImported ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Select
                          value={projectMap.get(b.xeroInvoiceId) || ""}
                          onValueChange={(v) => setRowProject(b.xeroInvoiceId, v)}
                        >
                          <SelectTrigger className="h-7 w-40 text-xs" data-testid={`select-project-${b.xeroInvoiceId}`}>
                            <SelectValue placeholder="Select project..." />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-auto">
            {selectedIds.size} selected
            {missingProject && selectedIds.size > 0 && (
              <span className="text-destructive ml-2">— some selected bills have no project assigned</span>
            )}
            {missingSupplier && selectedIds.size > 0 && (
              <span className="text-destructive ml-2">— some selected bills need a supplier</span>
            )}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={selectedIds.size === 0 || missingProject || missingSupplier || importMutation.isPending}
            onClick={handleImport}
            data-testid="button-confirm-import"
          >
            {importMutation.isPending ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Importing...</> : `Import ${selectedIds.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Bills({ embedded }: { embedded?: boolean } = {}) {
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
  // Faceted filters (see DataTableFilterBar).
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterDateRange, setFilterDateRange] = useState<string>("all");
  const [filterOverdue, setFilterOverdue] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [changeProjectDialogOpen, setChangeProjectDialogOpen] = useState(false);
  const [changeSupplierDialogOpen, setChangeSupplierDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string>("");
  const [emailSetupOpen, setEmailSetupOpen] = useState(false);
  const [billsView, setBillsView] = useState<"bills" | "reimbursements">("bills");
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  const { toast } = useToast();

  const { user } = useAuth();
  const roleName = ((user as any)?.roleName || "").toLowerCase();
  const isAdminLike = roleName.includes("admin") || roleName.includes("owner") || roleName.includes("general manager");

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
    mutationFn: async ({ billIds, projectId }: { billIds: string[]; projectId: string | null }) => {
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

  const bulkAiReadMutation = useMutation({
    mutationFn: async (billIds: string[]) =>
      apiRequest("/api/bills/bulk-ai-read", "POST", { billIds }) as Promise<{
        processed: number;
        skipped: number;
        failed?: number;
        results?: Array<{ billId: string; billNumber: string; status: string; reason?: string }>;
      }>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      const { processed, skipped, failed = 0, results = [] } = data;
      const parts: string[] = [];
      if (processed > 0) parts.push(`${processed} read`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);
      // Surface the actual failure reasons (deduped) so problems are diagnosable.
      const failReasons = Array.from(
        new Set(results.filter((r) => r.status === "failed" && r.reason).map((r) => r.reason as string)),
      );
      toast({
        title: failed > 0 ? "AI Read finished with errors" : "AI Read complete",
        description: [parts.join(", ") || "No bills were processed.", ...failReasons.map((r) => `• ${r}`)].join("\n"),
        variant: failed > 0 ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "AI Read failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    // Route through the real /approve endpoint so each approval gets a
    // bill_approvals audit record and enforces the approve permission — not a
    // raw status PATCH.
    mutationFn: async (billIds: string[]) => {
      const settled = await Promise.allSettled(
        billIds.map((id) => apiRequest(`/api/bills/${id}/approve`, "POST", { comments: null })),
      );
      const approved = settled.filter((r) => r.status === "fulfilled").length;
      const failures = settled
        .map((r, i) => (r.status === "rejected" ? (r.reason as Error)?.message || "Failed" : null))
        .filter((x): x is string => !!x);
      return { approved, failures };
    },
    onSuccess: ({ approved, failures }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setSelectedBills(new Set());
      const reasons = Array.from(new Set(failures));
      const parts = [`${approved} approved`];
      if (failures.length) parts.push(`${failures.length} failed`);
      toast({
        title: failures.length ? "Approved with errors" : "Bills approved",
        description: [parts.join(", "), ...reasons.map((r) => `• ${r}`)].join("\n"),
        variant: failures.length ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    },
  });

  const duplicateBillMutation = useMutation({
    mutationFn: (billId: string) => apiRequest(`/api/bills/${billId}/duplicate`, "POST"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Bill duplicated", description: "A copy has been created." });
      setLocation(`/bills/${data.id}`);
    },
    onError: () => toast({ title: "Error", description: "Failed to duplicate bill", variant: "destructive" }),
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

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });
  const billInboxError = companySettings?.billInboxStatus === 'error';

  const currentProject = projectIdFromUrl ? projects.find((p) => p.id === projectIdFromUrl) : null;

  // Lookup maps so per-row filtering/search is O(1) rather than a linear find
  // per bill per keystroke.
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.id, s.name || "");
    return m;
  }, [suppliers]);
  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name || "");
    return m;
  }, [projects]);

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);
  const getSupplierName = (supplierId: string, bill?: any) => {
    if (bill?.supplierName) return bill.supplierName;
    return supplierNameById.get(supplierId) || "—";
  };

  const filteredBills = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const now = Date.now();
    return bills.filter((bill) => {
      const effectiveStatus = bill.status === "needs_review" ? "draft" : bill.status;
      if (selectedStatus !== "all" && effectiveStatus !== selectedStatus) return false;

      // Faceted filters
      if (filterSuppliers.length > 0 && !(bill.supplierId && filterSuppliers.includes(bill.supplierId))) return false;
      if (filterProjects.length > 0 && !(bill.projectId && filterProjects.includes(bill.projectId))) return false;

      if (filterDateRange !== "all" && bill.billDate) {
        const d = new Date(bill.billDate as any).getTime();
        const days = filterDateRange === "30" ? 30 : filterDateRange === "90" ? 90 : filterDateRange === "365" ? 365 : 0;
        if (days > 0 && d < now - days * 24 * 60 * 60 * 1000) return false;
      }

      if (filterOverdue.includes("overdue")) {
        const isPaid = bill.status === "paid";
        const overdue = !isPaid && bill.dueDate && new Date(bill.dueDate as any).getTime() < now;
        if (!overdue) return false;
      }

      if (searchLower) {
        const supplierName = (bill as any).supplierName || supplierNameById.get(bill.supplierId || "") || "";
        const projectName = projectNameById.get(bill.projectId || "") || "";
        const matchesSearch =
          bill.billNumber?.toLowerCase().includes(searchLower) ||
          bill.billReference?.toLowerCase().includes(searchLower) ||
          supplierName.toLowerCase().includes(searchLower) ||
          projectName.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [bills, selectedStatus, searchTerm, filterSuppliers, filterProjects, filterDateRange, filterOverdue, supplierNameById, projectNameById]);

  const statusCounts = useMemo(() => ({
    all: bills.length,
    draft: bills.filter((b) => b.status === "draft" || b.status === "needs_review").length,
    awaiting_approval: bills.filter((b) => b.status === "awaiting_approval").length,
    awaiting_payment: bills.filter((b) => b.status === "awaiting_payment").length,
    paid: bills.filter((b) => b.status === "paid").length,
  }), [bills]);

  const statusTotals = useMemo(() => {
    const totals = { draft: 0, awaiting_approval: 0, awaiting_payment: 0, paid: 0 };
    bills.forEach((bill) => {
      const rawAmount = bill.total / 100;
      const amount = bill.billType === "credit" ? -rawAmount : rawAmount;
      if (bill.status === "draft" || bill.status === "needs_review") totals.draft += amount;
      else if (bill.status === "awaiting_approval") totals.awaiting_approval += amount;
      // Awaiting Payment footer must reflect the outstanding amount DUE (total −
      // already-paid), matching the per-row Due column so the two reconcile.
      else if (bill.status === "awaiting_payment") totals.awaiting_payment += billDueCents(bill) / 100;
      else if (bill.status === "paid") totals.paid += amount;
    });
    return totals;
  }, [bills]);

  const displayedTotal = useMemo(() => {
    return filteredBills.reduce((sum, bill) => {
      const rawAmount = bill.total / 100;
      return sum + (bill.billType === "credit" ? -rawAmount : rawAmount);
    }, 0);
  }, [filteredBills]);

  const selectedTotal = useMemo(() => {
    return filteredBills.reduce((sum, bill) => {
      if (!selectedBills.has(bill.id)) return sum;
      const rawAmount = bill.total / 100;
      return sum + (bill.billType === "credit" ? -rawAmount : rawAmount);
    }, 0);
  }, [filteredBills, selectedBills]);

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

  const pollNowMutation = useMutation({
    mutationFn: () => apiRequest("/api/bill-inbox/poll-now", "POST"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      const count = data?.processed ?? 0;
      toast({
        title: count > 0 ? `${count} bill${count === 1 ? "" : "s"} imported` : "Inbox checked",
        description: count > 0 ? "New bills have been imported from your inbox." : "No new invoices found.",
      });
    },
    onError: () => {
      toast({ title: "Check failed", description: "Could not reach the bill inbox. Try reconnecting in Settings.", variant: "destructive" });
    },
  });

  // Reconcile-with-Xero: preview the drift (dry run), then apply. Xero wins.
  type ReconcileResult = { billId: string; billNumber: string; xeroInvoiceId: string; changes: string[]; applied: boolean; error?: string };
  type ReconcileReport = {
    connected: boolean; total: number; checked: number; diverged: number; corrected: number;
    results: ReconcileResult[]; notInXero: Array<{ billNumber: string }>;
  };
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<ReconcileReport | null>(null);

  const reconcilePreview = useMutation({
    mutationFn: async () => apiRequest("/api/xero/bills/reconcile?dryRun=true", "POST", {}) as Promise<ReconcileReport>,
    onSuccess: (data) => {
      setReconcileReport(data);
      if (data.diverged === 0 && data.notInXero.length === 0) {
        toast({ title: "In sync with Xero", description: `${data.checked} of ${data.total} bills checked — all up to date.` });
      } else {
        setReconcileOpen(true);
      }
    },
    onError: (e: Error) => toast({ title: "Reconcile failed", description: e.message, variant: "destructive" }),
  });

  const reconcileApply = useMutation({
    mutationFn: async () => apiRequest("/api/xero/bills/reconcile", "POST", {}) as Promise<ReconcileReport>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      setReconcileOpen(false);
      toast({ title: "Reconciled with Xero", description: `${data.corrected} bill${data.corrected === 1 ? "" : "s"} corrected from Xero.` });
    },
    onError: (e: Error) => toast({ title: "Reconcile failed", description: e.message, variant: "destructive" }),
  });

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
              <Badge variant="outline" className="text-data px-1 py-0 text-status-success border-status-success/40">Credit</Badge>
            )}
            {!!(row.original as any).gmailMessageId && (
              <Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" title="Auto-imported from Bill Inbox" />
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
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
        accessorFn: (b: Bill) => getProject(b.projectId)?.name || "Business",
        cell: ({ row }) => {
          const project = getProject(row.original.projectId);
          return project ? (
            <div className="flex items-center gap-1.5">
              <ProjectIcon icon={project.icon} color={project.color} className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{project.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Business</span>
          );
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
          <span className={cn("font-medium", row.original.billType === "credit" && "text-status-success")}>
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
            <span title={tip}><SiXero className="h-3.5 w-3.5 inline text-[#13B5EA]" /></span>
          ) : null;
        },
        size: 60,
        meta: { defaultWidth: 60, align: "center", headerLabel: "Xero" },
      },
      {
        id: "due",
        header: "Due",
        // An amount is only "Due" once the bill is issued for payment. Drafts,
        // needs-review and awaiting-approval bills are not yet real payables, so
        // they show a dash and sort as zero.
        accessorFn: (b) => billDueCents(b),
        cell: ({ row }) =>
          row.original.status === "awaiting_payment" ? (
            <span className="font-medium">{formatCurrency(billDueCents(row.original))}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
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
          // attachmentUrls may contain either legacy string entries or rich
          // attachment record objects ({objectPath, filename, ...}). Normalize
          // to a list of URL strings so the popover never crashes.
          type AttachmentEntry = string | { objectPath?: string; filename?: string; mimeType?: string };
          const rawAttachments: AttachmentEntry[] = Array.isArray(bill.attachmentUrls)
            ? (bill.attachmentUrls as AttachmentEntry[])
            : [];
          const attachments = rawAttachments
            .map((a) => {
              if (typeof a === "string") return { url: a, filename: undefined as string | undefined, mimeType: undefined as string | undefined };
              if (a && typeof a === "object" && typeof a.objectPath === "string") {
                return { url: a.objectPath, filename: a.filename, mimeType: a.mimeType };
              }
              return null;
            })
            .filter((a): a is { url: string; filename: string | undefined; mimeType: string | undefined } => a !== null && a.url.length > 0);
          const attachmentCount = attachments.length;
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
                  {attachments.map(({ url, filename: providedFilename, mimeType }, idx) => {
                    const filename = providedFilename || url.split("/").pop()?.split("?")[0] || `Attachment ${idx + 1}`;
                    const isImage = mimeType?.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewFile({ url, filename, mimeType }); }}
                        className="flex items-center gap-2 rounded-md p-1.5 hover-elevate text-left w-full"
                      >
                        {isImage ? (
                          <img src={url} alt={filename} className="h-8 w-8 rounded object-cover shrink-0 border border-border" />
                        ) : (
                          <div className="h-8 w-8 rounded border border-border bg-muted flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-xs truncate text-foreground">{decodeURIComponent(filename)}</span>
                      </button>
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
      {
        id: "actions",
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const bill = row.original;
          return (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onSelect={() => handleRowClick(bill.id)}>
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => duplicateBillMutation.mutate(bill.id)}
                    disabled={duplicateBillMutation.isPending}
                  >
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => {
                      setSelectedBills(new Set([bill.id]));
                      setDeleteDialogOpen(true);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        size: 48,
        meta: { defaultWidth: 48, align: "right" },
      },
    ];
    return cols;
  }, [filteredBills.length, selectedBills, projectIdFromUrl, projects, suppliers, duplicateBillMutation.isPending]);

  const billPickerColumns = useMemo(
    () => BILL_COLUMN_LABELS.filter((c) => !(c.id === "project" && projectIdFromUrl)),
    [projectIdFromUrl],
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-bills">

      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1">
          <span className="text-xs text-muted-foreground">
            {projectIdFromUrl && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Bills</span>
        </div>
      )}

      {/* ── Single toolbar row: tabs + amounts + actions ── */}
      <div className="bg-background flex items-center gap-2 px-3 border-b border-border flex-shrink-0">
        {/* Status tabs */}
        <div className="flex items-center overflow-x-auto">
          {billsView === "bills" && STATUS_OPTIONS.map((status) => {
            const isActive = selectedStatus === status.key;
            const showCount = status.key !== "all" && status.key !== "paid";
            const count = statusCounts[status.key as keyof typeof statusCounts];
            return (
              <button
                key={status.key}
                onClick={() => handleStatusChange(status.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer bg-transparent border-0",
                  isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {showCount && count > 0 && (
                  <span className={cn(
                    "text-[11px] tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
          {billsView === "reimbursements" && (
            <span className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap text-primary">
              Reimbursements
              <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
            </span>
          )}
          {/* Reimbursements tab (admin only) */}
          {isAdminLike && (
            <button
              onClick={() => setBillsView(billsView === "reimbursements" ? "bills" : "reimbursements")}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer bg-transparent border-0",
                billsView === "reimbursements" ? "hidden" : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="tab-reimbursements"
            >
              <Banknote className="h-3 w-3" />
              Reimbursements
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* New Bill button */}
        {(isAdminLike || billsView === "bills") && (
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
            onClick={() => setLocation(projectIdFromUrl ? `/projects/${projectIdFromUrl}/bills/new` : "/bills/new")}
            data-testid="button-create-bill"
          >
            <Plus className="w-3 h-3" />
            <span>New Bill</span>
          </button>
        )}

        {/* 3-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
              data-testid="button-more-actions"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => pollNowMutation.mutate()}
              disabled={pollNowMutation.isPending}
              data-testid="menu-item-check-inbox-now"
            >
              {pollNowMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
              Check inbox now
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setEmailSetupOpen(true)} data-testid="menu-item-email-setup">
              <Mail className="w-3.5 h-3.5 mr-2" />
              Email Setup
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setImportProjectId(projectIdFromUrl || "");
                setImportDialogOpen(true);
              }}
              data-testid="menu-item-import-xero"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Import from Xero
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => reconcilePreview.mutate()}
              disabled={reconcilePreview.isPending}
              data-testid="menu-item-reconcile-xero"
            >
              {reconcilePreview.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
              Reconcile with Xero
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setLocation("/settings?tab=integrations")}
              data-testid="menu-item-bill-inbox-settings"
            >
              <Settings2 className="w-3.5 h-3.5 mr-2" />
              Bill Inbox Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Email Setup Dialog ── */}
      <Dialog open={emailSetupOpen} onOpenChange={setEmailSetupOpen}>
        <DialogContent className="max-w-[min(500px,90vw)]" data-testid="dialog-email-setup">
          <DialogHeader>
            <DialogTitle data-testid="text-email-to-bill-heading">Email-to-Bill Feature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground" data-testid="text-email-to-bill-description">Forward invoices to auto-create bills</p>
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
        </DialogContent>
      </Dialog>

      {/* ── Bill Inbox error banner ── */}
      {billInboxError && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-foreground">
              Bill Inbox disconnected — invoices are no longer being imported.{" "}
              <a
                href="/settings?tab=integrations"
                className="underline text-primary hover:text-primary/80"
              >
                Reconnect in Settings
              </a>
            </span>
          </div>
        </div>
      )}

      {/* ── Floating bulk action bar (fixed at bottom, doesn't push layout) ── */}
      <BulkActionBar
        count={selectedBills.size}
        summary={formatCurrency(selectedTotal * 100)}
        onClear={() => setSelectedBills(new Set())}
        data-testid="bulk-action-bar-bills"
      >
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setChangeProjectDialogOpen(true)}>
          Change Project
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setChangeSupplierDialogOpen(true)}>
          Change Supplier
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkAiReadMutation.isPending} onClick={() => bulkAiReadMutation.mutate(Array.from(selectedBills))}>
          {bulkAiReadMutation.isPending ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Reading…</>
          ) : (
            <><ScanText className="w-3 h-3 mr-1" />Run AI Read</>
          )}
        </Button>
        <Button size="sm" className="h-7 text-xs bg-status-success text-white" disabled={bulkApproveMutation.isPending} onClick={() => bulkApproveMutation.mutate(Array.from(selectedBills))}>
          {bulkApproveMutation.isPending ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Approving…</>
          ) : (
            <><CheckCircle2 className="w-3 h-3 mr-1" />Approve</>
          )}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" onClick={() => setDeleteDialogOpen(true)}>
          <Trash2 className="w-3 h-3 mr-1" />Delete
        </Button>
      </BulkActionBar>

      {/* ── Dialogs ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {selectedBills.size} bill(s)?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. Are you sure you want to delete the selected bills?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={bulkDeleteMutation.isPending} onClick={() => bulkDeleteMutation.mutate(Array.from(selectedBills))}>
              {bulkDeleteMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>) : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeProjectDialogOpen} onOpenChange={(open) => { setChangeProjectDialogOpen(open); if (!open) setSelectedProjectId(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change project for {selectedBills.size} bill(s)</DialogTitle></DialogHeader>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger><SelectValue placeholder="Select a project or business" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__business__">Business (no project)</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeProjectDialogOpen(false); setSelectedProjectId(""); }}>Cancel</Button>
            <Button disabled={!selectedProjectId || bulkChangeProjectMutation.isPending} style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => bulkChangeProjectMutation.mutate({ billIds: Array.from(selectedBills), projectId: selectedProjectId === "__business__" ? null : selectedProjectId })}>
              {bulkChangeProjectMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>) : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeSupplierDialogOpen} onOpenChange={(open) => { setChangeSupplierDialogOpen(open); if (!open) setSelectedSupplierId(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change supplier for {selectedBills.size} bill(s)</DialogTitle></DialogHeader>
          <SupplierSelect
            value={selectedSupplierId}
            onValueChange={setSelectedSupplierId}
            placeholder="Select a supplier"
            data-testid="select-bulk-supplier"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeSupplierDialogOpen(false); setSelectedSupplierId(""); }}>Cancel</Button>
            <Button disabled={!selectedSupplierId || bulkChangeSupplierMutation.isPending} style={{ backgroundColor: "hsl(var(--primary))", color: "white" }} onClick={() => bulkChangeSupplierMutation.mutate({ billIds: Array.from(selectedBills), supplierId: selectedSupplierId })}>
              {bulkChangeSupplierMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>) : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportFromXeroDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projects={projects}
        suppliers={suppliers}
        defaultProjectId={importProjectId}
      />

      {/* Reconcile-with-Xero divergence report */}
      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><SiXero className="w-4 h-4" /> Out of sync with Xero</DialogTitle>
          </DialogHeader>
          {reconcileReport && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {reconcileReport.diverged} of {reconcileReport.checked} linked bill{reconcileReport.checked === 1 ? "" : "s"} differ from Xero.
                Xero is the source of truth — applying will update these bills to match.
              </p>
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {reconcileReport.results.map((r) => (
                  <div key={r.billId} className="p-2 text-xs">
                    <div className="font-medium">{r.billNumber}</div>
                    <ul className="mt-0.5 text-muted-foreground list-disc list-inside">
                      {r.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ))}
                {reconcileReport.notInXero.length > 0 && (
                  <div className="p-2 text-xs text-muted-foreground">
                    {reconcileReport.notInXero.length} bill(s) linked locally are no longer in Xero: {reconcileReport.notInXero.map((b) => b.billNumber).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileOpen(false)}>Close</Button>
            <Button
              disabled={reconcileApply.isPending || (reconcileReport?.diverged ?? 0) === 0}
              style={{ backgroundColor: "hsl(var(--primary))", color: "white" }}
              onClick={() => reconcileApply.mutate()}
              data-testid="button-reconcile-apply"
            >
              {reconcileApply.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Applying...</>) : `Apply ${reconcileReport?.diverged ?? 0} correction${(reconcileReport?.diverged ?? 0) === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reimbursements queue (admin) ── */}
      {billsView === "reimbursements" && (
        <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">
          <div className="flex items-center justify-between mb-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setBillsView("bills")}
              data-testid="btn-back-to-bills"
            >
              <ChevronRight className="h-3 w-3 rotate-180" />
              Back to Bills
            </button>
          </div>
          <ReimbursementsQueue projectId={projectIdFromUrl || undefined} />
        </div>
      )}

      {/* ── Content ── */}
      {billsView === "bills" && <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">
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

              {/* Faceted filters */}
              <DataTableFilterBar
                facets={[
                  {
                    key: "supplier",
                    label: "Supplier",
                    allLabel: "All suppliers",
                    searchable: true,
                    selected: filterSuppliers,
                    onChange: setFilterSuppliers,
                    options: [...suppliers]
                      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
                      .map((s) => ({ value: s.id, label: s.name || "Unnamed" })),
                  },
                  {
                    key: "project",
                    label: "Project",
                    allLabel: "All projects",
                    searchable: true,
                    hidden: !!projectIdFromUrl,
                    selected: filterProjects,
                    onChange: setFilterProjects,
                    options: [...projects]
                      .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
                      .map((p) => ({ value: p.id, label: p.name || "Unnamed" })),
                  },
                  {
                    key: "overdue",
                    label: "Due",
                    allLabel: "Any",
                    selected: filterOverdue,
                    onChange: setFilterOverdue,
                    options: [{ value: "overdue", label: "Overdue only" }],
                  },
                ]}
                selects={[
                  {
                    key: "date",
                    label: "Bill date",
                    value: filterDateRange,
                    onChange: setFilterDateRange,
                    options: [
                      { value: "all", label: "All time" },
                      { value: "30", label: "Last 30 days" },
                      { value: "90", label: "Last 90 days" },
                      { value: "365", label: "Last 12 months" },
                    ],
                  },
                ]}
              />

              {/* Column picker — far right */}
              <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 border border-transparent ml-auto flex-shrink-0 text-muted-foreground" data-testid="button-column-picker" title="Columns" aria-label="Columns">
                    <Columns3 className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <DataTableColumnPicker storageKey="bills" columns={billPickerColumns} />
                </PopoverContent>
              </Popover>
            </div>

            {/* DataTable */}
            <div className="flex-1 min-h-0">
              {filteredBills.length === 0 ? (
                <EmptyState
                  title={bills.length === 0 ? "No bills found" : "No matching bills"}
                  action={
                    bills.length === 0
                      ? {
                          label: "Add First Bill",
                          onClick: () => setLocation(projectIdFromUrl ? `/projects/${projectIdFromUrl}/bills/new` : "/bills/new"),
                          icon: Plus,
                          "data-testid": "button-add-first-bill",
                        }
                      : undefined
                  }
                  variant="inline"
                  className="py-8"
                />
              ) : (
                <DataTable
                  storageKey="bills"
                  legacyConfigKey="bills-column-config-v1"
                  data={filteredBills}
                  columns={billColumns}
                  rowKey={(b) => b.id}
                  onRowClick={(b) => handleRowClick(b.id)}
                  isRowSelected={(b) => selectedBills.has(b.id)}
                  className="max-h-[calc(100vh-260px)]"
                />
              )}
            </div>
          </div>
        )}

        {/* Amounts summary — sits below the bills list table */}
        {!billsLoading && (
          <div className="hidden md:flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground mt-2 px-1">
            <span data-testid="text-total-count">
              {filteredBills.length} {filteredBills.length === 1 ? "bill" : "bills"}
            </span>
            <div className="w-px h-4 bg-border" />
            <span data-testid="text-total-grand">
              Total <span className="font-medium text-foreground">{formatCurrency(displayedTotal * 100)}</span>
            </span>
            <div className="w-px h-4 bg-border" />
            <span data-testid="text-total-draft">
              Draft <span className="font-medium text-foreground">{formatCurrency(statusTotals.draft * 100)}</span>
            </span>
            <div className="w-px h-4 bg-border" />
            <span data-testid="text-total-awaiting-approval">
              Awaiting Approval <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_approval * 100)}</span>
            </span>
            <div className="w-px h-4 bg-border" />
            <span data-testid="text-total-awaiting-payment">
              Awaiting Payment <span className="font-medium text-foreground">{formatCurrency(statusTotals.awaiting_payment * 100)}</span>
            </span>
          </div>
        )}
      </div>}

      <FilePreviewModal
        file={previewFile}
        open={!!previewFile}
        onOpenChange={(o) => { if (!o) setPreviewFile(null); }}
      />

    </div>
  );
}

