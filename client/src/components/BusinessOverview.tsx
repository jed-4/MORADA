import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Settings, 
  SlidersHorizontal,
  ChevronDown, 
  MoreHorizontal,
  Check, 
  PlusCircle,
  Trash2,
  GripVertical,
  X,
  Building2,
  Palette,
  Pencil,
  Users,
  Lock,
  Globe,
  Shield,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type KPIPeriod } from "./business-widgets/kpiDefinitions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Widget } from "@/types/widgets";
import type { UserRole, User } from "@shared/schema";
import { 
  businessWidgetRegistry, 
  getBusinessWidgetDefinition,
  getAvailableBusinessWidgets 
} from "./business-widgets/BusinessWidgetRegistry";
import BusinessWidgetContainer from "./business-widgets/BusinessWidgetContainer";
import {
  BusinessFinancialsPeriodBadge,
  BusinessFinancialsMenuItems,
} from "./business-widgets/BusinessFinancialsWidget";
import {
  BusinessPnLHeaderExtra,
  BusinessPnLMenuItems,
} from "./business-widgets/BusinessPnLWidget";
import { BusinessRevenuePeriodTabs } from "./business-widgets/BusinessRevenueWidget";
import { BusinessCashFlowViewToggle } from "./business-widgets/BusinessCashFlowWidget";
import DashboardThemeSettings from "./DashboardThemeSettings";
import { useAuth } from "@/hooks/use-auth";
import { useFinancialPermission, usePermission } from "@/hooks/use-permission";
import type { DashboardTheme, Company, BusinessDashboardView } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
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

const DEFAULT_WIDGETS: Widget[] = [
  { id: "1", type: "businessKPIs", title: "Business KPIs", size: "xl", dimensions: { columns: 8 } },
  { id: "2", type: "businessQuickActions", title: "Quick Actions", size: "sm", dimensions: { columns: 2 } },
  { id: "3", type: "businessActivity", title: "Recent Activity", size: "md", dimensions: { columns: 3 } },
  { id: "4", type: "businessAlerts", title: "Alerts & Reminders", size: "md", dimensions: { columns: 3 } },
  { id: "5", type: "businessProjects", title: "Active Projects", size: "lg", dimensions: { columns: 4 } },
  { id: "6", type: "businessFinancials", title: "Financial Summary", size: "md", dimensions: { columns: 4 } },
  { id: "7", type: "businessTimesheets", title: "Timesheets", size: "md", dimensions: { columns: 4 } },
];

function BusinessKpisPeriodTabs({
  widget,
  onUpdate,
}: {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
}) {
  const period = ((widget.config?.period as KPIPeriod) || "month") as KPIPeriod;
  const setPeriod = (p: KPIPeriod) => {
    onUpdate({ ...widget, config: { ...(widget.config || {}), period: p } });
  };
  const options: { value: KPIPeriod; label: string; aria: string }[] = [
    { value: "month", label: "M", aria: "Month" },
    { value: "quarter", label: "Q", aria: "Quarter" },
    { value: "year", label: "Y", aria: "Year" },
  ];
  return (
    <div className="flex items-center gap-1" data-testid="kpi-period-tabs">
      {options.map((o) => {
        const active = period === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setPeriod(o.value)}
            aria-label={o.aria}
            title={o.aria}
            className={cn(
              "text-[12px] transition-colors pb-0.5 w-5 text-center",
              active
                ? "text-bp-purple font-medium border-b-2 border-bp-purple"
                : "text-bp-muted hover:text-bp-card-foreground",
            )}
            data-testid={`kpi-period-${o.value}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BusinessKpisMenuItems({
  widget,
  onUpdate,
  onOpenEdit,
}: {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  onOpenEdit: () => void;
}) {
  const columns = ([1, 2, 3, 4].includes(widget.config?.columns)
    ? widget.config!.columns
    : 4) as 1 | 2 | 3 | 4;
  const setColumns = (n: 1 | 2 | 3 | 4) => {
    onUpdate({ ...widget, config: { ...(widget.config || {}), columns: n } });
  };
  return (
    <>
      <DropdownMenuItem onClick={onOpenEdit} data-testid="kpi-menu-edit">
        <Pencil className="h-3.5 w-3.5 mr-2" />
        Edit KPIs
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="kpi-menu-columns">
          Columns
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {([1, 2, 3, 4] as const).map((n) => (
            <DropdownMenuItem
              key={n}
              onClick={() => setColumns(n)}
              data-testid={`kpi-menu-columns-${n}`}
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5 mr-2",
                  columns === n ? "opacity-100" : "opacity-0",
                )}
              />
              {n}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

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
  const hasFinancialAccess = useFinancialPermission();
  const definitionForPerm = getBusinessWidgetDefinition(widget.type);
  const reqPerm = definitionForPerm?.requiredPermission;
  const hasSpecificPermission = usePermission(
    reqPerm?.key ?? "__noop__",
    reqPerm?.action ?? "view",
  );

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
  const isLocked = definition.requiredPermission
    ? !hasSpecificPermission
    : !!definition.financialGated && !hasFinancialAccess;

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
        onConfigure={
          widget.type === "businessKPIs"
            ? undefined
            : definition.configurable
            ? () => onConfigure(widget.id)
            : undefined
        }
        dragHandleProps={{ ...attributes, ...listeners }}
        onResizeEnd={handleResizeEnd}
        dimensions={widget.dimensions}
        isResizing={isResizing}
        setIsResizing={setIsResizing}
        themeClassName={themeStyle?.className}
        themeStyleOverride={themeStyle?.style}
        accent={definition.accent}
        locked={isLocked}
        headerExtra={
          widget.type === "businessKPIs" ? (
            <BusinessKpisPeriodTabs widget={widget} onUpdate={onUpdate} />
          ) : widget.type === "businessFinancials" ? (
            <BusinessFinancialsPeriodBadge widget={widget} />
          ) : widget.type === "businessPnL" ? (
            <BusinessPnLHeaderExtra widget={widget} onUpdate={onUpdate} />
          ) : widget.type === "businessRevenue" ? (
            <BusinessRevenuePeriodTabs widget={widget} onUpdate={onUpdate} />
          ) : widget.type === "businessCashFlow" && hasFinancialAccess ? (
            <BusinessCashFlowViewToggle
              widget={widget}
              onUpdate={(updates) => onUpdate({ ...widget, ...updates })}
            />
          ) : undefined
        }
        extraMenuItems={
          widget.type === "businessKPIs" ? (
            <BusinessKpisMenuItems
              widget={widget}
              onUpdate={onUpdate}
              onOpenEdit={() => onConfigure(widget.id)}
            />
          ) : widget.type === "businessFinancials" ? (
            <BusinessFinancialsMenuItems widget={widget} onUpdate={onUpdate} />
          ) : widget.type === "businessPnL" ? (
            <BusinessPnLMenuItems widget={widget} onUpdate={onUpdate} />
          ) : undefined
        }
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
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);
  const [isCreatingView, setIsCreatingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const findSlot = () => {
      const el = document.getElementById("business-toolbar-slot");
      setToolbarSlot(el);
    };
    findSlot();
    const id = window.setTimeout(findSlot, 0);
    return () => window.clearTimeout(id);
  }, []);
  const [editingView, setEditingView] = useState<BusinessDashboardView | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [editVisibility, setEditVisibility] = useState<"everyone" | "roles" | "users" | "private">("everyone");
  const [editAllowedRoleIds, setEditAllowedRoleIds] = useState<string[]>([]);
  const [editAllowedUserIds, setEditAllowedUserIds] = useState<string[]>([]);

  const { data: company } = useQuery<Company>({
    queryKey: [`/api/companies/${user?.companyId}`],
    enabled: !!user?.companyId,
  });

  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ["/api/dashboard-themes/business"],
  });

  // Fetch views from database
  const { data: savedViews = [], isLoading: viewsLoading } = useQuery<BusinessDashboardView[]>({
    queryKey: ["/api/business-dashboard-views"],
  });

  // Fetch roles and users for access control
  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Active view key for localStorage (just stores which view is selected)
  const activeViewKey = `business-dashboard-active-view-${user?.id || 'default'}`;

  // Initialize active view when views are loaded
  useEffect(() => {
    if (savedViews.length > 0 && !activeViewId) {
      const storedActiveId = localStorage.getItem(activeViewKey);
      const storedView = storedActiveId ? savedViews.find(v => v.id === storedActiveId) : null;
      const defaultView = savedViews.find(v => v.isDefault) || savedViews[0];
      const viewToUse = storedView || defaultView;
      
      if (viewToUse) {
        setActiveViewId(viewToUse.id);
        setWidgets((viewToUse.widgets as Widget[]) || DEFAULT_WIDGETS);
      }
    }
  }, [savedViews, activeViewId]);

  // Mutation to update a view
  const updateViewMutation = useMutation({
    mutationFn: async ({ viewId, updates }: { viewId: string; updates: Partial<BusinessDashboardView> }) => {
      return apiRequest(`/api/business-dashboard-views/${viewId}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-dashboard-views"] });
    },
    onError: (error) => {
      toast({ title: "Failed to save changes", variant: "destructive" });
      console.error("Failed to update view:", error);
    },
  });

  // Mutation to create a view
  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; widgets: Widget[] }) => {
      return apiRequest("/api/business-dashboard-views", "POST", {
        name: data.name,
        widgets: data.widgets,
        visibility: "everyone",
        displayOrder: savedViews.length,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-dashboard-views"] });
      setActiveViewId(newView.id);
      setWidgets((newView.widgets as Widget[]) || DEFAULT_WIDGETS);
      localStorage.setItem(activeViewKey, newView.id);
      setIsCreatingView(false);
      setNewViewName("");
      toast({ title: "View created successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to create view", variant: "destructive" });
      console.error("Failed to create view:", error);
    },
  });

  // Mutation to delete a view
  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      return apiRequest(`/api/business-dashboard-views/${viewId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-dashboard-views"] });
      toast({ title: "View deleted" });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to delete view";
      toast({ title: message, variant: "destructive" });
    },
  });

  const handleWidgetUpdate = (updatedWidget: Widget) => {
    const newWidgets = widgets.map(w => 
      w.id === updatedWidget.id ? updatedWidget : w
    );
    setWidgets(newWidgets);
    updateCurrentView(newWidgets);
  };

  const handleWidgetRemove = (widgetId: string) => {
    const newWidgets = widgets.filter(w => w.id !== widgetId);
    setWidgets(newWidgets);
    updateCurrentView(newWidgets);
  };

  const handleAddWidget = (type: string) => {
    const definition = getBusinessWidgetDefinition(type);
    if (!definition) return;

    const fallbackColumns =
      definition.defaultSize === 'xl' ? 8 :
      definition.defaultSize === 'lg' ? 6 :
      definition.defaultSize === 'md' ? 4 : 2;

    const newWidget: Widget = {
      id: Date.now().toString(),
      type,
      title: definition.name,
      size: definition.defaultSize,
      dimensions: {
        columns: definition.defaultColumns ?? fallbackColumns,
        ...(definition.defaultRowSpan ? { height: definition.defaultRowSpan * 120 } : {}),
      },
    };

    const newWidgets = [...widgets, newWidget];
    setWidgets(newWidgets);
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
    updateCurrentView(newWidgets);
  };

  const updateCurrentView = (newWidgets: Widget[]) => {
    if (!activeViewId) return;
    updateViewMutation.mutate({ viewId: activeViewId, updates: { widgets: newWidgets } });
  };

  const switchView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view) {
      setActiveViewId(viewId);
      setWidgets((view.widgets as Widget[]) || DEFAULT_WIDGETS);
      localStorage.setItem(activeViewKey, viewId);
    }
  };

  const createNewView = () => {
    if (!newViewName.trim()) return;
    createViewMutation.mutate({
      name: newViewName.trim(),
      widgets: [...DEFAULT_WIDGETS],
    });
  };

  const createEmptyView = () => {
    const baseName = "New View";
    const existing = new Set(savedViews.map(v => v.name));
    let n = savedViews.length + 1;
    let name = `${baseName} ${n}`;
    while (existing.has(name)) {
      n++;
      name = `${baseName} ${n}`;
    }
    createViewMutation.mutate({ name, widgets: [] });
  };

  const deleteView = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (!view || view.isDefault) {
      toast({ title: "Cannot delete the default view", variant: "destructive" });
      return;
    }
    
    deleteViewMutation.mutate(viewId);
    
    if (activeViewId === viewId) {
      const defaultView = savedViews.find(v => v.isDefault) || savedViews.find(v => v.id !== viewId);
      if (defaultView) {
        setActiveViewId(defaultView.id);
        setWidgets((defaultView.widgets as Widget[]) || DEFAULT_WIDGETS);
        localStorage.setItem(activeViewKey, defaultView.id);
      }
    }
  };

  const openEditView = (view: BusinessDashboardView) => {
    setEditingView(view);
    setEditViewName(view.name);
    setEditVisibility((view.visibility as "everyone" | "roles" | "users" | "private") || "everyone");
    setEditAllowedRoleIds(view.allowedRoleIds || []);
    setEditAllowedUserIds(view.allowedUserIds || []);
  };

  const closeEditView = () => {
    setEditingView(null);
    setEditViewName("");
    setEditVisibility("everyone");
    setEditAllowedRoleIds([]);
    setEditAllowedUserIds([]);
  };

  const saveEditView = () => {
    if (!editingView || !editViewName.trim()) return;
    
    const updates: Partial<BusinessDashboardView> = {
      name: editViewName.trim(),
      visibility: editVisibility,
      allowedRoleIds: editVisibility === "roles" ? editAllowedRoleIds : null,
      allowedUserIds: editVisibility === "users" ? editAllowedUserIds : null,
    };
    
    updateViewMutation.mutate(
      { viewId: editingView.id, updates },
      {
        onSuccess: () => {
          toast({ title: "View updated successfully" });
          closeEditView();
        },
      }
    );
  };

  const canEditView = (view: BusinessDashboardView) => {
    if (!user) return false;
    if (view.createdById === user.id) return true;
    // Admins can edit any view
    return true; // The server will validate permissions
  };

  const activeView = savedViews.find(v => v.id === activeViewId);
  const availableWidgets = getAvailableBusinessWidgets();
  const addedWidgetTypes = new Set(
    widgets
      .filter(w => !getBusinessWidgetDefinition(w.type)?.multiInstance)
      .map(w => w.type)
  );

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

  // Show loading state while views are loading
  const isInitializing = viewsLoading || (savedViews.length > 0 && !activeViewId);

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full items-center justify-center" data-testid="business-overview-loading">
        <div className="text-muted-foreground text-sm">Loading dashboard...</div>
      </div>
    );
  }

  const toolbar = (
    <>
        <div className="flex items-center gap-1 mr-1 max-w-[60vw] overflow-x-auto self-stretch">
          {savedViews.map((view) => {
            const isActive = view.id === activeViewId;
            const VisIcon =
              view.visibility === "private" ? Lock :
              view.visibility === "roles" ? Shield :
              view.visibility === "users" ? Users : null;
            return (
              <div key={view.id} className="relative group flex items-center flex-shrink-0 self-stretch">
                <button
                  type="button"
                  onClick={() => switchView(view.id)}
                  className={`relative h-full px-2 text-xs flex items-center gap-1.5 transition-colors bg-transparent border-0 ${
                    isActive
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground font-medium'
                  }`}
                  data-testid={`tab-view-${view.id}`}
                >
                  {VisIcon && <VisIcon className="w-3 h-3 text-muted-foreground" />}
                  <span className="truncate max-w-[140px]">{view.name}</span>
                  {isActive && (
                    <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
                {isActive && (canEditView(view) || !view.isDefault) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-6 w-5 flex items-center justify-center rounded-md hover-elevate active-elevate-2 ml-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        data-testid={`view-menu-${view.id}`}
                        aria-label="View options"
                      >
                        <MoreHorizontal className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      {canEditView(view) && (
                        <DropdownMenuItem
                          className="text-xs flex items-center gap-2"
                          onClick={() => openEditView(view)}
                          data-testid={`edit-view-${view.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                      )}
                      {!view.isDefault && (
                        <DropdownMenuItem
                          className="text-xs flex items-center gap-2 text-destructive focus:text-destructive"
                          onClick={() => deleteView(view.id)}
                          data-testid={`delete-view-${view.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={createEmptyView}
              disabled={createViewMutation.isPending}
              className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2 disabled:opacity-50"
              data-testid="button-new-view"
              aria-label="New view"
            >
              <Plus className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">New view</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-dashboard-settings"
                  aria-label="Customize dashboard"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Customize dashboard</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="text-xs flex items-center gap-2"
              onClick={() => setIsAddingWidget(true)}
              data-testid="menu-add-widget"
            >
              <Plus className="w-3 h-3" />
              <span>Add Widget</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs flex items-center gap-2"
              onClick={() => setIsThemeSettingsOpen(true)}
              data-testid="menu-theme-settings"
            >
              <Palette className="w-3 h-3" />
              <span>Theme Settings</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
    </>
  );

  return (
    <div className="flex flex-col h-full px-4 pt-2" data-testid="business-overview">
      {toolbarSlot && createPortal(toolbar, toolbarSlot)}

      {/* Widget Grid with Theme Background */}
      <div 
        className="flex-1 overflow-auto rounded-lg relative"
        style={getBackgroundStyle()}
      >
        {/* Overlay for image backgrounds */}
        {theme?.backgroundType === "image" && theme.overlayEnabled && (
          <div 
            className="absolute inset-0 pointer-events-none rounded-lg"
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
                      <Badge variant="secondary" className="text-data ml-auto">Added</Badge>
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

      {/* Edit View Dialog */}
      <Dialog open={!!editingView} onOpenChange={(open) => !open && closeEditView()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                value={editViewName}
                onChange={(e) => setEditViewName(e.target.value)}
                placeholder="Enter view name..."
                data-testid="edit-view-name-input"
              />
            </div>

            <div className="space-y-3">
              <Label>Who can view this?</Label>
              <RadioGroup 
                value={editVisibility} 
                onValueChange={(value) => setEditVisibility(value as typeof editVisibility)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-3 p-2 rounded-md border hover-elevate cursor-pointer">
                  <RadioGroupItem value="everyone" id="visibility-everyone" />
                  <Label htmlFor="visibility-everyone" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Everyone</div>
                      <div className="text-xs text-muted-foreground">All team members can see this view</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 p-2 rounded-md border hover-elevate cursor-pointer">
                  <RadioGroupItem value="roles" id="visibility-roles" />
                  <Label htmlFor="visibility-roles" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Specific Roles</div>
                      <div className="text-xs text-muted-foreground">Only selected roles can see this view</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 p-2 rounded-md border hover-elevate cursor-pointer">
                  <RadioGroupItem value="users" id="visibility-users" />
                  <Label htmlFor="visibility-users" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Specific Users</div>
                      <div className="text-xs text-muted-foreground">Only selected users can see this view</div>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 p-2 rounded-md border hover-elevate cursor-pointer">
                  <RadioGroupItem value="private" id="visibility-private" />
                  <Label htmlFor="visibility-private" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">Private</div>
                      <div className="text-xs text-muted-foreground">Only you can see this view</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {editVisibility === "roles" && (
              <div className="space-y-2">
                <Label>Select Roles</Label>
                <ScrollArea className="h-32 border rounded-md p-2">
                  <div className="space-y-2">
                    {roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={editAllowedRoleIds.includes(role.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditAllowedRoleIds([...editAllowedRoleIds, role.id]);
                            } else {
                              setEditAllowedRoleIds(editAllowedRoleIds.filter(id => id !== role.id));
                            }
                          }}
                        />
                        <span className="text-sm">{role.name}</span>
                      </label>
                    ))}
                    {roles.length === 0 && (
                      <div className="text-xs text-muted-foreground">No roles available</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {editVisibility === "users" && (
              <div className="space-y-2">
                <Label>Select Users</Label>
                <ScrollArea className="h-32 border rounded-md p-2">
                  <div className="space-y-2">
                    {users.filter(u => u.id !== user?.id).map((u) => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={editAllowedUserIds.includes(u.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditAllowedUserIds([...editAllowedUserIds, u.id]);
                            } else {
                              setEditAllowedUserIds(editAllowedUserIds.filter(id => id !== u.id));
                            }
                          }}
                        />
                        <span className="text-sm">{u.firstName} {u.lastName || ''}</span>
                      </label>
                    ))}
                    {users.filter(u => u.id !== user?.id).length === 0 && (
                      <div className="text-xs text-muted-foreground">No other users available</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditView}>
              Cancel
            </Button>
            <Button 
              onClick={saveEditView} 
              disabled={!editViewName.trim() || updateViewMutation.isPending}
              data-testid="save-view-button"
            >
              {updateViewMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
