import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  FileText, 
  Lock, 
  Search,
  DollarSign
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Estimate, type EstimateSummary, type Project } from "@shared/schema";

export default function Estimates() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

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


  // Get project name helper
  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Draft</Badge>;
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
      const matchesStatus = selectedStatus === 'All' || 
        (selectedStatus === 'Draft' && !estimate.isLocked) ||
        (selectedStatus === 'Locked' && estimate.isLocked);
        
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
          <Button onClick={handleNewEstimate} data-testid="button-new-estimate">
            <Plus className="h-4 w-4 mr-2" />
            New Estimate
          </Button>
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
                  {project.name}
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
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Locked">Locked</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="w-full space-y-3">
          {filteredEstimates.map((estimate) => (
            <EstimateCard key={estimate.id} estimate={estimate} />
          ))}
        </div>
      )}
    </div>
  );
}