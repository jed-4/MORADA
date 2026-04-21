import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, LayoutGrid, List, Eye, Layers, Edit3, Columns3, EyeOff } from "lucide-react";
import { type Project } from "@shared/schema";
import { ProjectBoard, type ViewPreferences } from "@/components/ProjectBoard";
import { ProjectIcon } from "@/components/ProjectIcon";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import CreateProjectDialog from "@/components/CreateProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DEFAULT_PREFERENCES: ViewPreferences = {
  groupBy: "phase",
  columnWidth: "medium",
  visibleFields: {
    client: true,
    budget: true,
    phase: true,
    dueDate: true,
    progress: true,
    foreman: true,
  },
  hideEmptyColumns: false,
};

const STATUS_CONFIG = {
  active: { label: "Active", variant: "default" as const, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  on_hold: { label: "On Hold", variant: "secondary" as const, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  completed: { label: "Completed", variant: "outline" as const, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
};

export default function BusinessProjects() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("board");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [cardFieldsDialogOpen, setCardFieldsDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  // Manage preferences state at parent level
  const [preferences, setPreferences] = useState<ViewPreferences>(DEFAULT_PREFERENCES);

  // Load view preferences from database
  const { data: userPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "business_projects"],
    queryFn: async () => {
      const response = await fetch("/api/user-view-preferences/business_projects", {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error("Failed to fetch view preferences");
      }
      return response.json();
    },
  });

  // Apply loaded preferences
  useEffect(() => {
    if (userPreferences?.preferences) {
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...userPreferences.preferences,
        visibleFields: {
          ...DEFAULT_PREFERENCES.visibleFields,
          ...(userPreferences.preferences.visibleFields || {}),
        },
      });
      if (userPreferences.preferences.activeTab) {
        setActiveTab(userPreferences.preferences.activeTab);
      }
      setPreferencesLoaded(true);
    } else if (userPreferences === null || preferencesError) {
      setPreferencesLoaded(true);
    }
  }, [userPreferences, preferencesError]);

  // Save view preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: ViewPreferences & { activeTab: string }) => {
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "business_projects",
        preferences: prefs,
      });
    },
  });

  // Auto-save preferences when they change (after initial load)
  useEffect(() => {
    if (preferencesLoaded) {
      const timer = setTimeout(() => {
        savePreferencesMutation.mutate({ ...preferences, activeTab });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [preferences, activeTab, preferencesLoaded]);

  // Handle preferences update from child or local changes - supports functional updates
  const handlePreferencesChange = (newPreferences: ViewPreferences | ((prev: ViewPreferences) => ViewPreferences)) => {
    setPreferences(prev => {
      const updated = typeof newPreferences === 'function' ? newPreferences(prev) : newPreferences;
      return updated;
    });
  };

  // Update single preference and persist
  const updatePreference = <K extends keyof ViewPreferences>(
    key: K,
    value: ViewPreferences[K]
  ) => {
    handlePreferencesChange({ ...preferences, [key]: value });
  };

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects and business projects
  const activeProjects = projects.filter(p => !p.isArchived && !p.isBusiness);

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "$0";
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const projectColumns = useMemo<ColumnDef<Project, unknown>[]>(() => [
    {
      id: "project",
      header: "Project",
      accessorFn: (p) => p.name || "",
      cell: ({ row }) => {
        const project = row.original;
        return (
          <div className="flex items-center gap-3" data-testid={`cell-project-${project.id}`}>
            <ProjectIcon
              icon={project.icon}
              color={project.color}
              className="w-6 h-6 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{project.name}</p>
              {project.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {project.description}
                </p>
              )}
            </div>
          </div>
        );
      },
      size: 300,
      meta: { defaultWidth: 300, headerLabel: "Project" } satisfies DataTableColumnMeta,
    },
    {
      id: "location",
      header: "Location",
      accessorFn: (p) => p.location || "",
      cell: ({ row }) => (
        <span className="text-muted-foreground" data-testid={`cell-location-${row.original.id}`}>
          {row.original.location || "—"}
        </span>
      ),
      size: 180,
      meta: { defaultWidth: 180, headerLabel: "Location" } satisfies DataTableColumnMeta,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (p) => p.status || "active",
      cell: ({ row }) => {
        const projectStatus = (row.original.status || "active") as keyof typeof STATUS_CONFIG;
        const statusConfig = STATUS_CONFIG[projectStatus] || STATUS_CONFIG.active;
        return (
          <Badge
            variant={statusConfig.variant}
            className={statusConfig.color}
            data-testid={`badge-status-${row.original.id}`}
          >
            {statusConfig.label}
          </Badge>
        );
      },
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "Status" } satisfies DataTableColumnMeta,
    },
    {
      id: "startDate",
      header: "Start Date",
      accessorFn: (p) => (p.startDate ? new Date(p.startDate).getTime() : 0),
      cell: ({ row }) => (
        <span className="text-muted-foreground" data-testid={`cell-start-${row.original.id}`}>
          {formatDate(row.original.startDate)}
        </span>
      ),
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "Start Date" } satisfies DataTableColumnMeta,
    },
    {
      id: "endDate",
      header: "End Date",
      accessorFn: (p) => (p.endDate ? new Date(p.endDate).getTime() : 0),
      cell: ({ row }) => (
        <span className="text-muted-foreground" data-testid={`cell-end-${row.original.id}`}>
          {formatDate(row.original.endDate)}
        </span>
      ),
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "End Date" } satisfies DataTableColumnMeta,
    },
    {
      id: "budget",
      header: "Budget",
      accessorFn: (p) => p.budget ?? 0,
      cell: ({ row }) => (
        <span className="font-medium tabular-nums" data-testid={`cell-budget-${row.original.id}`}>
          {formatCurrency(row.original.budget)}
        </span>
      ),
      size: 140,
      meta: { defaultWidth: 140, align: "right", headerLabel: "Budget" } satisfies DataTableColumnMeta,
    },
  ], []);

  const pickerColumns = useMemo(
    () => projectColumns.map((c) => {
      const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
      return {
        id: c.id as string,
        label: meta.headerLabel ?? (c.id as string),
        pinned: !!meta.pinned,
      };
    }),
    [projectColumns],
  );

  return (
    <div className="h-full flex flex-col" data-testid="business-projects">
      {/* Row 2 - Views & Controls (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-project-views">
          <button
            onClick={() => setActiveTab("board")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "board" 
                ? 'bg-[#A890D4] text-white border-[#A890D4]/20 hover:bg-[#A890D4]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-board"
          >
            <LayoutGrid className="w-3 h-3" />
            Board
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "list" 
                ? 'bg-[#A890D4] text-white border-[#A890D4]/20 hover:bg-[#A890D4]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-list"
          >
            <List className="w-3 h-3" />
            List
          </button>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5">
          {activeTab === "board" && (
            <>
              {/* Card Display - Opens Edit Card Fields Popover */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCardFieldsDialogOpen(!cardFieldsDialogOpen)}
                className="h-6 w-6"
                data-testid="button-card-display"
              >
                <Eye className="h-3 w-3" />
              </Button>

              {/* Group By - Toggle Button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => updatePreference('groupBy', preferences.groupBy === 'phase' ? 'status' : 'phase')}
                className={`h-6 w-6 ${preferences.groupBy === 'status' ? 'bg-[#A890D4]/10 text-[#A890D4]' : ''}`}
                data-testid="button-group-by"
                title={preferences.groupBy === 'phase' ? 'Grouped by Phase' : 'Grouped by Status'}
              >
                <Layers className="h-3 w-3" />
              </Button>

              {/* Column Width - Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    data-testid="button-column-width"
                  >
                    <Columns3 className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => updatePreference('columnWidth', 'small')}
                    data-testid="menu-item-column-small"
                  >
                    Small
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => updatePreference('columnWidth', 'medium')}
                    data-testid="menu-item-column-medium"
                  >
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => updatePreference('columnWidth', 'wide')}
                    data-testid="menu-item-column-wide"
                  >
                    Wide
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Hide Empty Columns Toggle */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => updatePreference('hideEmptyColumns', !preferences.hideEmptyColumns)}
                className={`h-6 w-6 ${preferences.hideEmptyColumns ? 'bg-[#A890D4]/10 text-[#A890D4]' : ''}`}
                data-testid="button-hide-empty"
                title={preferences.hideEmptyColumns ? 'Showing only columns with projects' : 'Showing all columns'}
              >
                <EyeOff className="h-3 w-3" />
              </Button>

              {/* Edit Mode Toggle - Highlights when active */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditMode(!editMode)}
                className={`h-6 w-6 ${editMode ? 'bg-[#A890D4]/10 text-[#A890D4]' : ''}`}
                data-testid="button-edit-mode"
                title={editMode ? 'Edit Mode: ON - Drag projects to move' : 'Edit Mode: OFF'}
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            </>
          )}

          {activeTab === "list" && (
            <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  data-testid="button-columns"
                >
                  <Columns3 className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0">
                <DataTableColumnPicker storageKey="business-projects" columns={pickerColumns} />
              </PopoverContent>
            </Popover>
          )}

          {/* New Project Button */}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#A890D4] text-white border-[#A890D4]/20 hover:bg-[#A890D4]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsCreateProjectOpen(true)}
            data-testid="button-create-project"
          >
            <Plus className="w-3 h-3" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Content - Full Height */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "board" && (
          <div className="h-full p-6">
            <ProjectBoard 
              projects={activeProjects} 
              isLoading={isLoading}
              cardFieldsDialogOpen={cardFieldsDialogOpen}
              onCardFieldsDialogChange={setCardFieldsDialogOpen}
              editMode={editMode}
              preferences={preferences}
              onPreferencesChange={handlePreferencesChange}
            />
          </div>
        )}
        {activeTab === "list" && (
          <div className="h-full p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading projects...</p>
              </div>
            ) : (
              <div className="h-full border rounded-lg overflow-hidden">
                <DataTable
                  data={activeProjects}
                  columns={projectColumns}
                  storageKey="business-projects"
                  legacyConfigKey="business-projects-column-config-v1"
                  rowKey={(p) => p.id}
                  onRowClick={(p) => navigate(`/projects/${p.id}`)}
                  emptyState="No projects found"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
      />
    </div>
  );
}
