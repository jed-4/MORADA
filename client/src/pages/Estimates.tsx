import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, 
  FileText, 
  Lock, 
  Unlock, 
  Copy, 
  MoreHorizontal,
  DollarSign,
  Calculator,
  FolderOpen
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Estimate, type EstimateSummary, type Project } from "@shared/schema";

export default function Estimates() {
  const [activeTab, setActiveTab] = useState("list");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();

  const handleNewEstimate = () => {
    setLocation('/estimates/new');
  };

  // Fetch estimates filtered by current project
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/estimates?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  // Mutation for toggling estimate lock state
  const toggleLockMutation = useMutation({
    mutationFn: async ({ estimateId, isLocked }: { estimateId: string; isLocked: boolean }) => {
      const endpoint = isLocked ? `/api/estimates/${estimateId}/unlock` : `/api/estimates/${estimateId}/lock`;
      const response = await apiRequest("POST", endpoint, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", currentProject?.id] });
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

  const EstimateCard = ({ estimate }: { estimate: Estimate }) => {
    // Fetch summary for this estimate
    const { data: summary } = useQuery<EstimateSummary>({
      queryKey: ["/api/estimates", estimate.id, "summary"],
      enabled: !!estimate.id,
    });
    
    // Fetch project details
    const { data: project } = useQuery<Project>({
      queryKey: ["/api/projects", estimate.projectId],
      enabled: !!estimate.projectId,
    });

    return (
      <Card key={estimate.id} className="hover-elevate">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex-1">
            <CardTitle 
              className="text-lg cursor-pointer hover:text-blue-600 transition-colors" 
              onClick={() => setLocation(`/estimates/${estimate.id}`)}
              data-testid={`link-estimate-title-${estimate.id}`}
            >
              {estimate.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Project: {project?.name || 'Loading...'}</p>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusBadge(estimate)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-estimate-menu-${estimate.id}`}>
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  data-testid={`button-edit-estimate-${estimate.id}`}
                  onClick={() => setLocation(`/estimates/${estimate.id}`)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Edit Items
                </DropdownMenuItem>
                <DropdownMenuItem 
                  data-testid={`button-view-summary-${estimate.id}`}
                  onClick={() => setLocation(`/estimates/${estimate.id}`)}
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  View Summary
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid={`button-clone-estimate-${estimate.id}`}>
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

  if (estimatesLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">
                Estimates
              </h1>
              <Badge variant="secondary" data-testid="text-estimate-count">
                Loading...
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-gray-300 rounded w-1/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Estimates
            </h1>
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
          <div className="flex items-center space-x-2">
            <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
              <Plus className="w-4 h-4 mr-2" />
              New Estimate
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
          <div className="border-b border-border px-4">
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="list" data-testid="tab-list-view">
                <FolderOpen className="w-4 h-4 mr-2" />
                List View
              </TabsTrigger>
              <TabsTrigger value="summary" data-testid="tab-summary-view">
                <DollarSign className="w-4 h-4 mr-2" />
                Summary View
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="list" className="p-4 h-full">
            {estimates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No estimates yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first estimate to get started with project cost management.
                </p>
                <Button onClick={handleNewEstimate} data-testid="button-create-first-estimate">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Estimate
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {estimates.map((estimate) => (
                  <EstimateCard key={estimate.id} estimate={estimate} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="summary" className="p-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Estimates</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-estimates">
                    {estimates.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Draft Estimates</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600" data-testid="text-draft-estimates">
                    {draftCount}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Locked Estimates</CardTitle>
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600" data-testid="text-locked-estimates">
                    {lockedCount}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-total-value">
                    Loading...
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No recent activity to display.</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as you work with estimates.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}