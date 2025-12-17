import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Settings, 
  ChevronDown, 
  Check, 
  PlusCircle,
  Trash2,
  GripVertical,
  X,
  Building2,
  Palette
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Widget } from "@/types/widgets";
import { 
  businessWidgetRegistry, 
  getBusinessWidgetDefinition,
  getAvailableBusinessWidgets 
} from "./business-widgets/BusinessWidgetRegistry";
import BusinessWidgetContainer from "./business-widgets/BusinessWidgetContainer";
import DashboardThemeSettings from "./DashboardThemeSettings";
import { useAuth } from "@/hooks/use-auth";
import type { DashboardTheme, Company } from "@shared/schema";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DashboardView {
  id: string;
  name: string;
  widgets: Widget[];
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: "1", type: "businessKPIs", title: "Business KPIs", size: "xl", dimensions: { columns: 8 } },
  { id: "2", type: "businessQuickActions", title: "Quick Actions", size: "sm", dimensions: { columns: 2 } },
  { id: "3", type: "businessActivity", title: "Recent Activity", size: "md", dimensions: { columns: 3 } },
  { id: "4", type: "businessAlerts", title: "Alerts & Reminders", size: "md", dimensions: { columns: 3 } },
  { id: "5", type: "businessProjects", title: "Active Projects", size: "lg", dimensions: { columns: 4 } },
  { id: "6", type: "businessTeam", title: "Team Overview", size: "md", dimensions: { columns: 4 } },
  { id: "7", type: "businessFinancials", title: "Financial Summary", size: "md", dimensions: { columns: 4 } },
  { id: "8", type: "businessTimesheets", title: "Timesheets", size: "md", dimensions: { columns: 4 } },
];

const DEFAULT_VIEW: DashboardView = {
  id: "overview",
  name: "Overview",
  widgets: DEFAULT_WIDGETS,
};

function SortableWidget({ 
  widget, 
  onUpdate, 
  onRemove, 
  isConfiguring, 
  onConfigure,
  themeStyle
}: { 
  widget: Widget; 
  onUpdate: (widget: Widget) => void;
  onRemove: (id: string) => void;
  isConfiguring: boolean;
  onConfigure: (id: string | null) => void;
  themeStyle?: { className: string; style?: React.CSSProperties };
}) {
  const [isResizing, setIsResizing] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: isResizing });

  const definition = getBusinessWidgetDefinition(widget.type);
  if (!definition) return null;

  const WidgetComponent = definition.component;

  const sizeClasses: Record<string, string> = {
    sm: "col-span-2",
    md: "col-span-4",
    lg: "col-span-6",
    xl: "col-span-8",
  };

  const getColSpanClass = () => {
    if (widget.dimensions?.columns) {
      const colSpanMap: Record<number, string> = {
        1: 'col-span-1',
        2: 'col-span-2', 
        3: 'col-span-3',
        4: 'col-span-4',
        5: 'col-span-5',
        6: 'col-span-6',
        7: 'col-span-7',
        8: 'col-span-8',
      };
      return colSpanMap[widget.dimensions.columns] || sizeClasses[widget.size];
    }
    return sizeClasses[widget.size];
  };

  const handleResizeEnd = (columns: number, height: number) => {
    onUpdate({
      ...widget,
      dimensions: { columns, height }
    });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={getColSpanClass()}
    >
      <BusinessWidgetContainer
        title={widget.title}
        icon={<definition.icon className="h-3.5 w-3.5" />}
        onRemove={() => onRemove(widget.id)}
        onConfigure={definition.configurable ? () => onConfigure(widget.id) : undefined}
        dragHandleProps={{ ...attributes, ...listeners }}
        onResizeEnd={handleResizeEnd}
        dimensions={widget.dimensions}
        isResizing={isResizing}
        setIsResizing={setIsResizing}
        themeClassName={themeStyle?.className}
        themeStyleOverride={themeStyle?.style}
      >
        <WidgetComponent
          widget={widget}
          onUpdate={onUpdate}
          onRemove={onRemove}
          isConfiguring={isConfiguring}
          onCloseConfig={() => onConfigure(null)}
        />
      </BusinessWidgetContainer>
    </div>
  );
}

export default function BusinessOverview() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [savedViews, setSavedViews] = useState<DashboardView[]>([DEFAULT_VIEW]);
  const [activeViewId, setActiveViewId] = useState("overview");
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [isCreatingView, setIsCreatingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

  const { data: company } = useQuery<Company>({
    queryKey: [`/api/companies/${user?.companyId}`],
    enabled: !!user?.companyId,
  });

  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/business"],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const storageKey = `business-dashboard-widgets-${user?.id || 'default'}`;
  const viewsStorageKey = `business-dashboard-views-${user?.id || 'default'}`;
  const activeViewKey = `business-dashboard-active-view-${user?.id || 'default'}`;

  useEffect(() => {
    const savedViewsJson = localStorage.getItem(viewsStorageKey);
    if (savedViewsJson) {
      try {
        const parsedViews = JSON.parse(savedViewsJson);
        setSavedViews(parsedViews);
        
        const savedActiveView = localStorage.getItem(activeViewKey);
        if (savedActiveView && parsedViews.find((v: DashboardView) => v.id === savedActiveView)) {
          setActiveViewId(savedActiveView);
          const view = parsedViews.find((v: DashboardView) => v.id === savedActiveView);
          if (view) setWidgets(view.widgets);
        } else {
          setWidgets(parsedViews[0]?.widgets || DEFAULT_WIDGETS);
        }
      } catch (e) {
        console.error("Failed to load views", e);
      }
    } else {
      const savedWidgetsJson = localStorage.getItem(storageKey);
      if (savedWidgetsJson) {
        try {
          setWidgets(JSON.parse(savedWidgetsJson));
        } catch (e) {
          console.error("Failed to load widgets", e);
        }
      }
    }
  }, [user?.id]);

  const saveWidgets = (newWidgets: Widget[]) => {
    localStorage.setItem(storageKey, JSON.stringify(newWidgets));
  };

  const saveViews = (views: DashboardView[]) => {
    localStorage.setItem(viewsStorageKey, JSON.stringify(views));
  };

  const handleWidgetUpdate = (updatedWidget: Widget) => {
    const newWidgets = widgets.map(w => 
      w.id === updatedWidget.id ? updatedWidget : w
    );
    setWidgets(newWidgets);
    saveWidgets(newWidgets);
    updateCurrentView(newWidgets);
  };

  const handleWidgetRemove = (widgetId: string) => {
    const newWidgets = widgets.filter(w => w.id !== widgetId);
    setWidgets(newWidgets);
    saveWidgets(newWidgets);
    updateCurrentView(newWidgets);
  };

  const handleAddWidget = (type: string) => {
    const definition = getBusinessWidgetDefinition(type);
    if (!definition) return;

    const newWidget: Widget = {
      id: Date.now().toString(),
      type,
      title: definition.name,
      size: definition.defaultSize,
      dimensions: { 
        columns: definition.defaultSize === 'xl' ? 8 : 
                 definition.defaultSize === 'lg' ? 6 : 
                 definition.defaultSize === 'md' ? 4 : 2 
      }
    };

    const newWidgets = [...widgets, newWidget];
    setWidgets(newWidgets);
    saveWidgets(newWidgets);
    updateCurrentView(newWidgets);
    setIsAddingWidget(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex(w => w.id === active.id);
    const newIndex = widgets.findIndex(w => w.id === over.id);
    
    const newWidgets = arrayMove(widgets, oldIndex, newIndex);
    setWidgets(newWidgets);
    saveWidgets(newWidgets);
    updateCurrentView(newWidgets);
  };

  const updateCurrentView = (newWidgets: Widget[]) => {
    const updatedViews = savedViews.map(view => 
      view.id === activeViewId ? { ...view, widgets: newWidgets } : view
    );
    setSavedViews(updatedViews);
    saveViews(updatedViews);
  };

  const switchView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view) {
      setActiveViewId(viewId);
      setWidgets(view.widgets);
      localStorage.setItem(activeViewKey, viewId);
    }
  };

  const createNewView = () => {
    if (!newViewName.trim()) return;
    
    const newView: DashboardView = {
      id: Date.now().toString(),
      name: newViewName.trim(),
      widgets: [...DEFAULT_WIDGETS],
    };
    
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    saveViews(updatedViews);
    setActiveViewId(newView.id);
    setWidgets(newView.widgets);
    localStorage.setItem(activeViewKey, newView.id);
    setIsCreatingView(false);
    setNewViewName("");
  };

  const deleteView = (viewId: string) => {
    if (viewId === "overview") return;
    
    const updatedViews = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updatedViews);
    saveViews(updatedViews);
    
    if (activeViewId === viewId) {
      setActiveViewId("overview");
      const overview = updatedViews.find(v => v.id === "overview");
      setWidgets(overview?.widgets || DEFAULT_WIDGETS);
      localStorage.setItem(activeViewKey, "overview");
    }
  };

  const activeView = savedViews.find(v => v.id === activeViewId);
  const availableWidgets = getAvailableBusinessWidgets();
  const addedWidgetTypes = new Set(widgets.map(w => w.type));

  const getBackgroundStyle = () => {
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

  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  };

  return (
    <div className="flex flex-col h-full" data-testid="business-overview">
      {/* Row 1 - Business Info Header (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold" data-testid="text-company-name">
            {company?.name || "Business Overview"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsThemeSettingsOpen(true)}
            data-testid="button-theme-settings"
          >
            <Palette className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Row 2 - View Controls (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" data-testid="view-selector">
                {activeView?.name || "Overview"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Saved Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedViews.map(view => (
                <DropdownMenuItem 
                  key={view.id} 
                  onClick={() => switchView(view.id)}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    {activeViewId === view.id && <Check className="h-4 w-4" />}
                    {view.name}
                  </span>
                  {view.id !== "overview" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteView(view.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsCreatingView(true)}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Create New View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button size="sm" className="h-7" onClick={() => setIsAddingWidget(true)} data-testid="add-widget-button">
          <Plus className="h-3 w-3 mr-1" />
          Add Widget
        </Button>
      </div>

      {/* Widget Grid with Theme Background */}
      <div 
        className="flex-1 overflow-auto relative"
        style={getBackgroundStyle()}
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
            <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-8 gap-4">
                {widgets.map(widget => (
                  <SortableWidget
                    key={widget.id}
                    widget={widget}
                    onUpdate={handleWidgetUpdate}
                    onRemove={handleWidgetRemove}
                    isConfiguring={configuringWidget === widget.id}
                    onConfigure={setConfiguringWidget}
                    themeStyle={getWidgetStyle()}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Widget</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
            {availableWidgets.map(def => {
              const isAdded = addedWidgetTypes.has(def.type);
              return (
                <div
                  key={def.type}
                  className={`p-3 border rounded-md cursor-pointer ${
                    isAdded ? 'opacity-50 cursor-not-allowed' : 'hover-elevate'
                  }`}
                  onClick={() => !isAdded && handleAddWidget(def.type)}
                  data-testid={`add-widget-${def.type}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <def.icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{def.name}</span>
                    {isAdded && (
                      <Badge variant="secondary" className="text-[10px] ml-auto">Added</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{def.description}</p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreatingView} onOpenChange={setIsCreatingView}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name..."
                data-testid="new-view-name-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreatingView(false)}>
              Cancel
            </Button>
            <Button onClick={createNewView} disabled={!newViewName.trim()} data-testid="create-view-button">
              Create View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DashboardThemeSettings
        open={isThemeSettingsOpen}
        onOpenChange={setIsThemeSettingsOpen}
        dashboardType="business"
      />
    </div>
  );
}
