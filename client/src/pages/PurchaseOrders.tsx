import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  ShoppingCart,
  Loader2,
  Columns3,
  MoreVertical,
  Filter,
  ChevronRight,
  Check,
  X,
  Link2,
  ClipboardList,
  CheckCheck,
  Ban,
  Copy,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiXero } from "react-icons/si";
import { StatusBadge } from "@/components/StatusBadge";
import type { PurchaseOrder, Project, Contact, CostCode } from "@shared/schema";

const STATUS_OPTIONS = [
  { key: "all", label: "All Statuses" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "completed", label: "Completed" },
  { key: "billed", label: "Billed" },
  { key: "cancelled", label: "Cancelled" },
];

const SELECT_COL_WIDTH = 32;
const BULK_STATUSES: Array<{ key: string; label: string; icon?: typeof CheckCheck; className?: string }> = [
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted", icon: CheckCheck, className: "text-emerald-600 dark:text-emerald-400" },
  { key: "completed", label: "Completed", className: "text-emerald-600 dark:text-emerald-400" },
  { key: "cancelled", label: "Cancelled", icon: Ban, className: "text-destructive" },
  { key: "draft", label: "Draft", className: "text-muted-foreground" },
];

type POType = "all" | "main" | "site";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function PurchaseOrders({ embedded }: { embedded?: boolean } = {}) {
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
  const [supplierFilterSearch, setSupplierFilterSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newPOProjectId, setNewPOProjectId] = useState<string>("");
  const [isSitePODialogOpen, setIsSitePODialogOpen] = useState(false);
  const [confirmedSitePO, setConfirmedSitePO] = useState<{ poNumber: string; id: string } | null>(null);
  const [sitePOSupplierId, setSitePOSupplierId] = useState<string>("");
  const [sitePOSupplierName, setSitePOSupplierName] = useState<string>("");
  const [sitePOCostCodeId, setSitePOCostCodeId] = useState<string>("");
  const [sitePOAmount, setSitePOAmount] = useState<string>("");
  const [sitePODescription, setSitePODescription] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  const { data: projectCostCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/projects", projectIdFromUrl, "cost-codes"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectIdFromUrl}/cost-codes`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectIdFromUrl,
  });

  const createPoMutation = useMutation({
    mutationFn: async (data: { projectId: string; type: string }) => {
      return apiRequest("/api/purchase-orders", "POST", data);
    },
    onSuccess: (newPO: PurchaseOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsProjectDialogOpen(false);
      setNewPOProjectId("");
      const basePath = `/projects/${newPO.projectId}/purchase-orders/${newPO.id}`;
      setLocation(basePath);
    },
    onError: (error: Error) => {
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
      const p = new URLSearchParams(queryParams);
      const queryString = p.toString();
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

  // Team-member subcontractors that can also act as PO suppliers (avoids duplicate Xero contacts).
  const { data: assignableUsers = [] } = useQuery<Array<{
    id: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    isSubcontractor?: boolean;
  }>>({
    queryKey: ["/api/users/assignable"],
  });

  const projectsMap = useMemo(() => {
    return new Map(projects.map(p => [p.id, p]));
  }, [projects]);

  const currentProject = useMemo(() => {
    return projectIdFromUrl ? projectsMap.get(projectIdFromUrl) : null;
  }, [projectIdFromUrl, projectsMap]);

  const suppliersMap = useMemo(() => {
    return new Map(suppliers.map(s => [s.id, s]));
  }, [suppliers]);

  const supplierUsersMap = useMemo(() => {
    const m = new Map<string, string>();
    assignableUsers.forEach((u) => {
      if (!u.isSubcontractor) return;
      const name =
        u.displayName ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.email ||
        "Team member";
      m.set(u.id, name);
    });
    return m;
  }, [assignableUsers]);

  // Resolve the display name of a PO's supplier whether it points at a contact or a user.
  const supplierNameForPO = (po: PurchaseOrder): string => {
    const anyPo = po as any;
    if (anyPo.supplierId) return suppliersMap.get(anyPo.supplierId)?.name || "";
    if (anyPo.supplierUserId) return supplierUsersMap.get(anyPo.supplierUserId) || "";
    if (anyPo.supplierName) return anyPo.supplierName as string;
    return "";
  };

  const baseFilteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (selectedSupplierId && po.supplierId !== selectedSupplierId) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const project = po.projectId ? projectsMap.get(po.projectId) : null;
        const supplierName = supplierNameForPO(po);
        return (
          po.poNumber?.toLowerCase().includes(term) ||
          po.title?.toLowerCase().includes(term) ||
          po.description?.toLowerCase().includes(term) ||
          project?.name?.toLowerCase().includes(term) ||
          supplierName.toLowerCase().includes(term)
        );
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrders, selectedSupplierId, searchTerm, projectsMap, suppliersMap, supplierUsersMap]);

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
      total: filteredPOs.reduce((sum, po) => sum + (po.total || 0), 0),
      sent: filteredPOs.filter(po => po.status === "sent").reduce((sum, po) => sum + (po.total || 0), 0),
      approved: filteredPOs.filter(po => po.status === "approved").reduce((sum, po) => sum + (po.total || 0), 0),
    };
  }, [filteredPOs]);

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      apiRequest("/api/purchase-orders/bulk-status", "POST", { ids, status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setSelectedIds(new Set());
      toast({
        title: `${vars.ids.length} purchase order${vars.ids.length !== 1 ? "s" : ""} updated to ${vars.status}`,
      });
    },
    onError: (err: Error) => toast({
      title: "Failed to update purchase orders",
      description: err.message,
      variant: "destructive",
    }),
  });

  const duplicatePoMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/purchase-orders/${id}/duplicate`, "POST"),
    onSuccess: (newPo: PurchaseOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order duplicated", description: newPo.poNumber || undefined });
    },
    onError: (err: Error) => toast({
      title: "Failed to duplicate purchase order",
      description: err.message,
      variant: "destructive",
    }),
  });

  const deletePoMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/purchase-orders/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order deleted" });
    },
    onError: (err: Error) => toast({
      title: "Failed to delete purchase order",
      description: err.message,
      variant: "destructive",
    }),
  });

  const handleDuplicatePO = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    duplicatePoMutation.mutate(id);
  };

  const handleDeletePO = (po: PurchaseOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const label = po.poNumber || po.title || "this purchase order";
    if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
      deletePoMutation.mutate(po.id);
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const createSitePOMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      supplierId?: string;
      supplierName?: string;
      costCodeId: string;
      total: number;
      description: string;
      poType: string;
      status: string;
      requiresApproval: boolean;
    }) => {
      return apiRequest("/api/purchase-orders", "POST", data);
    },
    onSuccess: (newPO: PurchaseOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setIsSitePODialogOpen(false);
      resetSitePOForm();
      setConfirmedSitePO({ poNumber: newPO.poNumber || '', id: newPO.id });
    },
    onError: (error: Error) => {
      toast({
        title: "Error creating site PO",
        description: error.message || "Failed to create site purchase order",
        variant: "destructive",
      });
    },
  });

  function resetSitePOForm() {
    setSitePOSupplierId("");
    setSitePOSupplierName("");
    setSitePOCostCodeId("");
    setSitePOAmount("");
    setSitePODescription("");
  }

  function handleCreateSitePO() {
    if (!projectIdFromUrl) return;
    if (!sitePOCostCodeId) {
      toast({ title: "Cost code required", description: "Please select a cost code", variant: "destructive" });
      return;
    }
    const amountInDollars = parseFloat(sitePOAmount);
    if (!sitePOAmount || isNaN(amountInDollars) || amountInDollars < 0) {
      toast({ title: "Valid amount required", description: "Please enter the amount inc. GST", variant: "destructive" });
      return;
    }
    if (!sitePODescription.trim()) {
      toast({ title: "Description required", description: "Please describe what is being purchased", variant: "destructive" });
      return;
    }
    createSitePOMutation.mutate({
      projectId: projectIdFromUrl,
      supplierId: sitePOSupplierId || undefined,
      supplierName: !sitePOSupplierId ? sitePOSupplierName || undefined : undefined,
      costCodeId: sitePOCostCodeId,
      total: Math.round(amountInDollars * 100),
      description: sitePODescription.trim(),
      poType: 'site',
      status: 'draft',
      requiresApproval: false,
    });
  }

  const handleNewPO = () => {
    if (isProjectContext && projectIdFromUrl) {
      createPoMutation.mutate({
        projectId: projectIdFromUrl,
        type: "main",
      });
    } else {
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

  // Main (non-site) POs visible in the table — used for select-all + bulk actions.
  const mainPOs = useMemo(
    () => filteredPOs.filter(po => po.poType !== "site"),
    [filteredPOs],
  );

  const allMainSelected = mainPOs.length > 0 && mainPOs.every(po => selectedIds.has(po.id));
  const someMainSelected = mainPOs.some(po => selectedIds.has(po.id)) && !allMainSelected;

  const toggleSelectAll = () => {
    if (allMainSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mainPOs.map(po => po.id)));
    }
  };

  // ── DataTable column defs ───────────────────────────────────────────────
  const poColumns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(() => {
    const cols: (ColumnDef<PurchaseOrder, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={allMainSelected}
            ref={el => { if (el) el.indeterminate = someMainSelected; }}
            onChange={toggleSelectAll}
            className="w-3 h-3 accent-primary cursor-pointer"
            aria-label="Select all"
            data-testid="checkbox-select-all"
          />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => toggleSelect(row.original.id, e)}>
            <input
              type="checkbox"
              checked={selectedIds.has(row.original.id)}
              onChange={() => {}}
              className="w-3 h-3 accent-primary cursor-pointer"
              data-testid={`checkbox-${row.original.id}`}
            />
          </span>
        ),
        enableSorting: false,
        size: SELECT_COL_WIDTH,
        meta: { defaultWidth: SELECT_COL_WIDTH, align: "left", pinned: true, headerLabel: "Select" },
      },
      {
        id: "poNumber",
        header: "PO Number",
        accessorFn: (po) => po.poNumber || "",
        cell: ({ row }) => (
          <span className="text-xs font-medium text-primary" data-testid={`cell-po-number-${row.original.id}`}>
            {row.original.poNumber}
          </span>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "PO Number" },
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (po) => po.title || "",
        cell: ({ row }) => (
          <span className="text-xs font-medium truncate" data-testid={`cell-name-${row.original.id}`}>
            {row.original.title || <span className="text-muted-foreground italic">Untitled</span>}
          </span>
        ),
        size: 180,
        meta: { defaultWidth: 180, headerLabel: "Name" },
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (po) => po.poType || "",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={`text-data uppercase font-medium ${
              row.original.poType === "site"
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
                : "bg-blue-50 border-blue-200 text-status-info dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
            }`}
          >
            {row.original.poType === "site" ? "Site" : "Std"}
          </Badge>
        ),
        size: 90,
        meta: { defaultWidth: 90, headerLabel: "Type" },
      },
      {
        id: "project",
        header: "Project",
        accessorFn: (po) => (po.projectId ? projectsMap.get(po.projectId)?.name || "" : ""),
        cell: ({ row }) => {
          const project = row.original.projectId ? projectsMap.get(row.original.projectId) : null;
          return (
            <span className="text-xs truncate" data-testid={`cell-project-${row.original.id}`}>
              {project?.name || <span className="text-muted-foreground">-</span>}
            </span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Project" },
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (po) => supplierNameForPO(po),
        cell: ({ row }) => {
          const name = supplierNameForPO(row.original);
          return (
            <span className="text-xs truncate" data-testid={`cell-supplier-${row.original.id}`}>
              {name || <span className="text-muted-foreground">-</span>}
            </span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Supplier" },
      },
      {
        id: "date",
        header: "Date",
        accessorFn: (po) => (po.poDate ? new Date(po.poDate).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-date-${row.original.id}`}>
            {row.original.poDate ? format(new Date(row.original.poDate), "dd MMM yyyy") : "-"}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Date" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (po) => po.status,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            data-testid={`badge-status-${row.original.id}`}
          />
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Status" },
      },
      {
        id: "amount",
        header: "Amount",
        accessorFn: (po) => po.total || 0,
        cell: ({ row }) => (
          <span className="text-xs text-right font-semibold tabular-nums" data-testid={`cell-amount-${row.original.id}`}>
            {formatCurrency(row.original.total || 0)}
          </span>
        ),
        size: 110,
        meta: { defaultWidth: 110, align: "right", headerLabel: "Amount" },
      },
      {
        id: "xero",
        header: "Xero",
        accessorFn: (po) => ((po as any).xeroPurchaseOrderId ? 1 : 0),
        cell: ({ row }) => {
          const xeroId = (row.original as any).xeroPurchaseOrderId as string | null;
          const xeroNum = (row.original as any).xeroPurchaseOrderNumber as string | null;
          const xeroStatus = (row.original as any).xeroStatus as string | null;
          if (!xeroId) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          const statusLabel = xeroStatus
            ? xeroStatus.charAt(0) + xeroStatus.slice(1).toLowerCase()
            : null;
          return (
            <span
              className="inline-flex items-center gap-1 text-xs min-w-0"
              title={
                xeroNum
                  ? `Xero PO ${xeroNum}${xeroStatus ? ` — ${xeroStatus}` : ""}`
                  : "Linked to Xero"
              }
              data-testid={`cell-xero-${row.original.id}`}
            >
              <SiXero className="w-3 h-3 text-[#13B5EA] flex-shrink-0" />
              <span className="truncate text-muted-foreground">
                {xeroNum || "Linked"}
                {statusLabel ? ` · ${statusLabel}` : ""}
              </span>
            </span>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Xero" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground"
                  data-testid={`button-row-actions-${row.original.id}`}
                  title="More actions"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); handleRowClick(row.original.id); }}
                  data-testid={`menu-open-${row.original.id}`}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => handleDuplicatePO(row.original.id, e)}
                  disabled={duplicatePoMutation.isPending}
                  data-testid={`menu-duplicate-${row.original.id}`}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => handleDeletePO(row.original, e)}
                  disabled={deletePoMutation.isPending}
                  className="text-destructive focus:text-destructive"
                  data-testid={`menu-delete-${row.original.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 40,
        meta: { defaultWidth: 40, align: "right", pinned: true, headerLabel: "Actions" },
      },
    ];
    return cols;
  }, [projectsMap, suppliersMap, selectedIds, allMainSelected, someMainSelected, mainPOs, duplicatePoMutation.isPending, deletePoMutation.isPending]);

  const pickerColumns = useMemo(
    () => [
      { id: "select", label: "Select" },
      { id: "poNumber", label: "PO Number" },
      { id: "name", label: "Name" },
      { id: "type", label: "Type" },
      { id: "project", label: "Project" },
      { id: "supplier", label: "Supplier" },
      { id: "date", label: "Date" },
      { id: "status", label: "Status" },
      { id: "amount", label: "Amount" },
      { id: "xero", label: "Xero" },
      { id: "actions", label: "Actions" },
    ],
    [],
  );

  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {isProjectContext && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Purchase Orders</span>
        </div>
      )}
      {/* Single header row - Status tabs + toolbar */}
      <div className="bg-background flex items-center px-3 gap-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STATUS_OPTIONS.map((status) => {
            const isActive = selectedStatus === status.key;
            const label = status.label === "All Statuses" ? "All" : status.label;
            const count = statusCounts[status.key] ?? 0;
            return (
              <button
                key={status.key}
                onClick={() => setSelectedStatus(status.key)}
                data-testid={`filter-status-${status.key}`}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs transition-colors flex-shrink-0 cursor-pointer bg-transparent border-0 ${
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                }`}
              >
                <span>{label}</span>
                <span className={`text-[11px] tabular-nums ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {count}
                </span>
                {isActive && (
                  <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground mr-1">
          <span data-testid="text-total-value">Total: <span className="font-medium text-foreground">{formatCurrency(totals.total)}</span></span>
          <div className="w-px h-4 bg-border" />
          <span data-testid="text-sent-value">Sent: <span className="font-medium text-foreground">{formatCurrency(totals.sent)}</span></span>
          <div className="w-px h-4 bg-border" />
          <span data-testid="text-approved-value">Approved: <span className="font-medium text-foreground">{formatCurrency(totals.approved)}</span></span>
        </div>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Search icon-button (popover with input) */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center ${
                searchTerm ? "bg-primary/10 text-primary border-primary/30" : ""
              }`}
              data-testid="button-search"
              title="Search"
            >
              <Search className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search purchase orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-2 h-7 text-xs"
                data-testid="po-search-input"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter icon-button (popover with supplier filter) */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center ${
                selectedSupplierId ? "bg-primary/10 text-primary border-primary/30" : ""
              }`}
              data-testid="button-filter"
              title="Filter"
            >
              <Filter className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Supplier</div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search suppliers..."
                  value={supplierFilterSearch}
                  onChange={(e) => setSupplierFilterSearch(e.target.value)}
                  className="h-7 pl-7 text-xs"
                  data-testid="input-supplier-filter-search"
                />
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => setSelectedSupplierId(null)}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted dark:hover:bg-gray-800 transition-colors ${
                    !selectedSupplierId ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                  data-testid="filter-supplier-all"
                >
                  All Suppliers
                </button>
                {suppliers
                  .filter((supplier) =>
                    supplier.name.toLowerCase().includes(supplierFilterSearch.trim().toLowerCase())
                  )
                  .map((supplier) => (
                    <button
                      key={supplier.id}
                      onClick={() => setSelectedSupplierId(supplier.id)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted dark:hover:bg-gray-800 transition-colors truncate ${
                        selectedSupplierId === supplier.id ? "bg-primary/10 text-primary font-medium" : ""
                      }`}
                      data-testid={`filter-supplier-${supplier.id}`}
                    >
                      {supplier.name}
                    </button>
                  ))}
                {suppliers.filter((s) =>
                  s.name.toLowerCase().includes(supplierFilterSearch.trim().toLowerCase())
                ).length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    No suppliers found
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {isProjectContext && (
          <button
            onClick={() => setIsSitePODialogOpen(true)}
            disabled={createSitePOMutation.isPending}
            className="h-6 px-2 text-xs border rounded-md bg-amber-500 text-white border-amber-400/20 hover:bg-amber-600 active-elevate-2 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
            data-testid="button-new-site-po"
          >
            {createSitePOMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ClipboardList className="w-3 h-3" />
            )}
            <span>{createSitePOMutation.isPending ? "Creating..." : "New Site PO"}</span>
          </button>
        )}
        <button
          onClick={handleNewPO}
          disabled={createPoMutation.isPending}
          className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
          data-testid="button-new-po"
        >
          {createPoMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          <span>{createPoMutation.isPending ? "Creating..." : "New PO"}</span>
        </button>

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-columns"
              title="Configure columns"
            >
              <Columns3 className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" align="end">
            <DataTableColumnPicker storageKey="purchase-orders" columns={pickerColumns} />
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-po-more"
              title="More actions"
            >
              <MoreVertical className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleNewPO} data-testid="menu-new-po">
              <Plus className="w-3.5 h-3.5 mr-2" />
              New Purchase Order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading purchase orders...</div>
          </div>
        ) : (
          <>
            {/* ── Site PO Section ─────────────────────────────────────────── */}
            {(selectedType === "all" || selectedType === "site") && (() => {
              const sitePOs = filteredPOs.filter(po => po.poType === "site");
              if (sitePOs.length === 0 && selectedType !== "site") return null;
              return (
                <div className="border-b border-border">
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50/50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30">
                    <ClipboardList className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                      Site Purchase Orders
                    </span>
                    <span className="text-xs text-amber-600/70 dark:text-amber-400/70">({sitePOs.length})</span>
                  </div>
                  {sitePOs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <p className="text-sm text-muted-foreground">No site POs yet.</p>
                      {isProjectContext && (
                        <Button size="sm" variant="outline" onClick={() => setIsSitePODialogOpen(true)} data-testid="button-empty-site-po">
                          <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
                          New Site PO
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
                      {sitePOs.map(po => {
                        const anyPo = po as any;
                        const supplierName = supplierNameForPO(po);
                        const project = po.projectId ? projectsMap.get(po.projectId) : null;
                        const statusLabel = po.status === "draft" ? "Open" : po.status === "billed" ? "Matched" : po.status === "cancelled" ? "Closed" : po.status;
                        const statusClass = po.status === "draft"
                          ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                          : po.status === "billed"
                          ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                          : "bg-muted border-border text-muted-foreground";
                        return (
                          <div
                            key={po.id}
                            onClick={() => handleRowClick(po.id)}
                            className="rounded-md border bg-card p-3 cursor-pointer hover-elevate flex flex-col gap-2"
                            data-testid={`site-po-card-${po.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-primary font-mono tracking-tight">{po.poNumber}</span>
                              <Badge variant="outline" className={`text-[11px] font-medium px-1.5 py-0 flex-shrink-0 ${statusClass}`}>
                                {statusLabel}
                              </Badge>
                            </div>
                            {supplierName && (
                              <div className="text-xs text-muted-foreground truncate">{supplierName}</div>
                            )}
                            <div className="text-xs text-foreground line-clamp-2 min-h-[2.5em]">{po.description || <span className="text-muted-foreground italic">No description</span>}</div>
                            <div className="flex items-center justify-between gap-2 mt-auto">
                              <div className="flex flex-col gap-0.5">
                                {!isProjectContext && project && (
                                  <span className="text-[11px] text-muted-foreground truncate">{project.name}</span>
                                )}
                                {po.createdAt && (
                                  <span className="text-[11px] text-muted-foreground">{format(new Date(po.createdAt), "dd MMM yyyy")}</span>
                                )}
                              </div>
                              <span className="text-sm font-semibold tabular-nums">{formatCurrency(po.total || 0)}</span>
                            </div>
                            {po.status === "billed" && anyPo.matchedBillId && (
                              <div className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 mt-0.5">
                                <Link2 className="w-3 h-3 flex-shrink-0" />
                                <span>Matched to bill</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Standard PO Table ──────────────────────────────────────── */}
            {(selectedType === "all" || selectedType === "main") && (() => {
              if (mainPOs.length === 0 && selectedType !== "main") return null;
              const showHeader = selectedType === "all";
              return (
                <div className={showHeader ? "" : "h-full flex flex-col"}>
                  {showHeader && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                      <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Standard Purchase Orders
                      </span>
                      <span className="text-xs text-muted-foreground/70">({mainPOs.length})</span>
                    </div>
                  )}
                  {mainPOs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2">
                      <p className="text-sm text-muted-foreground">No standard purchase orders match your filters.</p>
                    </div>
                  ) : (
                    <DataTable
                      data={mainPOs}
                      columns={poColumns}
                      storageKey="purchase-orders"
                      legacyConfigKey="purchase-orders-column-config-v1"
                      rowKey={(po) => po.id}
                      onRowClick={(po) => handleRowClick(po.id)}
                      rowClassName={(po) => selectedIds.has(po.id) ? "bg-primary/8 dark:bg-primary/10" : ""}
                    />
                  )}
                </div>
              );
            })()}

            {/* ── Empty state when truly nothing ──────────────────────────── */}
            {filteredPOs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <ShoppingCart className="w-6 h-6 text-primary" />
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
                    className="bg-primary hover:bg-primary/90"
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
            )}
          </>
        )}
      </div>

      {/* ── Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-card border border-border rounded-lg shadow-lg px-3 py-2"
          data-testid="bulk-action-bar"
        >
          <span className="text-xs font-medium text-muted-foreground mr-1" data-testid="bulk-count">
            {selectedIds.size} selected
          </span>
          <div className="w-px h-4 bg-border" />
          {BULK_STATUSES.map(s => {
            const Icon = s.icon;
            return (
              <Button
                key={s.key}
                size="sm"
                variant="ghost"
                className={`h-7 px-2 text-xs ${s.className ?? ""}`}
                onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: s.key })}
                disabled={bulkStatusMutation.isPending}
                data-testid={`button-bulk-${s.key}`}
              >
                {Icon && <Icon className="w-3 h-3 mr-1" />}
                {s.label}
              </Button>
            );
          })}
          <div className="w-px h-4 bg-border" />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={clearSelection}
            data-testid="button-bulk-clear"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Site PO Creation Dialog */}
      <Dialog open={isSitePODialogOpen} onOpenChange={(open) => { setIsSitePODialogOpen(open); if (!open) resetSitePOForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Site Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="spo-supplier">Supplier</Label>
              <Select value={sitePOSupplierId} onValueChange={(v) => { setSitePOSupplierId(v === "__manual__" ? "" : v); if (v !== "__manual__") setSitePOSupplierName(""); }}>
                <SelectTrigger id="spo-supplier" data-testid="select-spo-supplier">
                  <SelectValue placeholder="Select supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Enter name manually</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!sitePOSupplierId && (
                <Input
                  placeholder="Supplier name"
                  value={sitePOSupplierName}
                  onChange={e => setSitePOSupplierName(e.target.value)}
                  className="text-sm"
                  data-testid="input-spo-supplier-name"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spo-costcode">Cost Code <span className="text-destructive">*</span></Label>
              <Select value={sitePOCostCodeId} onValueChange={setSitePOCostCodeId}>
                <SelectTrigger id="spo-costcode" data-testid="select-spo-costcode">
                  <SelectValue placeholder="Select cost code" />
                </SelectTrigger>
                <SelectContent>
                  {projectCostCodes.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.code ? `${cc.code} — ${cc.name}` : cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spo-amount">Amount (inc. GST) <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="spo-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={sitePOAmount}
                  onChange={e => setSitePOAmount(e.target.value)}
                  className="pl-7 text-sm"
                  data-testid="input-spo-amount"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spo-description">Description <span className="text-destructive">*</span></Label>
              <Textarea
                id="spo-description"
                placeholder="What is being purchased and why? e.g. 'Timber for frame repairs — approved by PM'"
                value={sitePODescription}
                onChange={e => setSitePODescription(e.target.value)}
                rows={3}
                className="text-sm resize-none"
                data-testid="textarea-spo-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsSitePODialogOpen(false); resetSitePOForm(); }} disabled={createSitePOMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSitePO}
              disabled={createSitePOMutation.isPending || !sitePOCostCodeId || !sitePOAmount || !sitePODescription.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="button-submit-site-po"
            >
              {createSitePOMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              ) : (
                "Create Site PO"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site PO Confirmation Dialog */}
      <Dialog open={!!confirmedSitePO} onOpenChange={(open) => { if (!open) setConfirmedSitePO(null); }}>
        <DialogContent className="sm:max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Site PO Created</h2>
              <p className="text-sm text-muted-foreground">PO number generated successfully</p>
            </div>
            <div className="bg-muted rounded-md px-6 py-4 w-full text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Number</div>
              <div className="text-3xl font-bold font-mono tracking-widest text-primary">{confirmedSitePO?.poNumber}</div>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Give this number to the supplier to include on their invoice.
            </p>
          </div>
          <DialogFooter className="sm:justify-center gap-2">
            <Button variant="outline" onClick={() => setConfirmedSitePO(null)}>Close</Button>
            <Button
              onClick={() => {
                if (confirmedSitePO) handleRowClick(confirmedSitePO.id);
                setConfirmedSitePO(null);
              }}
              className="bg-primary"
            >
              View Site PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="bg-primary hover:bg-primary/90"
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
