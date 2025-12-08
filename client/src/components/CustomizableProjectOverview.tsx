import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, ChevronDown, Search, PlusCircle, Check } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Widget } from "@/types/widgets";
import { widgetRegistry, getWidgetDefinition } from "./widgets/WidgetRegistry";
import WidgetContainer from "./widgets/WidgetContainer";
import { useProject } from "@/contexts/ProjectContext";
import type { FieldCategoryWithOptions } from "@shared/schema";
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
  financial: [
    { id: "preset-1", type: "metrics", title: "Financial Overview", size: "lg", config: {} },
    { id: "preset-2", type: "bills", title: "Bills Summary", size: "md", config: {} },
    { id: "preset-3", type: "variations", title: "Variations", size: "md", config: {} },
    { id: "preset-4", type: "invoices", title: "Client Invoices", size: "md", config: {} },
  ],
  schedule: [
    { id: "preset-1", type: "schedule", title: "Schedule", size: "lg", config: { maxItems: 8 } },
    { id: "preset-2", type: "tasks", title: "Tasks", size: "md", config: { maxTasks: 6 } },
    { id: "preset-3", type: "checklist", title: "Checklists", size: "md", config: {} },
    { id: "preset-4", type: "quickActions", title: "Quick Actions", size: "md", config: {} },
  ],
};

// Dashboard view type
interface DashboardView {
  id: string;
  name: string;
  widgets: Widget[];
  isDefault?: boolean;
}

// Default view setup
const defaultView: DashboardView = {
  id: "overview",
  name: "Overview",
  widgets: presetWidgets.overview,
  isDefault: true,
};

// Default template setup (same as overview preset)
const defaultWidgets: Widget[] = presetWidgets.overview;

export default function CustomizableProjectOverview() {
  const { currentProject } = useProject();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<DashboardView[]>([defaultView]);
  const [activeViewId, setActiveViewId] = useState("overview");
  const [backgroundId, setBackgroundId] = useState("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  
  // Fetch field categories for phase colors
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
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
  const activeView = savedViews.find(v => v.id === activeViewId) || savedViews[0];

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get current background class
  const currentBackground = backgroundOptions.find(b => b.id === backgroundId)?.value || backgroundOptions[0].value;

  // Save widgets to localStorage
  const saveWidgets = (widgetsToSave: Widget[]) => {
    if (!currentProject) return;
    
    try {
      localStorage.setItem(`widgets-${currentProject.id}`, JSON.stringify(widgetsToSave));
    } catch (error) {
      console.error('Failed to save widgets:', error);
    }
  };

  // Save background preference
  const saveBackground = (bgId: string) => {
    if (!currentProject) return;
    setBackgroundId(bgId);
    try {
      localStorage.setItem(`dashboard-bg-${currentProject.id}`, bgId);
    } catch (error) {
      console.error('Failed to save background:', error);
    }
  };

  // Migrate old pixel-based dimensions to column-based (one-time migration)
  const migrateWidgetDimensions = (widgets: Widget[]): Widget[] => {
    return widgets.map(widget => {
      if (widget.dimensions && widget.dimensions.width && !widget.dimensions.columns) {
        return {
          ...widget,
          dimensions: widget.dimensions.height 
            ? { height: widget.dimensions.height } 
            : undefined
        };
      }
      return widget;
    });
  };

  // Load widgets, views, and background from localStorage on component mount and project change
  useEffect(() => {
    if (!currentProject) {
      setWidgets([]);
      return;
    }
    
    // Load background
    const savedBg = localStorage.getItem(`dashboard-bg-${currentProject.id}`);
    if (savedBg && backgroundOptions.find(b => b.id === savedBg)) {
      setBackgroundId(savedBg);
    } else {
      setBackgroundId("default");
    }
    
    // Load saved views
    const savedViewsStr = localStorage.getItem(`dashboard-views-${currentProject.id}`);
    if (savedViewsStr) {
      try {
        const parsedViews = JSON.parse(savedViewsStr) as DashboardView[];
        if (parsedViews.length > 0) {
          setSavedViews(parsedViews);
        }
      } catch (error) {
        console.error('Failed to parse saved views:', error);
      }
    }
    
    // Load active view ID
    const savedActiveViewId = localStorage.getItem(`dashboard-active-view-${currentProject.id}`);
    if (savedActiveViewId) {
      setActiveViewId(savedActiveViewId);
    } else {
      setActiveViewId("overview");
    }
    
    // Load widgets for active view
    const savedWidgets = localStorage.getItem(`widgets-${currentProject.id}`);
    console.log(`Looking for saved widgets for project ${currentProject.id}:`, savedWidgets ? 'found' : 'not found');
    
    if (savedWidgets) {
      try {
        const parsedWidgets = JSON.parse(savedWidgets) as Widget[];
        console.log(`Loading ${parsedWidgets.length} widgets for project ${currentProject.id}`);
        const migratedWidgets = migrateWidgetDimensions(parsedWidgets);
        setWidgets(migratedWidgets);
        
        if (JSON.stringify(parsedWidgets) !== JSON.stringify(migratedWidgets)) {
          saveWidgets(migratedWidgets);
        }
      } catch (error) {
        console.error('Failed to parse saved widgets:', error);
        setWidgets(defaultWidgets);
        try {
          localStorage.setItem(`widgets-${currentProject.id}`, JSON.stringify(defaultWidgets));
        } catch (saveError) {
          console.error('Failed to save default widgets:', saveError);
        }
      }
    } else {
      console.log(`No saved widgets found, using defaults for project ${currentProject.id}`);
      setWidgets(defaultWidgets);
      try {
        localStorage.setItem(`widgets-${currentProject.id}`, JSON.stringify(defaultWidgets));
      } catch (saveError) {
        console.error('Failed to save default widgets:', saveError);
      }
    }
  }, [currentProject]);

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

  // Save views to localStorage
  const saveViews = (views: DashboardView[]) => {
    if (!currentProject) return;
    try {
      localStorage.setItem(`dashboard-views-${currentProject.id}`, JSON.stringify(views));
    } catch (error) {
      console.error('Failed to save views:', error);
    }
  };
  
  // Switch to a different view
  const switchToView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view) {
      setActiveViewId(viewId);
      setWidgets(view.widgets);
      saveWidgets(view.widgets);
      if (currentProject) {
        localStorage.setItem(`dashboard-active-view-${currentProject.id}`, viewId);
      }
    }
  };
  
  // Create a new view with current widgets
  const createNewView = () => {
    const newViewId = `view-${Date.now()}`;
    const newView: DashboardView = {
      id: newViewId,
      name: `View ${savedViews.length + 1}`,
      widgets: [...widgets],
    };
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    saveViews(updatedViews);
    setActiveViewId(newViewId);
    if (currentProject) {
      localStorage.setItem(`dashboard-active-view-${currentProject.id}`, newViewId);
    }
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

    setWidgets((widgets) => {
      const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
      const newIndex = widgets.findIndex((widget) => widget.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return widgets;
      }

      const reorderedWidgets = arrayMove(widgets, oldIndex, newIndex);
      saveWidgets(reorderedWidgets);
      return reorderedWidgets;
    });
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

  // Get phase display name and color
  const phaseDisplayName = currentPhaseOption?.name || 
    currentProject.currentSystemPhase?.replace(/_/g, ' ') || 
    'Lead';
  const phaseColor = currentPhaseOption?.color || '#6b7280';

  return (
    <div className="flex flex-col h-full" data-testid="customizable-project-overview">
      {/* Row 1 - Title & Actions (36px / h-9) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Project Name · Dashboard breadcrumb + Active chip */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5" data-testid="text-page-title">
            <span className="truncate max-w-[180px]">{currentProject.name}</span>
            <span className="text-muted-foreground">·</span>
            <span>Dashboard</span>
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
        </div>

        {/* Right: Phase chip + Add Widget + Settings gear */}
        <div className="flex items-center gap-1.5">
          <Badge 
            className="text-xs text-white capitalize"
            style={{ backgroundColor: phaseColor }}
            data-testid="badge-project-phase"
          >
            {phaseDisplayName}
          </Badge>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
            onClick={() => setIsAddingWidget(true)}
            data-testid="button-add-widget"
          >
            <Plus className="w-3 h-3" />
            <span>Add Widget</span>
          </button>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-6 w-6"
            onClick={() => navigate('/project-settings')}
            data-testid="button-project-settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Row 2 - View Switcher (36px / h-9) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View split-button selector */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="h-6 w-auto px-2.5 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1.5"
                data-testid="button-view-switcher"
              >
                <span>{activeView?.name || 'Overview'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Dashboard Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedViews.map((view) => (
                <DropdownMenuItem 
                  key={view.id}
                  onClick={() => switchToView(view.id)}
                  className="text-xs flex items-center justify-between"
                >
                  <span>{view.name}</span>
                  {view.id === activeViewId && (
                    <Check className="w-3 h-3 text-[#bba7db]" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: New View button */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
            onClick={createNewView}
            data-testid="button-new-view"
          >
            <PlusCircle className="w-3 h-3" />
            <span>New View</span>
          </button>
        </div>
      </div>

      {/* Widgets Area with Background */}
      <div className={`flex-1 overflow-auto ${currentBackground} p-4`}>
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

      {/* Add Widget Dialog */}
      <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl">Widgets Center</DialogTitle>
            <p className="text-muted-foreground">
              Choose widgets to add to your project dashboard
            </p>
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
    </div>
  );
}
