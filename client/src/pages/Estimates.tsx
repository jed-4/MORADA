import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  FileText, 
  Lock, 
  Search,
  DollarSign,
  LayoutGrid,
  Columns3,
  Download
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ProjectIcon } from "@/components/ProjectIcon";
import { logActivity } from "@/lib/activityLogger";

export default function Estimates() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [currentView, setCurrentView] = useState<'grid' | 'kanban'>('grid');
  const [activeId, setActiveId] = useState<string | null>(null);

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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
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

        logActivity({
          projectId: estimate.projectId,
          userId: "current-user",
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
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

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
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />{estimate.status || 'Draft'}</Badge>;
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

  const EstimateCard = ({ estimate }: { estimate: Estimate }) => {
    // Fetch summary for this estimate
    const { data: summary } = useQuery<EstimateSummary>({
      queryKey: ["/api/estimates", estimate.id, "summary"],
      queryFn: async () => {
        const response = await fetch(`/api/estimates/${estimate.id}/summary`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`${response.status}: ${response.statusText}`);
        }
        return response.json();
      },
      enabled: !!estimate.id,
    });

    const handleEstimateClick = () => {
      setLocation(`/estimates/project/${estimate.projectId}`);
    };

    return (
      <Card 
        key={estimate.id} 
        className="hover-elevate p-4 cursor-pointer"
        data-testid={`estimate-card-${estimate.id}`}
        onClick={handleEstimateClick}
      >
        <div className="flex items-start gap-6">
          {/* Estimate Name and Project */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-base mb-2 line-clamp-1">
              {estimate.name}
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              Project: {getProjectName(estimate.projectId)}
            </p>
          </div>
          
          {/* Total Value */}
          <div className="flex-shrink-0 text-right">
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="font-semibold text-lg" data-testid={`text-estimate-total-${estimate.id}`}>
              {summary ? formatCurrency(summary.total) : 'Loading...'}
            </p>
          </div>
          
          {/* Status Badge */}
          <div className="flex-shrink-0">
            {getStatusBadge(estimate)}
          </div>
        </div>
      </Card>
    );
  };


  return (
    <div className="p-6 space-y-6" data-testid="estimates-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">All Estimates</h1>
            <p className="text-muted-foreground mt-1">
              View and manage estimates across all your projects
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
              <Plus className="h-4 w-4 mr-2" />
              New Estimate
            </Button>
          </div>
        </div>
        
        {/* Section separator */}
        <div className="border-b border-border"></div>

        {/* Filters and Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search estimates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="estimates-search-input"
            />
          </div>
          
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48" data-testid="estimates-project-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    <ProjectIcon 
                      icon={project.icon} 
                      color={project.color} 
                      className="w-4 h-4 flex-shrink-0" 
                    />
                    <span className="truncate">{project.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-48" data-testid="estimates-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Status</SelectItem>
              {estimateStatuses
                .filter(status => status.isActive)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(status => (
                  <SelectItem key={status.key} value={status.key}>
                    {status.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* View Tabs */}
      <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as 'grid' | 'kanban')}>
        <div className="border-b border-border">
          <TabsList data-testid="tabs-estimate-views">
            <TabsTrigger value="grid" data-testid="tab-grid-view">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Grid View
            </TabsTrigger>
            <TabsTrigger value="kanban" data-testid="tab-kanban-view">
              <Columns3 className="h-4 w-4 mr-2" />
              Kanban
            </TabsTrigger>
          </TabsList>
        </div>

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
            <TabsContent value="grid" className="mt-6">
              <div className="w-full space-y-3">
                {filteredEstimates.map((estimate) => (
                  <EstimateCard key={estimate.id} estimate={estimate} />
                ))}
              </div>
            </TabsContent>

            {/* Kanban View */}
            <TabsContent value="kanban" className="mt-6">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
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
                        />
                      );
                    })}
                </div>

                <DragOverlay>
                  {activeId ? (
                    <div className="bg-card border rounded-lg p-3 shadow-lg opacity-90">
                      <div className="font-medium text-sm">
                        {estimates.find(e => e.id === activeId)?.name || 'Dragging...'}
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({ status, estimates, count, estimateStatuses, projects }: { 
  status: FieldOption; 
  estimates: Estimate[]; 
  count: number;
  estimateStatuses: FieldOption[];
  projects: Project[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.key,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: status.color || '#6B7280' }}
          />
          <h3 className="font-medium text-sm">{status.name}</h3>
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[200px] rounded-lg p-3 transition-colors ${
          isOver ? 'bg-accent/50' : 'bg-muted/20'
        }`}
      >
        <SortableContext items={estimates.map(e => e.id)} strategy={verticalListSortingStrategy}>
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
    opacity: isDragging ? 0.5 : 1,
  };

  // Fetch summary for this estimate
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", estimate.id, "summary"],
    queryFn: async () => {
      const response = await fetch(`/api/estimates/${estimate.id}/summary`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!estimate.id,
  });

  const handleEstimateClick = () => {
    setLocation(`/estimates/project/${estimate.projectId}`);
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
    if (statusOption) {
      return (
        <Badge 
          variant="outline"
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
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />{estimate.status || 'Draft'}</Badge>;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleEstimateClick}
      className="bg-card border rounded-lg p-3 mb-2 cursor-move hover-elevate"
      data-testid={`kanban-estimate-card-${estimate.id}`}
    >
      <h4 className="font-medium text-sm mb-1 line-clamp-1">{estimate.name}</h4>
      <p className="text-xs text-muted-foreground mb-2">
        {getProjectName(estimate.projectId)}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {summary ? formatCurrency(summary.total) : 'Loading...'}
        </span>
        {getStatusBadge(estimate)}
      </div>
    </div>
  );
}