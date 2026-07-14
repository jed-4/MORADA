import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, LayoutGrid, List, Eye, Layers, Edit3, Columns3, EyeOff, BookOpen, User } from "lucide-react";
import { type Project, type FieldOption } from "@shared/schema";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProjectBoard, type ViewPreferences } from "@/components/ProjectBoard";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
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

// Reads parent project-status options and lists each stage with its long-form
// description in a Sheet. Read-only — descriptions are edited inline from each
// column's Info popover on the board.
function StageGuideButton() {
  const [open, setOpen] = useState(false);
  const { data: stages = [], isLoading } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-categories/by-key/project.status/options-flat"],
    queryFn: async () => {
      const catRes = await fetch("/api/field-categories/by-key/project.status");
      if (!catRes.ok) return [];
      const cat = await catRes.json();
      const optsRes = await fetch(`/api/field-categories/${cat.id}/options`);
      if (!optsRes.ok) return [];
      const opts: FieldOption[] = await optsRes.json();
      return opts
        .filter((o) => !o.parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    },
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="h-6 px-2 text-xs border rounded-md bg-background hover:bg-muted active-elevate-2 flex items-center gap-1 text-foreground"
          data-testid="button-stage-guide"
        >
          <BookOpen className="w-3 h-3" />
          <span>Stage Guide</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Project Stage Guide</SheetTitle>
          <SheetDescription>
            What each stage means and what happens when a project lands there.
            Edit any stage's description from the Info icon on its board column.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
          {!isLoading && stages.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No project stages have been configured yet.
            </div>
          )}
          {stages.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-border/60 p-3 space-y-1.5"
              data-testid={`stage-guide-item-${s.id}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color || "#6b7280" }}
                />
                <h4 className="text-sm font-semibold text-foreground">
                  {s.name}
                </h4>
              </div>
              {(s as any).description && String((s as any).description).trim() ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {(s as any).description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No description added yet.
                </p>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
      id: "client",
      header: "Client",
      accessorFn: (p) => (p as Project & { clientName?: string | null }).clientName || "",
      cell: ({ row }) => {
        const clientName = (row.original as Project & { clientName?: string | null }).clientName;
        return clientName ? (
          <span className="flex items-center gap-1.5 min-w-0" data-testid={`cell-client-${row.original.id}`}>
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{clientName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground" data-testid={`cell-client-${row.original.id}`}>—</span>
        );
      },
      size: 180,
      meta: { defaultWidth: 180, headerLabel: "Client" } satisfies DataTableColumnMeta,
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
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status || "active"}
          data-testid={`badge-status-${row.original.id}`}
        />
      ),
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
                ? 'bg-primary text-white border-primary/20 hover:bg-primary/90' 
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
                ? 'bg-primary text-white border-primary/20 hover:bg-primary/90' 
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
                className={`h-6 w-6 ${preferences.groupBy === 'status' ? 'bg-primary/10 text-primary' : ''}`}
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
                className={`h-6 w-6 ${preferences.hideEmptyColumns ? 'bg-primary/10 text-primary' : ''}`}
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
                className={`h-6 w-6 ${editMode ? 'bg-primary/10 text-primary' : ''}`}
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

          {/* Stage Guide — full list of all stages with descriptions */}
          {activeTab === "board" && <StageGuideButton />}

          {/* New Project Button */}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
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
