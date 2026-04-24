import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  LayoutGrid,
  Columns3,
  Download,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ProjectIcon } from "@/components/ProjectIcon";
import { logActivity } from "@/lib/activityLogger";

export default function Estimates() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const pageTitle = usePageTitle({ pageName: "Estimates" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [currentView, setCurrentView] = useState<'grid' | 'kanban'>('grid');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);
  const [cardWidth, setCardWidth] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

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

  // Fetch all projects for display
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch estimate status options from field settings
  const { data: estimateStatusesData } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate.status"],
  });

  const estimateStatuses = useMemo(() => {
    return estimateStatusesData?.options || [];
  }, [estimateStatusesData]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    estimates.forEach(estimate => {
      counts[estimate.status] = (counts[estimate.status] || 0) + 1;
    });
    return counts;
  }, [estimates]);

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
        let description = `User updated estimate status to '${statusName}' for estimate '${estimate.name}'`;

        if (variables.status === "approved") {
          action = "approved";
          description = `User approved estimate '${estimate.name}'`;
        } else if (variables.status === "rejected") {
          action = "rejected";
          description = `User rejected estimate '${estimate.name}'`;
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

    // Update the status
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

  const getStatusBadge = (estimate: Estimate) => {
    const statusOption = estimateStatuses.find(s => s.key === estimate.status);
    if (statusOption) {
      return (
        <Badge 
          variant="outline"
          className="h-4 text-[10px] px-1.5"
          style={{
            backgroundColor: statusOption.color || '#6B7280',
            color: '#FFFFFF',
            borderColor: statusOption.color || '#6B7280'
          }}
        >
          {statusOption.name}
        </Badge>
      );
    }
    // Fallback to isLocked for backward compatibility
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="h-4 text-[10px] px-1.5 bg-blue-100 text-status-info"><Lock className="w-3 h-3 mr-0.5" />Locked</Badge>;
    }
    return <Badge variant="outline" className="h-4 text-[10px] px-1.5"><FileText className="w-3 h-3 mr-0.5" />{estimate.status || 'Draft'}</Badge>;
  };


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
        
      return matchesSearch && matchesProject && matchesStatus;
    });
  }, [estimates, searchTerm, selectedProject, selectedStatus, projects]);

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
    setLocation(`/estimates/project/${estimate.projectId}`);
  };


  return (
    <div className="flex flex-col h-full" data-testid="estimates-page">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Title + Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {pageTitle}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-estimate-count">
            {filteredEstimates.length} estimates
          </Badge>
        </div>

        {/* Right: New Estimate Button */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleNewEstimate}
            data-testid="button-new-estimate"
          >
            <Plus className="w-3 h-3" />
            <span>New Estimate</span>
          </button>
        </div>
      </div>

      {/* Row 2 - View Tabs (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCurrentView('grid')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'grid' 
                ? 'bg-primary text-white border-primary/20 hover:bg-primary/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-grid-view"
          >
            <LayoutGrid className="w-3 h-3" />
            <span>Grid</span>
          </button>
          <button
            onClick={() => setCurrentView('kanban')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'kanban' 
                ? 'bg-primary text-white border-primary/20 hover:bg-primary/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-kanban-view"
          >
            <Columns3 className="w-3 h-3" />
            <span>Kanban</span>
          </button>
        </div>

        {/* Right: Card Width Toggle (only visible in kanban view) */}
        {currentView === 'kanban' && (
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
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
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

        {/* Right: Column picker (grid view only) */}
        {currentView === 'grid' && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-columns"
              >
                <Columns3 className="w-3 h-3" />
                <span>Columns</span>
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
          <Card className="p-8 text-center mt-6">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm || selectedProject !== "All" || selectedStatus !== "All" ? "No estimates found" : "No estimates yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || selectedProject !== "All" || selectedStatus !== "All" 
                ? "Try adjusting your search or filter criteria"
                : "Start by creating your first estimate for a project"
              }
            </p>
            {!searchTerm && selectedProject === "All" && selectedStatus === "All" && (
              <Button onClick={handleNewEstimate} data-testid="button-create-first-estimate">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Estimate
              </Button>
            )}
          </Card>
        ) : (
          <>
            {/* Grid View */}
            {currentView === 'grid' && (
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
            {currentView === 'kanban' && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {estimateStatuses
                    .filter(status => status.isActive)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(status => {
                      const columnEstimates = filteredEstimates.filter(est => est.status === status.key);
                      
                      return (
                        <KanbanColumn
                          key={status.key}
                          status={status}
                          estimates={columnEstimates}
                          count={statusCounts[status.key] || 0}
                          estimateStatuses={estimateStatuses}
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
function KanbanColumn({ status, estimates, count, estimateStatuses, projects, cardWidth, isHighlighted }: { 
  status: FieldOption; 
  estimates: Estimate[]; 
  count: number;
  estimateStatuses: FieldOption[];
  projects: Project[];
  cardWidth: 'compact' | 'comfortable' | 'spacious';
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
        <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{status.name}</h3>
            <Badge variant="secondary" className="text-xs px-2 py-0.5 h-5 rounded-full bg-primary/10 text-primary border-primary/20 no-default-hover-elevate font-semibold">
              {count}
            </Badge>
          </div>
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
                estimateStatuses={estimateStatuses}
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
function SortableEstimateCard({ estimate, estimateStatuses, projects }: { 
  estimate: Estimate;
  estimateStatuses: FieldOption[];
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
    setLocation(`/estimates/${estimate.id}`);
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

  const getStatusBadge = (estimate: Estimate) => {
    const statusOption = estimateStatuses.find(s => s.key === estimate.status);
    if (statusOption && statusOption.color) {
      return (
        <Badge 
          variant="secondary"
          className="h-4 text-[10px] px-1.5 rounded-full"
          style={{
            backgroundColor: `${statusOption.color}20`,
            color: statusOption.color,
            borderColor: `${statusOption.color}40`
          }}
        >
          {statusOption.name}
        </Badge>
      );
    }
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="h-4 text-[10px] px-1.5 rounded-full bg-blue-100 text-status-info"><Lock className="w-2.5 h-2.5 mr-0.5" />Locked</Badge>;
    }
    return <Badge variant="outline" className="h-4 text-[10px] px-1.5 rounded-full"><FileText className="w-2.5 h-2.5 mr-0.5" />{estimate.status || 'Draft'}</Badge>;
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
        <h4 className="font-medium text-sm mb-0.5 line-clamp-1">{estimate.name}</h4>
        <p className="text-[10px] text-muted-foreground mb-2">
          {getProjectName(estimate.projectId)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">
            {summary ? formatCurrency(summary.total) : 'Loading...'}
          </span>
          {getStatusBadge(estimate)}
        </div>
      </div>
    </div>
  );
}