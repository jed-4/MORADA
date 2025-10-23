import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileCheck,
  ChevronDown,
  Archive,
  ArchiveRestore
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Proposal, type Project, type FieldCategoryWithOptions } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Proposals() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const { toast } = useToast();

  // Auto-select project if accessed from project context
  useEffect(() => {
    if (params.projectId) {
      setSelectedProject(params.projectId);
    }
  }, [params.projectId]);

  const isProjectContext = !!params.projectId;

  const handleNewProposal = () => {
    if (isProjectContext) {
      setLocation(`/projects/${params.projectId}/proposals/new`);
    } else {
      setLocation('/proposals/new');
    }
  };

  // Mutation to update proposal status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ proposalId, status }: { proposalId: string; status: string }) => {
      return await apiRequest(`/api/proposals/${proposalId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Status updated",
        description: "Proposal status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update proposal status.",
      });
    },
  });

  // Mutation to archive/unarchive proposal
  const toggleArchiveMutation = useMutation({
    mutationFn: async ({ proposalId, isArchived }: { proposalId: string; isArchived: boolean }) => {
      return await apiRequest(`/api/proposals/${proposalId}`, "PATCH", { isArchived });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: variables.isArchived ? "Proposal archived" : "Proposal restored",
        description: variables.isArchived 
          ? "Proposal has been moved to archived proposals."
          : "Proposal has been restored to active proposals.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update proposal archive status.",
      });
    },
  });

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
      const matchesArchived = activeTab === "archived" ? proposal.isArchived : !proposal.isArchived;
      const matchesSearch = proposal.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           proposal.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject = selectedProject === "All" || proposal.projectId === selectedProject;
      const matchesStatus = selectedStatus === "All" || proposal.status === selectedStatus;
      return matchesArchived && matchesSearch && matchesProject && matchesStatus;
    });
  }, [proposals, searchTerm, selectedProject, selectedStatus, activeTab]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    proposals.forEach(proposal => {
      counts[proposal.status] = (counts[proposal.status] || 0) + 1;
    });
    return counts;
  }, [proposals]);

  // Calculate archive counts
  const archiveCounts = useMemo(() => {
    const active = proposals.filter(p => !p.isArchived).length;
    const archived = proposals.filter(p => p.isArchived).length;
    return { active, archived };
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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "archived")} className="mt-6">
            <TabsList className="w-full sm:w-auto" data-testid="tabs-proposals">
              <TabsTrigger value="active" className="gap-2" data-testid="tab-active-proposals">
                <FileText className="w-4 h-4" />
                Active
                {archiveCounts.active > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                    {archiveCounts.active}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-2" data-testid="tab-archived-proposals">
                <Archive className="w-4 h-4" />
                Archived
                {archiveCounts.archived > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                    {archiveCounts.archived}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
            {!isProjectContext && (
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
            )}
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
      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 min-w-[800px]">
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
          <div className="flex flex-col gap-4">
            {filteredProposals.map((proposal) => {
              const project = projects.find(p => p.id === proposal.projectId);
              const statusColor = getStatusColor(proposal.status);
              const statusOption = proposalStatuses.find(s => s.key === proposal.status);
              
              return (
                <Card 
                  key={proposal.id}
                  className="hover-elevate cursor-pointer transition-all"
                  onClick={() => {
                    if (isProjectContext) {
                      setLocation(`/projects/${params.projectId}/proposals/${proposal.id}`);
                    } else {
                      setLocation(`/proposals/${proposal.id}`);
                    }
                  }}
                  data-testid={`card-proposal-${proposal.id}`}
                >
                  <div className="flex items-center gap-6 p-6">
                    {/* Left: Title and Project */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {project && (
                        <ProjectIcon 
                          icon={project.icon} 
                          color={project.color} 
                          className="w-6 h-6 shrink-0" 
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base" data-testid={`text-proposal-title-${proposal.id}`}>
                          {proposal.name}
                        </h3>
                        {project && (
                          <p className="text-sm text-muted-foreground">
                            {project.name}
                          </p>
                        )}
                        {proposal.notes && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {proposal.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Middle: Additional Info */}
                    <div className="flex items-center gap-6 text-sm shrink-0">
                      {proposal.expiryDate && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            Valid until {format(new Date(proposal.expiryDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}

                      {proposal.sentDate && !proposal.acceptedDate && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Send className="w-4 h-4" />
                          <span className="text-sm">
                            Sent {format(new Date(proposal.sentDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}

                      {proposal.acceptedDate && (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            Accepted {format(new Date(proposal.acceptedDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status Column */}
                    <div className="shrink-0 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <div className="cursor-pointer">
                            <Badge 
                              variant={getStatusBadgeVariant(proposal.status)}
                              className="gap-1.5 px-3 py-1.5 w-full justify-center hover-elevate"
                              style={statusColor ? {
                                backgroundColor: `${statusColor}15`,
                                color: statusColor,
                                borderColor: `${statusColor}30`
                              } : undefined}
                              data-testid={`badge-proposal-status-${proposal.id}`}
                            >
                              {getStatusIcon(proposal.status)}
                              <span className="font-medium">{statusOption?.name || proposal.status}</span>
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </Badge>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-48">
                          {proposalStatuses.map((status) => {
                            const statusColor = status.color;
                            return (
                              <DropdownMenuItem
                                key={status.key}
                                onClick={() => updateStatusMutation.mutate({ 
                                  proposalId: proposal.id, 
                                  status: status.key 
                                })}
                                className="gap-2"
                                data-testid={`menu-item-status-${status.key}`}
                              >
                                {getStatusIcon(status.key)}
                                <span className="flex-1">{status.name}</span>
                                {proposal.status === status.key && (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => toggleArchiveMutation.mutate({ 
                              proposalId: proposal.id, 
                              isArchived: !proposal.isArchived 
                            })}
                            className="gap-2"
                            data-testid={`menu-item-archive-${proposal.id}`}
                          >
                            {proposal.isArchived ? (
                              <>
                                <ArchiveRestore className="w-4 h-4" />
                                <span>Restore</span>
                              </>
                            ) : (
                              <>
                                <Archive className="w-4 h-4" />
                                <span>Archive</span>
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Price Column */}
                    <div className="shrink-0 min-w-[140px] text-right">
                      <div className="text-lg font-semibold" data-testid={`text-proposal-amount-${proposal.id}`}>
                        {formatCurrency(proposal.totalAmount)}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
