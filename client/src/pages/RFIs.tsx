import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  HelpCircle,
  MoreHorizontal,
  MoreVertical,
  Search,
  Send,
  AlertCircle,
  Users,
  Columns3,
  ChevronRight,
} from "lucide-react";
import { type Rfi, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format, isPast } from "date-fns";
import { useRfiStatusOptions } from "@/hooks/useRfiStatusOptions";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export default function RFIs({ embedded }: { embedded?: boolean } = {}) {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { statusOptions, getStatusInfo } = useRfiStatusOptions();

  // Focus the search input when expanded
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Close the search on outside click (only when there is no query text)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node) &&
        !searchQuery
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen, searchQuery]);

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) {
    queryParams.projectId = projectIdFromUrl;
  }

  const { data: rfis = [], isLoading } = useQuery<Rfi[]>({
    queryKey: ["/api/rfis", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const queryString = params.toString();
      const url = queryString ? `/api/rfis?${queryString}` : "/api/rfis";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });


  const getProject = (projectId: string) => {
    return projects.find((p) => p.id === projectId);
  };

  const currentProject = projectIdFromUrl ? getProject(projectIdFromUrl) : null;

  const getNavigationPath = (path: string) => {
    return projectIdFromUrl ? `/projects/${projectIdFromUrl}${path}` : path;
  };

  const filteredRFIs = useMemo(() => {
    return rfis.filter((rfi) => {
      const matchesSearch =
        searchQuery === "" ||
        rfi.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfi.rfiNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfi.directedToName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || rfi.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rfis, searchQuery, statusFilter]);

  // Status tabs — "all" hardcoded + every status returned by useRfiStatusOptions().
  const statusTabs = useMemo(() => {
    const tabs: { key: string; label: string }[] = [{ key: "all", label: "All" }];
    statusOptions.forEach((option) => {
      tabs.push({ key: option.key, label: option.name });
    });
    return tabs;
  }, [statusOptions]);

  // Per-status counts (memoised) — total in "all".
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rfis.length };
    statusTabs.forEach((tab) => {
      if (tab.key === "all") return;
      counts[tab.key] = rfis.filter((r) => r.status === tab.key).length;
    });
    return counts;
  }, [rfis, statusTabs]);

  const handleRowClick = (rfiId: string) => {
    if (projectIdFromUrl) {
      setLocation(`/projects/${projectIdFromUrl}/rfis/${rfiId}`);
    } else {
      setLocation(`/rfis/${rfiId}`);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; label: string }> = {
      low: { color: "bg-muted text-foreground", label: "Low" },
      normal: { color: "bg-status-info-bg text-status-info", label: "Normal" },
      high: { color: "bg-status-warning-bg text-status-warning", label: "High" },
      urgent: { color: "bg-status-danger-bg text-status-danger", label: "Urgent" },
    };
    const { color, label } = config[priority] || config.normal;
    return <Badge className={color}>{label}</Badge>;
  };

  // ── DataTable column defs ───────────────────────────────────────────────
  const rfiColumns = useMemo<ColumnDef<Rfi, unknown>[]>(() => {
    const cols: (ColumnDef<Rfi, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "rfiNumber",
        header: "RFI Number",
        accessorFn: (r) => r.rfiNumber || "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 font-medium" data-testid={`cell-number-${row.original.id}`}>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            {row.original.rfiNumber}
          </div>
        ),
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "RFI Number" },
      },
      {
        id: "subject",
        header: "Subject",
        accessorFn: (r) => r.subject || "",
        cell: ({ row }) => (
          <div data-testid={`cell-subject-${row.original.id}`}>
            <div className="font-medium truncate">{row.original.subject}</div>
            {row.original.question && (
              <div className="text-xs text-muted-foreground line-clamp-1">
                {row.original.question}
              </div>
            )}
          </div>
        ),
        size: 260,
        meta: { defaultWidth: 260, headerLabel: "Subject" },
      },
    ];

    if (!projectIdFromUrl) {
      cols.push({
        id: "project",
        header: "Project",
        accessorFn: (r) => getProject(r.projectId)?.name || "",
        cell: ({ row }) => {
          const project = getProject(row.original.projectId);
          if (!project) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex items-center gap-2" data-testid={`cell-project-${row.original.id}`}>
              <ProjectIcon color={project.color} size="sm" className="shrink-0" />
              <span className="truncate">{project.name}</span>
            </div>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Project" },
      });
    }

    cols.push(
      {
        id: "directedTo",
        header: "Directed To",
        accessorFn: (r) => r.directedToName || "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2" data-testid={`cell-directed-${row.original.id}`}>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{row.original.directedToName || "-"}</span>
          </div>
        ),
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Directed To" },
      },
      {
        id: "dueDate",
        header: "Due Date",
        accessorFn: (r) => (r.dueDate ? new Date(r.dueDate).getTime() : 0),
        cell: ({ row }) => {
          const rfi = row.original;
          const isOverdue =
            rfi.dueDate &&
            isPast(new Date(rfi.dueDate)) &&
            rfi.status !== "closed" &&
            rfi.status !== "answered";
          if (!rfi.dueDate) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          return (
            <div
              className={`flex items-center gap-1 text-xs ${isOverdue ? "text-destructive" : ""}`}
              data-testid={`cell-due-${rfi.id}`}
            >
              {isOverdue && <AlertCircle className="h-3.5 w-3.5" />}
              {format(new Date(rfi.dueDate), "MMM d, yyyy")}
            </div>
          );
        },
        size: 130,
        meta: { defaultWidth: 130, headerLabel: "Due Date" },
      },
      {
        id: "priority",
        header: "Priority",
        accessorFn: (r) => r.priority || "normal",
        cell: ({ row }) => (
          <span data-testid={`cell-priority-${row.original.id}`}>
            {getPriorityBadge(row.original.priority || "normal")}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Priority" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status || "",
        cell: ({ row }) => {
          const statusInfo = getStatusInfo(row.original.status);
          return (
            <Badge
              style={{ backgroundColor: statusInfo.color, color: "#fff" }}
              data-testid={`cell-status-${row.original.id}`}
            >
              {statusInfo.name}
            </Badge>
          );
        },
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Status" },
      },
      {
        id: "createdAt",
        header: "Created",
        accessorFn: (r) => (r.createdAt ? new Date(r.createdAt).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-created-${row.original.id}`}>
            {format(new Date(row.original.createdAt), "MMM d, yyyy")}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Created" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                data-testid={`button-rfi-actions-${row.original.id}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleRowClick(row.original.id);
                }}
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {row.original.status === "draft" && (
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                  <Send className="mr-2 h-4 w-4" />
                  Send RFI
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 60,
        meta: { defaultWidth: 60, align: "center", pinned: true, headerLabel: "Actions" },
      },
    );

    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdFromUrl, projects, getStatusInfo]);

  const pickerColumns = useMemo(() => {
    const list: { id: string; label: string; pinned?: boolean }[] = [
      { id: "rfiNumber", label: "RFI Number" },
      { id: "subject", label: "Subject" },
    ];
    if (!projectIdFromUrl) list.push({ id: "project", label: "Project" });
    list.push(
      { id: "directedTo", label: "Directed To" },
      { id: "dueDate", label: "Due Date" },
      { id: "priority", label: "Priority" },
      { id: "status", label: "Status" },
      { id: "createdAt", label: "Created" },
      { id: "actions", label: "Actions", pinned: true },
    );
    return list;
  }, [projectIdFromUrl]);

  return (
    <div className="flex flex-col h-full" data-testid="page-rfis">
      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {projectIdFromUrl && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">RFIs</span>
        </div>
      )}
      {/* Toolbar — flush h-9 row with bottom divider */}
      <div className="h-9 flex items-center px-3 gap-2 border-b border-border flex-shrink-0">
          {/* Status tabs — left, scrollable when narrow */}
          <div className="flex items-center min-w-0 flex-1 overflow-x-auto">
            {statusTabs.map((status) => {
              const isActive = statusFilter === status.key;
              const count = statusCounts[status.key] ?? 0;
              return (
                <button
                  key={status.key}
                  type="button"
                  onClick={() => setStatusFilter(status.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
                    isActive
                      ? "text-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  )}
                  data-testid={`tab-status-${status.key}`}
                >
                  {status.label}
                  {status.key !== "all" && count > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-sm text-data font-semibold",
                        isActive
                          ? "bg-primary/20 text-[#8b6bb1]"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right side: Create RFI, Search, Columns, Options */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => setLocation(getNavigationPath("/rfis/new"))}
              data-testid="button-create-rfi"
            >
              <Plus className="w-3 h-3" />
              <span>Create RFI</span>
            </button>

            {/* Icon-expand search (input expands leftward) */}
            <div ref={searchContainerRef} className="flex items-center flex-shrink-0">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search RFIs..."
                aria-hidden={!searchOpen}
                tabIndex={searchOpen ? 0 : -1}
                className={cn(
                  "h-6 text-xs transition-all duration-200 ease-in-out",
                  searchOpen
                    ? "w-48 mr-1 px-2 opacity-100 border"
                    : "w-0 mr-0 px-0 opacity-0 border-0 pointer-events-none"
                )}
                data-testid="input-search-rfis"
              />
              <button
                type="button"
                onClick={() => setSearchOpen((o) => !o)}
                className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                data-testid="button-search-toggle"
                aria-label="Search RFIs"
              >
                <Search className="h-3 w-3" />
              </button>
            </div>

            <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-column-picker"
                  aria-label="Columns"
                >
                  <Columns3 className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-auto">
                <DataTableColumnPicker storageKey="rfis" columns={pickerColumns} />
              </PopoverContent>
            </Popover>

            <DropdownMenu open={optionsOpen} onOpenChange={setOptionsOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-rfis-options"
                  aria-label="Options"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  No options
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <Card className="m-2 p-8 text-center text-muted-foreground">
            Loading RFIs...
          </Card>
        ) : filteredRFIs.length === 0 ? (
          searchQuery || statusFilter !== "all" ? (
            <EmptyState variant="card" title="No RFIs match your search" className="m-2" />
          ) : (
            <EmptyState
              variant="inline"
              icon={HelpCircle}
              title="No Requests for Information yet"
              description="Create RFIs to request clarification from architects, engineers, clients, or other stakeholders on your projects."
              action={{
                label: "Create New RFI",
                onClick: () => setLocation(getNavigationPath("/rfis/new")),
                icon: Plus,
                "data-testid": "button-create-rfi-empty",
              }}
              className="py-16"
            />
          )
        ) : (
          <DataTable
            data={filteredRFIs}
            columns={rfiColumns}
            storageKey="rfis"
            legacyConfigKey="rfis-column-config-v1"
            rowKey={(r) => r.id}
            onRowClick={(r) => handleRowClick(r.id)}
          />
        )}
      </div>

    </div>
  );
}
