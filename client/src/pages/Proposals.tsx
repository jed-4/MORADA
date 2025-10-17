import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  FileText, 
  Search,
  DollarSign,
  Calendar,
  User,
  Send,
  CheckCircle,
  XCircle,
  FileCheck
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Proposal, type Project, type FieldCategoryWithOptions } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

export default function Proposals() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  const handleNewProposal = () => {
    setLocation('/proposals/new');
  };

  // Fetch all proposals
  const { data: proposals = [], isLoading: proposalsLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
  });

  // Fetch all projects for display
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch proposal status options from field settings
  const { data: proposalStatusesData } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/proposal.status"],
  });

  const proposalStatuses = useMemo(() => {
    return proposalStatusesData?.options || [];
  }, [proposalStatusesData]);

  // Filter proposals
  const filteredProposals = useMemo(() => {
    return proposals.filter(proposal => {
      const matchesSearch = proposal.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           proposal.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject = selectedProject === "All" || proposal.projectId === selectedProject;
      const matchesStatus = selectedStatus === "All" || proposal.status === selectedStatus;
      return matchesSearch && matchesProject && matchesStatus;
    });
  }, [proposals, searchTerm, selectedProject, selectedStatus]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    proposals.forEach(proposal => {
      counts[proposal.status] = (counts[proposal.status] || 0) + 1;
    });
    return counts;
  }, [proposals]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'accepted': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      default: return <FileCheck className="w-4 h-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    const statusOption = proposalStatuses.find(s => s.key === status);
    if (statusOption?.color) {
      return "default";
    }
    
    switch (status) {
      case 'draft': return "secondary";
      case 'sent': return "default";
      case 'accepted': return "default";
      case 'rejected': return "destructive";
      default: return "outline";
    }
  };

  const getStatusColor = (status: string) => {
    const statusOption = proposalStatuses.find(s => s.key === status);
    return statusOption?.color || null;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  if (proposalsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading proposals...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-proposals-heading">Proposals</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage project proposals
              </p>
            </div>
            <Button 
              onClick={handleNewProposal} 
              data-testid="button-new-proposal"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New Proposal
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search proposals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-proposals"
              />
            </div>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
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
              <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Statuses</SelectItem>
                {proposalStatuses.map((status) => (
                  <SelectItem key={status.key} value={status.key}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {filteredProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No proposals found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchTerm || selectedProject !== "All" || selectedStatus !== "All"
                ? "Try adjusting your filters"
                : "Create your first proposal to get started"}
            </p>
            {!searchTerm && selectedProject === "All" && selectedStatus === "All" && (
              <Button onClick={handleNewProposal} className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Create Proposal
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProposals.map((proposal) => {
              const project = projects.find(p => p.id === proposal.projectId);
              const statusColor = getStatusColor(proposal.status);
              const statusOption = proposalStatuses.find(s => s.key === proposal.status);
              
              return (
                <Card 
                  key={proposal.id}
                  className="hover-elevate cursor-pointer transition-all"
                  onClick={() => setLocation(`/proposals/${proposal.id}`)}
                  data-testid={`card-proposal-${proposal.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {project && (
                          <ProjectIcon 
                            icon={project.icon} 
                            color={project.color} 
                            className="w-5 h-5 shrink-0" 
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium truncate" data-testid={`text-proposal-title-${proposal.id}`}>
                            {proposal.name}
                          </h3>
                          {project && (
                            <p className="text-xs text-muted-foreground truncate">
                              {project.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant={getStatusBadgeVariant(proposal.status)}
                        className="shrink-0 gap-1"
                        style={statusColor ? {
                          backgroundColor: `${statusColor}15`,
                          color: statusColor,
                          borderColor: `${statusColor}30`
                        } : undefined}
                        data-testid={`badge-proposal-status-${proposal.id}`}
                      >
                        {getStatusIcon(proposal.status)}
                        {statusOption?.name || proposal.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {proposal.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {proposal.notes}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        <span data-testid={`text-proposal-amount-${proposal.id}`}>
                          {formatCurrency(proposal.totalAmount)}
                        </span>
                      </div>
                      {proposal.expiryDate && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-xs">
                            Valid until {format(new Date(proposal.expiryDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}
                    </div>

                    {proposal.sentDate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Send className="w-3 h-3" />
                        <span>
                          Sent {format(new Date(proposal.sentDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}

                    {proposal.acceptedDate && (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        <span>
                          Accepted {format(new Date(proposal.acceptedDate), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
