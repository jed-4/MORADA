import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Plus, 
  FileText, 
  Lock, 
  Search,
  DollarSign,
  LayoutList,
  Columns3,
  SlidersHorizontal,
  MoreHorizontal,
  Archive,
  ArrowLeft,
  Download,
  ChevronDown,
  GripVertical,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Estimate, type EstimateSummary, type Project, type FieldCategoryWithOptions, type FieldOption } from "@shared/schema";
import { StatusBadge } from "@/components/StatusBadge";

/** Single status-badge renderer shared by the list view and the kanban cards. */
function renderEstimateStatusBadge(estimate: Estimate, statuses: FieldOption[]) {
  const statusOption = statuses.find((s) => s.key === estimate.status);
  if (statusOption) {
    return <StatusBadge status={statusOption.key} label={statusOption.name} color={statusOption.color} />;
  }
  // Fallback to isLocked for backward compatibility
  if (estimate.isLocked) {
    return <StatusBadge status="locked" tone="info" label="Locked" />;
  }
  return <StatusBadge status={estimate.status || "Draft"} />;
}
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ProjectIcon } from "@/components/ProjectIcon";
import { logActivity } from "@/lib/activityLogger";
import { EmptyState } from "@/components/EmptyState";

type ViewMode = 'list' | 'kanban';
/** Where a "back" from an estimate opened on this page should land. */
const ALL_ESTIMATES_PATH = "/estimates";
/** Estimates in this status are held back from the normal views. */
const ARCHIVED_STATUS = "archived";
type CardWidth = 'compact' | 'comfortable' | 'spacious';
const VIEW_KEY = "estimates-view";
const CARD_WIDTH_KEY = "estimates-card-width";

export default function Estimates() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  // Sets document.title; the visible page name comes from the breadcrumb.
  usePageTitle({ pageName: "Estimates" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  // Remembers the last view between visits — coming back to this page should
  // land you where you left off, not reset to the list every time.
  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return 'list';
    return window.localStorage.getItem(VIEW_KEY) === 'kanban' ? 'kanban' : 'list';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, currentView);
    } catch {
      /* noop — private browsing / storage disabled */
    }
  }, [currentView]);
  // The archive is a separate destination rather than a filter: archived
  // estimates stay out of the normal list and board entirely, and are reached
  // from the overflow menu.
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);
  // Persisted alongside the view — the card density you chose should survive
  // leaving the page, same as the view itself.
  const [cardWidth, setCardWidth] = useState<CardWidth>(() => {
    if (typeof window === "undefined") return 'comfortable';
    const saved = window.localStorage.getItem(CARD_WIDTH_KEY);
    return saved === 'compact' || saved === 'spacious' ? saved : 'comfortable';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CARD_WIDTH_KEY, cardWidth);
    } catch {
      /* noop — private browsing / storage disabled */
    }
  }, [cardWidth]);

  const handleNewEstimate = () => {
    setLocation('/estimates/new');
  };


  // Fetch all estimates across all projects
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
    queryFn: async () => {
      const response = await fetch(`/api/estimates`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  // Include archived projects: an estimate outlives its project being
  // archived, and must still show which project it belongs to.
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects", { includeArchived: true }],
    queryFn: async () => {
      const response = await fetch("/api/projects?includeArchived=1", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  // Fetch estimate status options from field settings
  const { data: estimateStatusesData } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate.status"],
  });

  const estimateStatuses = useMemo(() => {
    return estimateStatusesData?.options || [];
  }, [estimateStatusesData]);

  // Drag and drop sensors - require 8px movement before drag starts to prevent accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Mutation to update estimate status
  const updateEstimateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, status }: { estimateId: string; status: string }) => {
      return await apiRequest(`/api/estimates/${estimateId}`, 'PATCH', { status });
    },
    onSuccess: async (updatedEstimate, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Status Updated",
        description: "Estimate status has been updated successfully.",
      });

      const estimate = estimates.find(e => e.id === variables.estimateId);
      if (estimate) {
        const statusOption = estimateStatuses.find(s => s.key === variables.status);
        const statusName = statusOption?.name || variables.status;
        
        let action: "approved" | "rejected" | "updated" = "updated";
        let description = `updated estimate status to '${statusName}' for estimate '${estimate.name}'`;

        if (variables.status === "approved") {
          action = "approved";
          description = `approved estimate '${estimate.name}'`;
        } else if (variables.status === "rejected") {
          action = "rejected";
          description = `rejected estimate '${estimate.name}'`;
        }

        if (user?.id) {
          logActivity({
            projectId: estimate.projectId,
            userId: user.id,
            activityType: "estimate",
            action,
            description,
            entityId: estimate.id,
            entityName: estimate.name,
            metadata: {
              oldStatus: estimate.status,
              newStatus: variables.status
            }
          });
        }
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update estimate status.",
        variant: "destructive",
      });
    },
  });

  // Lifecycle transitions must go through the dedicated endpoints (never a raw
  // status PATCH) so selection, canonical contract-price stamping and the
  // lock/freeze guards always run. Approve = promote to the live, editable
  // selected estimate. Revert = step back (unlock + clear selection).
  const approveMutation = useMutation({
    mutationFn: async (estimateId: string) =>
      await apiRequest(`/api/estimates/${estimateId}/approve`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Estimate approved",
        description: "It's now the project's selected estimate — still editable.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't approve",
        description: error?.message || "Failed to approve estimate.",
        variant: "destructive",
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async ({ estimateId, target }: { estimateId: string; target: "approved" | "draft" }) =>
      await apiRequest(`/api/estimates/${estimateId}/revert`, "POST", { target }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: variables.target === "approved" ? "Reverted to approved" : "Reverted to draft",
        description: variables.target === "approved"
          ? "The estimate is unlocked and editable again."
          : "The estimate is back in draft.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't revert",
        description: error?.message || "Failed to revert estimate.",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setHoveredColumnId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setHoveredColumnId(over ? (over.data.current?.sortable?.containerId || String(over.id)) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setHoveredColumnId(null);

    if (!over) return;

    const estimateId = active.id as string;
    
    // Determine the target status key
    let newStatus: string;
    
    if (over.data.current?.sortable) {
      // Dropped on a card - get the container (column) ID
      newStatus = over.data.current.sortable.containerId as string;
    } else {
      // Dropped on empty column space - over.id is the status key
      newStatus = over.id as string;
    }

    // Validate that newStatus is a valid estimate status key
    const validStatusKeys = estimateStatuses.map(s => s.key);
    if (!validStatusKeys.includes(newStatus)) {
      console.warn('Invalid status key detected during drag:', newStatus);
      return;
    }

    // Find the estimate being dragged
    const estimate = estimates.find(e => e.id === estimateId);
    if (!estimate || estimate.status === newStatus) return;

    const norm = (s?: string | null) =>
      s === "approved" || s === "contract" || s === "archived" ? s : "draft";
    const from = norm(estimate.status);
    const to = norm(newStatus);

    // Mark as Contract locks + freezes the price — a deliberate action that
    // needs the totals confirmation on the estimate page, never a silent drag.
    if (to === "contract") {
      toast({
        title: "Open the estimate to mark it as contract",
        description: "This locks and freezes the contract price. Open the estimate and use “Mark as Contract” to confirm.",
      });
      return;
    }

    // Promote to the live, editable selected estimate. Coming from a locked
    // contract this is a revert (unlock); otherwise a plain approve.
    if (to === "approved") {
      if (from === "contract") {
        revertMutation.mutate({ estimateId, target: "approved" });
      } else {
        approveMutation.mutate(estimateId);
      }
      return;
    }

    // Step back to draft — revert (unlock + clear selection) when coming from
    // a lifecycle status; otherwise a plain status update.
    if (to === "draft" && (from === "approved" || from === "contract")) {
      revertMutation.mutate({ estimateId, target: "draft" });
      return;
    }

    // Archived and any custom statuses use the generic status update.
    updateEstimateStatusMutation.mutate({ estimateId, status: newStatus });
  };


  // Get project name helper
  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const formatCurrency = (amount: number) => {
    // Check if it's a whole number
    const isWholeNumber = amount % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getStatusBadge = (estimate: Estimate) => renderEstimateStatusBadge(estimate, estimateStatuses);


  // Filter estimates based on search and filters
  const filteredEstimates = useMemo(() => {
    return estimates.filter(estimate => {
      const searchableContent = [
        estimate.name,
        getProjectName(estimate.projectId),
      ].join(' ').toLowerCase();
      
      const matchesSearch = searchableContent.includes(searchTerm.toLowerCase());
      const matchesProject = selectedProject === 'All' || estimate.projectId === selectedProject;
      const matchesStatus = selectedStatus === 'All' || estimate.status === selectedStatus;
      // Archived estimates were previously mixed into the "All" list; they now
      // live only behind the archive view.
      const matchesArchive = showArchived
        ? estimate.status === ARCHIVED_STATUS
        : estimate.status !== ARCHIVED_STATUS;

      return matchesSearch && matchesProject && matchesStatus && matchesArchive;
    });
  }, [estimates, searchTerm, selectedProject, selectedStatus, projects, showArchived]);

  const archivedCount = useMemo(
    () => estimates.filter((e) => e.status === ARCHIVED_STATUS).length,
    [estimates],
  );

  // The board's columns come from the configured statuses, and "archived"
  // isn't one — so the archive is always the list.
  const effectiveView: ViewMode = showArchived ? 'list' : currentView;

  // Field settings are the user's to change, so an estimate can end up in a
  // status with no configured option — "contract" is one today. Those used to
  // get no column and vanish from the board with nothing to say they existed.
  // Give every status that actually holds estimates a column, appending the
  // unconfigured ones after the configured order.
  const boardColumns = useMemo<FieldOption[]>(() => {
    const configured = estimateStatuses
      .filter((status) => status.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const known = new Set(configured.map((s) => s.key));

    const orphanKeys = Array.from(
      new Set(
        estimates
          .map((e) => e.status)
          .filter((key): key is string => !!key && key !== ARCHIVED_STATUS && !known.has(key)),
      ),
    ).sort();

    const orphanColumns = orphanKeys.map((key, i) => ({
      // Enough of a FieldOption to render a column. No colour, so it picks up
      // the neutral accent and reads as the odd one out that it is.
      id: `unconfigured-${key}`,
      key,
      name: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      color: null,
      isActive: true,
      sortOrder: configured.length + i,
    })) as unknown as FieldOption[];

    return [...configured, ...orphanColumns];
  }, [estimateStatuses, estimates]);

  const EstimateTotalCell = ({ estimateId }: { estimateId: string }) => {
    const { data: summary } = useQuery<EstimateSummary>({
      queryKey: ["/api/estimates", estimateId, "summary"],
      enabled: !!estimateId,
      staleTime: 0,
    });
    return (
      <span className="text-xs font-semibold tabular-nums" data-testid={`text-estimate-total-${estimateId}`}>
        {summary ? formatCurrency(summary.total) : "Loading..."}
      </span>
    );
  };

  const estimateColumns = useMemo<ColumnDef<Estimate, unknown>[]>(() => [
    {
      id: "name",
      header: "Name",
      accessorFn: (e) => e.name || "",
      cell: ({ row }) => (
        <span className="text-xs font-medium line-clamp-1" data-testid={`cell-name-${row.original.id}`}>
          {row.original.name}
        </span>
      ),
      size: 240,
      meta: { defaultWidth: 240, headerLabel: "Name" } satisfies DataTableColumnMeta,
    },
    {
      id: "project",
      header: "Project",
      accessorFn: (e) => getProjectName(e.projectId),
      cell: ({ row }) => {
        const project = projects.find((p) => p.id === row.original.projectId);
        return (
          <div className="flex items-center gap-1.5" data-testid={`cell-project-${row.original.id}`}>
            <ProjectIcon
              icon={project?.icon || "Briefcase"}
              color={project?.color || "#3b82f6"}
              className="w-3 h-3 flex-shrink-0"
            />
            <span className="text-xs text-muted-foreground truncate">
              {getProjectName(row.original.projectId)}
            </span>
          </div>
        );
      },
      size: 200,
      meta: { defaultWidth: 200, headerLabel: "Project" } satisfies DataTableColumnMeta,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (e) => e.status || "",
      cell: ({ row }) => getStatusBadge(row.original),
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "Status" } satisfies DataTableColumnMeta,
    },
    {
      id: "total",
      header: "Total",
      enableSorting: false,
      cell: ({ row }) => <EstimateTotalCell estimateId={row.original.id} />,
      size: 120,
      meta: { defaultWidth: 120, align: "right", headerLabel: "Total" } satisfies DataTableColumnMeta,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [projects, estimateStatuses]);

  const pickerColumns = useMemo(
    () => [
      { id: "name", label: "Name" },
      { id: "project", label: "Project" },
      { id: "status", label: "Status" },
      { id: "total", label: "Total" },
    ],
    [],
  );

  const handleRowClick = (estimate: Estimate) => {
    // Open the estimate directly (matches the kanban card) — no redundant hop
    // through the per-project estimate list. `from` tells the estimate's back
    // button to return here rather than to the project's own estimate list.
    setLocation(`/projects/${estimate.projectId}/estimates/${estimate.id}?from=${encodeURIComponent(ALL_ESTIMATES_PATH)}`);
  };


  return (
    <div className="flex flex-col h-full" data-testid="estimates-page">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">All Projects</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        {showArchived ? (
          <>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowArchived(false)}
              data-testid="breadcrumb-estimates"
            >
              Estimates
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
            <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Archived</span>
          </>
        ) : (
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Estimates</span>
        )}
      </div>
      {/* Row 1 - Actions (36px). The page name lives in the breadcrumb above —
          a second title here read as a duplicate breadcrumb. */}
      <div className="h-9 bg-background flex items-center justify-end px-2 gap-4 flex-shrink-0">
        {/* Right: New Estimate + overflow */}
        <div className="flex items-center gap-1.5">
          {showArchived ? (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
              onClick={() => setShowArchived(false)}
              data-testid="button-back-to-active"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back to estimates</span>
            </button>
          ) : (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              onClick={handleNewEstimate}
              data-testid="button-new-estimate"
            >
              <Plus className="w-3 h-3" />
              <span>New Estimate</span>
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
                data-testid="button-more-actions"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => setShowArchived((v) => !v)}
                data-testid="menu-item-archived-estimates"
              >
                {showArchived ? (
                  <ArrowLeft className="w-3.5 h-3.5 mr-2" />
                ) : (
                  <Archive className="w-3.5 h-3.5 mr-2" />
                )}
                <span className="flex-1">
                  {showArchived ? "Back to estimates" : "Archived estimates"}
                </span>
                {!showArchived && archivedCount > 0 && (
                  <span className="ml-2 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {archivedCount}
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2 - View Tabs (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View toggle (icon only). Hidden in the archive, which has no
            board columns to drop into. */}
        <div
          className={`bg-muted/40 rounded-md p-0.5 h-[28px] flex ${showArchived ? 'invisible' : ''}`}
          data-testid="view-toggle"
        >
          <button
            onClick={() => setCurrentView('list')}
            className={`w-7 h-full flex items-center justify-center rounded transition-colors ${
              currentView === 'list'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground'
            }`}
            data-testid="button-list-view"
            aria-label="List view"
            title="List view"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentView('kanban')}
            className={`w-7 h-full flex items-center justify-center rounded transition-colors ${
              currentView === 'kanban'
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground'
            }`}
            data-testid="button-kanban-view"
            aria-label="Kanban view"
            title="Kanban view"
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Card Width Toggle (only visible in kanban view) */}
        {effectiveView === 'kanban' && (
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-card-width-toggle"
              >
                <span className="capitalize">{cardWidth}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="end">
              <div className="space-y-1">
                <button
                  onClick={() => setCardWidth('compact')}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                    cardWidth === 'compact' ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                  data-testid="button-width-compact"
                >
                  Compact
                </button>
                <button
                  onClick={() => setCardWidth('comfortable')}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                    cardWidth === 'comfortable' ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                  data-testid="button-width-comfortable"
                >
                  Comfortable
                </button>
                <button
                  onClick={() => setCardWidth('spacious')}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                    cardWidth === 'spacious' ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                  data-testid="button-width-spacious"
                >
                  Spacious
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Row 3 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search + Filter */}
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="estimates-search-input"
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
                {selectedStatus !== "All" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedStatus("All")}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                    selectedStatus === "All" ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                  data-testid="filter-status-all"
                >
                  All Status
                </button>
                {estimateStatuses
                  .filter(status => status.isActive)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(status => (
                    <button
                      key={status.key}
                      onClick={() => setSelectedStatus(status.key)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors ${
                        selectedStatus === status.key ? "bg-primary/10 text-primary font-medium" : ""
                      }`}
                      data-testid={`filter-status-${status.key}`}
                    >
                      {status.name}
                    </button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right: Column picker (list view only) */}
        {effectiveView === 'list' && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-6 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-columns"
                title="Columns"
                aria-label="Columns"
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0">
              <DataTableColumnPicker storageKey="estimates" columns={pickerColumns} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* Estimates Display */}
        {estimatesLoading ? (
          <div className="text-center py-8">
            <div className="text-muted-foreground">Loading estimates...</div>
          </div>
        ) : filteredEstimates.length === 0 ? (
          <EmptyState
            icon={showArchived ? Archive : DollarSign}
            title={
              showArchived
                ? "Nothing archived"
                : searchTerm || selectedProject !== "All" || selectedStatus !== "All"
                  ? "No estimates found"
                  : "No estimates yet"
            }
            description={
              showArchived
                ? "Estimates you archive are kept here, out of the main list."
                : searchTerm || selectedProject !== "All" || selectedStatus !== "All"
                  ? "Try adjusting your search or filter criteria"
                  : "Start by creating your first estimate for a project"
            }
            action={
              showArchived
                ? {
                    label: "Back to estimates",
                    onClick: () => setShowArchived(false),
                    icon: ArrowLeft,
                    "data-testid": "button-empty-back-to-active",
                  }
                : !searchTerm && selectedProject === "All" && selectedStatus === "All"
                  ? {
                      label: "Create Your First Estimate",
                      onClick: handleNewEstimate,
                      icon: Plus,
                      "data-testid": "button-create-first-estimate",
                    }
                  : undefined
            }
            variant="card"
            className="mt-6"
          />
        ) : (
          <>
            {/* List View */}
            {effectiveView === 'list' && (
              <div className="w-full h-full">
                <DataTable
                  data={filteredEstimates}
                  columns={estimateColumns}
                  storageKey="estimates"
                  legacyConfigKey="estimates-column-config-v1"
                  rowKey={(e) => e.id}
                  onRowClick={handleRowClick}
                />
              </div>
            )}

            {/* Kanban View */}
            {effectiveView === 'kanban' && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {boardColumns
                    .map(status => {
                      const columnEstimates = filteredEstimates.filter(est => est.status === status.key);
                      
                      return (
                        <KanbanColumn
                          key={status.key}
                          status={status}
                          estimates={columnEstimates}
                          projects={projects}
                          cardWidth={cardWidth}
                          isHighlighted={hoveredColumnId === status.key}
                        />
                      );
                    })}
                </div>

                <DragOverlay dropAnimation={null}>
                  {activeId ? (
                    <div className="bg-card border border-border/50 rounded-xl p-2 shadow-lg opacity-90">
                      <div className="font-medium text-sm">
                        {estimates.find(e => e.id === activeId)?.name || 'Dragging...'}
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({ status, estimates, projects, cardWidth, isHighlighted }: {
  status: FieldOption;
  estimates: Estimate[];
  projects: Project[];
  cardWidth: CardWidth;
  isHighlighted: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: status.key,
  });

  const getWidthClass = () => {
    switch (cardWidth) {
      case 'compact': return 'w-64';
      case 'comfortable': return 'w-80';
      case 'spacious': return 'w-96';
      default: return 'w-80';
    }
  };

  return (
    <div className={`flex-shrink-0 ${getWidthClass()}`}>
      <div
        className={`rounded-xl border transition-all duration-200 ${
          isHighlighted ? 'border-2 border-primary border-dashed bg-primary/10' : 'border-border/50'
        }`}
      >
        {/* The status name IS the header, as a chip in its own colour — the
            same pill the rest of the app uses for a status. */}
        <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
          <StatusBadge
            status={status.key}
            label={status.name}
            color={status.color || undefined}
            className="h-[22px] px-2.5 text-xs"
            data-testid={`kanban-column-status-${status.key}`}
          />
        </div>

        <div
          ref={setNodeRef}
          className="min-h-[200px] p-2"
        >
          <SortableContext id={status.key} items={estimates.map(e => e.id)} strategy={verticalListSortingStrategy}>
            {estimates.map(estimate => (
              <SortableEstimateCard
                key={estimate.id}
                estimate={estimate}
                projects={projects}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

// Sortable Estimate Card Component for Kanban
function SortableEstimateCard({ estimate, projects }: {
  estimate: Estimate;
  projects: Project[];
}) {
  const [, setLocation] = useLocation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: estimate.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  // Fetch summary for this estimate
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", estimate.id, "summary"],
    enabled: !!estimate.id,
    staleTime: 0,
  });

  const handleEstimateClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    setLocation(`/projects/${estimate.projectId}/estimates/${estimate.id}?from=${encodeURIComponent(ALL_ESTIMATES_PATH)}`);
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const formatCurrency = (amount: number) => {
    // Check if it's a whole number
    const isWholeNumber = amount % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={handleEstimateClick}
      className="bg-card border border-border/50 rounded-xl p-2 mb-2 cursor-pointer hover-elevate shadow-sm group flex items-start gap-1"
      data-testid={`kanban-estimate-card-${estimate.id}`}
    >
      <div
        {...listeners}
        className="invisible group-hover:visible cursor-grab flex-shrink-0 mt-0.5"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <div className="flex-1 min-w-0">
        {/* Project leads the card — it's how you find the job at a glance;
            the estimate/revision name is the qualifier underneath. */}
        <h4 className="font-medium text-sm mb-0.5 line-clamp-1">
          {getProjectName(estimate.projectId)}
        </h4>
        <p className="text-data text-muted-foreground mb-2 line-clamp-1">
          {estimate.name}
        </p>
        {/* No status chip: the column the card sits in already says the
            status. Lock state isn't implied by the column, so it stays. */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold">
            {summary ? formatCurrency(summary.total) : 'Loading...'}
          </span>
          {estimate.isLocked && (
            <Lock
              className="w-3 h-3 text-muted-foreground flex-shrink-0"
              aria-label="Locked"
              data-testid={`kanban-card-locked-${estimate.id}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}