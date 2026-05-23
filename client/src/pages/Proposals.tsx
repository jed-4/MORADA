import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  FileText,
  Search,
  Send,
  CheckCircle,
  XCircle,
  FileCheck,
  ChevronDown,
  Archive,
  ArchiveRestore,
  Columns3,
  Eye,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { type Proposal, type Project, type FieldCategoryWithOptions } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { revisionLabel, formatViewedTooltip } from "@/components/proposals/proposalDisplay";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Proposals({ embedded }: { embedded?: boolean } = {}) {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const pageTitle = usePageTitle({ pageName: "Proposals" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [activeTab, setActiveTab] = useState<"active" | "completed" | "archived">("active");
  const [sortBy, setSortBy] = useState<"status" | "alphabetical">("status");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { toast } = useToast();

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

  const { data: proposals = [], isLoading: proposalsLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: proposalStatusesData } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/proposal.status"],
  });

  const proposalStatuses = useMemo(() => {
    return proposalStatusesData?.options || [];
  }, [proposalStatusesData]);

  const filteredProposals = useMemo(() => {
    let filtered = proposals.filter(proposal => {
      let matchesTab = true;
      if (!isProjectContext) {
        if (activeTab === "archived") {
          matchesTab = proposal.isArchived;
        } else if (activeTab === "completed") {
          matchesTab = !proposal.isArchived && (proposal.status === "accepted" || proposal.status === "rejected");
        } else {
          matchesTab = !proposal.isArchived && proposal.status !== "accepted" && proposal.status !== "rejected";
        }
      }

      const matchesSearch = proposal.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (proposal.notes || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProject = selectedProject === "All" || proposal.projectId === selectedProject;
      const matchesStatus = selectedStatus === "All" || proposal.status === selectedStatus;
      return matchesTab && matchesSearch && matchesProject && matchesStatus;
    });

    if (isProjectContext) {
      if (sortBy === "alphabetical") {
        filtered = [...filtered].sort((a, b) =>
          (a.name || "").localeCompare(b.name || "")
        );
      } else {
        const statusOrder = { draft: 0, sent: 1, accepted: 2, rejected: 3 };
        filtered = [...filtered].sort((a, b) => {
          const statusA = statusOrder[a.status as keyof typeof statusOrder] ?? 999;
          const statusB = statusOrder[b.status as keyof typeof statusOrder] ?? 999;
          return statusA - statusB;
        });
      }
    }

    return filtered;
  }, [proposals, searchTerm, selectedProject, selectedStatus, activeTab, isProjectContext, sortBy]);

  const tabCounts = useMemo(() => {
    const active = proposals.filter(p => !p.isArchived && p.status !== "accepted" && p.status !== "rejected").length;
    const completed = proposals.filter(p => !p.isArchived && (p.status === "accepted" || p.status === "rejected")).length;
    const archived = proposals.filter(p => p.isArchived).length;
    return { active, completed, archived };
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

  const handleRowClick = (proposalId: string) => {
    if (isProjectContext) {
      setLocation(`/projects/${params.projectId}/proposals/${proposalId}`);
    } else {
      setLocation(`/proposals/${proposalId}`);
    }
  };

  const proposalColumns = useMemo<ColumnDef<Proposal, unknown>[]>(() => {
    const cols: ColumnDef<Proposal, unknown>[] = [
      {
        id: "proposalNumber",
        header: "Proposal #",
        accessorFn: (p) => p.proposalNumber || "",
        cell: ({ row }) => (
          <span className="text-xs font-mono text-muted-foreground" data-testid={`text-proposal-number-${row.original.id}`}>
            {row.original.proposalNumber || "—"}
          </span>
        ),
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Proposal #" } satisfies DataTableColumnMeta,
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (p) => p.name || "",
        cell: ({ row }) => {
          const proposal = row.original;
          const project = projects.find(p => p.id === proposal.projectId);
          return (
            <div className="flex items-center gap-2 min-w-0">
              {project && (
                <ProjectIcon
                  icon={project.icon}
                  color={project.color}
                  className="w-4 h-4 shrink-0"
                />
              )}
              <span className="text-xs font-medium truncate" data-testid={`text-proposal-title-${proposal.id}`}>
                {proposal.name}
              </span>
            </div>
          );
        },
        size: 240,
        meta: { defaultWidth: 240, headerLabel: "Name" } satisfies DataTableColumnMeta,
      },
    ];

    if (!isProjectContext) {
      cols.push({
        id: "project",
        header: "Project",
        accessorFn: (p) => projects.find(pr => pr.id === p.projectId)?.name || "",
        cell: ({ row }) => {
          const project = projects.find(p => p.id === row.original.projectId);
          if (!project) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="text-xs text-muted-foreground truncate">{project.name}</span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Project" } satisfies DataTableColumnMeta,
      });
    }

    const hasRevisions = filteredProposals.some((p) => (p.version ?? 1) > 1);
    if (hasRevisions) {
      cols.push({
        id: "version",
        header: "Version",
        accessorFn: (p) => p.version ?? 1,
        cell: ({ row }) => {
          const v = row.original.version ?? 1;
          return (
            <Badge variant="outline" className="text-xs" data-testid={`badge-version-${row.original.id}`}>
              {revisionLabel(v)}
            </Badge>
          );
        },
        size: 90,
        meta: { defaultWidth: 90, headerLabel: "Version" } satisfies DataTableColumnMeta,
      });
    }

    cols.push(
      {
        id: "notes",
        header: "Notes",
        accessorFn: (p) => p.notes || "",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate">
            {row.original.notes || "—"}
          </span>
        ),
        size: 200,
        meta: { defaultWidth: 200, headerLabel: "Notes", defaultHidden: true } satisfies DataTableColumnMeta,
      },
      {
        id: "expiryDate",
        header: "Valid Until",
        accessorFn: (p) => (p.expiryDate ? new Date(p.expiryDate).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.expiryDate ? format(new Date(row.original.expiryDate), 'MMM d, yyyy') : "—"}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Valid Until" } satisfies DataTableColumnMeta,
      },
      {
        id: "sentDate",
        header: "Sent",
        accessorFn: (p) => (p.sentDate ? new Date(p.sentDate).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.sentDate ? format(new Date(row.original.sentDate), 'MMM d, yyyy') : "—"}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Sent" } satisfies DataTableColumnMeta,
      },
      {
        id: "acceptedDate",
        header: "Accepted",
        accessorFn: (p) => (p.acceptedDate ? new Date(p.acceptedDate).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.acceptedDate ? format(new Date(row.original.acceptedDate), 'MMM d, yyyy') : "—"}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Accepted", defaultHidden: true } satisfies DataTableColumnMeta,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (p) => p.status,
        enableSorting: false,
        cell: ({ row }) => {
          const proposal = row.original;
          const statusColor = getStatusColor(proposal.status);
          const statusOption = proposalStatuses.find(s => s.key === proposal.status);
          return (
            <span onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex"
                    data-testid={`badge-proposal-status-${proposal.id}`}
                  >
                    <Badge
                      variant={getStatusBadgeVariant(proposal.status)}
                      className="gap-1 px-2 py-0.5 hover-elevate cursor-pointer"
                      style={statusColor ? {
                        backgroundColor: `${statusColor}15`,
                        color: statusColor,
                        borderColor: `${statusColor}30`
                      } : undefined}
                    >
                      {getStatusIcon(proposal.status)}
                      <span className="font-medium">{statusOption?.name || proposal.status}</span>
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {proposalStatuses.map((status) => (
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
                  ))}
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
            </span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Status" } satisfies DataTableColumnMeta,
      },
      {
        id: "viewCount",
        header: "Seen",
        accessorFn: (p) => p.viewCount ?? 0,
        enableSorting: false,
        cell: ({ row }) => {
          const proposal = row.original;
          const count = proposal.viewCount ?? 0;
          const lastViewed = proposal.lastViewedAt;
          const device = proposal.viewerDevice;
          const tooltipText = formatViewedTooltip(count, lastViewed, device);
          if (count === 0) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center text-muted-foreground/40"
                    data-testid={`icon-unviewed-${proposal.id}`}
                  >
                    <Eye className="w-4 h-4" strokeWidth={1.25} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{tooltipText}</TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  data-testid={`text-view-count-${proposal.id}`}
                >
                  <Eye className="w-4 h-4 text-foreground fill-current" />
                  <span>{count}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{tooltipText}</TooltipContent>
            </Tooltip>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Seen" } satisfies DataTableColumnMeta,
      },
      {
        id: "totalAmount",
        header: "Total",
        accessorFn: (p) => p.totalAmount,
        cell: ({ row }) => (
          <span className="text-xs font-semibold tabular-nums" data-testid={`text-proposal-amount-${row.original.id}`}>
            {formatCurrency(row.original.totalAmount)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, align: "right", headerLabel: "Total" } satisfies DataTableColumnMeta,
      },
    );

    return cols;
  }, [projects, proposalStatuses, isProjectContext, updateStatusMutation, toggleArchiveMutation, filteredProposals]);

  const pickerColumns = useMemo(() => {
    return proposalColumns.map((c) => {
      const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
      return {
        id: c.id as string,
        label: meta.headerLabel ?? (c.id as string),
        pinned: !!meta.pinned,
      };
    });
  }, [proposalColumns]);

  if (proposalsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading proposals...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {params.projectId ? (projects.find(p => p.id === params.projectId)?.name ?? "All Projects") : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Proposals</span>
        </div>
      )}
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-proposals-heading">{pageTitle}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create and manage project proposals
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-column-picker">
                    <Columns3 className="w-4 h-4" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0">
                  <DataTableColumnPicker storageKey="proposals" columns={pickerColumns} />
                </PopoverContent>
              </Popover>
              <Button
                onClick={handleNewProposal}
                data-testid="button-new-proposal"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New Proposal
              </Button>
            </div>
          </div>

          {!isProjectContext && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "completed" | "archived")} className="mt-6">
              <TabsList className="w-full sm:w-auto" data-testid="tabs-proposals">
                <TabsTrigger value="active" className="gap-2" data-testid="tab-active-proposals">
                  <FileText className="w-4 h-4" />
                  Active
                  {tabCounts.active > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                      {tabCounts.active}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-2" data-testid="tab-completed-proposals">
                  <FileCheck className="w-4 h-4" />
                  Completed
                  {tabCounts.completed > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                      {tabCounts.completed}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="archived" className="gap-2" data-testid="tab-archived-proposals">
                  <Archive className="w-4 h-4" />
                  Archived
                  {tabCounts.archived > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs h-5">
                      {tabCounts.archived}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

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
            {isProjectContext && (
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as "status" | "alphabetical")}>
                <SelectTrigger className="w-full sm:w-48" data-testid="select-sort-proposals">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Sort by Status</SelectItem>
                  <SelectItem value="alphabetical">Sort Alphabetically</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
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
          <DataTable
            data={filteredProposals}
            columns={proposalColumns}
            storageKey="proposals"
            legacyConfigKey="proposals-column-config-v1"
            rowKey={(p) => p.id}
            onRowClick={(p) => handleRowClick(p.id)}
          />
        )}
      </div>
    </div>
  );
}
