import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
  Check,
  GripVertical
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type ColumnKey = "poNumber" | "name" | "type" | "project" | "supplier" | "date" | "status" | "amount";

const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "poNumber", "name", "type", "project", "supplier", "date", "status", "amount"
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  poNumber: "PO Number",
  name: "Name",
  type: "Type",
  project: "Project",
  supplier: "Supplier",
  date: "Date",
  status: "Status",
  amount: "Amount",
};

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  poNumber: 110,
  name: 180,
  type: 90,
  project: 160,
  supplier: 160,
  date: 100,
  status: 100,
  amount: 110,
};

const MIN_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  poNumber: 80,
  name: 100,
  type: 70,
  project: 100,
  supplier: 100,
  date: 80,
  status: 80,
  amount: 80,
};

const MAX_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  poNumber: 200,
  name: 400,
  type: 150,
  project: 300,
  supplier: 300,
  date: 150,
  status: 150,
  amount: 180,
};

function getDefaultColumnVisibility(): Record<ColumnKey, boolean> {
  return DEFAULT_COLUMN_ORDER.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {} as Record<ColumnKey, boolean>);
}

interface ColumnPreferences {
  visibility: Record<ColumnKey, boolean>;
  order: ColumnKey[];
  widths: Record<ColumnKey, number>;
}

function loadColumnPreferences(): ColumnPreferences {
  try {
    const saved = localStorage.getItem("po-column-preferences");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure all columns are present (handles new columns being added)
      const order = parsed.order?.filter((k: string) => DEFAULT_COLUMN_ORDER.includes(k as ColumnKey)) || [];
      DEFAULT_COLUMN_ORDER.forEach(k => {
        if (!order.includes(k)) order.push(k);
      });
      return {
        visibility: { ...getDefaultColumnVisibility(), ...parsed.visibility },
        order: order.length === DEFAULT_COLUMN_ORDER.length ? order : DEFAULT_COLUMN_ORDER,
        widths: { ...DEFAULT_COLUMN_WIDTHS, ...parsed.widths },
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return {
    visibility: getDefaultColumnVisibility(),
    order: DEFAULT_COLUMN_ORDER,
    widths: { ...DEFAULT_COLUMN_WIDTHS },
  };
}

function saveColumnPreferences(prefs: ColumnPreferences) {
  localStorage.setItem("po-column-preferences", JSON.stringify(prefs));
}

function SortableColumnItem({ 
  columnKey, 
  label, 
  isVisible, 
  onToggle 
}: { 
  columnKey: ColumnKey; 
  label: string; 
  isVisible: boolean; 
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      <div
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <button
        onClick={onToggle}
        className="flex-1 text-left px-1 py-1.5 text-sm flex items-center justify-between"
        data-testid={`toggle-column-${columnKey}`}
      >
        <span>{label}</span>
        {isVisible && (
          <Check className="w-4 h-4 text-[#bba7db]" />
        )}
      </button>
    </div>
  );
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
  const [columnPrefs, setColumnPrefs] = useState<ColumnPreferences>(loadColumnPreferences);
  
  // Column resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef<{ columnId: ColumnKey; startX: number; startWidth: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleColumn = (key: ColumnKey) => {
    setColumnPrefs(prev => {
      const updated = {
        ...prev,
        visibility: { ...prev.visibility, [key]: !prev.visibility[key] },
      };
      saveColumnPreferences(updated);
      return updated;
    });
  };

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumnPrefs(prev => {
        const oldIndex = prev.order.indexOf(active.id as ColumnKey);
        const newIndex = prev.order.indexOf(over.id as ColumnKey);
        const newOrder = arrayMove(prev.order, oldIndex, newIndex);
        const updated = { ...prev, order: newOrder };
        saveColumnPreferences(updated);
        return updated;
      });
    }
  };

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    
    const currentWidth = columnPrefs.widths[columnId] || DEFAULT_COLUMN_WIDTHS[columnId];
    resizeStateRef.current = {
      columnId,
      startX: e.clientX,
      startWidth: currentWidth,
    };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnPrefs.widths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStateRef.current) return;
      
      const { columnId, startX, startWidth } = resizeStateRef.current;
      const delta = e.clientX - startX;
      const minWidth = MIN_COLUMN_WIDTHS[columnId];
      const maxWidth = MAX_COLUMN_WIDTHS[columnId];
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      
      setColumnPrefs(prev => ({
        ...prev,
        widths: { ...prev.widths, [columnId]: newWidth },
      }));
    };

    const handleMouseUp = () => {
      if (resizeStateRef.current) {
        resizeStateRef.current = null;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Save after resize ends
        setColumnPrefs(prev => {
          saveColumnPreferences(prev);
          return prev;
        });
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const hiddenColumnCount = useMemo(() => {
    return DEFAULT_COLUMN_ORDER.filter(key => !columnPrefs.visibility[key]).length;
  }, [columnPrefs.visibility]);

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
          po.title?.toLowerCase().includes(term) ||
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
      <div className="h-10 bg-gray-50/80 dark:bg-gray-900/50 flex items-center px-3 border-b border-border flex-shrink-0 gap-2">
        {/* Search */}
        <div className="relative w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, PO#, supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-2 py-0 h-7 text-xs bg-white dark:bg-gray-950 border rounded-md"
            data-testid="po-search-input"
          />
        </div>

        <div className="w-px h-5 bg-border/60" />

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status.key}
              onClick={() => setSelectedStatus(status.key)}
              className={`h-6 px-2 text-[11px] font-medium rounded-full transition-all ${
                selectedStatus === status.key
                  ? "bg-[#bba7db] text-white shadow-sm"
                  : "bg-white dark:bg-gray-900 border hover-elevate"
              }`}
              data-testid={`filter-status-${status.key}`}
            >
              {status.label === "All Statuses" ? "All" : status.label}
              {statusCounts[status.key] > 0 && (
                <span className={`ml-1 ${selectedStatus === status.key ? "opacity-80" : "text-muted-foreground"}`}>
                  {statusCounts[status.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border/60" />

        {/* Supplier Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all ${
                selectedSupplierId 
                  ? "bg-[#bba7db]/10 text-[#bba7db] border border-[#bba7db]/30 font-medium" 
                  : "bg-white dark:bg-gray-900 border hover-elevate"
              }`}
              data-testid="filter-supplier-popover"
            >
              <span className="truncate max-w-[120px]">
                {selectedSupplierId ? suppliersMap.get(selectedSupplierId)?.name || "Supplier" : "Supplier"}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
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
              className="h-7 w-7 text-xs bg-white dark:bg-gray-900 border rounded-md hover-elevate flex items-center justify-center"
              data-testid="button-columns"
              title="Configure columns"
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="end">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-foreground px-2 py-1.5 flex items-center justify-between border-b mb-1">
                <span>Table Columns</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {DEFAULT_COLUMN_ORDER.length - hiddenColumnCount}/{DEFAULT_COLUMN_ORDER.length}
                </Badge>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
              >
                <SortableContext
                  items={columnPrefs.order}
                  strategy={verticalListSortingStrategy}
                >
                  {columnPrefs.order.map((key) => (
                    <SortableColumnItem
                      key={key}
                      columnKey={key}
                      label={COLUMN_LABELS[key]}
                      isVisible={columnPrefs.visibility[key]}
                      onToggle={() => toggleColumn(key)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-3">
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
          <Card className="border-2 overflow-hidden">
            <div className="overflow-x-auto">
              <Table style={{ tableLayout: "fixed" }}>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 dark:bg-gray-900/50 border-b-2 border-[#bba7db]/20">
                    {columnPrefs.order.map((key) => {
                      if (!columnPrefs.visibility[key]) return null;
                      const width = columnPrefs.widths[key] || DEFAULT_COLUMN_WIDTHS[key];
                      const isLast = columnPrefs.order.filter(k => columnPrefs.visibility[k]).indexOf(key) === 
                        columnPrefs.order.filter(k => columnPrefs.visibility[k]).length - 1;
                      return (
                        <TableHead 
                          key={key} 
                          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground relative group"
                          style={{ width: `${width}px`, minWidth: `${MIN_COLUMN_WIDTHS[key]}px` }}
                        >
                          <div className={`flex items-center ${key === "amount" ? "justify-end" : ""}`}>
                            {COLUMN_LABELS[key]}
                          </div>
                          {!isLast && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-col-resize group/resize"
                              onMouseDown={(e) => handleResizeStart(e, key)}
                              data-testid={`resize-handle-${key}`}
                            >
                              <div className="w-0.5 h-full mx-auto bg-transparent group-hover/resize:bg-[#bba7db] transition-colors" />
                            </div>
                          )}
                        </TableHead>
                      );
                    })}
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPOs.map((po, index) => {
                    const project = po.projectId ? projectsMap.get(po.projectId) : null;
                    const supplier = po.supplierId ? suppliersMap.get(po.supplierId) : null;
                    const statusStyle = STATUS_COLORS[po.status] || STATUS_COLORS.draft;
                    const isEven = index % 2 === 0;

                    return (
                      <TableRow 
                        key={po.id} 
                        className={`cursor-pointer hover-elevate transition-colors ${
                          isEven ? "bg-white dark:bg-gray-950" : "bg-gray-50/50 dark:bg-gray-900/30"
                        }`}
                        onClick={() => handleRowClick(po.id)}
                        data-testid={`po-row-${po.id}`}
                      >
                        {columnPrefs.order.map((key) => {
                          if (!columnPrefs.visibility[key]) return null;
                          const width = columnPrefs.widths[key] || DEFAULT_COLUMN_WIDTHS[key];
                          switch (key) {
                            case "poNumber":
                              return (
                                <TableCell key={key} className="text-xs font-medium text-[#bba7db]" style={{ width: `${width}px` }}>
                                  {po.poNumber}
                                </TableCell>
                              );
                            case "name":
                              return (
                                <TableCell key={key} className="text-xs font-medium truncate" style={{ width: `${width}px`, maxWidth: `${width}px` }}>
                                  {po.title || <span className="text-muted-foreground italic">Untitled</span>}
                                </TableCell>
                              );
                            case "type":
                              return (
                                <TableCell key={key} style={{ width: `${width}px` }}>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] uppercase font-medium ${
                                      po.poType === "site" 
                                        ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" 
                                        : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
                                    }`}
                                  >
                                    {po.poType === "site" ? "Site" : "Std"}
                                  </Badge>
                                </TableCell>
                              );
                            case "project":
                              return (
                                <TableCell key={key} className="text-xs truncate" style={{ width: `${width}px`, maxWidth: `${width}px` }}>
                                  {project?.name || <span className="text-muted-foreground">-</span>}
                                </TableCell>
                              );
                            case "supplier":
                              return (
                                <TableCell key={key} className="text-xs truncate" style={{ width: `${width}px`, maxWidth: `${width}px` }}>
                                  {supplier?.name || <span className="text-muted-foreground">-</span>}
                                </TableCell>
                              );
                            case "date":
                              return (
                                <TableCell key={key} className="text-xs text-muted-foreground" style={{ width: `${width}px` }}>
                                  {po.poDate ? format(new Date(po.poDate), "dd MMM yyyy") : "-"}
                                </TableCell>
                              );
                            case "status":
                              return (
                                <TableCell key={key} style={{ width: `${width}px` }}>
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-[10px] uppercase font-medium ${statusStyle.bg} ${statusStyle.text}`}
                                  >
                                    {po.status}
                                  </Badge>
                                </TableCell>
                              );
                            case "amount":
                              return (
                                <TableCell key={key} className="text-xs text-right font-semibold tabular-nums" style={{ width: `${width}px` }}>
                                  {formatCurrency(po.totalAmountCents || 0)}
                                </TableCell>
                              );
                            default:
                              return null;
                          }
                        })}
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
            </div>
          </Card>
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
