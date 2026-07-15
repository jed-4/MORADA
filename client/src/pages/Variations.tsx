import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PinRowButton } from "@/components/widgets/PinRowButton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import {
  Plus,
  Columns3,
  Search,
  Eye,
  EyeOff,
  GripVertical,
  X,
  CheckCheck,
  Ban,
  ChevronRight,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Variation, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "action", label: "Action" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", action: "Action",
  pending: "Pending", approved: "Approved", rejected: "Rejected",
};

// "action" is a custom variation status that maps to the sky "Action required" tone.
function StatusChip({ status }: { status: string }) {
  const tone = status === "action" ? "action" : undefined;
  return <StatusBadge status={status} label={STATUS_LABEL[status]} tone={tone} />;
}

const TABLE_STORAGE_KEY = "variations";
const LEGACY_STORAGE_KEY = "variations-column-config-v2";
const SELECT_COL_WIDTH = 32;

interface ColumnSpec {
  id: string;
  label: string;
  required?: boolean;
  defaultWidth: number;
  defaultVisible?: boolean;
}

const ALL_COLUMNS: ColumnSpec[] = [
  { id: "number",       label: "Number",            required: true,  defaultWidth: 80,  defaultVisible: true  },
  { id: "name",         label: "Name",              required: true,  defaultWidth: 200, defaultVisible: true  },
  { id: "project",      label: "Project",                            defaultWidth: 150, defaultVisible: true  },
  { id: "status",       label: "Status",                             defaultWidth: 110, defaultVisible: true  },
  { id: "total",        label: "Total",                              defaultWidth: 90,  defaultVisible: true  },
  { id: "paid",         label: "Paid",                               defaultWidth: 90,  defaultVisible: false },
  { id: "balance",      label: "Balance Due",                        defaultWidth: 100, defaultVisible: false },
  { id: "seen",         label: "Seen",                               defaultWidth: 60,  defaultVisible: false },
  { id: "deadline",     label: "Approval Deadline",                  defaultWidth: 120, defaultVisible: false },
  { id: "relatedItems", label: "Related",                            defaultWidth: 150, defaultVisible: false },
];

// ─── Kanban DnD helper components ─────────────────────────────────────────────

interface KanbanCardProps {
  variation: Variation & { isSeen?: boolean };
  columnId: string;
  onCardClick: (id: string) => void;
  projectIdFromUrl: string;
  getProject: (id: string) => Project | undefined;
  getProjectName: (id: string) => string;
  formatCurrency: (v: number) => string;
  formatDate: (d: Date | string | null | undefined) => string;
}

function DraggableKanbanCard({ variation, columnId, onCardClick, projectIdFromUrl, getProject, getProjectName, formatCurrency, formatDate }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: variation.id,
    data: { columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        className={cn("p-3 cursor-pointer hover-elevate", isDragging && "opacity-40")}
        onClick={() => !isDragging && onCardClick(variation.id)}
        data-testid={`kanban-card-${variation.id}`}
        style={{ position: "relative", ...(isDragging ? {} : {}) }}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div
              {...listeners}
              className="cursor-grab active:cursor-grabbing mt-0.5 text-muted-foreground/40 shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <GripVertical className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" data-testid={`kanban-card-name-${variation.id}`}>
                {variation.name}
              </p>
              <div className="absolute top-1 right-1" onClick={(e) => e.stopPropagation()}>
                <PinRowButton
                  projectId={variation.projectId}
                  itemType="variation"
                  itemId={variation.id}
                  itemName={variation.name || variation.variationNumber || "Variation"}
                />
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`kanban-card-number-${variation.id}`}>
                {variation.variationNumber}
              </p>
            </div>
          </div>
          {!projectIdFromUrl && (
            <div className="flex items-center gap-2 ml-5" data-testid={`kanban-card-project-${variation.id}`}>
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
          <div className="flex items-center justify-between pt-2 border-t ml-5">
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
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 min-h-[60px] rounded-md p-1 -m-1 transition-colors",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/20"
      )}
    >
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Variations({ embedded }: { embedded?: boolean } = {}) {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const pageTitle = usePageTitle({ pageName: "Variations" });
  const { toast } = useToast();

  const [currentView, setCurrentView] = useState<"table" | "kanban">("table");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  // Kanban DnD state
  const [activeKanbanId, setActiveKanbanId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/api/variations/${id}`, "PATCH", { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/projects" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      apiRequest("/api/variations/bulk-status", "POST", { ids, status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/variations"] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/projects" });
      setSelectedIds(new Set());
      toast({ title: `${vars.ids.length} variation${vars.ids.length !== 1 ? "s" : ""} updated to ${STATUS_LABEL[vars.status] ?? vars.status}` });
    },
    onError: () => toast({ title: "Failed to update variations", variant: "destructive" }),
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

  // Bulk selection helpers
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVariations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVariations.map(v => v.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

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

  // ── DataTable column defs ───────────────────────────────────────────────
  type VariationRow = Variation & { isSeen?: boolean };

  const variationColumns = useMemo<ColumnDef<VariationRow, unknown>[]>(() => {
    const cols: (ColumnDef<VariationRow, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            checked={filteredVariations.length > 0 && selectedIds.size === filteredVariations.length}
            ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredVariations.length; }}
            onChange={toggleSelectAll}
            className="w-3 h-3 accent-primary cursor-pointer"
            aria-label="Select all"
            data-testid="checkbox-select-all"
          />
        ),
        cell: ({ row }) => {
          const isSelected = selectedIds.has(row.original.id);
          return (
            <span onClick={(e) => toggleSelect(row.original.id, e)}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="w-3 h-3 accent-primary cursor-pointer"
                data-testid={`checkbox-${row.original.id}`}
              />
            </span>
          );
        },
        enableSorting: false,
        size: SELECT_COL_WIDTH,
        meta: { defaultWidth: SELECT_COL_WIDTH, align: "center", pinned: true, headerLabel: "Select" },
      },
      {
        id: "number",
        header: "Number",
        accessorFn: (v) => v.variationNumber || "",
        cell: ({ row }) => (
          <span className="text-xs font-medium" data-testid={`cell-number-${row.original.id}`}>
            {row.original.variationNumber}
          </span>
        ),
        size: 80,
        meta: { defaultWidth: 80, headerLabel: "Number" },
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (v) => v.name || "",
        cell: ({ row }) => (
          <span className="text-xs line-clamp-1" data-testid={`cell-name-${row.original.id}`}>
            {row.original.name}
          </span>
        ),
        size: 200,
        meta: { defaultWidth: 200, headerLabel: "Name" },
      },
    ];

    if (!projectIdFromUrl) {
      cols.push({
        id: "project",
        header: "Project",
        accessorFn: (v) => getProjectName(v.projectId),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5" data-testid={`cell-project-${row.original.id}`}>
            <ProjectIcon
              icon={getProject(row.original.projectId)?.icon || "Briefcase"}
              color={getProject(row.original.projectId)?.color || "#3b82f6"}
              className="w-3 h-3 flex-shrink-0"
            />
            <span className="truncate">{getProjectName(row.original.projectId)}</span>
          </div>
        ),
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Project" },
      });
    }

    cols.push(
      {
        id: "status",
        header: "Status",
        accessorFn: (v) => v.status,
        cell: ({ row }) => <StatusChip status={row.original.status} />,
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Status" },
      },
      {
        id: "total",
        header: "Total",
        accessorFn: (v) => v.totalAmount,
        cell: ({ row }) => (
          <span className="text-xs font-medium tabular-nums" data-testid={`cell-total-${row.original.id}`}>
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Total" },
      },
      {
        id: "paid",
        header: "Paid",
        accessorFn: (v) => v.paidAmount,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums" data-testid={`cell-paid-${row.original.id}`}>
            {row.original.paidAmount > 0 ? formatCurrency(row.original.paidAmount) : "-"}
          </span>
        ),
        size: 90,
        meta: { defaultWidth: 90, align: "right", headerLabel: "Paid", defaultHidden: true },
      },
      {
        id: "balance",
        header: "Balance Due",
        accessorFn: (v) => v.balanceAmount,
        cell: ({ row }) => (
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              row.original.balanceAmount > 0
                ? "text-destructive"
                : "text-status-success",
            )}
            data-testid={`cell-balance-${row.original.id}`}
          >
            {formatCurrency(row.original.balanceAmount)}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Balance Due", defaultHidden: true },
      },
      {
        id: "seen",
        header: "Seen",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSeenMutation.mutate({ id: row.original.id, isSeen: !row.original.isSeen });
            }}
            className={cn(
              "p-0.5 rounded hover-elevate",
              row.original.isSeen ? "text-foreground" : "text-muted-foreground/40",
            )}
            data-testid={`button-seen-${row.original.id}`}
          >
            {row.original.isSeen
              ? <Eye className="w-3.5 h-3.5" />
              : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        ),
        size: 60,
        meta: { defaultWidth: 60, align: "center", headerLabel: "Seen", defaultHidden: true },
      },
      {
        id: "deadline",
        header: "Approval Deadline",
        accessorFn: (v) => (v.approvalDeadline ? new Date(v.approvalDeadline).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-deadline-${row.original.id}`}>
            {formatDate(row.original.approvalDeadline)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Approval Deadline", defaultHidden: true },
      },
    );

    if (projectIdFromUrl) {
      cols.push({
        id: "relatedItems",
        header: "Related",
        enableSorting: false,
        cell: ({ row }) => {
          const links = invoiceLinkMap[row.original.id] || [];
          return (
            <span className="text-xs text-muted-foreground" data-testid={`cell-related-${row.original.id}`}>
              {links.length > 0 ? links.join(", ") : "-"}
            </span>
          );
        },
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Related", defaultHidden: true },
      });
    }

    return cols;
  }, [filteredVariations, selectedIds, projectIdFromUrl, projects, invoiceLinkMap, toggleSeenMutation]);

  // Picker columns: respect default visibility for fresh installs.
  const pickerColumns = useMemo(() => {
    const visibleSpecs = ALL_COLUMNS.filter((c) => {
      if (c.id === "project" && projectIdFromUrl) return false;
      if (c.id === "relatedItems" && !projectIdFromUrl) return false;
      return true;
    });
    return [
      { id: "select", label: "Select", pinned: true },
      ...visibleSpecs.map((c) => ({ id: c.id, label: c.label, pinned: c.required })),
    ];
  }, [projectIdFromUrl]);

  // ─── Kanban DnD sensors & handlers ──────────────────────────────────────────
  const kanbanSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleKanbanDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveKanbanId(null);
    if (!over) return;

    const activeVariation = filteredVariations.find(v => v.id === active.id);
    if (!activeVariation) return;

    let targetStatus: string | undefined;
    const overData = over.data?.current as
      | { sortable?: { containerId?: string }; columnId?: string }
      | undefined;
    if (overData?.sortable?.containerId) {
      targetStatus = overData.sortable.containerId;
    } else if (overData?.columnId) {
      targetStatus = overData.columnId;
    } else {
      const col = STATUS_OPTIONS.find(s => s.key === over.id);
      if (col) targetStatus = col.key;
    }

    if (targetStatus && activeVariation.status !== targetStatus) {
      updateStatusMutation.mutate({ id: activeVariation.id, status: targetStatus });
    }
  };

  const activeKanbanVariation = activeKanbanId ? filteredVariations.find(v => v.id === activeKanbanId) : null;

  const KanbanView = () => (
    <DndContext
      sensors={kanbanSensors}
      onDragStart={e => setActiveKanbanId(e.active.id as string)}
      onDragEnd={handleKanbanDragEnd}
    >
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
              <SortableContext
                id={statusOption.key}
                items={columnVariations.map(v => v.id)}
                strategy={verticalListSortingStrategy}
              >
                <DroppableColumn id={statusOption.key}>
                  {columnVariations.map((variation) => (
                    <DraggableKanbanCard
                      key={variation.id}
                      variation={variation}
                      columnId={statusOption.key}
                      onCardClick={handleRowClick}
                      projectIdFromUrl={projectIdFromUrl}
                      getProject={getProject}
                      getProjectName={getProjectName}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeKanbanVariation && (
          <Card className="p-3 shadow-lg opacity-90 w-56">
            <p className="font-medium text-sm truncate">{activeKanbanVariation.name}</p>
            <p className="text-xs text-muted-foreground">{activeKanbanVariation.variationNumber}</p>
            <p className="text-sm font-semibold mt-1.5">{formatCurrency(activeKanbanVariation.totalAmount)}</p>
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-variations">

      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {projectIdFromUrl ? (getProject(projectIdFromUrl)?.name ?? "All Projects") : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Variations</span>
        </div>
      )}

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
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
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
                    ? "text-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {status.key !== "all" && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full text-data min-w-4 h-4 px-1",
                    isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3 — Lilac summary strip */}
        <div className="bg-primary/10 flex items-center px-4 py-2 gap-5 text-xs">
          <div className="flex items-center gap-1.5" data-testid="text-total-action">
            <span className="text-muted-foreground">Action</span>
            <span className="font-semibold tabular-nums">{formatCurrency(statusTotals.action)}</span>
          </div>
          <div className="w-px h-3.5 bg-primary/40" />
          <div className="flex items-center gap-1.5" data-testid="text-total-pending">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-semibold tabular-nums">{formatCurrency(statusTotals.pending)}</span>
          </div>
          <div className="w-px h-3.5 bg-primary/40" />
          <div className="flex items-center gap-1.5" data-testid="text-total-approved">
            <span className="text-muted-foreground">Approved</span>
            <span className="font-semibold tabular-nums text-status-success">{formatCurrency(statusTotals.approved)}</span>
          </div>
        </div>

      </div>{/* end header card */}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5 relative">

        <div className="border border-border rounded-md bg-background overflow-hidden">

          {/* Search / controls row — always visible for both views */}
          <div className="h-9 flex items-center px-3 border-b border-border/50 gap-2 bg-background sticky top-0 z-20">
            {/* Kanban toggle — leftmost */}
            <button
              onClick={() => setCurrentView(currentView === "kanban" ? "table" : "kanban")}
              className={cn(
                "h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 flex-shrink-0",
                currentView === "kanban"
                  ? "bg-primary text-white border-primary/20"
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
                <PopoverContent className="w-56 p-0" align="end">
                  <DataTableColumnPicker storageKey={TABLE_STORAGE_KEY} columns={pickerColumns} />
                </PopoverContent>
              </Popover>
            )}
            {currentView === "kanban" && <div className="ml-auto" />}
          </div>

          {currentView === "kanban" ? (
            <KanbanView />
          ) : variationsLoading ? (
            <div className="text-center py-8">
              <span className="text-muted-foreground text-sm" data-testid="text-loading">Loading variations...</span>
            </div>
          ) : filteredVariations.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex flex-col items-center gap-3">
                <span className="text-muted-foreground text-sm" data-testid="text-no-variations">
                  {variations.length === 0 ? "No variations found" : "No matching variations"}
                </span>
                {variations.length === 0 && (
                  <button
                    className="h-7 px-3 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
                    onClick={handleAddVariation}
                    data-testid="button-add-first-variation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add First Variation
                  </button>
                )}
              </div>
            </div>
          ) : (
            <DataTable
              storageKey={TABLE_STORAGE_KEY}
              legacyConfigKey={LEGACY_STORAGE_KEY}
              data={filteredVariations as VariationRow[]}
              columns={variationColumns}
              rowKey={(v) => v.id}
              onRowClick={(v) => handleRowClick(v.id)}
              rowClassName={(v) => selectedIds.has(v.id) ? "bg-primary/8 dark:bg-primary/10" : ""}
              className="max-h-[calc(100vh-260px)]"
            />
          )}
        </div>

        {/* ── Floating bulk action bar ── */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-card border border-border rounded-lg shadow-lg px-3 py-2" data-testid="bulk-action-bar">
            <span className="text-xs font-medium text-muted-foreground mr-1" data-testid="bulk-count">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-4 bg-border" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-status-success"
              onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: "approved" })}
              disabled={bulkStatusMutation.isPending}
              data-testid="button-bulk-approve"
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive"
              onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: "rejected" })}
              disabled={bulkStatusMutation.isPending}
              data-testid="button-bulk-reject"
            >
              <Ban className="w-3 h-3 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-status-warning"
              onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: "pending" })}
              disabled={bulkStatusMutation.isPending}
              data-testid="button-bulk-pending"
            >
              Pending
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => bulkStatusMutation.mutate({ ids: [...selectedIds], status: "draft" })}
              disabled={bulkStatusMutation.isPending}
              data-testid="button-bulk-draft"
            >
              Draft
            </Button>
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

      </div>
    </div>
  );
}
