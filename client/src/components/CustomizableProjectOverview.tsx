import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, ChevronDown, Search, PlusCircle, Check, LayoutGrid, Trash2, Lock, Users, Globe, Eye, Pencil, Star, Palette, Home, MessageSquare, ClipboardList, FileText, Calculator, FileBarChart, File, ListTree, Clock, CheckSquare, ListChecks, FileSearch, HelpCircle, CheckCircle, DollarSign, Receipt, AlertCircle, BookOpen, Timer, FolderOpen, Activity } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Tab content components
import ProjectActivity from "@/pages/ProjectActivity";
import Notes from "@/pages/Notes";
import Messages from "@/pages/Messages";
import ProjectScope from "@/pages/ProjectScope";
import Schedule from "@/pages/Schedule";
import Tasks from "@/pages/Tasks";
import Timesheets from "@/pages/Timesheets";
import ProjectFiles from "@/pages/ProjectFiles";
import Takeoff from "@/pages/Takeoff";
import ProjectEstimates from "@/pages/ProjectEstimates";
import Proposals from "@/pages/Proposals";
import Bills from "@/pages/Bills";
import Budget from "@/pages/Budget";
import Calendar from "@/pages/Calendar";
import Selections from "@/pages/Selections";
import RFQs from "@/pages/RFQs";
import RFIs from "@/pages/RFIs";
import Allowances from "@/pages/Allowances";
import Defects from "@/pages/Defects";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Variations from "@/pages/Variations";
import ClientInvoices from "@/pages/ClientInvoices";
import SiteDiaryEntries from "@/pages/SiteDiaryEntries";
import ProjectTeam from "@/pages/ProjectTeam";
import ProjectChecklists from "@/pages/ProjectChecklists";
import Minutes from "@/pages/Minutes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Widget } from "@/types/widgets";
import { widgetRegistry, getWidgetDefinition } from "./widgets/WidgetRegistry";
import WidgetContainer from "./widgets/WidgetContainer";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import type { FieldCategoryWithOptions, DashboardView, UserRole, DashboardTheme } from "@shared/schema";
import DashboardThemeSettings from "./DashboardThemeSettings";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useToast } from "@/hooks/use-toast";

// High-level tab groups for Project Overview matching sidebar sections
const PROJECT_TAB_GROUPS = [
  { 
    id: "project", 
    label: "Project", 
    icon: Home,
    items: [
      { id: "overview", label: "Overview", icon: Home, path: "" },
      { id: "activity", label: "Activity", icon: Activity, path: "/activity" },
      { id: "messages", label: "Messages", icon: MessageSquare, path: "/messages" },
      { id: "notes", label: "Notes", icon: FileText, path: "/notes" },
      { id: "scope", label: "Scope", icon: ListTree, path: "/scope" },
    ]
  },
  { 
    id: "management", 
    label: "Management", 
    icon: ClipboardList,
    items: [
      { id: "schedule", label: "Schedule", icon: Clock, path: "/schedule" },
      { id: "tasks", label: "Tasks", icon: CheckSquare, path: "/tasks" },
      { id: "timesheets", label: "Timesheets", icon: Timer, path: "/timesheets" },
      { id: "files", label: "Files", icon: FolderOpen, path: "/files" },
    ]
  },
  { 
    id: "finance", 
    label: "Finance", 
    icon: DollarSign,
    items: [
      { id: "takeoff", label: "Take off", icon: Calculator, path: "/takeoff" },
      { id: "estimates", label: "Estimates", icon: FileBarChart, path: "/estimates" },
      { id: "proposals", label: "Proposals", icon: File, path: "/proposals" },
      { id: "bills", label: "Bills", icon: Receipt, path: "/bills" },
      { id: "budget", label: "Budget", icon: DollarSign, path: "/budget" },
    ]
  },
] as const;

// Flat list of all tabs for backward compatibility
const PROJECT_TABS = PROJECT_TAB_GROUPS.flatMap(group => group.items);

// Background options
const backgroundOptions = [
  { id: "default", name: "Default", value: "bg-background", preview: "bg-slate-100 dark:bg-slate-900" },
  { id: "white", name: "White", value: "bg-white dark:bg-slate-950", preview: "bg-white" },
  { id: "slate", name: "Slate", value: "bg-slate-50 dark:bg-slate-900", preview: "bg-slate-100" },
  { id: "zinc", name: "Zinc", value: "bg-zinc-50 dark:bg-zinc-900", preview: "bg-zinc-100" },
  { id: "stone", name: "Stone", value: "bg-stone-50 dark:bg-stone-900", preview: "bg-stone-100" },
  { id: "gradient-blue", name: "Blue Gradient", value: "bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-950", preview: "bg-gradient-to-br from-blue-100 to-indigo-200" },
  { id: "gradient-purple", name: "Purple Gradient", value: "bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-950 dark:to-pink-950", preview: "bg-gradient-to-br from-purple-100 to-pink-200" },
  { id: "gradient-green", name: "Green Gradient", value: "bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950 dark:to-emerald-950", preview: "bg-gradient-to-br from-green-100 to-emerald-200" },
  { id: "gradient-warm", name: "Warm Gradient", value: "bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-950", preview: "bg-gradient-to-br from-orange-100 to-amber-200" },
  { id: "dots", name: "Subtle Dots", value: "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50 dark:bg-slate-900", preview: "bg-slate-200" },
  { id: "grid", name: "Grid", value: "bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] [background-size:24px_24px] bg-white dark:bg-slate-950", preview: "bg-gray-200" },
];

// Preset widget configurations
const presetWidgets: Record<string, Widget[]> = {
  overview: [
    { id: "preset-1", type: "metrics", title: "Project Metrics", size: "lg", config: {} },
    { id: "preset-2", type: "tasks", title: "Upcoming Tasks", size: "md", config: { maxTasks: 4 } },
    { id: "preset-3", type: "schedule", title: "Schedule", size: "md", config: { maxItems: 4 } },
    { id: "preset-4", type: "alerts", title: "Alerts", size: "md", config: {} },
  ],
};

// Default widgets for new views
const defaultWidgets: Widget[] = presetWidgets.overview;

type VisibilityOption = "private" | "by_role" | "by_user" | "everyone";

const visibilityOptions: { value: VisibilityOption; label: string; description: string; icon: typeof Lock }[] = [
  { value: "private", label: "Private", description: "Only you can see this view", icon: Lock },
  { value: "everyone", label: "Everyone", description: "All team members can see this view", icon: Globe },
  { value: "by_role", label: "By Role", description: "Specific roles can see this view", icon: Users },
  { value: "by_user", label: "By User", description: "Specific users can see this view", icon: Eye },
];

export default function CustomizableProjectOverview() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [backgroundId, setBackgroundId] = useState("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentLocation, navigate] = useLocation();

  // Determine active tab from URL path
  const activeTab = useMemo(() => {
    if (!currentProject) return "overview";
    const basePath = `/projects/${currentProject.id}`;
    const currentPath = currentLocation.split(basePath)[1] || "";
    
    // Sort tabs by path length (longest first) to match most specific path
    const sortedTabs = [...PROJECT_TABS].sort((a, b) => b.path.length - a.path.length);
    const currentTab = sortedTabs.find(tab => {
      if (tab.path === "") return currentPath === "" || currentPath === "/";
      return currentPath.startsWith(tab.path);
    });
    return currentTab?.id || "overview";
  }, [currentLocation, currentProject]);

  // New View Modal state
  const [isNewViewModalOpen, setIsNewViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewVisibility, setNewViewVisibility] = useState<VisibilityOption>("private");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Edit View Modal state
  const [isEditViewModalOpen, setIsEditViewModalOpen] = useState(false);
  const [viewToEdit, setViewToEdit] = useState<DashboardView | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [editViewVisibility, setEditViewVisibility] = useState<VisibilityOption>("private");
  const [editSelectedRoleIds, setEditSelectedRoleIds] = useState<string[]>([]);
  const [editSelectedUserIds, setEditSelectedUserIds] = useState<string[]>([]);

  // Delete confirmation state
  const [viewToDelete, setViewToDelete] = useState<DashboardView | null>(null);
  
  // Theme settings modal state
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  
  // Track if default view creation was attempted
  const defaultViewCreatedRef = useRef(false);

  // Fetch dashboard views from database
  const { data: dashboardViews = [], isLoading: isLoadingViews, isError: isViewsError } = useQuery<DashboardView[]>({
    queryKey: ["/api/dashboard-views"],
    enabled: !!user?.companyId,
    retry: 2,
  });

  // Fetch user's active view preference
  const { data: dashboardPreference } = useQuery<{ activeViewId: string | null } | null>({
    queryKey: ["/api/dashboard-preference"],
    enabled: !!user?.companyId,
    retry: 1,
  });

  // Fetch roles for visibility selection
  const { data: roles = [], isLoading: isLoadingRoles } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
    enabled: !!user?.companyId,
    retry: 1,
  });

  // Fetch users for visibility selection
  const { data: companyUsers = [], isLoading: isLoadingUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user?.companyId,
    retry: 1,
  });

  // Fetch field categories for phase colors
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Fetch project dashboard theme
  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/project", currentProject?.id],
    enabled: !!currentProject?.id,
  });

  // Create view mutation
  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; visibility: VisibilityOption; widgets: Widget[]; viewType?: "personal" | "business"; roleIds?: string[]; userIds?: string[] }) => {
      return apiRequest("/api/dashboard-views", "POST", { ...data, viewType: data.viewType || "business" });
    },
    onSuccess: (newView: DashboardView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-views"] });
      setActiveViewId(newView.id);
      setWidgets((newView.widgets as Widget[]) || defaultWidgets);
      setIsNewViewModalOpen(false);
      setNewViewName("");
      setNewViewVisibility("private");
      setSelectedRoleIds([]);
      setSelectedUserIds([]);
      toast({ title: "View created", description: `"${newView.name}" has been created successfully.` });
      // Save preference
      savePreferenceMutation.mutate({ activeViewId: newView.id });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create view", variant: "destructive" });
    },
  });

  // Set as company default mutation
  const setCompanyDefaultMutation = useMutation({
    mutationFn: async (viewId: string) => {
      return apiRequest(`/api/dashboard-views/${viewId}/set-company-default`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-views"] });
      toast({ title: "Company default set", description: "This view is now the default for everyone." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to set company default", variant: "destructive" });
    },
  });

  // Update view mutation - includes optional roleIds/userIds for permission updates
  const updateViewMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DashboardView> & { roleIds?: string[]; userIds?: string[] } }) => {
      return apiRequest(`/api/dashboard-views/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-views"] });
    },
  });

  // Delete view mutation
  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/dashboard-views/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-views"] });
      setViewToDelete(null);
      // Switch to first available view
      const remainingViews = dashboardViews.filter(v => v.id !== viewToDelete?.id);
      if (remainingViews.length > 0) {
        switchToView(remainingViews[0]);
      }
      toast({ title: "View deleted", description: "The view has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete view", variant: "destructive" });
    },
  });

  // Save preference mutation
  const savePreferenceMutation = useMutation({
    mutationFn: async (data: { activeViewId: string | null }) => {
      return apiRequest("/api/dashboard-preference", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-preference"] });
    },
  });

  // Track active view ID with ref for debounced callbacks
  const activeViewIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeViewIdRef.current = activeViewId;
  }, [activeViewId]);

  // Debounced widget save to prevent rapid-fire mutations
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingWidgetsRef = useRef<Widget[] | null>(null);

  const debouncedSaveWidgets = useCallback((widgetsToSave: Widget[]) => {
    const currentViewId = activeViewIdRef.current;
    if (!currentViewId) return;
    
    // Store the latest widgets to save
    pendingWidgetsRef.current = widgetsToSave;
    
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule the save after a short delay
    saveTimeoutRef.current = setTimeout(() => {
      const viewIdToSave = activeViewIdRef.current;
      if (pendingWidgetsRef.current && viewIdToSave) {
        updateViewMutation.mutate({
          id: viewIdToSave,
          data: { widgets: pendingWidgetsRef.current as any },
        });
        pendingWidgetsRef.current = null;
      }
    }, 300);
  }, [updateViewMutation]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Get project status category and find the current phase color
  const projectStatusCategory = fieldCategories.find(cat => cat.key === "project.status");
  const allPhaseOptions = projectStatusCategory?.options || [];

  // Get current phase option with color
  const currentPhaseOption = useMemo(() => {
    if (!currentProject?.currentSystemPhase) return null;
    return allPhaseOptions.find(opt =>
      opt.systemPhase === currentProject.currentSystemPhase ||
      opt.key === currentProject.currentSystemPhase
    );
  }, [currentProject?.currentSystemPhase, allPhaseOptions]);

  // Get the active view
  const activeView = dashboardViews.find(v => v.id === activeViewId) || dashboardViews[0];

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get current background class
  const currentBackground = backgroundOptions.find(b => b.id === backgroundId)?.value || backgroundOptions[0].value;

  // Initialize active view from preference or first view
  useEffect(() => {
    if (dashboardViews.length > 0 && !activeViewId) {
      const preferredViewId = dashboardPreference?.activeViewId;
      const targetView = preferredViewId
        ? dashboardViews.find(v => v.id === preferredViewId)
        : dashboardViews[0];

      if (targetView) {
        setActiveViewId(targetView.id);
        setWidgets((targetView.widgets as Widget[]) || defaultWidgets);
        setBackgroundId(targetView.backgroundId || "default");
      }
    }
  }, [dashboardViews, dashboardPreference, activeViewId]);

  // One-time creation of default view when none exist
  useEffect(() => {
    if (!user?.id || isLoadingViews || defaultViewCreatedRef.current) return;
    if (dashboardViews.length > 0) return;

    // Prevent multiple creation attempts
    defaultViewCreatedRef.current = true;

    // Check if there are any localStorage layouts to migrate
    const projectKeys = Object.keys(localStorage).filter(k => k.startsWith('widgets-'));
    if (projectKeys.length > 0) {
      const firstKey = projectKeys[0];
      const savedWidgetsStr = localStorage.getItem(firstKey);
      if (savedWidgetsStr) {
        try {
          const savedWidgets = JSON.parse(savedWidgetsStr) as Widget[];
          createViewMutation.mutate({
            name: "Imported Layout",
            visibility: "private",
            widgets: savedWidgets,
          });
          return;
        } catch (e) {
          console.error("Failed to migrate localStorage widgets:", e);
        }
      }
    }

    // Create default view
    createViewMutation.mutate({
      name: "Overview",
      visibility: "private",
      widgets: defaultWidgets,
    });
  }, [user?.id, dashboardViews.length, isLoadingViews]);

  // Save widgets to the active view (uses debounced save)
  const saveWidgets = useCallback((widgetsToSave: Widget[]) => {
    debouncedSaveWidgets(widgetsToSave);
  }, [debouncedSaveWidgets]);

  // Save background preference
  const saveBackground = (bgId: string) => {
    setBackgroundId(bgId);
    if (activeViewId) {
      updateViewMutation.mutate({
        id: activeViewId,
        data: { backgroundId: bgId },
      });
    }
  };

  // Switch to a different view
  const switchToView = (view: DashboardView) => {
    setActiveViewId(view.id);
    setWidgets((view.widgets as Widget[]) || defaultWidgets);
    setBackgroundId(view.backgroundId || "default");
    savePreferenceMutation.mutate({ activeViewId: view.id });
  };

  // Open new view modal
  const openNewViewModal = () => {
    setNewViewName("");
    setNewViewVisibility("private");
    setSelectedRoleIds([]);
    setSelectedUserIds([]);
    setIsNewViewModalOpen(true);
  };

  // Create new view
  const handleCreateView = () => {
    if (!newViewName.trim()) {
      toast({ title: "Name required", description: "Please enter a name for the view", variant: "destructive" });
      return;
    }

    // Build clean payload - only include roleIds/userIds when visibility matches
    const payload: {
      name: string;
      visibility: VisibilityOption;
      widgets: Widget[];
      roleIds?: string[];
      userIds?: string[];
    } = {
      name: newViewName.trim(),
      visibility: newViewVisibility,
      widgets: [...widgets],
    };

    // Only include roleIds for by_role visibility with actual selections
    if (newViewVisibility === "by_role" && selectedRoleIds.length > 0) {
      payload.roleIds = selectedRoleIds;
    }
    
    // Only include userIds for by_user visibility with actual selections
    if (newViewVisibility === "by_user" && selectedUserIds.length > 0) {
      payload.userIds = selectedUserIds;
    }

    createViewMutation.mutate(payload);
  };

  // Confirm delete view
  const confirmDeleteView = (view: DashboardView) => {
    setViewToDelete(view);
  };

  // Open edit view modal - fetches permissions first
  const openEditViewModal = async (view: DashboardView) => {
    setViewToEdit(view);
    setEditViewName(view.name);
    setEditViewVisibility((view.visibility as VisibilityOption) || "private");
    
    // Fetch current permissions if this is a by_role or by_user view
    if (view.visibility === "by_role" || view.visibility === "by_user") {
      try {
        const response = await fetch(`/api/dashboard-views/${view.id}/permissions`, {
          credentials: "include",
        });
        if (response.ok) {
          const { roleIds, userIds } = await response.json();
          setEditSelectedRoleIds(roleIds || []);
          setEditSelectedUserIds(userIds || []);
        } else {
          setEditSelectedRoleIds([]);
          setEditSelectedUserIds([]);
        }
      } catch (error) {
        console.error("Failed to fetch view permissions:", error);
        setEditSelectedRoleIds([]);
        setEditSelectedUserIds([]);
      }
    } else {
      setEditSelectedRoleIds([]);
      setEditSelectedUserIds([]);
    }
    
    setIsEditViewModalOpen(true);
  };

  // Handle edit view
  const handleEditView = () => {
    if (!viewToEdit || !editViewName.trim()) {
      toast({ title: "Name required", description: "Please enter a name for the view", variant: "destructive" });
      return;
    }

    // Build update payload - includes roleIds/userIds for permissions
    const updateData: Partial<DashboardView> & { roleIds?: string[]; userIds?: string[] } = {
      name: editViewName.trim(),
      visibility: editViewVisibility,
    };

    // Only include roleIds/userIds when visibility requires them
    // When switching away from by_role/by_user, we need to clear the permissions
    if (editViewVisibility === "by_role") {
      updateData.roleIds = editSelectedRoleIds;
      updateData.userIds = []; // Clear user permissions when switching to role-based
    } else if (editViewVisibility === "by_user") {
      updateData.userIds = editSelectedUserIds;
      updateData.roleIds = []; // Clear role permissions when switching to user-based
    } else {
      // For private/everyone visibility, clear both permission types
      updateData.roleIds = [];
      updateData.userIds = [];
    }

    updateViewMutation.mutate({
      id: viewToEdit.id,
      data: updateData,
    }, {
      onSuccess: () => {
        toast({ title: "View updated", description: `"${editViewName.trim()}" has been updated.` });
        setIsEditViewModalOpen(false);
        setViewToEdit(null);
        setEditViewName("");
        setEditViewVisibility("private");
        setEditSelectedRoleIds([]);
        setEditSelectedUserIds([]);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update view", variant: "destructive" });
      },
    });
  };

  const addWidget = (type: string) => {
    const definition = getWidgetDefinition(type);
    if (!definition) return;

    const newWidget: Widget = {
      id: Date.now().toString(),
      type,
      title: definition.name,
      size: definition.defaultSize,
      config: {},
    };

    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    saveWidgets(updatedWidgets);
    setIsAddingWidget(false);
  };

  const removeWidget = (widgetId: string) => {
    const updatedWidgets = widgets.filter(w => w.id !== widgetId);
    setWidgets(updatedWidgets);
    saveWidgets(updatedWidgets);
  };

  const updateWidget = (updatedWidget: Widget) => {
    const updatedWidgets = widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w);
    setWidgets(updatedWidgets);
    saveWidgets(updatedWidgets);
    if (configuringWidget === updatedWidget.id) {
      setConfiguringWidget(null);
    }
  };

  // Handle drag end event for reordering widgets
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
    const newIndex = widgets.findIndex((widget) => widget.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedWidgets = arrayMove(widgets, oldIndex, newIndex);
    setWidgets(reorderedWidgets);
    saveWidgets(reorderedWidgets);
  };

  // Filter widgets for search
  const filteredWidgetTypes = Object.values(widgetRegistry).filter(def =>
    def.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    def.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderWidget = (widget: Widget) => {
    const definition = getWidgetDefinition(widget.type);
    if (!definition) return null;

    const WidgetComponent = definition.component;

    return (
      <WidgetContainer
        key={widget.id}
        widget={widget}
        onUpdate={updateWidget}
        onRemove={removeWidget}
        onConfigure={definition.configurable ? setConfiguringWidget : undefined}
        isConfiguring={configuringWidget === widget.id}
      >
        <WidgetComponent
          widget={widget}
          onUpdate={updateWidget}
          onRemove={removeWidget}
          isConfiguring={configuringWidget === widget.id}
          onCloseConfig={() => setConfiguringWidget(null)}
        />
      </WidgetContainer>
    );
  };

  // Show loading state while fetching views
  if (isLoadingViews) {
    return (
      <div className="flex flex-col h-full" data-testid="customizable-project-overview">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#bba7db] mx-auto mb-4"></div>
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if views failed to load
  if (isViewsError) {
    return (
      <div className="flex flex-col h-full" data-testid="customizable-project-overview">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <h2 className="text-xl font-medium mb-2">Unable to Load Dashboard</h2>
            <p className="mb-4">There was a problem loading your dashboard views.</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/dashboard-views"] })}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state if no project is selected
  if (!currentProject) {
    return (
      <div className="flex flex-col h-full" data-testid="customizable-project-overview">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <h2 className="text-xl font-medium mb-2">No Project Selected</h2>
            <p>Please select a project from the dropdown to view its dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get phase display name and color
  const phaseDisplayName = currentPhaseOption?.name ||
    currentProject.currentSystemPhase?.replace(/_/g, ' ') ||
    'Lead';
  const phaseColor = currentPhaseOption?.color || '#6b7280';

  // Theme helper functions
  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  };

  const getThemeBackground = (): React.CSSProperties => {
    if (!theme) return {};
    
    if (theme.backgroundType === "color" && theme.backgroundColor) {
      return { backgroundColor: theme.backgroundColor };
    } else if (theme.backgroundType === "gradient" && theme.backgroundGradient) {
      return { background: theme.backgroundGradient };
    } else if (theme.backgroundType === "image" && theme.backgroundImage) {
      return { 
        backgroundImage: `url(${theme.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    return {};
  };

  const getWidgetStyle = (): { className: string; style?: React.CSSProperties } => {
    if (!theme) return { className: "" };
    const opacity = (theme.widgetOpacity ?? 100) / 100;
    if (theme.widgetBackgroundType === "frosted") {
      return { 
        className: "backdrop-blur-sm", 
        style: { backgroundColor: `hsl(var(--card) / ${opacity * 0.8})` }
      };
    }
    if (theme.widgetBackgroundType === "transparent") {
      return { 
        className: "border-white/20", 
        style: { backgroundColor: 'transparent' }
      };
    }
    if (opacity < 1) {
      return { 
        className: "", 
        style: { backgroundColor: `hsl(var(--card) / ${opacity})` }
      };
    }
    return { className: "" };
  };

  // Get visibility icon for a view
  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case "private": return Lock;
      case "everyone": return Globe;
      case "by_role": return Users;
      case "by_user": return Eye;
      default: return Lock;
    }
  };

  // Render content for non-overview tabs
  const renderTabContent = () => {
    switch (activeTab) {
      case "activity":
        return <ProjectActivity />;
      case "messages":
        return <Messages />;
      case "notes":
        return <Notes projectId={currentProject.id} />;
      case "scope":
        return <ProjectScope />;
      case "schedule":
        return <Schedule />;
      case "tasks":
        return <Tasks />;
      case "timesheets":
        return <Timesheets />;
      case "files":
        return <ProjectFiles />;
      case "takeoff":
        return <Takeoff />;
      case "estimates":
        return <ProjectEstimates />;
      case "proposals":
        return <Proposals />;
      case "bills":
        return <Bills />;
      case "budget":
        return <Budget />;
      case "calendar":
        return <Calendar />;
      case "selections":
        return <Selections />;
      case "rfqs":
        return <RFQs />;
      case "rfis":
        return <RFIs />;
      case "allowances":
        return <Allowances />;
      case "defects":
        return <Defects />;
      case "purchase-orders":
        return <PurchaseOrders />;
      case "variations":
        return <Variations />;
      case "client-invoices":
        return <ClientInvoices />;
      case "invoices":
        return <ClientInvoices />;
      case "site-diary":
        return <SiteDiaryEntries />;
      case "team":
        return <ProjectTeam />;
      case "checklists":
        return <ProjectChecklists />;
      case "minutes":
        return <Minutes />;
      default:
        return null; // overview renders inline below
    }
  };

  // Check if we're on the overview tab (renders the widget dashboard)
  const isOverviewTab = activeTab === "overview";

  return (
    <div className="flex flex-col h-full gap-1.5" data-testid="customizable-project-overview">
      {/* Header Panel - Rounded like Workspace */}
      <div className="surface-panel flex-shrink-0">
        {/* Row 1 - Title & Actions */}
        <div className="h-10 flex items-center justify-between px-4 gap-4">
          {/* Left: Project Name + Active chip */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5" data-testid="text-page-title">
              <span className="truncate max-w-[180px]">{currentProject.name}</span>
            </h2>
            <Badge
              variant="secondary"
              className={`text-xs ${
                currentProject.status === 'active'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {currentProject.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
            <Badge
              className="text-xs capitalize"
              style={{
                backgroundColor: `${phaseColor}20`,
                color: phaseColor,
                borderColor: `${phaseColor}40`
              }}
              data-testid="badge-project-phase"
            >
              {phaseDisplayName}
            </Badge>
          </div>

          {/* Right: Add Widget + Settings gear - only show on overview tab */}
          <div className="flex items-center gap-1.5">
            {isOverviewTab && (
              <>
                <button
                  className="h-6 w-6 text-xs border rounded-md flex items-center justify-center hover-elevate active-elevate-2"
                  onClick={() => setIsThemeSettingsOpen(true)}
                  data-testid="button-theme-settings"
                >
                  <Palette className="w-3 h-3" />
                </button>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                  onClick={() => setIsAddingWidget(true)}
                  data-testid="button-add-widget"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Widget</span>
                </button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => navigate(`/projects/${currentProject.id}/settings`)}
              data-testid="button-project-settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Row 2 - Navigation Tabs - Underline Style */}
        <div className="h-10 flex items-center px-4 gap-4 border-t border-border/50 overflow-x-auto">
        {PROJECT_TABS.map((tab) => {
          const Icon = tab.icon;
          const tabPath = tab.path ? `/projects/${currentProject.id}${tab.path}` : `/projects/${currentProject.id}`;
          const currentPath = currentLocation.split(`/projects/${currentProject.id}`)[1] || "";
          const isActive = tab.path === "" 
            ? currentPath === "" || currentPath === "/" 
            : currentPath.startsWith(tab.path);
          
          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                navigate(tabPath);
              }}
              className={`relative h-full px-1 text-xs flex items-center gap-1.5 flex-shrink-0 transition-colors ${
                isActive
                  ? 'text-[#bba7db] font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db] rounded-full" />
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Content Area - either tab content or widget dashboard */}
      {!isOverviewTab ? (
        <div className="flex-1 overflow-auto">
          {renderTabContent()}
        </div>
      ) : (
        <>
          {/* View Switcher Row - Simplified */}
          <div className="h-8 bg-muted/30 flex items-center justify-between px-2 border-b border-border flex-shrink-0 rounded-lg">
        {/* Left: Current view indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">View:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs rounded-md hover:bg-muted flex items-center gap-1.5"
                data-testid="button-view-switcher"
              >
                {activeView && (() => {
                  const VisIcon = getVisibilityIcon(activeView.visibility);
                  return <VisIcon className="w-3 h-3 text-muted-foreground" />;
                })()}
                <span className="font-medium">{activeView?.name || 'Select View'}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Dashboard Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dashboardViews.length === 0 ? (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  No views yet. Create one!
                </DropdownMenuItem>
              ) : (
                dashboardViews.map((view) => {
                  const VisIcon = getVisibilityIcon(view.visibility);
                  const isViewCreator = view.creatorId === user?.id;
                  const isAdminOrOwner = user?.role === "owner" || user?.role === "admin";
                  const canEditView = isViewCreator || isAdminOrOwner;
                  return (
                    <DropdownMenuItem
                      key={view.id}
                      className="text-xs flex items-center justify-between gap-2 group"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <button
                        className="flex-1 text-left flex items-center gap-2"
                        onClick={() => switchToView(view)}
                      >
                        <VisIcon className="w-3 h-3 text-muted-foreground" />
                        <span className="flex-1 truncate">{view.name}</span>
                        {view.id === activeViewId && (
                          <Check className="w-3 h-3 text-[#bba7db] flex-shrink-0" />
                        )}
                      </button>
                      {view.isCompanyDefault && (
                        <span className="text-[10px] px-1 py-0.5 bg-[#bba7db]/20 text-[#bba7db] rounded" title="Company Default">
                          Default
                        </span>
                      )}
                      {canEditView && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditViewModal(view);
                            }}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            data-testid={`button-edit-view-${view.id}`}
                            title="Edit view"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {!view.isCompanyDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompanyDefaultMutation.mutate(view.id);
                              }}
                              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                              data-testid={`button-set-default-${view.id}`}
                              title="Set as company default"
                            >
                              <Star className="w-3 h-3" />
                            </button>
                          )}
                          {dashboardViews.length > 1 && !view.isCompanyDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteView(view);
                              }}
                              className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                              data-testid={`button-delete-view-${view.id}`}
                              title="Delete view"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: New View button */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 hover-elevate active-elevate-2"
            onClick={openNewViewModal}
            data-testid="button-new-view"
          >
            <PlusCircle className="w-3 h-3" />
            <span>New View</span>
          </button>
        </div>
      </div>

      {/* Widgets Area with Background */}
      <div 
        className={`flex-1 overflow-auto relative ${!theme ? currentBackground : ''}`}
        style={getThemeBackground()}
      >
        {/* Overlay for image backgrounds */}
        {theme?.backgroundType === "image" && theme.overlayEnabled && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ 
              backgroundColor: hexToRgba(theme.overlayColor || '#000000', theme.overlayOpacity || 40),
              backdropFilter: theme.blurStrength ? `blur(${theme.blurStrength}px)` : undefined,
            }}
          />
        )}
        
        <div className="relative p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map(w => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {widgets.map((widget) => renderWidget(widget))}

              {widgets.length === 0 && (
                <div className="col-span-full">
                  <Card className="border-dashed border-2 border-primary/20 bg-card/80 backdrop-blur-sm">
                    <CardContent className="p-8 text-center">
                      <div className="space-y-3">
                        <div className="text-muted-foreground">
                          <LayoutGrid className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                          <h3 className="text-lg font-semibold tracking-tight">Customize Your Dashboard</h3>
                          <p className="text-base">Add widgets to create your personalized project overview</p>
                        </div>
                        <Button
                          onClick={() => setIsAddingWidget(true)}
                          className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Your First Widget
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
        </div>
      </div>
        </>
      )}

      {/* Add Widget Dialog */}
      <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl">Widgets Center</DialogTitle>
            <DialogDescription>
              Choose widgets to add to your project dashboard
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search widgets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-widgets"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 overflow-y-auto pr-2 max-h-[50vh]">
            {filteredWidgetTypes.map((definition) => (
              <Card
                key={definition.type}
                className="cursor-pointer hover-elevate group"
                onClick={() => addWidget(definition.type)}
                data-testid={`add-widget-${definition.type}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Widget Preview Header */}
                    <div className="flex items-center justify-between">
                      <definition.icon className="h-5 w-5 text-[#bba7db]" />
                      <div className="h-2 w-16 bg-muted rounded-full">
                        <div className="h-full w-3/4 bg-[#bba7db] rounded-full"></div>
                      </div>
                    </div>

                    {/* Widget Preview Content */}
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded w-full"></div>
                      <div className="h-3 bg-muted rounded w-3/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                    </div>

                    {/* Widget Info */}
                    <div className="pt-2 border-t">
                      <h3 className="font-medium text-sm">{definition.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {definition.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* New View Modal */}
      <Dialog open={isNewViewModalOpen} onOpenChange={setIsNewViewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New View</DialogTitle>
            <DialogDescription>
              Name your view and choose who can see it
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                placeholder="e.g., Financial Overview"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                data-testid="input-view-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select 
                value={newViewVisibility} 
                onValueChange={(v) => {
                  const visibility = v as VisibilityOption;
                  setNewViewVisibility(visibility);
                  // Clear role/user selections when switching visibility type
                  if (visibility !== "by_role") setSelectedRoleIds([]);
                  if (visibility !== "by_user") setSelectedUserIds([]);
                }}
              >
                <SelectTrigger data-testid="select-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="w-4 h-4" />
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newViewVisibility === "by_role" && (
              <div className="space-y-2">
                <Label>Select Roles</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {isLoadingRoles ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Loading roles...</p>
                  ) : roles.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No roles available</p>
                  ) : (
                    roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRoleIds([...selectedRoleIds, role.id]);
                            } else {
                              setSelectedRoleIds(selectedRoleIds.filter(id => id !== role.id));
                            }
                          }}
                          className="rounded"
                        />
                        {role.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {newViewVisibility === "by_user" && (
              <div className="space-y-2">
                <Label>Select Users</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {isLoadingUsers ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Loading users...</p>
                  ) : companyUsers.filter(u => u.id !== user?.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No other users available</p>
                  ) : (
                    companyUsers.filter(u => u.id !== user?.id).map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds([...selectedUserIds, u.id]);
                            } else {
                              setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                            }
                          }}
                          className="rounded"
                        />
                        {u.firstName} {u.lastName} {u.email && `(${u.email})`}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewViewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateView}
              disabled={createViewMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            >
              {createViewMutation.isPending ? "Creating..." : "Create View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!viewToDelete} onOpenChange={() => setViewToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => viewToDelete && deleteViewMutation.mutate(viewToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit View Dialog */}
      <Dialog open={isEditViewModalOpen} onOpenChange={setIsEditViewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit View</DialogTitle>
            <DialogDescription>
              Update the name and visibility settings for this view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                placeholder="e.g., My Dashboard"
                value={editViewName}
                onChange={(e) => setEditViewName(e.target.value)}
                data-testid="input-edit-view-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select 
                value={editViewVisibility} 
                onValueChange={(v) => {
                  const visibility = v as VisibilityOption;
                  setEditViewVisibility(visibility);
                  if (visibility !== "by_role") setEditSelectedRoleIds([]);
                  if (visibility !== "by_user") setEditSelectedUserIds([]);
                }}
              >
                <SelectTrigger data-testid="select-edit-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="w-4 h-4" />
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editViewVisibility === "by_role" && (
              <div className="space-y-2">
                <Label>Select Roles</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {isLoadingRoles ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Loading roles...</p>
                  ) : roles.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No roles available</p>
                  ) : (
                    roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={editSelectedRoleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditSelectedRoleIds([...editSelectedRoleIds, role.id]);
                            } else {
                              setEditSelectedRoleIds(editSelectedRoleIds.filter(id => id !== role.id));
                            }
                          }}
                          className="rounded"
                        />
                        {role.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {editViewVisibility === "by_user" && (
              <div className="space-y-2">
                <Label>Select Users</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {isLoadingUsers ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Loading users...</p>
                  ) : companyUsers.filter(u => u.id !== user?.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No other users available</p>
                  ) : (
                    companyUsers.filter(u => u.id !== user?.id).map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={editSelectedUserIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditSelectedUserIds([...editSelectedUserIds, u.id]);
                            } else {
                              setEditSelectedUserIds(editSelectedUserIds.filter(id => id !== u.id));
                            }
                          }}
                          className="rounded"
                        />
                        {u.firstName} {u.lastName} {u.email && `(${u.email})`}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditViewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditView}
              disabled={updateViewMutation.isPending || !editViewName.trim()}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            >
              {updateViewMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DashboardThemeSettings
        open={isThemeSettingsOpen}
        onOpenChange={setIsThemeSettingsOpen}
        dashboardType="project"
        projectId={currentProject?.id}
        projectColor={phaseColor}
      />
    </div>
  );
}
