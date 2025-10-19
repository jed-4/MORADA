import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Plus, 
  FileText, 
  Lock, 
  Unlock, 
  Copy, 
  MoreHorizontal,
  DollarSign,
  Calculator,
  Search,
  ArrowLeft,
  LayoutGrid,
  Columns3,
  Download,
  Trash2,
  Upload
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type Estimate, type EstimateSummary, type Project, type FieldOption } from "@shared/schema";
import { ImportFullEstimateDialog } from "@/components/estimates/ImportFullEstimateDialog";

interface ProjectEstimatesParams {
  projectId: string;
}

export default function ProjectEstimates() {
  const { projectId } = useParams<ProjectEstimatesParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [currentView, setCurrentView] = useState("grid");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Drag and drop sensors
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

  if (!projectId) {
    return <div>Invalid project ID</div>;
  }

  const handleNewEstimate = () => {
    setLocation(`/projects/${projectId}/estimates/new`);
  };

  const handleBackToAllEstimates = () => {
    setLocation('/estimates');
  };


  // Fetch project details
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  // Fetch estimates for this specific project
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/estimates?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  // Mutation for toggling estimate lock state
  const toggleLockMutation = useMutation({
    mutationFn: async ({ estimateId, isLocked }: { estimateId: string; isLocked: boolean }) => {
      const endpoint = isLocked ? `/api/estimates/${estimateId}/unlock` : `/api/estimates/${estimateId}/lock`;
      const response = await apiRequest(endpoint, "POST", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", projectId] });
      toast({
        title: "Success",
        description: "Estimate lock status updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate lock status.",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting estimate
  const deleteEstimateMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      const response = await apiRequest(`/api/estimates/${estimateId}`, "DELETE");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Estimate deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setEstimateToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete estimate.",
        variant: "destructive",
      });
    },
  });

  // Fetch estimate statuses from field settings
  const { data: estimateStatuses = [] } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-categories/estimate.status/options"],
    queryFn: async () => {
      const response = await fetch("/api/field-categories/estimate.status/options", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  // Mutation for updating estimate status
  const updateEstimateStatusMutation = useMutation({
    mutationFn: async ({ estimateId, status }: { estimateId: string; status: string }) => {
      const response = await apiRequest(`/api/estimates/${estimateId}`, "PATCH", { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", projectId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate status.",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
    // Check if it's a whole number
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const getStatusBadge = (estimate: Estimate) => {
    const statusOption = estimateStatuses.find(s => s.key === estimate.status);
    if (statusOption) {
      return (
        <Badge 
          variant="secondary" 
          style={{ 
            backgroundColor: `${statusOption.color}20`,
            color: statusOption.color,
            borderColor: statusOption.color
          }}
        >
          {statusOption.name} v{estimate.version}
        </Badge>
      );
    }
    // Fallback for estimates without status
    return <Badge variant="outline">{estimate.status || 'Unknown'} v{estimate.version}</Badge>;
  };

  // Filter estimates based on search and filters
  const filteredEstimates = useMemo(() => {
    return estimates.filter(estimate => {
      const searchableContent = estimate.name.toLowerCase();
      
      const matchesSearch = searchableContent.includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'All' || estimate.status === selectedStatus;
        
      return matchesSearch && matchesStatus;
    });
  }, [estimates, searchTerm, selectedStatus]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    estimates.forEach(est => {
      const status = est.status || 'draft';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [estimates]);

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

    return (
      <Card 
        key={estimate.id} 
        className="hover-elevate cursor-pointer"
        onClick={() => setLocation(`/projects/${projectId}/estimates/${estimate.id}`)}
        data-testid={`card-estimate-${estimate.id}`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex-1">
            <CardTitle 
              className="text-lg" 
              data-testid={`link-estimate-title-${estimate.id}`}
            >
              {estimate.name}
            </CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusBadge(estimate)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" data-testid={`button-estimate-menu-${estimate.id}`}>
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  data-testid={`button-open-estimate-${estimate.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(`/projects/${projectId}/estimates/${estimate.id}`);
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Open estimate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  data-testid={`button-clone-estimate-${estimate.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Create Version
                </DropdownMenuItem>
                <DropdownMenuItem 
                  data-testid={`button-toggle-lock-${estimate.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLockMutation.mutate({ estimateId: estimate.id, isLocked: estimate.isLocked });
                  }}
                  disabled={toggleLockMutation.isPending}
                >
                  {estimate.isLocked ? (
                    <>
                      <Unlock className="w-4 h-4 mr-2" />
                      Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Lock
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  data-testid={`button-delete-estimate-${estimate.id}`}
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEstimateToDelete(estimate.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-lg font-semibold" data-testid={`text-estimate-total-${estimate.id}`}>
                {summary ? formatCurrency(summary.total) : 'Loading...'}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-sm text-muted-foreground">Items</p>
              <p className="text-lg font-medium">
                {summary ? summary.itemCount : '-'}
              </p>
            </div>
          </div>
          {summary && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Subtotal</p>
                <p className="font-medium">{formatCurrency(summary.subtotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Markup</p>
                <p className="font-medium">{formatCurrency(summary.markupAmount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">GST</p>
                <p className="font-medium">{formatCurrency(summary.taxAmount)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const estimateId = active.id as string;
    
    // Determine the target status key
    // If dropped on a column directly, over.id is the status key
    // If dropped on a card, get the containerId from sortable data
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

  // Sortable Estimate Card Component
  const SortableEstimateCard = ({ estimate }: { estimate: Estimate }) => {
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

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        data-testid={`kanban-estimate-card-${estimate.id}`}
      >
        <div onClick={() => setLocation(`/projects/${projectId}/estimates/${estimate.id}`)}>
          <EstimateCard estimate={estimate} />
        </div>
      </div>
    );
  };

  // Droppable Column Component
  const DroppableColumn = ({ status, estimates }: { status: FieldOption; estimates: Estimate[] }) => {
    const { setNodeRef, isOver } = useDroppable({ id: status.key });

    return (
      <div
        ref={setNodeRef}
        className={`flex-shrink-0 w-80 ${isOver ? 'bg-accent/20 rounded-lg' : ''}`}
        data-testid={`kanban-column-${status.key}`}
      >
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: status.color || '#6B7280' }}
              />
              {status.name}
            </h3>
            <Badge variant="secondary">{estimates.length}</Badge>
          </div>
        </div>
        <SortableContext items={estimates.map(e => e.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 min-h-[200px]">
            {estimates.map(estimate => (
              <SortableEstimateCard key={estimate.id} estimate={estimate} />
            ))}
            {estimates.length === 0 && (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
                Drop estimates here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    );
  };

  // Kanban Board Component
  const KanbanBoard = () => {
    // Group estimates by status
    const estimatesByStatus = useMemo(() => {
      const grouped: Record<string, Estimate[]> = {};
      
      // Initialize with all active statuses
      estimateStatuses.filter(status => status.isActive).forEach(status => {
        grouped[status.key] = [];
      });

      // Group filtered estimates by status
      filteredEstimates.forEach(estimate => {
        const statusKey = estimate.status || 'draft';
        if (grouped[statusKey]) {
          grouped[statusKey].push(estimate);
        } else {
          grouped[statusKey] = [estimate];
        }
      });

      return grouped;
    }, [filteredEstimates, estimateStatuses]);

    // Get active estimate for drag overlay
    const activeEstimate = activeId ? estimates.find(e => e.id === activeId) : null;

    return (
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
              const statusEstimates = estimatesByStatus[status.key] || [];
              return <DroppableColumn key={status.key} status={status} estimates={statusEstimates} />;
            })}
        </div>
        <DragOverlay>
          {activeEstimate ? (
            <div className="opacity-80">
              <EstimateCard estimate={activeEstimate} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  return (
    <div className="p-6 space-y-6" data-testid="project-estimates-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={handleBackToAllEstimates}
              data-testid="button-back-to-all-estimates"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              All Estimates
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {project ? `${project.name} Estimates` : 'Project Estimates'}
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage estimates for this project
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="button-import-estimate">
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
              <Plus className="w-4 h-4 mr-2" />
              New Estimate
            </Button>
          </div>
        </div>
        
        {/* Section separator */}
        <div className="border-b border-border"></div>

        {/* Stats and Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" data-testid="text-estimate-count">
              {estimates.length} Total
            </Badge>
            {estimateStatuses
              .filter(status => status.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .slice(0, 3)
              .map(status => {
                const count = statusCounts[status.key] || 0;
                return (
                  <Badge 
                    key={status.key} 
                    variant="outline" 
                    style={{ 
                      borderColor: status.color || '#6B7280',
                      color: status.color || '#6B7280'
                    }}
                    data-testid={`text-status-count-${status.key}`}
                  >
                    {count} {status.name}
                  </Badge>
                );
              })}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search estimates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="project-estimates-search-input"
              />
            </div>
            
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-48" data-testid="project-estimates-status-filter">
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
      </div>

      {/* View Tabs */}
      <Tabs value={currentView} onValueChange={setCurrentView}>
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
              {searchTerm || selectedStatus !== "All" ? "No estimates found" : "No estimates yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || selectedStatus !== "All" 
                ? "Try adjusting your search or filter criteria"
                : `Start by creating your first estimate for ${project?.name || 'this project'}`
              }
            </p>
            {!searchTerm && selectedStatus === "All" && (
              <Button onClick={handleNewEstimate} data-testid="button-create-first-project-estimate">
                <Plus className="h-4 w-4 mr-2" />
                Create First Estimate
              </Button>
            )}
          </Card>
        ) : (
          <>
            <TabsContent value="grid" className="mt-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEstimates.map((estimate) => (
                  <EstimateCard key={estimate.id} estimate={estimate} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="kanban" className="mt-6">
              <KanbanBoard />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Delete Estimate Confirmation Dialog */}
      <AlertDialog 
        open={deleteDialogOpen} 
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setEstimateToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this estimate? This action cannot be undone and will permanently delete all estimate items and groups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              data-testid="button-cancel-delete-estimate"
              disabled={deleteEstimateMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => estimateToDelete && deleteEstimateMutation.mutate(estimateToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-estimate"
              disabled={deleteEstimateMutation.isPending}
            >
              {deleteEstimateMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Estimate Dialog */}
      <ImportFullEstimateDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        projectId={projectId!}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/estimates", projectId] });
          queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
        }}
      />
    </div>
  );
}