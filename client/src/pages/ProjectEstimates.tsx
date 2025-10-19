import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Trash2
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
    if (statusOption && statusOption.color) {
      return (
        <Badge 
          variant="secondary" 
          style={{ 
            backgroundColor: `${statusOption.color}20`,
            color: statusOption.color,
            borderColor: statusOption.color
          }}
        >
          {statusOption.name}
        </Badge>
      );
    }
    // Fallback for estimates without status or color
    return <Badge variant="outline">{statusOption?.name || estimate.status || 'Unknown'}</Badge>;
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0 pb-4">
          <div className="flex-1 min-w-0">
            <CardTitle 
              className="text-lg truncate" 
              data-testid={`link-estimate-title-${estimate.id}`}
            >
              {estimate.name}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {summary && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-lg font-semibold" data-testid={`text-estimate-total-${estimate.id}`}>
                  {formatCurrency(summary.total)}
                </p>
              </div>
            )}
            {!summary && (
              <div className="text-muted-foreground text-sm">Loading...</div>
            )}
            <div className="flex items-center gap-2">
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
          </div>
        </CardHeader>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6" data-testid="project-estimates-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {project ? `${project.name} Estimates` : 'Project Estimates'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage estimates for this project
            </p>
          </div>
          <div className="flex gap-2">
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
        <div className="mt-6 space-y-4">
          {filteredEstimates.map((estimate) => (
            <EstimateCard key={estimate.id} estimate={estimate} />
          ))}
        </div>
      )}

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