import { useState, useMemo, useEffect, useRef } from "react";
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
} from "lucide-react";
import { type Bill, type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid", label: "Paid" },
];

const ALL_BILL_COLUMNS = [
  { id: "checkbox", label: "", required: true, width: 40 },
  { id: "billNumber", label: "ID", required: false, width: 90 },
  { id: "status", label: "Status", required: false, width: 130 },
  { id: "supplier", label: "Supplier", required: false, width: 160 },
  { id: "project", label: "Project", required: false, width: 150 },
  { id: "reference", label: "Reference", required: false, width: 120 },
  { id: "date", label: "Date", required: false, width: 100 },
  { id: "total", label: "Total", required: false, width: 90 },
  { id: "xero", label: "Xero", required: false, width: 50 },
  { id: "due", label: "Due", required: false, width: 90 },
  { id: "attachments", label: "", required: false, width: 40 },
];

const BILL_COL_STORAGE_KEY = "bills-column-config-v1";

function loadBillColumnConfig() {
  try {
    const saved = localStorage.getItem(BILL_COL_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return ALL_BILL_COLUMNS.map((col, i) => ({ id: col.id, visible: true, order: i }));
}

function saveBillColumnConfig(config: { id: string; visible: boolean; order: number }[]) {
  try {
    localStorage.setItem(BILL_COL_STORAGE_KEY, JSON.stringify(config));
  } catch {}
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
  const [columnConfig, setColumnConfig] = useState<{ id: string; visible: boolean; order: number }[]>(loadBillColumnConfig);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const syncHeaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

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

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
    const isWholeNumber = dollars % 1 === 0;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(dollars);
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    return format(new Date(date), "dd MMM yyyy");
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
    awaiting_approval: bills.filter((b) => b.status === "awaiting_approval").length,
    awaiting_payment: bills.filter((b) => b.status === "awaiting_payment").length,
    paid: bills.filter((b) => b.status === "paid").length,
  }), [bills]);

  const statusTotals = useMemo(() => {
    const totals = { draft: 0, awaiting_approval: 0, awaiting_payment: 0, paid: 0 };
    bills.forEach((bill) => {
      const rawAmount = bill.total / 100;
      const amount = (bill as any).billType === "credit" ? -rawAmount : rawAmount;
      if (bill.status === "draft") totals.draft += amount;
      else if (bill.status === "awaiting_approval") totals.awaiting_approval += amount;
      else if (bill.status === "awaiting_payment") totals.awaiting_payment += amount;
      else if (bill.status === "paid") totals.paid += amount;
    });
    return totals;
  }, [bills]);

  const getStatusBadge = (status: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "h-4 px-1.5 text-[10px]" : "";
    switch (status) {
      case "draft": return <Badge variant="secondary" className={sizeClass} data-testid="badge-status-draft">Draft</Badge>;
      case "awaiting_approval": return <Badge variant="destructive" className={sizeClass} data-testid="badge-status-awaiting-approval">Awaiting Approval</Badge>;
      case "awaiting_payment": return <Badge variant="default" className={sizeClass} data-testid="badge-status-awaiting-payment">Awaiting Payment</Badge>;
      case "paid": return <Badge variant="outline" className={`border-green-500 text-green-700 ${sizeClass}`} data-testid="badge-status-paid">Paid</Badge>;
      default: return <Badge variant="outline" className={sizeClass} data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
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

  // Column config helpers
  const isColVisible = (id: string) => {
    if (id === "project" && projectIdFromUrl) return false;
    const col = columnConfig.find((c) => c.id === id);
    const def = ALL_BILL_COLUMNS.find((d) => d.id === id);
    if (!col || !def) return false;
    return def.required ? true : col.visible;
  };

  const toggleColumn = (id: string) => {
    const updated = columnConfig.map((c) => c.id === id ? { ...c, visible: !c.visible } : c);
    setColumnConfig(updated);
    saveBillColumnConfig(updated);
  };

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (id: string, e: React.DragEvent) => { e.preventDefault(); setDragOverId(id); };
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const sorted = [...columnConfig].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((c) => c.id === dragId);
    const toIdx = sorted.findIndex((c) => c.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, order: i }));
    setColumnConfig(updated);
    saveBillColumnConfig(updated);
    setDragId(null);
    setDragOverId(null);
  };

  const orderedColumns = [...columnConfig].sort((a, b) => a.order - b.order).filter(c => isColVisible(c.id));

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
              className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => setLocation("/bills/new")}
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
                  isActive ? "text-foreground border-[#bba7db]" : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {showCount && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full text-[10px] min-w-4 h-4 px-1",
                    isActive ? "bg-[#bba7db]/20 text-[#bba7db]" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3 — Lilac summary strip (no Paid) */}
        <div className="bg-[#bba7db]/10 flex items-center px-5 py-2">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground ml-auto">
            <span data-testid="text-total-draft">
              Draft <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.draft * 100)}</span>
            </span>
            <span className="w-px h-3 bg-[#bba7db]/40 self-center" />
            <span data-testid="text-total-awaiting-approval">
              Awaiting Approval <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.awaiting_approval * 100)}</span>
            </span>
            <span className="w-px h-3 bg-[#bba7db]/40 self-center" />
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
            <Button variant="ghost" size="sm" className="text-xs" style={{ backgroundColor: "#bba7db", color: "white" }} onClick={() => setChangeProjectDialogOpen(true)}>Change Project</Button>
            <Button variant="ghost" size="sm" className="text-xs" style={{ backgroundColor: "#bba7db", color: "white" }} onClick={() => setChangeSupplierDialogOpen(true)}>Change Supplier</Button>
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
            <Button disabled={!selectedProjectId || bulkChangeProjectMutation.isPending} style={{ backgroundColor: "#bba7db", color: "white" }} onClick={() => bulkChangeProjectMutation.mutate({ billIds: Array.from(selectedBills), projectId: selectedProjectId })}>
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
            <Button disabled={!selectedSupplierId || bulkChangeSupplierMutation.isPending} style={{ backgroundColor: "#bba7db", color: "white" }} onClick={() => bulkChangeSupplierMutation.mutate({ billIds: Array.from(selectedBills), supplierId: selectedSupplierId })}>
              {bulkChangeSupplierMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <PopoverContent className="w-52 p-3" align="end">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Columns — drag to reorder</p>
                  <div className="space-y-1">
                    {[...columnConfig].sort((a, b) => a.order - b.order).map((col) => {
                      const def = ALL_BILL_COLUMNS.find((d) => d.id === col.id)!;
                      if (col.id === "project" && projectIdFromUrl) return null;
                      if (!def) return null;
                      return (
                        <div
                          key={col.id}
                          draggable
                          onDragStart={() => onDragStart(col.id)}
                          onDragOver={(e) => onDragOver(col.id, e)}
                          onDrop={() => onDrop(col.id)}
                          className={cn(
                            "flex items-center gap-2 p-1.5 rounded-md text-sm select-none",
                            dragOverId === col.id ? "bg-accent" : "hover-elevate"
                          )}
                        >
                          <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab flex-shrink-0" />
                          <Checkbox checked={def.required ? true : col.visible} disabled={def.required} onCheckedChange={() => toggleColumn(col.id)} className="border-border/50" />
                          <span className={cn("flex-1 text-xs", def.required && "text-muted-foreground")}>{def.label || col.id}</span>
                          {def.required && <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Column header — slim, sticky below search */}
            <div ref={headerScrollRef} className="overflow-x-hidden sticky top-9 z-10 border-b border-border bg-muted/50">
              <Table style={{ tableLayout: "fixed" }}>
                <TableHeader>
                  <TableRow className="h-5 bg-muted/50 hover:bg-muted/50">
                    {orderedColumns.map((col) => {
                      const def = ALL_BILL_COLUMNS.find((d) => d.id === col.id)!;
                      const isRight = ["total", "due"].includes(col.id);
                      const isCenter = ["checkbox", "xero", "attachments"].includes(col.id);
                      return (
                        <TableHead
                          key={col.id}
                          style={{ minWidth: def.width, width: def.width }}
                          className={cn(
                            "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2",
                            isRight && "text-right",
                            isCenter && "text-center"
                          )}
                          data-testid={`header-${col.id}`}
                        >
                          {col.id === "attachments" ? <Paperclip className="h-3 w-3 inline" /> : def.label}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
              </Table>
            </div>

            {/* Table body */}
            <div ref={bodyScrollRef} onScroll={syncHeaderScroll} className="overflow-x-auto">
              <Table style={{ tableLayout: "fixed" }}>
                <TableBody>
                  {filteredBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={orderedColumns.length} className="text-center py-8">
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-muted-foreground text-sm">
                            {bills.length === 0 ? "No bills found" : "No matching bills"}
                          </p>
                          {bills.length === 0 && (
                            <button
                              className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                              onClick={() => setLocation("/bills/new")}
                              data-testid="button-add-first-bill"
                            >
                              <Plus className="w-3.5 h-3.5" />Add First Bill
                            </button>
                          )}
                        </div>
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
                          className="cursor-pointer hover-elevate h-9"
                          onClick={() => handleRowClick(bill.id)}
                          data-testid={`row-bill-${bill.id}`}
                        >
                          {orderedColumns.map((col) => {
                            switch (col.id) {
                              case "checkbox":
                                return (
                                  <TableCell key="checkbox" style={{ minWidth: 40, width: 40 }} className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox checked={selectedBills.has(bill.id)} onCheckedChange={(checked) => handleSelectBill(bill.id, checked as boolean)} data-testid={`checkbox-bill-${bill.id}`} />
                                  </TableCell>
                                );
                              case "billNumber":
                                return (
                                  <TableCell key="billNumber" style={{ minWidth: 90, width: 90 }} className="text-xs font-medium px-2 py-1" data-testid={`text-bill-number-${bill.id}`}>
                                    <div className="flex items-center gap-1">
                                      {bill.billNumber}
                                      {(bill as any).billType === "credit" && (
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 dark:text-green-400 border-green-300 dark:border-green-600">Credit</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                );
                              case "status":
                                return (
                                  <TableCell key="status" style={{ minWidth: 130, width: 130 }} className="px-2 py-1" data-testid={`badge-bill-status-${bill.id}`}>
                                    {getStatusBadge(bill.status, "sm")}
                                  </TableCell>
                                );
                              case "supplier":
                                return (
                                  <TableCell key="supplier" style={{ minWidth: 160, width: 160 }} className="text-xs px-2 py-1" data-testid={`text-supplier-name-${bill.id}`}>
                                    <div className="flex items-center gap-1">
                                      <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                      <span className="truncate">{getSupplierName(bill.supplierId, bill)}</span>
                                    </div>
                                  </TableCell>
                                );
                              case "project":
                                return (
                                  <TableCell key="project" style={{ minWidth: 150, width: 150 }} className="px-2 py-1" data-testid={`text-project-${bill.id}`}>
                                    {project && (
                                      <div className="flex items-center gap-1.5">
                                        <ProjectIcon icon={project.icon} color={project.color} className="w-3 h-3 flex-shrink-0" />
                                        <span className="text-xs truncate">{project.name}</span>
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              case "reference":
                                return (
                                  <TableCell key="reference" style={{ minWidth: 120, width: 120 }} className="text-xs text-muted-foreground px-2 py-1" data-testid={`text-reference-${bill.id}`}>
                                    {bill.billReference || "-"}
                                  </TableCell>
                                );
                              case "date":
                                return (
                                  <TableCell key="date" style={{ minWidth: 100, width: 100 }} className="text-xs px-2 py-1" data-testid={`text-date-${bill.id}`}>
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                      {formatDate(bill.billDate)}
                                    </div>
                                  </TableCell>
                                );
                              case "total":
                                return (
                                  <TableCell key="total" style={{ minWidth: 90, width: 90 }} className={cn("text-xs font-medium text-right px-2 py-1", (bill as any).billType === "credit" && "text-green-600 dark:text-green-400")} data-testid={`text-total-${bill.id}`}>
                                    {(bill as any).billType === "credit" ? `-${formatCurrency(bill.total)}` : formatCurrency(bill.total)}
                                  </TableCell>
                                );
                              case "xero":
                                return (
                                  <TableCell key="xero" style={{ minWidth: 50, width: 50 }} className="text-center px-2 py-1" data-testid={`icon-sync-${bill.id}`}>
                                    {bill.xeroInvoiceId && <Circle className="h-3 w-3 inline fill-blue-500 text-blue-500" />}
                                  </TableCell>
                                );
                              case "due":
                                return (
                                  <TableCell key="due" style={{ minWidth: 90, width: 90 }} className="text-xs font-medium text-right px-2 py-1" data-testid={`text-due-${bill.id}`}>
                                    {formatCurrency(dueAmount)}
                                  </TableCell>
                                );
                              case "attachments":
                                return (
                                  <TableCell key="attachments" style={{ minWidth: 40, width: 40 }} className="text-center px-2 py-1" data-testid={`text-attachments-${bill.id}`}>
                                    {attachmentCount > 0 && (
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
                                    )}
                                  </TableCell>
                                );
                              default:
                                return null;
                            }
                          })}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
