import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Settings, 
  ChevronDown, 
  Check, 
  PlusCircle,
  Trash2,
  GripVertical,
  X,
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
} from "@/components/ui/dialog";
import type { User, DashboardTheme } from "@shared/schema";
import type { Widget } from "@/types/widgets";
import DashboardThemeSettings from "../DashboardThemeSettings";
import { personalWidgetRegistry, getPersonalWidgetDefinition } from "./widgets/PersonalWidgetRegistry";
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
import PersonalWidgetContainer from "./widgets/PersonalWidgetContainer";

interface UserOverviewProps {
  user: User;
  isOwnPage: boolean;
  currentUserId?: string;
}

interface DashboardView {
  id: string;
  name: string;
  widgets: Widget[];
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: "1", type: "myDay", title: "My Day", size: "md" },
  { id: "2", type: "personalQuickActions", title: "Quick Actions", size: "sm" },
  { id: "3", type: "personalTasks", title: "My Tasks", size: "md" },
  { id: "4", type: "personalReminders", title: "My Reminders", size: "md" },
  { id: "5", type: "crossProjectDeadlines", title: "Upcoming Deadlines", size: "md" },
  { id: "6", type: "personalMemos", title: "My Memos", size: "md" },
  { id: "7", type: "personalCalendar", title: "My Calendar", size: "md" },
  { id: "8", type: "personalAISummary", title: "AI Summary", size: "md" },
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
  userId
}: { 
  widget: Widget; 
  onUpdate: (widget: Widget) => void;
  onRemove: (id: string) => void;
  isConfiguring: boolean;
  onConfigure: (id: string | null) => void;
  userId?: string;
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

  const definition = getPersonalWidgetDefinition(widget.type);
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
      <PersonalWidgetContainer
        title={widget.title}
        icon={<definition.icon className="h-3.5 w-3.5" />}
        onRemove={() => onRemove(widget.id)}
        onConfigure={definition.configurable ? () => onConfigure(widget.id) : undefined}
        dragHandleProps={{ ...attributes, ...listeners }}
        onResizeEnd={handleResizeEnd}
        dimensions={widget.dimensions}
        isResizing={isResizing}
        setIsResizing={setIsResizing}
      >
        <WidgetComponent
          widget={widget}
          onUpdate={onUpdate}
          onRemove={onRemove}
          isConfiguring={isConfiguring}
          onCloseConfig={() => onConfigure(null)}
          userId={userId}
        />
      </PersonalWidgetContainer>
    </div>
  );
}

export default function UserOverview({ user, isOwnPage, currentUserId }: UserOverviewProps) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [savedViews, setSavedViews] = useState<DashboardView[]>([DEFAULT_VIEW]);
  const [activeViewId, setActiveViewId] = useState("overview");
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [isCreatingView, setIsCreatingView] = useState(false);
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

  // Fetch user dashboard theme
  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/user"],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const storageKey = `user-workspace-widgets-${user.id}`;
  const viewsStorageKey = `user-workspace-views-${user.id}`;
  const activeViewKey = `user-workspace-active-view-${user.id}`;

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
  }, [user.id]);

  const saveWidgets = (newWidgets: Widget[]) => {
    localStorage.setItem(storageKey, JSON.stringify(newWidgets));
    const updatedViews = savedViews.map(v => 
      v.id === activeViewId ? { ...v, widgets: newWidgets } : v
    );
    setSavedViews(updatedViews);
    localStorage.setItem(viewsStorageKey, JSON.stringify(updatedViews));
  };

  const saveViews = (views: DashboardView[]) => {
    localStorage.setItem(viewsStorageKey, JSON.stringify(views));
  };

  const activeView = savedViews.find(v => v.id === activeViewId);

  const switchToView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view) {
      setActiveViewId(viewId);
      setWidgets(view.widgets);
      localStorage.setItem(activeViewKey, viewId);
    }
  };

  const createNewView = () => {
    if (isCreatingView) return;
    setIsCreatingView(true);
    
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
    localStorage.setItem(activeViewKey, newViewId);
    
    setTimeout(() => setIsCreatingView(false), 500);
  };

  const deleteView = (viewId: string) => {
    if (savedViews.length <= 1) return;
    if (viewId === "overview") return;
    const updatedViews = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updatedViews);
    saveViews(updatedViews);
    
    if (activeViewId === viewId) {
      const newActiveView = updatedViews[0];
      setActiveViewId(newActiveView.id);
      setWidgets(newActiveView.widgets);
      localStorage.setItem(activeViewKey, newActiveView.id);
    }
  };

  const addWidget = (type: string) => {
    const definition = getPersonalWidgetDefinition(type);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setWidgets((widgets) => {
      const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
      const newIndex = widgets.findIndex((widget) => widget.id === over.id);
      const newWidgets = arrayMove(widgets, oldIndex, newIndex);
      saveWidgets(newWidgets);
      return newWidgets;
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

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

  return (
    <div className="flex flex-col h-full" data-testid="user-overview">
      {/* Header with view switcher */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
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
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Dashboard Views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedViews.map((view) => (
                <DropdownMenuItem 
                  key={view.id}
                  className="text-xs flex items-center justify-between gap-2 group"
                  onSelect={(e) => e.preventDefault()}
                >
                  <button
                    className="flex-1 text-left flex items-center gap-2"
                    onClick={() => switchToView(view.id)}
                  >
                    <span className="flex-1 truncate">{view.name}</span>
                    {view.id === activeViewId && (
                      <Check className="w-3 h-3 text-[#bba7db] flex-shrink-0" />
                    )}
                  </button>
                  {savedViews.length > 1 && view.id !== "overview" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteView(view.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-opacity"
                      data-testid={`button-delete-view-${view.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <span className="text-xs text-muted-foreground">
            {isOwnPage ? `${getGreeting()}, ${user.firstName || 'there'}` : `${user.firstName}'s workspace`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 ${
              isCreatingView 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover-elevate active-elevate-2'
            }`}
            onClick={createNewView}
            disabled={isCreatingView}
            data-testid="button-new-view"
          >
            <PlusCircle className="w-3 h-3" />
            <span>{isCreatingView ? 'Creating...' : 'New View'}</span>
          </button>
          
          {isOwnPage && (
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
        </div>
      </div>

      {/* Widgets Area with Theme Background */}
      <div 
        className="flex-1 overflow-auto relative"
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
              {widgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  onUpdate={updateWidget}
                  onRemove={removeWidget}
                  isConfiguring={configuringWidget === widget.id}
                  onConfigure={setConfiguringWidget}
                  userId={currentUserId}
                />
              ))}
              
              {widgets.length === 0 && (
                <div className="col-span-full">
                  <Card className="border-dashed border-2 border-primary/20 bg-card/80">
                    <CardContent className="p-8 text-center">
                      <div className="space-y-3">
                        <div className="text-muted-foreground">
                          <p className="text-sm">Your workspace is empty</p>
                          <p className="text-xs">Add widgets to customize your dashboard</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAddingWidget(true)}
                          data-testid="button-add-first-widget"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Widget
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

      {/* Add Widget Dialog */}
      <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Widget</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {Object.values(personalWidgetRegistry).map((definition) => (
              <button
                key={definition.type}
                onClick={() => addWidget(definition.type)}
                className="p-3 border rounded-md hover-elevate text-left"
                data-testid={`add-widget-${definition.type}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <definition.icon className="h-4 w-4 text-[#bba7db]" />
                  <span className="text-xs font-medium">{definition.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {definition.description}
                </p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <DashboardThemeSettings
        open={isThemeSettingsOpen}
        onOpenChange={setIsThemeSettingsOpen}
        dashboardType="user"
      />
    </div>
  );
}
