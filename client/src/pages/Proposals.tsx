import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  FileText,
  Search,
  Send,
  CheckCircle,
  XCircle,
  FileCheck,
  Archive,
  ArchiveRestore,
  Columns3,
  Eye,
  ChevronRight,
  Filter,
  MoreHorizontal,
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
  DropdownMenuLabel,
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
import { formatCents } from "@shared/money";

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

  /**
   * Revisions of one proposal are one thing, not several.
   *
   * Every revision carries parentProposalId pointing at the original, so a
   * family is keyed by `parentProposalId ?? id`. The row you see is the family's
   * CURRENT revision — the highest version that hasn't been superseded — and the
   * older ones collapse underneath it. Listing them flat showed the same job
   * three times, identical but for a version chip, and buried the live one
   * among its own history.
   */
  const familyKey = (p: Proposal) => p.parentProposalId ?? p.id;

  const families = useMemo(() => {
    const byFamily = new Map<string, Proposal[]>();
    for (const p of proposals) {
      const key = familyKey(p);
      const list = byFamily.get(key);
      if (list) list.push(p);
      else byFamily.set(key, [p]);
    }

    return Array.from(byFamily.values()).map((members) => {
      const newestFirst = [...members].sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
      // The live one leads. Every revision superseded means the family is
      // finished with; show its newest rather than nothing.
      const current = newestFirst.find((p) => p.status !== "superseded") ?? newestFirst[0];
      return {
        current,
        history: newestFirst.filter((p) => p.id !== current.id),
        members,
      };
    });
  }, [proposals]);

  /** Does this family belong on the given tab? Judged on its current revision. */
  const onTab = (current: Proposal, tab: typeof activeTab) => {
    if (tab === "archived") return current.isArchived;
    const decided = current.status === "accepted" || current.status === "rejected";
    return tab === "completed" ? !current.isArchived && decided : !current.isArchived && !decided;
  };

  const filteredFamilies = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let matched = families.filter(({ current, members }) => {
      const matchesTab = isProjectContext || onTab(current, activeTab);
      // Search spans the whole family: an old revision's name or notes should
      // still surface the job, rather than appearing to have vanished.
      const matchesSearch = !term || members.some((m) =>
        (m.name || "").toLowerCase().includes(term) ||
        (m.notes || "").toLowerCase().includes(term) ||
        (m.proposalNumber || "").toLowerCase().includes(term),
      );
      const matchesProject = selectedProject === "All" || current.projectId === selectedProject;
      // A status filter looks inside the family too, so filtering by "accepted"
      // still finds a job whose accepted revision has since been revised.
      const matchesStatus = selectedStatus === "All" || members.some((m) => m.status === selectedStatus);
      return matchesTab && matchesSearch && matchesProject && matchesStatus;
    });

    if (isProjectContext) {
      if (sortBy === "alphabetical") {
        matched = [...matched].sort((a, b) => (a.current.name || "").localeCompare(b.current.name || ""));
      } else {
        const statusOrder = { draft: 0, sent: 1, accepted: 2, rejected: 3 };
        matched = [...matched].sort((a, b) => {
          const sa = statusOrder[a.current.status as keyof typeof statusOrder] ?? 999;
          const sb = statusOrder[b.current.status as keyof typeof statusOrder] ?? 999;
          return sa - sb;
        });
      }
    }

    return matched;
  }, [families, searchTerm, selectedProject, selectedStatus, activeTab, isProjectContext, sortBy]);

  // Only filters that are actually narrowing anything count towards the badge.
  const activeFilterCount =
    (!isProjectContext && selectedProject !== "All" ? 1 : 0) +
    (selectedStatus !== "All" ? 1 : 0);

  /** Rows handed to the table: one per family, history hanging off it. */
  const filteredProposals = useMemo(
    () => filteredFamilies.map((f) => f.current),
    [filteredFamilies],
  );

  const historyByProposalId = useMemo(() => {
    const map = new Map<string, Proposal[]>();
    for (const f of filteredFamilies) map.set(f.current.id, f.history);
    return map;
  }, [filteredFamilies]);


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

  // proposals.totalAmount is CENTS. This used to hand the raw column to a
  // dollars formatter, which was invisible only because the column was always
  // 0 — now that send computes real totals it would overstate every figure by
  // 100x. formatCents is the canonical AUD formatter and takes cents.
  const formatCurrency = (cents: number) => formatCents(Number(cents ?? 0));

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

    const hasRevisions = filteredProposals.some(
      (p) => (p.version ?? 1) > 1 || (historyByProposalId.get(p.id)?.length ?? 0) > 0,
    );
    if (hasRevisions) {
      cols.push({
        id: "version",
        header: "Rev",
        accessorFn: (p) => p.version ?? 1,
        cell: ({ row }) => {
          const v = row.original.version ?? 1;
          return (
            <Badge variant="outline" className="text-xs" data-testid={`badge-version-${row.original.id}`}>
              {revisionLabel(v)}
            </Badge>
          );
        },
        size: 72,
        meta: { defaultWidth: 72, headerLabel: "Revision" } satisfies DataTableColumnMeta,
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
        size: 132,
        meta: { defaultWidth: 132, headerLabel: "Valid Until" } satisfies DataTableColumnMeta,
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
        // Presentational. The chevron used to open a status picker, which was
        // how you could mark a proposal accepted with no acceptance record;
        // the server refuses that now, so an affordance here would only
        // promise something it cannot do. Archive moved to the actions column.
        cell: ({ row }) => {
          const proposal = row.original;
          const statusColor = getStatusColor(proposal.status);
          const statusOption = proposalStatuses.find((s) => s.key === proposal.status);
          return (
            <Badge
              variant={getStatusBadgeVariant(proposal.status)}
              className="gap-1 px-2 py-0.5"
              style={statusColor ? {
                backgroundColor: `${statusColor}15`,
                color: statusColor,
                borderColor: `${statusColor}30`,
              } : undefined}
              data-testid={`badge-proposal-status-${proposal.id}`}
            >
              {getStatusIcon(proposal.status)}
              <span className="font-medium">{statusOption?.name || proposal.status}</span>
            </Badge>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Status" } satisfies DataTableColumnMeta,
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
      {
        // Row actions, pinned right — the shared table auto-detects id "actions"
        // and keeps it flush against the columns on horizontal overflow.
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const proposal = row.original;
          return (
            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 text-xs border border-border/50 text-muted-foreground rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                    aria-label="Proposal actions"
                    data-testid={`button-row-actions-${proposal.id}`}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => handleRowClick(proposal.id)}
                    className="gap-2"
                    data-testid={`menu-item-open-${proposal.id}`}
                  >
                    <FileText className="w-4 h-4" />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => toggleArchiveMutation.mutate({
                      proposalId: proposal.id,
                      isArchived: !proposal.isArchived,
                    })}
                    className="gap-2"
                    data-testid={`menu-item-archive-${proposal.id}`}
                  >
                    {proposal.isArchived ? (
                      <><ArchiveRestore className="w-4 h-4" />Restore</>
                    ) : (
                      <><Archive className="w-4 h-4" />Archive</>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        size: 56,
        meta: { defaultWidth: 56, align: "right", pinned: true, headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    );

    return cols;
  }, [projects, proposalStatuses, isProjectContext, toggleArchiveMutation, filteredProposals, historyByProposalId]);

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
          <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: "hsl(var(--primary))" }} aria-hidden="true" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Proposals</span>
        </div>
      )}
      {/* Header panel — one condensed row, matching Tasks/Timesheets. The
          breadcrumb above already names the page, so there is no 24px title
          and no subtitle; the three stacked rows this replaces (title, tabs,
          filter row) cost ~120px before any data appeared. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-3">
          {/* Search — always visible, Timesheets width */}
          <div className="relative w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-proposals"
            />
          </div>

          {/* Project + status roll up behind one icon. As always-visible
              Selects they sat there reading "All Projects" / "All Statuses",
              taking prime space to say that nothing was filtered. */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`relative h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center ${
                      activeFilterCount > 0 ? "bg-primary/10 text-primary border-primary/40" : "border-border/50 text-muted-foreground"
                    }`}
                    data-testid="button-filters"
                    aria-label="Filters"
                  >
                    <Filter className="w-3 h-3" />
                    {activeFilterCount > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                        data-testid="badge-filters-count"
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-72 p-3" align="start">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setSelectedProject(params.projectId ?? "All"); setSelectedStatus("All"); }}
                      className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
                      data-testid="button-filters-clear"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!isProjectContext && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Project</span>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger className="h-7 text-xs" data-testid="select-project-filter">
                        <SelectValue placeholder="All Projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Projects</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-status-filter">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Statuses</SelectItem>
                      {proposalStatuses.map((status) => (
                        <SelectItem key={status.key} value={status.key}>{status.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isProjectContext && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Sort</span>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as "status" | "alphabetical")}>
                      <SelectTrigger className="h-7 text-xs" data-testid="select-sort-proposals">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">Sort by Status</SelectItem>
                        <SelectItem value="alphabetical">Sort Alphabetically</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Active / Completed / Archived as segmented chips, in the bar */}
          {!isProjectContext && (
            <div className="flex items-center gap-0.5" data-testid="tabs-proposals">
              {([
                { key: "active", label: "Active" },
                { key: "completed", label: "Completed" },
                { key: "archived", label: "Archived" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 ${
                    activeTab === t.key
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "border-border/50 text-muted-foreground"
                  }`}
                  data-testid={`tab-${t.key}-proposals`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          {/* Columns lives in the overflow, as on Timesheets */}
          <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-6 text-xs border border-border/50 text-muted-foreground rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                    data-testid="button-column-picker"
                    aria-label="Columns"
                  >
                    <Columns3 className="w-3 h-3" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Columns</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="p-0">
              <DataTableColumnPicker storageKey="proposals-v2" columns={pickerColumns} />
            </PopoverContent>
          </Popover>

          {/* Primary CTA is a raw button with the token classes — a shadcn
              <Button> here is visibly chunkier than everything around it. */}
          <button
            onClick={handleNewProposal}
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            data-testid="button-new-proposal"
          >
            <Plus className="w-3 h-3" />
            New Proposal
          </button>
        </div>
      </div>

      {/* Body closes the card */}
      <div className="flex-1 overflow-hidden border-x border-b border-border rounded-b-lg bg-card">
        {filteredProposals.length === 0 ? (
          <EmptyState
            variant="card"
            icon={FileText}
            title="No proposals found"
            description={searchTerm || selectedProject !== "All" || selectedStatus !== "All"
              ? "Try adjusting your filters"
              : "Create your first proposal to get started"}
            action={!searchTerm && selectedProject === "All" && selectedStatus === "All" ? {
              label: "Create Proposal",
              onClick: handleNewProposal,
              icon: Plus,
            } : undefined}
            className="m-2"
          />
        ) : (
          <DataTable
            data={filteredProposals}
            columns={proposalColumns}
            // Bumped from "proposals" with the 2026-09 restyle. Saved widths,
            // order and visibility are per user in localStorage and survive a
            // redesign, so without a new key every existing user would keep the
            // old layout and never see these defaults. Costs them their column
            // customisations once, deliberately.
            //
            // legacyConfigKey is deliberately NOT carried over: it only fires
            // when the new keys are empty, which is exactly the state this bump
            // creates, so it would re-import the pre-DataTable layout and undo
            // the reset for anyone still holding that key.
            storageKey="proposals-v2"
            rowKey={(p) => p.id}
            onRowClick={(p) => handleRowClick(p.id)}
            // Earlier revisions collapse under their current one. The table
            // hides the chevron by itself on families with no history.
            getSubRows={(p) => historyByProposalId.get(p.id) ?? undefined}
            rowClassName={(p) =>
              historyByProposalId.has(p.id) ? "" : "text-muted-foreground"
            }
          />
        )}
      </div>
    </div>
  );
}
