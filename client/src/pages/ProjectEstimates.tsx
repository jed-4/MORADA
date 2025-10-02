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
  Calculator,
  Search,
  ArrowLeft
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
import { type Estimate, type EstimateSummary, type Project } from "@shared/schema";

interface ProjectEstimatesParams {
  projectId: string;
}

export default function ProjectEstimates() {
  const { projectId } = useParams<ProjectEstimatesParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");

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
      const response = await apiRequest("POST", endpoint, {});
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

  // Get estimate counts by status
  const draftCount = estimates.filter(est => !est.isLocked).length;
  const lockedCount = estimates.filter(est => est.isLocked).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked v{estimate.version}</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Draft v{estimate.version}</Badge>;
  };

  // Filter estimates based on search and filters
  const filteredEstimates = useMemo(() => {
    return estimates.filter(estimate => {
      const searchableContent = estimate.name.toLowerCase();
      
      const matchesSearch = searchableContent.includes(searchTerm.toLowerCase());
      const matchesStatus = selectedStatus === 'All' || 
        (selectedStatus === 'Draft' && !estimate.isLocked) ||
        (selectedStatus === 'Locked' && estimate.isLocked);
        
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
          <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
            <Plus className="w-4 h-4 mr-2" />
            New Estimate
          </Button>
        </div>
        
        {/* Section separator */}
        <div className="border-b border-border"></div>

        {/* Stats and Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" data-testid="text-estimate-count">
              {estimates.length} Total
            </Badge>
            <Badge variant="outline" data-testid="text-draft-count">
              {draftCount} Draft
            </Badge>
            <Badge variant="secondary" data-testid="text-locked-count">
              {lockedCount} Locked
            </Badge>
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
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Locked">Locked</SelectItem>
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
        <Card className="p-8 text-center">
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEstimates.map((estimate) => (
            <EstimateCard key={estimate.id} estimate={estimate} />
          ))}
        </div>
      )}
    </div>
  );
}