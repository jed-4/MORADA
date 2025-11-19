import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  FileText, 
  Lock, 
  Unlock, 
  Copy, 
  MoreHorizontal,
  DollarSign,
  Search,
  Trash2,
  LayoutGrid,
  Columns3
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { usePageTitle } from "@/hooks/usePageTitle";

interface ProjectEstimatesParams {
  projectId: string;
}

export default function ProjectEstimates() {
  const { projectId } = useParams<ProjectEstimatesParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'grid' | 'kanban'>('grid');

  if (!projectId) {
    return <div>Invalid project ID</div>;
  }

  const handleNewEstimate = () => {
    setLocation(`/projects/${projectId}/estimates/new`);
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

  // Set page title
  const pageTitle = project ? `${project.name} · Estimates` : 'Project · Estimates';
  usePageTitle(pageTitle);

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

  const formatCurrency = (amount: number) => {
    const dollars = amount / 100;
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
    if (statusOption && statusOption.color) {
      return (
        <Badge 
          variant="secondary" 
          className="h-4 text-[10px] px-1.5"
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
    return <Badge variant="outline" className="h-4 text-[10px] px-1.5"><FileText className="w-3 h-3 mr-0.5" />{estimate.status || 'Draft'}</Badge>;
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
      setLocation(`/projects/${projectId}/estimates/${estimate.id}`);
    };

    return (
      <Card 
        key={estimate.id} 
        className="hover-elevate p-3 cursor-pointer border rounded-xl"
        data-testid={`estimate-card-${estimate.id}`}
        onClick={handleEstimateClick}
      >
        <div className="flex items-center gap-3">
          {/* Left: Estimate Name */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-1">
              {estimate.name}
            </h3>
          </div>
          
          {/* Right: Status Badge (fixed width for alignment) */}
          <div className="flex-shrink-0 w-24 flex justify-end">
            {getStatusBadge(estimate)}
          </div>
          
          {/* Right: Total Value */}
          <div className="flex-shrink-0 text-right w-28">
            <p className="font-semibold text-sm" data-testid={`text-estimate-total-${estimate.id}`}>
              {summary ? formatCurrency(summary.total) : 'Loading...'}
            </p>
          </div>

          {/* Menu */}
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-estimate-menu-${estimate.id}`}>
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  data-testid={`button-open-estimate-${estimate.id}`}
                  onClick={() => setLocation(`/projects/${projectId}/estimates/${estimate.id}`)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Open estimate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  data-testid={`button-clone-estimate-${estimate.id}`}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Create Version
                </DropdownMenuItem>
                <DropdownMenuItem 
                  data-testid={`button-toggle-lock-${estimate.id}`}
                  onClick={() => toggleLockMutation.mutate({ estimateId: estimate.id, isLocked: estimate.isLocked })}
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
                  onClick={() => {
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
        </div>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-full" data-testid="project-estimates-page">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0">
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
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleNewEstimate}
            data-testid="button-new-estimate"
          >
            <Plus className="w-3 h-3" />
            <span>New Estimate</span>
          </button>
        </div>
      </div>

      {/* Row 2 - View Tabs (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCurrentView('grid')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'grid' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
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
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-kanban-view"
          >
            <Columns3 className="w-3 h-3" />
            <span>Kanban</span>
          </button>
        </div>
      </div>

      {/* Row 3 - Search & Filters (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
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
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors ${
                    selectedStatus === "All" ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
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
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors ${
                        selectedStatus === status.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* Estimates Display */}
        {estimatesLoading ? (
          <div className="text-center py-8">
            <div className="text-muted-foreground">Loading estimates...</div>
          </div>
        ) : filteredEstimates.length === 0 ? (
          <Card className="p-8 text-center mt-6 rounded-xl">
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
              <button
                onClick={handleNewEstimate}
                className="h-8 w-auto px-3 text-sm border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1 mx-auto"
                data-testid="button-create-first-project-estimate"
              >
                <Plus className="h-4 w-4" />
                Create First Estimate
              </button>
            )}
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredEstimates.map((estimate) => (
              <EstimateCard key={estimate.id} estimate={estimate} />
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
