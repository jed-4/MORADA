import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Search, 
  LayoutList, 
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  ExternalLink,
  Send,
  Copy,
  Trash2,
  Building2,
  Hammer,
  Loader2,
  Columns3,
  Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Label } from "@/components/ui/label";
import type { PurchaseOrder, Project, Contact } from "@shared/schema";

const STATUS_OPTIONS = [
  { key: "all", label: "All Statuses" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
  sent: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" },
  approved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" },
  received: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" },
};

type POType = "all" | "main" | "site";

const COLUMN_DEFINITIONS = [
  { key: "poNumber", label: "PO Number", defaultVisible: true },
  { key: "type", label: "Type", defaultVisible: true },
  { key: "project", label: "Project", defaultVisible: true },
  { key: "supplier", label: "Supplier", defaultVisible: true },
  { key: "description", label: "Description", defaultVisible: true },
  { key: "date", label: "Date", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "amount", label: "Amount", defaultVisible: true },
] as const;

type ColumnKey = typeof COLUMN_DEFINITIONS[number]["key"];

function getDefaultColumnVisibility(): Record<ColumnKey, boolean> {
  return COLUMN_DEFINITIONS.reduce((acc, col) => {
    acc[col.key] = col.defaultVisible;
    return acc;
  }, {} as Record<ColumnKey, boolean>);
}

function loadColumnVisibility(): Record<ColumnKey, boolean> {
  try {
    const saved = localStorage.getItem("po-column-visibility");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle new columns
      return { ...getDefaultColumnVisibility(), ...parsed };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return getDefaultColumnVisibility();
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function PurchaseOrders() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId;
  const isProjectContext = !!projectIdFromUrl;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<POType>("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newPOProjectId, setNewPOProjectId] = useState<string>("");
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>(loadColumnVisibility);

  const toggleColumn = (key: ColumnKey) => {
    setColumnVisibility(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem("po-column-visibility", JSON.stringify(updated));
      return updated;
    });
  };

  const hiddenColumnCount = useMemo(() => {
    return COLUMN_DEFINITIONS.filter(col => !columnVisibility[col.key]).length;
  }, [columnVisibility]);

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  // Create new PO mutation - creates the PO first, then navigates to it
  const createPoMutation = useMutation({
    mutationFn: async (data: { projectId: string; type: string }) => {
      return apiRequest("/api/purchase-orders", "POST", data);
    },
    onSuccess: (newPO: PurchaseOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsProjectDialogOpen(false);
      setNewPOProjectId("");
      // Navigate to the newly created PO (use the PO's projectId for the URL)
      const basePath = `/projects/${newPO.projectId}/purchase-orders/${newPO.id}`;
      setLocation(basePath);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating purchase order",
        description: error.message || "Failed to create purchase order",
        variant: "destructive",
      });
    },
  });

  const queryParams: Record<string, string> = {};
  if (selectedProjectId) {
    queryParams.projectId = selectedProjectId;
  }

  const { data: purchaseOrders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/purchase-orders?${queryString}` : "/api/purchase-orders";
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

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const suppliers = useMemo(() => {
    return contacts.filter(c => c.contactType === "supplier" || c.contactType === "subcontractor");
  }, [contacts]);

  const projectsMap = useMemo(() => {
    return new Map(projects.map(p => [p.id, p]));
  }, [projects]);

  const currentProject = useMemo(() => {
    return projectIdFromUrl ? projectsMap.get(projectIdFromUrl) : null;
  }, [projectIdFromUrl, projectsMap]);

  const suppliersMap = useMemo(() => {
    return new Map(suppliers.map(s => [s.id, s]));
  }, [suppliers]);

  const baseFilteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (selectedSupplierId && po.supplierId !== selectedSupplierId) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const project = po.projectId ? projectsMap.get(po.projectId) : null;
        const supplier = po.supplierId ? suppliersMap.get(po.supplierId) : null;
        return (
          po.poNumber?.toLowerCase().includes(term) ||
          po.description?.toLowerCase().includes(term) ||
          project?.name?.toLowerCase().includes(term) ||
          supplier?.name?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [purchaseOrders, selectedSupplierId, searchTerm, projectsMap, suppliersMap]);

  const filteredByType = useMemo(() => {
    if (selectedType === "all") return baseFilteredPOs;
    return baseFilteredPOs.filter(po => po.poType === selectedType);
  }, [baseFilteredPOs, selectedType]);

  const filteredPOs = useMemo(() => {
    if (selectedStatus === "all") return filteredByType;
    return filteredByType.filter(po => po.status === selectedStatus);
  }, [filteredByType, selectedStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filteredByType.length };
    STATUS_OPTIONS.forEach(s => {
      if (s.key !== "all") {
        counts[s.key] = filteredByType.filter(po => po.status === s.key).length;
      }
    });
    return counts;
  }, [filteredByType]);

  const typeCounts = useMemo(() => {
    const typeFiltered = baseFilteredPOs.filter(po => 
      selectedStatus === "all" || po.status === selectedStatus
    );
    return {
      all: typeFiltered.length,
      main: typeFiltered.filter(po => po.poType === "main").length,
      site: typeFiltered.filter(po => po.poType === "site").length,
    };
  }, [baseFilteredPOs, selectedStatus]);

  const totals = useMemo(() => {
    return {
      total: filteredPOs.reduce((sum, po) => sum + (po.totalAmountCents || 0), 0),
      sent: filteredPOs.filter(po => po.status === "sent").reduce((sum, po) => sum + (po.totalAmountCents || 0), 0),
      approved: filteredPOs.filter(po => po.status === "approved").reduce((sum, po) => sum + (po.totalAmountCents || 0), 0),
    };
  }, [filteredPOs]);

  const handleNewPO = () => {
    if (isProjectContext && projectIdFromUrl) {
      // In project context - create PO directly
      createPoMutation.mutate({
        projectId: projectIdFromUrl,
        type: "main",
      });
    } else {
      // Not in project context - show project selection dialog
      setNewPOProjectId(projects.length > 0 ? projects[0].id : "");
      setIsProjectDialogOpen(true);
    }
  };

  const handleCreatePOWithProject = () => {
    if (!newPOProjectId) {
      toast({
        title: "Project required",
        description: "Please select a project for this purchase order",
        variant: "destructive",
      });
      return;
    }
    createPoMutation.mutate({
      projectId: newPOProjectId,
      type: "main",
    });
  };

  const handleRowClick = (poId: string) => {
    const basePath = isProjectContext 
      ? `/projects/${projectIdFromUrl}/purchase-orders/${poId}`
      : `/purchase-orders/${poId}`;
    setLocation(basePath);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Row 1 - Breadcrumbs + Title + Actions */}
      <div className="h-9 bg-white dark:bg-gray-950 flex items-center justify-between px-3 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="breadcrumbs">
            {isProjectContext && currentProject && (
              <>
                <button
                  onClick={() => setLocation(`/projects/${projectIdFromUrl}`)}
                  className="hover:text-foreground transition-colors"
                >
                  {currentProject.name}
                </button>
                <ChevronRight className="w-3 h-3" />
              </>
            )}
            <span className="text-foreground font-medium">Purchase Orders</span>
          </nav>
          <Badge variant="secondary" className="text-xs" data-testid="text-po-count">
            {filteredPOs.length}
          </Badge>
        </div>

        <button
          onClick={handleNewPO}
          disabled={createPoMutation.isPending}
          className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1 disabled:opacity-50"
          data-testid="button-new-po"
        >
          {createPoMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          <span>{createPoMutation.isPending ? "Creating..." : "New PO"}</span>
        </button>
      </div>

      {/* Row 2 - Type Tabs + Totals */}
      <div className="h-9 bg-white dark:bg-gray-950 flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSelectedType("all")}
            className={`h-6 px-2 text-xs border rounded-md ${
              selectedType === "all"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-type-all"
          >
            <LayoutList className="w-3 h-3" />
            <span>All</span>
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{typeCounts.all}</Badge>
          </button>
          <button
            onClick={() => setSelectedType("main")}
            className={`h-6 px-2 text-xs border rounded-md ${
              selectedType === "main"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-type-main"
          >
            <Building2 className="w-3 h-3" />
            <span>Standard</span>
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{typeCounts.main}</Badge>
          </button>
          <button
            onClick={() => setSelectedType("site")}
            className={`h-6 px-2 text-xs border rounded-md ${
              selectedType === "site"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-type-site"
          >
            <Hammer className="w-3 h-3" />
            <span>Site</span>
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{typeCounts.site}</Badge>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span data-testid="text-total-value">Total: <span className="font-medium text-foreground">{formatCurrency(totals.total)}</span></span>
          <div className="w-px h-4 bg-border" />
          <span data-testid="text-sent-value">Sent: <span className="font-medium text-foreground">{formatCurrency(totals.sent)}</span></span>
          <div className="w-px h-4 bg-border" />
          <span data-testid="text-approved-value">Approved: <span className="font-medium text-foreground">{formatCurrency(totals.approved)}</span></span>
        </div>
      </div>

      {/* Row 3 - Search + Status Filters + Supplier + Columns */}
      <div className="h-9 bg-white dark:bg-gray-950 flex items-center px-3 border-b border-border flex-shrink-0 gap-2">
        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search POs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs border"
            data-testid="po-search-input"
          />
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Status Filter */}
        <div className="flex items-center gap-0.5">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status.key}
              onClick={() => setSelectedStatus(status.key)}
              className={`h-5 px-1.5 text-[10px] border rounded ${
                selectedStatus === status.key
                  ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                  : "hover-elevate"
              } active-elevate-2`}
              data-testid={`filter-status-${status.key}`}
            >
              {status.label === "All Statuses" ? "All" : status.label}
              {statusCounts[status.key] > 0 && (
                <span className="ml-0.5 opacity-70">({statusCounts[status.key]})</span>
              )}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Supplier Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="filter-supplier-popover"
            >
              <span>{selectedSupplierId ? suppliersMap.get(selectedSupplierId)?.name || "Supplier" : "Supplier"}</span>
              {selectedSupplierId && (
                <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                  1
                </Badge>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => setSelectedSupplierId(null)}
                className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  !selectedSupplierId ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                }`}
                data-testid="filter-supplier-all"
              >
                All Suppliers
              </button>
              {suppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  onClick={() => setSelectedSupplierId(supplier.id)}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors truncate ${
                    selectedSupplierId === supplier.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                  }`}
                  data-testid={`filter-supplier-${supplier.id}`}
                >
                  {supplier.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Column Visibility */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="button-columns"
            >
              <Columns3 className="w-3 h-3" />
              <span>Columns</span>
              {hiddenColumnCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px] px-1">
                  {COLUMN_DEFINITIONS.length - hiddenColumnCount}/{COLUMN_DEFINITIONS.length}
                </Badge>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                Toggle Columns
              </div>
              {COLUMN_DEFINITIONS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between"
                  data-testid={`toggle-column-${col.key}`}
                >
                  <span>{col.label}</span>
                  {columnVisibility[col.key] && (
                    <Check className="w-4 h-4 text-[#bba7db]" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading purchase orders...</div>
          </div>
        ) : filteredPOs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <div className="w-12 h-12 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-4">
              <ShoppingCart className="w-6 h-6 text-[#bba7db]" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Purchase Orders</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              {searchTerm || selectedStatus !== "all" || selectedType !== "all"
                ? "No purchase orders match your current filters."
                : "Create your first purchase order to start tracking orders to suppliers."}
            </p>
            {!searchTerm && selectedStatus === "all" && selectedType === "all" && (
              <Button
                onClick={handleNewPO}
                disabled={createPoMutation.isPending}
                className="bg-[#bba7db] hover:bg-[#bba7db]/90"
                size="sm"
                data-testid="button-empty-new-po"
              >
                {createPoMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {createPoMutation.isPending ? "Creating..." : "New Purchase Order"}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900">
                {columnVisibility.poNumber && (
                  <TableHead className="w-[100px] text-xs font-medium">PO Number</TableHead>
                )}
                {columnVisibility.type && (
                  <TableHead className="w-[80px] text-xs font-medium">Type</TableHead>
                )}
                {columnVisibility.project && (
                  <TableHead className="text-xs font-medium">Project</TableHead>
                )}
                {columnVisibility.supplier && (
                  <TableHead className="text-xs font-medium">Supplier</TableHead>
                )}
                {columnVisibility.description && (
                  <TableHead className="text-xs font-medium">Description</TableHead>
                )}
                {columnVisibility.date && (
                  <TableHead className="w-[100px] text-xs font-medium">Date</TableHead>
                )}
                {columnVisibility.status && (
                  <TableHead className="w-[100px] text-xs font-medium">Status</TableHead>
                )}
                {columnVisibility.amount && (
                  <TableHead className="w-[100px] text-xs font-medium text-right">Amount</TableHead>
                )}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.map((po) => {
                const project = po.projectId ? projectsMap.get(po.projectId) : null;
                const supplier = po.supplierId ? suppliersMap.get(po.supplierId) : null;
                const statusStyle = STATUS_COLORS[po.status] || STATUS_COLORS.draft;

                return (
                  <TableRow 
                    key={po.id} 
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                    onClick={() => handleRowClick(po.id)}
                    data-testid={`po-row-${po.id}`}
                  >
                    {columnVisibility.poNumber && (
                      <TableCell className="text-xs font-medium text-[#bba7db]">
                        {po.poNumber}
                      </TableCell>
                    )}
                    {columnVisibility.type && (
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] ${
                            po.poType === "site" 
                              ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" 
                              : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
                          }`}
                        >
                          {po.poType === "site" ? "Site" : "Standard"}
                        </Badge>
                      </TableCell>
                    )}
                    {columnVisibility.project && (
                      <TableCell className="text-xs">
                        {project?.name || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    )}
                    {columnVisibility.supplier && (
                      <TableCell className="text-xs">
                        {supplier?.name || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    )}
                    {columnVisibility.description && (
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {po.description || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    )}
                    {columnVisibility.date && (
                      <TableCell className="text-xs text-muted-foreground">
                        {po.createdAt ? format(new Date(po.createdAt), "dd MMM yyyy") : "-"}
                      </TableCell>
                    )}
                    {columnVisibility.status && (
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className={`text-[10px] capitalize ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {po.status}
                        </Badge>
                      </TableCell>
                    )}
                    {columnVisibility.amount && (
                      <TableCell className="text-xs text-right font-medium">
                        {formatCurrency(po.totalAmountCents || 0)}
                      </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRowClick(po.id)}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Send className="w-4 h-4 mr-2" />
                            Send to Supplier
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Project Selection Dialog */}
      <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project">Select Project</Label>
              <Select value={newPOProjectId} onValueChange={setNewPOProjectId}>
                <SelectTrigger id="project" data-testid="select-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsProjectDialogOpen(false)}
              disabled={createPoMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePOWithProject}
              disabled={!newPOProjectId || createPoMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-create-po"
            >
              {createPoMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Purchase Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
