import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Settings,
  Palette,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PersonalWidgetContainer from "./widgets/PersonalWidgetContainer";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserOverviewProps {
  user: User;
  isOwnPage: boolean;
  currentUserId?: string;
}

interface UserWorkspaceView {
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

function SortableWidget({
  widget,
  onUpdate,
  onRemove,
  onConfigure,
  userId,
  themeStyle,
}: {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  onRemove: (id: string) => void;
  onConfigure: (id: string | null) => void;
  userId?: string;
  themeStyle?: { className: string; style?: React.CSSProperties };
}) {
  const [isResizing, setIsResizing] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id, disabled: isResizing });

  const definition = getPersonalWidgetDefinition(widget.type);
  if (!definition) return null;

  const WidgetComponent = definition.component;

  const sizeClasses: Record<string, string> = {
    sm: "col-span-2",
    md: "col-span-4",
    lg: "col-span-6",
    xl: "col-span-8",
  };

  const colSpanMap: Record<number, string> = {
    1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
    5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
  };

  const cols = widget.dimensions?.columns ?? definition.defaultColumns;
  const colSpanClass = (cols && colSpanMap[cols]) || sizeClasses[widget.size];

  const handleResizeEnd = (columns: number, height: number) => {
    onUpdate({ ...widget, dimensions: { columns, height } });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? "none" : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={colSpanClass}>
      <PersonalWidgetContainer
        title={widget.title}
        icon={<definition.icon className="h-3.5 w-3.5" />}
        accent={definition.accent}
        onRemove={() => onRemove(widget.id)}
        onConfigure={definition.configurable ? () => onConfigure(widget.id) : undefined}
        dragHandleProps={{ ...attributes, ...listeners }}
        onResizeEnd={handleResizeEnd}
        dimensions={
          widget.dimensions ?? {
            columns: definition.defaultColumns,
            height: definition.defaultRowSpan ? definition.defaultRowSpan * 120 : undefined,
          }
        }
        isResizing={isResizing}
        setIsResizing={setIsResizing}
        themeClassName={themeStyle?.className}
        themeStyleOverride={themeStyle?.style}
      >
        <WidgetComponent
          widget={widget}
          onUpdate={onUpdate}
          onRemove={onRemove}
          isConfiguring={false}
          onCloseConfig={() => onConfigure(null)}
          userId={userId}
        />
      </PersonalWidgetContainer>
    </div>
  );
}

export default function UserOverview({ user, isOwnPage, currentUserId }: UserOverviewProps) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  const initializedRef = useRef(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/user"],
  });

  // Server-side persisted layout (one row per user)
  const viewQueryKey = useMemo(
    () => ["/api/user-workspace/views", user.id] as const,
    [user.id],
  );
  const { data: serverView, isLoading: isLoadingView } = useQuery<UserWorkspaceView | null>({
    queryKey: viewQueryKey,
    enabled: isOwnPage,
  });

  const saveMutation = useMutation({
    mutationFn: async (next: Widget[]) => {
      return apiRequest(`/api/user-workspace/views/${user.id}`, "POST", {
        name: "Overview",
        widgets: next,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: viewQueryKey });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save layout",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Load from server, with one-time localStorage migration
  useEffect(() => {
    if (!isOwnPage || isLoadingView || initializedRef.current) return;

    // Any existing server row is authoritative — including an intentionally empty layout
    if (serverView && Array.isArray(serverView.widgets)) {
      setWidgets(serverView.widgets as Widget[]);
      initializedRef.current = true;
      return;
    }

    // No server doc — try one-time migration from localStorage
    const legacyKey = `user-workspace-widgets-${user.id}`;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as Widget[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
          saveMutation.mutate(parsed, {
            onSuccess: () => {
              localStorage.removeItem(legacyKey);
              localStorage.removeItem(`user-workspace-views-${user.id}`);
              localStorage.removeItem(`user-workspace-active-view-${user.id}`);
            },
          });
          initializedRef.current = true;
          return;
        }
      } catch {
        // fall through to defaults
      }
    }

    // Truly empty — seed with defaults & persist
    setWidgets(DEFAULT_WIDGETS);
    saveMutation.mutate(DEFAULT_WIDGETS);
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnPage, isLoadingView, serverView, user.id]);

  const persist = (next: Widget[]) => {
    setWidgets(next);
    if (isOwnPage) saveMutation.mutate(next);
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
    persist([...widgets, newWidget]);
    setIsAddingWidget(false);
  };

  const removeWidget = (widgetId: string) => persist(widgets.filter(w => w.id !== widgetId));

  const updateWidget = (updated: Widget) => {
    persist(widgets.map(w => (w.id === updated.id ? updated : w)));
    if (configuringWidget === updated.id) setConfiguringWidget(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets(prev => {
      const oldIndex = prev.findIndex(w => w.id === active.id);
      const newIndex = prev.findIndex(w => w.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      if (isOwnPage) saveMutation.mutate(next);
      return next;
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getThemeBackground = (): React.CSSProperties => {
    if (!theme) return {};
    if (theme.backgroundType === "color" && theme.backgroundColor) return { backgroundColor: theme.backgroundColor };
    if (theme.backgroundType === "gradient" && theme.backgroundGradient) return { background: theme.backgroundGradient };
    if (theme.backgroundType === "image" && theme.backgroundImage) {
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
      return { className: "backdrop-blur-sm", style: { backgroundColor: `hsl(var(--card) / ${opacity * 0.8})` } };
    }
    if (theme.widgetBackgroundType === "transparent") {
      return { className: "border-white/20", style: { backgroundColor: "transparent" } };
    }
    if (opacity < 1) return { className: "", style: { backgroundColor: `hsl(var(--card) / ${opacity})` } };
    return { className: "" };
  };

  return (
    <div className="flex flex-col h-full px-4 pt-2" data-testid="user-overview" style={getThemeBackground()}>
      <div className="h-8 flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isOwnPage ? `${getGreeting()}, ${user.firstName || "there"}` : `${user.firstName}'s workspace`}
          </span>
          {saveMutation.isPending && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isOwnPage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
                  data-testid="button-add-widget"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Widget</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem className="text-xs flex items-center gap-2" onClick={() => setIsAddingWidget(true)}>
                  <Plus className="w-3 h-3" />
                  <span>Add Widget</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs flex items-center gap-2" onClick={() => setIsThemeSettingsOpen(true)}>
                  <Palette className="w-3 h-3" />
                  <span>Theme Settings</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {widgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  onUpdate={updateWidget}
                  onRemove={removeWidget}
                  onConfigure={setConfiguringWidget}
                  userId={currentUserId}
                  themeStyle={getWidgetStyle()}
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
                        {isOwnPage && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAddingWidget(true)}
                            data-testid="button-add-first-widget"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Widget
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

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
                  <definition.icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">{definition.name}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{definition.description}</p>
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
