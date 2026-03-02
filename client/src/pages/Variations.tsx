import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Columns3,
  Search,
  Settings2,
  GripVertical,
  Lock,
} from "lucide-react";
import { type Variation, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "action", label: "Action" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const ALL_COLUMNS = [
  { id: "number", label: "Number", required: true },
  { id: "name", label: "Name", required: true },
  { id: "project", label: "Project", required: false },
  { id: "status", label: "Status", required: false },
  { id: "total", label: "Total", required: false },
  { id: "deadline", label: "Approval Deadline", required: false },
];

const STORAGE_KEY = "variations-column-config";

function loadColumnConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return ALL_COLUMNS.map((col, i) => ({ id: col.id, visible: true, order: i }));
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const getStatusBadge = (status: string, size: "sm" | "md" = "md") => {
    const sizeClass = size === "sm" ? "h-4 px-1.5 text-[10px]" : "";
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className={sizeClass} data-testid="badge-status-draft"><FileText className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />Draft</Badge>;
      case "action":
        return <Badge variant="destructive" className={sizeClass} data-testid="badge-status-action"><AlertCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />Action</Badge>;
      case "pending":
        return <Badge variant="default" className={sizeClass} data-testid="badge-status-pending"><Clock className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className={`border-green-500 text-green-700 ${sizeClass}`} data-testid="badge-status-approved"><CheckCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className={`border-red-500 text-red-700 ${sizeClass}`} data-testid="badge-status-rejected"><XCircle className={size === "sm" ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />Rejected</Badge>;
      default:
        return <Badge variant="outline" className={sizeClass} data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
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

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const sorted = [...columnConfig].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((c) => c.id === dragId);
    const toIdx = sorted.findIndex((c) => c.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, order: i }));
    setColumnConfig(updated);
    saveColumnConfig(updated);
    setDragId(null);
    setDragOverId(null);
  };

  const orderedColumns = [...columnConfig].sort((a, b) => a.order - b.order);

  const colSpan = orderedColumns.filter((c) => {
    if (c.id === "project" && projectIdFromUrl) return false;
    return true;
  }).length;

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

        {/* Row 1 — Title & Actions */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400/70" />
            <h2 className="text-sm font-semibold" data-testid="text-page-title">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentView(currentView === "kanban" ? "table" : "kanban")}
              className={cn(
                "h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1",
                currentView === "kanban"
                  ? "bg-[#bba7db] text-white border-[#bba7db]/20"
                  : "hover-elevate active-elevate-2"
              )}
              data-testid="button-kanban-view"
            >
              <Columns3 className="w-3 h-3" />
              <span>Kanban</span>
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              onClick={handleAddVariation}
              data-testid="button-add-variation"
            >
              <Plus className="w-3 h-3" />
              <span>Add Variation</span>
            </button>
          </div>
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
        <div className="bg-[#bba7db]/10 flex items-center px-5 py-2 gap-6 flex-wrap">
          <div className="flex items-center gap-6 text-[10px] text-muted-foreground ml-auto">
            <span data-testid="text-total-action">
              Action <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.action)}</span>
            </span>
            <span className="w-px h-3 bg-[#bba7db]/40 self-center" />
            <span data-testid="text-total-pending">
              Pending <span className="font-medium text-foreground ml-1">{formatCurrency(statusTotals.pending)}</span>
            </span>
            <span className="w-px h-3 bg-[#bba7db]/40 self-center" />
            <span data-testid="text-total-approved">
              Approved <span className="font-medium text-emerald-600 dark:text-emerald-400 ml-1">{formatCurrency(statusTotals.approved)}</span>
            </span>
          </div>
        </div>

      </div>{/* end header card */}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-3 pb-3 pt-1.5">

        {currentView === "kanban" ? (
          <div className="border border-border rounded-md bg-background overflow-hidden">
            <KanbanView />
          </div>
        ) : (
          <div className="border border-border rounded-md bg-background overflow-hidden">

            {/* Search / column picker row — sticky top */}
            <div className="h-9 flex items-center px-3 border-b border-border/50 gap-2 bg-background sticky top-0 z-20">
              {/* Status filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "h-6 w-auto px-2 py-0 text-xs border rounded-md flex items-center gap-1",
                      selectedStatus !== "all"
                        ? "bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30 font-medium"
                        : "hover-elevate active-elevate-2"
                    )}
                    data-testid="filter-status-popover"
                  >
                    <span>Status</span>
                    {selectedStatus !== "all" && (
                      <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                        1
                      </Badge>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-1">
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status.key}
                        onClick={() => setSelectedStatus(status.key)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded transition-colors flex items-center justify-between hover-elevate",
                          selectedStatus === status.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                        )}
                        data-testid={`filter-status-${status.key}`}
                      >
                        <span>{status.label}</span>
                        {statusCounts[status.key as keyof typeof statusCounts] > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {statusCounts[status.key as keyof typeof statusCounts]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Column picker */}
              <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2 border border-transparent"
                    data-testid="button-column-picker"
                  >
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-3" align="start">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Columns — drag to reorder</p>
                  <div className="space-y-1">
                    {orderedColumns.map((col) => {
                      const def = ALL_COLUMNS.find((d) => d.id === col.id)!;
                      if (col.id === "project" && projectIdFromUrl) return null;
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
                          <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                          <Checkbox
                            checked={def.required ? true : col.visible}
                            disabled={def.required}
                            onCheckedChange={() => toggleColumn(col.id)}
                            className="border-border/50"
                          />
                          <span className={cn("flex-1 text-xs", def.required && "text-muted-foreground")}>
                            {def.label}
                          </span>
                          {def.required && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Search — right side */}
              <div className="relative ml-auto">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Search variations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-2 py-0 h-6 text-xs w-48"
                  data-testid="variations-search-input"
                />
              </div>
            </div>

            {/* Column header — sticky below search row */}
            <div className="overflow-x-hidden sticky top-9 z-10 border-b border-border bg-muted/50">
              <Table>
                <TableHeader>
                  <TableRow className="h-5 bg-muted/50 hover:bg-muted/50">
                    {orderedColumns.map((col) => {
                      if (!isColVisible(col.id)) return null;
                      const def = ALL_COLUMNS.find((d) => d.id === col.id)!;
                      const isRight = col.id === "total";
                      return (
                        <TableHead
                          key={col.id}
                          className={cn(
                            "text-[10px] uppercase tracking-wide text-muted-foreground/50 font-normal py-0 px-2",
                            isRight && "text-right"
                          )}
                          data-testid={`header-${col.id}`}
                        >
                          {def.label}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
              </Table>
            </div>

            {/* Table body */}
            <Table>
              <TableBody>
                {variationsLoading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center py-8">
                      <span className="text-muted-foreground text-sm" data-testid="text-loading">Loading variations...</span>
                    </TableCell>
                  </TableRow>
                ) : filteredVariations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center py-8">
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
                      {orderedColumns.map((col) => {
                        if (!isColVisible(col.id)) return null;
                        switch (col.id) {
                          case "number":
                            return (
                              <TableCell key="number" className="text-xs font-medium px-2 py-1" data-testid={`cell-number-${variation.id}`}>
                                {variation.variationNumber}
                              </TableCell>
                            );
                          case "name":
                            return (
                              <TableCell key="name" className="text-xs px-2 py-1" data-testid={`cell-name-${variation.id}`}>
                                {variation.name}
                              </TableCell>
                            );
                          case "project":
                            return (
                              <TableCell key="project" className="text-xs px-2 py-1" data-testid={`cell-project-${variation.id}`}>
                                <div className="flex items-center gap-1.5">
                                  <ProjectIcon
                                    icon={getProject(variation.projectId)?.icon || "Briefcase"}
                                    color={getProject(variation.projectId)?.color || "#3b82f6"}
                                    className="w-3 h-3"
                                  />
                                  <span>{getProjectName(variation.projectId)}</span>
                                </div>
                              </TableCell>
                            );
                          case "status":
                            return (
                              <TableCell key="status" className="px-2 py-1" data-testid={`cell-status-${variation.id}`}>
                                {getStatusBadge(variation.status, "sm")}
                              </TableCell>
                            );
                          case "total":
                            return (
                              <TableCell key="total" className="text-xs font-medium text-right px-2 py-1" data-testid={`cell-total-${variation.id}`}>
                                {formatCurrency(variation.totalAmount)}
                              </TableCell>
                            );
                          case "deadline":
                            return (
                              <TableCell key="deadline" className="text-xs text-muted-foreground px-2 py-1" data-testid={`cell-deadline-${variation.id}`}>
                                {formatDate(variation.approvalDeadline)}
                              </TableCell>
                            );
                          default:
                            return null;
                        }
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
