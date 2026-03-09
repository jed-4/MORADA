import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  Plus,
  Columns3,
  Search,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { type Variation, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "action", label: "Action" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_CHIP: Record<string, string> = {
  draft:    "bg-muted text-muted-foreground border-transparent",
  sent:     "bg-blue-50   dark:bg-blue-950/60   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-800",
  action:   "bg-red-50    dark:bg-red-950/60    text-red-700    dark:text-red-300    border-red-200    dark:border-red-800",
  pending:  "bg-amber-50  dark:bg-amber-950/60  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800",
  approved: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  rejected: "bg-red-50    dark:bg-red-950/60    text-red-700    dark:text-red-300    border-red-200    dark:border-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", action: "Action",
  pending: "Pending", approved: "Approved", rejected: "Rejected",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-20 py-0.5 rounded text-[11px] font-medium border",
        STATUS_CHIP[status] ?? "bg-muted text-muted-foreground border-transparent"
      )}
      data-testid={`badge-status-${status}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const ALL_COLUMNS = [
  { id: "number", label: "Number", required: true, defaultWidth: 80 },
  { id: "name", label: "Name", required: true, defaultWidth: 200 },
  { id: "project", label: "Project", required: false, defaultWidth: 150 },
  { id: "status", label: "Status", required: false, defaultWidth: 110 },
  { id: "total", label: "Total", required: false, defaultWidth: 90 },
  { id: "paid", label: "Paid", required: false, defaultWidth: 90 },
  { id: "balance", label: "Balance Due", required: false, defaultWidth: 100 },
  { id: "seen", label: "Seen", required: false, defaultWidth: 60 },
  { id: "deadline", label: "Approval Deadline", required: false, defaultWidth: 120 },
  { id: "relatedItems", label: "Related", required: false, defaultWidth: 150 },
];

const STORAGE_KEY = "variations-column-config-v2";

function loadColumnConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return ALL_COLUMNS.map((col, i) => ({
    id: col.id,
    visible: !["paid", "balance", "seen", "deadline", "relatedItems"].includes(col.id),
    order: i,
  }));
}

function saveColumnConfig(config: { id: string; visible: boolean; order: number }[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export default function Variations() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Variations" });

  const [currentView, setCurrentView] = useState<"table" | "kanban">("table");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [columnConfig, setColumnConfig] = useState<{ id: string; visible: boolean; order: number }[]>(loadColumnConfig);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(ALL_COLUMNS.map(c => [c.id, c.defaultWidth]))
  );
  const colResizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);
  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const syncHeaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const startColResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colId] ?? 100;
    colResizeRef.current = { col: colId, startX, startWidth };
    setResizingCol(colId);

    const onMouseMove = (ev: MouseEvent) => {
      if (!colResizeRef.current) return;
      const delta = ev.clientX - colResizeRef.current.startX;
      const newWidth = Math.max(60, colResizeRef.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [colResizeRef.current!.col]: newWidth }));
    };

    const onMouseUp = () => {
      colResizeRef.current = null;
      setResizingCol(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) queryParams.projectId = projectIdFromUrl;
  if (selectedStatus !== "all") queryParams.status = selectedStatus;

  const { data: variations = [], isLoading: variationsLoading } = useQuery<Variation[]>({
    queryKey: ["/api/variations", queryParams],
    queryFn: async () => {
      const p = new URLSearchParams(queryParams);
      const qs = p.toString();
      const url = qs ? `/api/variations?${qs}` : "/api/variations";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: invoiceLinks = [] } = useQuery<Array<{ variationId: string; invoiceId: string; invoiceNumber: string | null }>>({
    queryKey: ["/api/invoice-variations/by-project", projectIdFromUrl],
    queryFn: async () => {
      if (!projectIdFromUrl) return [];
      const res = await fetch(`/api/invoice-variations/by-project?projectId=${projectIdFromUrl}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectIdFromUrl,
  });

  const invoiceLinkMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const link of invoiceLinks) {
      if (!map[link.variationId]) map[link.variationId] = [];
      if (link.invoiceNumber) map[link.variationId].push(link.invoiceNumber);
    }
    return map;
  }, [invoiceLinks]);

  const toggleSeenMutation = useMutation({
    mutationFn: async ({ id, isSeen }: { id: string; isSeen: boolean }) => {
      return apiRequest(`/api/variations/${id}`, "PATCH", { isSeen });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
    },
  });

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);
  const getProjectName = (projectId: string) => getProject(projectId)?.name || "Unknown Project";

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


  const handleRowClick = (variationId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/variations/${variationId}`);
    } else {
      setLocation(`/variations/${variationId}`);
    }
  };

  const handleAddVariation = () => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/variations/new`);
    } else {
      setLocation(`/variations/new`);
    }
  };

  const statusCounts = useMemo(() => ({
    all: variations.length,
    draft: variations.filter((v) => v.status === "draft").length,
    action: variations.filter((v) => v.status === "action").length,
    pending: variations.filter((v) => v.status === "pending").length,
    approved: variations.filter((v) => v.status === "approved").length,
    rejected: variations.filter((v) => v.status === "rejected").length,
  }), [variations]);

  const statusTotals = useMemo(() => ({
    action: variations.filter(v => v.status === "action").reduce((s, v) => s + v.totalAmount, 0),
    pending: variations.filter(v => v.status === "pending").reduce((s, v) => s + v.totalAmount, 0),
    approved: variations.filter(v => v.status === "approved").reduce((s, v) => s + v.totalAmount, 0),
  }), [variations]);

  const filteredVariations = useMemo(() => {
    return variations.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.variationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [variations, searchTerm]);

  const isColVisible = (id: string) => {
    if (id === "project" && projectIdFromUrl) return false;
    if (id === "relatedItems" && !projectIdFromUrl) return false;
    const col = columnConfig.find((c) => c.id === id);
    const def = ALL_COLUMNS.find((d) => d.id === id);
    if (!col || !def) return false;
    return def.required ? true : col.visible;
  };

  const toggleColumn = (id: string) => {
    const updated = columnConfig.map((c) =>
      c.id === id ? { ...c, visible: !c.visible } : c
    );
    setColumnConfig(updated);
    saveColumnConfig(updated);
  };

  const moveColumn = (id: string, direction: -1 | 1) => {
    const sorted = [...columnConfig].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((c) => c.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, order: i }));
    setColumnConfig(updated);
    saveColumnConfig(updated);
  };

  const orderedColumns = [...columnConfig].sort((a, b) => a.order - b.order).filter(c => isColVisible(c.id));
  const totalWidth = orderedColumns.reduce((sum, col) => {
    const def = ALL_COLUMNS.find(d => d.id === col.id);
    return sum + (colWidths[col.id] ?? def?.defaultWidth ?? 100);
  }, 0);

  const renderCell = (col: { id: string }, variation: Variation & { isSeen?: boolean }) => {
    switch (col.id) {
      case "number":
        return (
          <TableCell key="number" style={{ width: colWidths["number"], minWidth: colWidths["number"] }} className="text-xs font-medium px-2 py-1" data-testid={`cell-number-${variation.id}`}>
            {variation.variationNumber}
          </TableCell>
        );
      case "name":
        return (
          <TableCell key="name" style={{ width: colWidths["name"], minWidth: colWidths["name"] }} className="text-xs px-2 py-1" data-testid={`cell-name-${variation.id}`}>
            <span className="line-clamp-1">{variation.name}</span>
          </TableCell>
        );
      case "project":
        return (
          <TableCell key="project" style={{ width: colWidths["project"], minWidth: colWidths["project"] }} className="text-xs px-2 py-1" data-testid={`cell-project-${variation.id}`}>
            <div className="flex items-center gap-1.5">
              <ProjectIcon
                icon={getProject(variation.projectId)?.icon || "Briefcase"}
                color={getProject(variation.projectId)?.color || "#3b82f6"}
                className="w-3 h-3 flex-shrink-0"
              />
              <span className="truncate">{getProjectName(variation.projectId)}</span>
            </div>
          </TableCell>
        );
      case "status":
        return (
          <TableCell key="status" style={{ width: colWidths["status"], minWidth: colWidths["status"] }} className="px-2 py-1" data-testid={`cell-status-${variation.id}`}>
            <StatusChip status={variation.status} />
          </TableCell>
        );
      case "total":
        return (
          <TableCell key="total" style={{ width: colWidths["total"], minWidth: colWidths["total"] }} className="text-xs font-medium text-right px-2 py-1" data-testid={`cell-total-${variation.id}`}>
            {formatCurrency(variation.totalAmount)}
          </TableCell>
        );
      case "paid":
        return (
          <TableCell key="paid" style={{ width: colWidths["paid"], minWidth: colWidths["paid"] }} className="text-xs text-right px-2 py-1 text-muted-foreground" data-testid={`cell-paid-${variation.id}`}>
            {variation.paidAmount > 0 ? formatCurrency(variation.paidAmount) : "-"}
          </TableCell>
        );
      case "balance":
        return (
          <TableCell key="balance" style={{ width: colWidths["balance"], minWidth: colWidths["balance"] }} className={cn("text-xs font-medium text-right px-2 py-1", variation.balanceAmount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")} data-testid={`cell-balance-${variation.id}`}>
            {formatCurrency(variation.balanceAmount)}
          </TableCell>
        );
      case "seen":
        return (
          <TableCell key="seen" style={{ width: colWidths["seen"], minWidth: colWidths["seen"] }} className="px-2 py-1 text-center" data-testid={`cell-seen-${variation.id}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSeenMutation.mutate({ id: variation.id, isSeen: !(variation as any).isSeen });
              }}
              className={cn("p-0.5 rounded hover-elevate", (variation as any).isSeen ? "text-foreground" : "text-muted-foreground/40")}
              data-testid={`button-seen-${variation.id}`}
            >
              {(variation as any).isSeen
                ? <Eye className="w-3.5 h-3.5" />
                : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </TableCell>
        );
      case "deadline":
        return (
          <TableCell key="deadline" style={{ width: colWidths["deadline"], minWidth: colWidths["deadline"] }} className="text-xs text-muted-foreground px-2 py-1" data-testid={`cell-deadline-${variation.id}`}>
            {formatDate(variation.approvalDeadline)}
          </TableCell>
        );
      case "relatedItems": {
        const links = invoiceLinkMap[variation.id] || [];
        return (
          <TableCell key="relatedItems" style={{ width: colWidths["relatedItems"], minWidth: colWidths["relatedItems"] }} className="text-xs text-muted-foreground px-2 py-1" data-testid={`cell-related-${variation.id}`}>
            {links.length > 0 ? links.join(", ") : "-"}
          </TableCell>
        );
      }
      default:
        return null;
    }
  };

  const KanbanView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 p-3" data-testid="kanban-view">
      {STATUS_OPTIONS.slice(1).map((statusOption) => {
        const columnVariations = filteredVariations.filter((v) => v.status === statusOption.key);
        return (
          <div key={statusOption.key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-md">
              <h3 className="font-medium text-sm" data-testid={`kanban-column-${statusOption.key}`}>
                {statusOption.label}
              </h3>
              <Badge variant="secondary" data-testid={`kanban-count-${statusOption.key}`}>
                {columnVariations.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {columnVariations.map((variation) => (
                <Card
                  key={variation.id}
                  className="p-3 cursor-pointer hover-elevate"
                  onClick={() => handleRowClick(variation.id)}
                  data-testid={`kanban-card-${variation.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" data-testid={`kanban-card-name-${variation.id}`}>
                          {variation.name}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`kanban-card-number-${variation.id}`}>
                          {variation.variationNumber}
                        </p>
                      </div>
                    </div>
                    {!projectIdFromUrl && (
                      <div className="flex items-center gap-2" data-testid={`kanban-card-project-${variation.id}`}>
                        <ProjectIcon
                          icon={getProject(variation.projectId)?.icon || "Briefcase"}
                          color={getProject(variation.projectId)?.color || "#3b82f6"}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground truncate">
                          {getProjectName(variation.projectId)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm font-semibold" data-testid={`kanban-card-total-${variation.id}`}>
                        {formatCurrency(variation.totalAmount)}
                      </span>
                      {variation.approvalDeadline && (
                        <span className="text-xs text-muted-foreground" data-testid={`kanban-card-deadline-${variation.id}`}>
                          {formatDate(variation.approvalDeadline)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-variations">

      {/* ── Unified header card ── */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

        {/* Row 1 — Title & Add button */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold truncate" data-testid="text-page-title">
            {projectIdFromUrl && projects.find(p => p.id === projectIdFromUrl)
              ? <>{projects.find(p => p.id === projectIdFromUrl)!.name} <span className="text-muted-foreground font-normal">· Variations</span></>
              : pageTitle}
          </h2>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleAddVariation}
            data-testid="button-add-variation"
          >
            <Plus className="w-3 h-3" />
            <span>Add Variation</span>
          </button>
        </div>

        {/* Row 2 — Status tabs */}
        <div className="flex items-center px-3 border-b border-border/50 overflow-x-auto">
          {STATUS_OPTIONS.map((status) => {
            const isActive = selectedStatus === status.key;
            const count = statusCounts[status.key as keyof typeof statusCounts];
            return (
              <button
                key={status.key}
                onClick={() => setSelectedStatus(status.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
                  isActive
                    ? "text-foreground border-[#bba7db]"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {status.key !== "all" && count > 0 && (
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

        {/* Row 3 — Lilac summary strip */}
        <div className="bg-[#bba7db]/10 flex items-center px-4 py-2 gap-5 text-xs">
          <div className="flex items-center gap-1.5" data-testid="text-total-action">
            <span className="text-muted-foreground">Action</span>
            <span className="font-semibold tabular-nums">{formatCurrency(statusTotals.action)}</span>
          </div>
          <div className="w-px h-3.5 bg-[#bba7db]/40" />
          <div className="flex items-center gap-1.5" data-testid="text-total-pending">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-semibold tabular-nums">{formatCurrency(statusTotals.pending)}</span>
          </div>
          <div className="w-px h-3.5 bg-[#bba7db]/40" />
          <div className="flex items-center gap-1.5" data-testid="text-total-approved">
            <span className="text-muted-foreground">Approved</span>
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(statusTotals.approved)}</span>
          </div>
        </div>

      </div>{/* end header card */}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">

        <div className="border border-border rounded-md bg-background overflow-hidden">

          {/* Search / controls row — always visible for both views */}
          <div className="h-9 flex items-center px-3 border-b border-border/50 gap-2 bg-background sticky top-0 z-20">
            {/* Kanban toggle — leftmost */}
            <button
              onClick={() => setCurrentView(currentView === "kanban" ? "table" : "kanban")}
              className={cn(
                "h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 flex-shrink-0",
                currentView === "kanban"
                  ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                  : "hover-elevate active-elevate-2"
              )}
              data-testid="button-kanban-view"
            >
              <Columns3 className="w-3 h-3" />
              <span>Kanban</span>
            </button>

            <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />

            {/* Search — left, thin border */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search variations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-2 py-0 h-6 text-xs w-44 border border-border/50"
                data-testid="variations-search-input"
              />
            </div>

            {/* Column picker — far right (only relevant in table view) */}
            {currentView === "table" && (
              <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded-md border border-border/40 hover-elevate active-elevate-2 text-muted-foreground ml-auto flex-shrink-0"
                    title="Configure columns"
                    data-testid="button-column-picker"
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="end">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 mb-2">Columns</p>
                  <div className="space-y-0.5">
                    {[...columnConfig].sort((a, b) => a.order - b.order).map((col) => {
                      const def = ALL_COLUMNS.find((d) => d.id === col.id)!;
                      if (col.id === "project" && projectIdFromUrl) return null;
                      if (col.id === "relatedItems" && !projectIdFromUrl) return null;
                      const visibleCols = [...columnConfig]
                        .sort((a, b) => a.order - b.order)
                        .filter(c => !(c.id === "project" && projectIdFromUrl) && !(c.id === "relatedItems" && !projectIdFromUrl));
                      const visibleIdx = visibleCols.findIndex(c => c.id === col.id);
                      return (
                        <div key={col.id} className="flex items-center gap-2 px-1 py-1 rounded-md hover-elevate group">
                          <input
                            type="checkbox"
                            checked={def.required ? true : col.visible}
                            disabled={def.required}
                            onChange={() => !def.required && toggleColumn(col.id)}
                            className="w-3.5 h-3.5 accent-[#bba7db] flex-shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                          <span className={cn("flex-1 text-xs", !col.visible && "text-muted-foreground/60")}>
                            {def.label}
                          </span>
                          <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="h-3 w-4 flex items-center justify-center hover-elevate rounded disabled:opacity-20"
                              onClick={() => moveColumn(col.id, -1)}
                              disabled={visibleIdx === 0}
                            >
                              <ChevronUp className="w-2.5 h-2.5 text-muted-foreground" />
                            </button>
                            <button
                              className="h-3 w-4 flex items-center justify-center hover-elevate rounded disabled:opacity-20"
                              onClick={() => moveColumn(col.id, 1)}
                              disabled={visibleIdx === visibleCols.length - 1}
                            >
                              <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {currentView === "kanban" && <div className="ml-auto" />}
          </div>

          {currentView === "kanban" ? (
            <KanbanView />
          ) : (
            <>

            {/* Column header — sticky below search row, synced scroll */}
            <div
              ref={headerScrollRef}
              className="overflow-x-hidden sticky top-9 z-10 border-b border-border bg-muted/30"
            >
              <Table style={{ tableLayout: "fixed", width: totalWidth, minWidth: totalWidth }}>
                <TableHeader>
                  <TableRow className="h-5 bg-muted/30 hover:bg-muted/30">
                    {orderedColumns.map((col) => {
                      const def = ALL_COLUMNS.find((d) => d.id === col.id)!;
                      const isRight = ["total", "paid", "balance"].includes(col.id);
                      const isCenter = col.id === "seen";
                      return (
                        <TableHead
                          key={col.id}
                          style={{ width: colWidths[col.id], minWidth: colWidths[col.id], position: "relative" }}
                          className={cn(
                            "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2",
                            isRight && "text-right",
                            isCenter && "text-center"
                          )}
                          data-testid={`header-${col.id}`}
                        >
                          {def.label}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize group/resize flex items-center justify-center z-10"
                            onMouseDown={(e) => startColResize(col.id, e)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className={`w-0.5 h-4 rounded-full transition-all ${resizingCol === col.id ? 'bg-primary' : 'bg-transparent group-hover/resize:bg-primary/60'}`} />
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
              </Table>
            </div>

            {/* Table body — horizontal scroll synced with header */}
            <div
              ref={bodyScrollRef}
              onScroll={syncHeaderScroll}
              className="overflow-x-auto"
            >
              <Table style={{ tableLayout: "fixed", width: totalWidth, minWidth: totalWidth }}>
                <TableBody>
                  {variationsLoading ? (
                    <TableRow>
                      <TableCell colSpan={orderedColumns.length} className="text-center py-8">
                        <span className="text-muted-foreground text-sm" data-testid="text-loading">Loading variations...</span>
                      </TableCell>
                    </TableRow>
                  ) : filteredVariations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={orderedColumns.length} className="text-center py-8">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-muted-foreground text-sm" data-testid="text-no-variations">
                            {variations.length === 0 ? "No variations found" : "No matching variations"}
                          </span>
                          {variations.length === 0 && (
                            <button
                              className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                              onClick={handleAddVariation}
                              data-testid="button-add-first-variation"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add First Variation
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVariations.map((variation) => (
                      <TableRow
                        key={variation.id}
                        className="cursor-pointer hover-elevate h-9"
                        onClick={() => handleRowClick(variation.id)}
                        data-testid={`row-variation-${variation.id}`}
                      >
                        {orderedColumns.map((col) => renderCell(col, variation as any))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
