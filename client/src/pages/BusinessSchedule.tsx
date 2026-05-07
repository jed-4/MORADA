import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, ChevronLeft, ChevronRight, ExternalLink, Settings, MoreHorizontal, GanttChart, Users, Layers, CalendarDays, GripVertical } from "lucide-react";
import { TYPE_COLORS_HEX } from "@/lib/taskColors";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MasterScheduleGantt from "@/components/schedule/MasterScheduleGantt";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, differenceInDays, addDays, startOfWeek, startOfMonth, eachWeekOfInterval, eachMonthOfInterval, eachDayOfInterval, getISOWeek, endOfWeek, addWeeks } from "date-fns";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import CompanyWorkload from "./CompanyWorkload";

const ROW_HEIGHT = 40;
const ZOOM_LEVELS = { day: 30, week: 150, month: 600 };

interface BusinessProject {
  id: string;
  name: string;
  color: string;
  projectStatus: string;
  currentSystemPhase: string;
  scheduleStatus: string;
  isOnline: boolean;
  category: "online" | "offline" | "prospective";
  projectStartDate: string | null;
  projectEndDate: string | null;
  itemStartDate: string | null;
  itemEndDate: string | null;
  dateMode: string;
  customStartDate: string | null;
  customWeeks: number | null;
  isVisible: boolean;
  sortOrder: number;
  contractStartDate: string | null;
  contractEndDate: string | null;
  milestoneStartItemId: string | null;
  milestoneEndItemId: string | null;
  milestoneStartDate: string | null;
  milestoneEndDate: string | null;
}

function getProjectDates(project: BusinessProject): { start: Date | null; end: Date | null } {
  const mode = project.dateMode || "auto";

  if (mode === "custom") {
    if (project.customStartDate && project.customWeeks) {
      const start = new Date(project.customStartDate);
      const end = addWeeks(start, project.customWeeks);
      return { start, end };
    }
    return { start: null, end: null };
  }

  if (mode === "contract") {
    return {
      start: project.contractStartDate ? new Date(project.contractStartDate) : null,
      end: project.contractEndDate ? new Date(project.contractEndDate) : null,
    };
  }

  if (mode === "project") {
    return {
      start: project.projectStartDate ? new Date(project.projectStartDate) : null,
      end: project.projectEndDate ? new Date(project.projectEndDate) : null,
    };
  }

  if (mode === "milestone") {
    return {
      start: project.milestoneStartDate ? new Date(project.milestoneStartDate) : null,
      end: project.milestoneEndDate ? new Date(project.milestoneEndDate) : null,
    };
  }

  if (mode === "items") {
    return {
      start: project.itemStartDate ? new Date(project.itemStartDate) : null,
      end: project.itemEndDate ? new Date(project.itemEndDate) : null,
    };
  }

  // "auto" — hierarchy: project settings → selected milestone items → schedule item bounds
  // Applied independently per side so partial selections still work
  const effectiveStart =
    project.projectStartDate ? new Date(project.projectStartDate) :
    project.milestoneStartDate ? new Date(project.milestoneStartDate) :
    project.itemStartDate ? new Date(project.itemStartDate) : null;

  const effectiveEnd =
    project.projectEndDate ? new Date(project.projectEndDate) :
    project.milestoneEndDate ? new Date(project.milestoneEndDate) :
    project.itemEndDate ? new Date(project.itemEndDate) : null;

  return { start: effectiveStart, end: effectiveEnd };
}

interface WeekScheduleItem {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedToColor: string | null;
  assignedToContactType: string | null;
  parentItemId: string | null;
  type: string | null;
}

// Treat unassigned items and items assigned to a `team` contact as "company" work.
// Trade/supplier/client contacts are external. Legacy `company:*` ids and
// orphaned assignments (assignedToId set but the contact no longer exists, so
// the joined contactType comes back null) are also counted as company so that
// the row never silently appears empty when "Company only" is on.
function isCompanyItem(item: WeekScheduleItem): boolean {
  if (!item.assignedToId) return true;
  if (item.assignedToId.startsWith('company:')) return true;
  if (item.assignedToContactType === 'team') return true;
  if (item.assignedToContactType === null) return true;
  return false;
}

const WEEK_ITEM_H = 22;
const WEEK_ITEM_GAP = 3;
const WEEK_ROW_PAD = 6;

// Darken a hex color by mixing it toward black. Used for the company-item
// indicator chip so it reads as "same colour, just stronger".
function darkenHex(hex: string, amount = 0.35): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function ProjectWeekRow({ project, weekDays, todayStr, companyOnly, companyColor, onNavigate, dragHandleProps, items: providedItems }: {
  project: BusinessProject;
  weekDays: Date[];
  todayStr: string;
  companyOnly: boolean;
  companyColor: string;
  onNavigate: (id: string) => void;
  dragHandleProps?: { attributes: any; listeners: any };
  items?: WeekScheduleItem[];
}) {
  // When the parent already fetched items (Week view does this in bulk via
  // useQueries to know which rows to render), reuse them instead of firing a
  // duplicate query. React Query would dedupe by key anyway, but this is
  // clearer.
  const { data: fetchedItems = [] } = useQuery<WeekScheduleItem[]>({
    queryKey: ['/api/business-schedule/projects', project.id, 'schedule-items'],
    enabled: providedItems === undefined,
  });
  const items = providedItems ?? fetchedItems;

  // Show all items except group/summary headers (which have no meaningful date span of their own)
  const baseItems = items.filter(item => item.type !== 'group');
  const leafItems = companyOnly ? baseItems.filter(isCompanyItem) : baseItems;

  const maxPerDay = Math.max(1, ...weekDays.map(day => {
    return leafItems.filter(item => {
      if (!item.startDate || !item.endDate) return false;
      const s = new Date(item.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(item.endDate); e.setHours(23, 59, 59, 999);
      const d = new Date(day); d.setHours(12, 0, 0, 0);
      return d >= s && d <= e;
    }).length;
  }));
  const rowH = Math.max(ROW_HEIGHT + 8, maxPerDay * (WEEK_ITEM_H + WEEK_ITEM_GAP) + WEEK_ROW_PAD * 2);

  return (
    <div className="flex flex-shrink-0" style={{ minHeight: rowH }}>
      {/* Sticky left — project name with drag handle */}
      <div
        className="w-52 flex-shrink-0 border-r border-b-2 border-border flex items-start pt-1.5 px-1 gap-1.5 cursor-pointer hover-elevate group/row"
        style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--background)', minHeight: rowH }}
        onClick={() => onNavigate(project.id)}
      >
        {dragHandleProps && (
          <button
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/60 shrink-0 p-0.5 mt-0.5 touch-none"
            tabIndex={-1}
            aria-label="Drag to reorder"
            data-testid={`drag-week-${project.id}`}
          >
            <GripVertical className="w-3 h-3" />
          </button>
        )}
        <div className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: project.color || '#6b7280' }} />
        <span className="text-xs font-medium truncate flex-1">{project.name}</span>
        <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 shrink-0 mt-0.5 transition-colors" />
      </div>
      {/* Day cells */}
      {weekDays.map((day, colIdx) => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isToday = dayStr === todayStr;
        const isWknd = day.getDay() === 0 || day.getDay() === 6;
        const activeItems = leafItems.filter(item => {
          if (!item.startDate || !item.endDate) return false;
          const s = new Date(item.startDate); s.setHours(0, 0, 0, 0);
          const e = new Date(item.endDate); e.setHours(23, 59, 59, 999);
          const d = new Date(day); d.setHours(12, 0, 0, 0);
          return d >= s && d <= e;
        });
        return (
          <div
            key={colIdx}
            className={cn(
              "flex-1 min-w-[80px] border-r border-b-2 border-r-border/30 border-b-border flex flex-col px-1 gap-[3px]",
              isWknd ? "bg-muted/20" : "",
              isToday ? "bg-primary/5" : ""
            )}
            style={{ minHeight: rowH, paddingTop: WEEK_ROW_PAD, paddingBottom: WEEK_ROW_PAD }}
          >
            {activeItems.map(item => {
              const isCompany = isCompanyItem(item);
              const fill = isCompany
                ? (companyColor || item.assignedToColor || project.color || TYPE_COLORS_HEX.task)
                : (item.assignedToColor || project.color || TYPE_COLORS_HEX.task);
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="w-full rounded-sm flex items-center overflow-hidden shrink-0 relative gap-1.5"
                      style={{
                        height: WEEK_ITEM_H,
                        backgroundColor: fill,
                        opacity: isCompany ? 1 : 0.85,
                        paddingLeft: isCompany ? 4 : 6,
                        paddingRight: 6,
                      }}
                      data-testid={`week-item-${item.id}`}
                    >
                      {isCompany && (
                        <span
                          className="rounded-[3px] shrink-0"
                          style={{
                            width: 14,
                            height: 14,
                            backgroundColor: darkenHex(fill, 0.4),
                          }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-table text-white font-medium truncate leading-none">{item.name}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-muted-foreground">
                      {isCompany ? 'Company' : (item.assignedToName || 'Assigned')}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SortableProjectWeekRow(props: React.ComponentProps<typeof ProjectWeekRow> & { id: string }) {
  const { id, ...rest } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <ProjectWeekRow {...rest} dragHandleProps={{ attributes, listeners }} />
    </div>
  );
}

function SortableProjectRow({ project, onNavigate, onSettings, onContextMenu }: {
  project: BusinessProject;
  onNavigate: (id: string) => void;
  onSettings: (p: BusinessProject) => void;
  onContextMenu: (e: React.MouseEvent, projectId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  return (
    <div
      ref={setNodeRef}
      style={{ height: ROW_HEIGHT, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center px-1 gap-1 border-b-2 border-border group/row bg-background"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/60 shrink-0 p-0.5 touch-none"
        tabIndex={-1}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: project.color }} />
      <span className="text-xs font-medium truncate flex-1">{project.name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover/row:opacity-100 shrink-0"
            data-testid={`menu-${project.id}`}
          >
            <MoreHorizontal className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem onClick={() => onNavigate(project.id)} className="text-xs gap-2">
            <ExternalLink className="w-3 h-3" />
            Open Schedule
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSettings(project)} className="text-xs gap-2">
            <Settings className="w-3 h-3" />
            Date Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function BusinessSchedule() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"schedule" | "workload" | "schedules" | "week">("week");
  const [weekViewDate, setWeekViewDate] = useState(new Date());
  const [weekSwimlaneGroup, setWeekSwimlaneGroup] = useState<"project" | "assignee">("project");
  const [weekCompanyOnly, setWeekCompanyOnly] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("week");
  const pixelsPerDay = ZOOM_LEVELS[zoomLevel] / 7;
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<'all' | 'construction' | 'precon'>('all');
  const [showOnline, setShowOnline] = useState(true);
  const [showOffline, setShowOffline] = useState(false);
  const [showProspective, setShowProspective] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const [settingsProject, setSettingsProject] = useState<BusinessProject | null>(null);

  const { data: projects = [], isLoading } = useQuery<BusinessProject[]>({
    queryKey: ["/api/business-schedule/projects"],
  });

  const { data: nonWorkingDaysData = [] } = useQuery<{ id: string; date: string; name: string }[]>({
    queryKey: ["/api/non-working-days"],
  });

  const holidaySet = useMemo(() => {
    const s = new Set<string>();
    for (const d of nonWorkingDaysData) {
      const dt = new Date(d.date);
      s.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`);
    }
    return s;
  }, [nonWorkingDaysData]);

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, ...data }: { projectId: string; [key: string]: any }) => {
      return apiRequest(`/api/business-schedule/projects/${projectId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-schedule/projects"] });
    },
  });

  const visibleProjects = useMemo(() => {
    return projects.filter(p => {
      if (!p.isVisible) return false;
      if (p.category === 'online' && !showOnline) return false;
      if (p.category === 'offline' && !showOffline) return false;
      if (p.category === 'prospective' && !showProspective) return false;
      if (scheduleTypeFilter === 'construction') {
        return p.currentSystemPhase === 'construction' || p.currentSystemPhase === 'post_construction';
      }
      if (scheduleTypeFilter === 'precon') {
        return p.currentSystemPhase === 'lead' || p.currentSystemPhase === 'pre_construction';
      }
      return true;
    });
  }, [projects, scheduleTypeFilter, showOnline, showOffline, showProspective]);

  // Why are some projects not showing? Break the gap into reasons so the user
  // can see at a glance and one-click fix it.
  const hiddenBreakdown = useMemo(() => {
    let hiddenByVisibility = 0;
    let hiddenByOnline = 0;
    let hiddenByOffline = 0;
    let hiddenByProspective = 0;
    let hiddenByScheduleType = 0;
    for (const p of projects) {
      if (!p.isVisible) { hiddenByVisibility++; continue; }
      if (p.category === 'online' && !showOnline) { hiddenByOnline++; continue; }
      if (p.category === 'offline' && !showOffline) { hiddenByOffline++; continue; }
      if (p.category === 'prospective' && !showProspective) { hiddenByProspective++; continue; }
      if (scheduleTypeFilter === 'construction' &&
          !(p.currentSystemPhase === 'construction' || p.currentSystemPhase === 'post_construction')) {
        hiddenByScheduleType++; continue;
      }
      if (scheduleTypeFilter === 'precon' &&
          !(p.currentSystemPhase === 'lead' || p.currentSystemPhase === 'pre_construction')) {
        hiddenByScheduleType++; continue;
      }
    }
    const total = hiddenByVisibility + hiddenByOnline + hiddenByOffline + hiddenByProspective + hiddenByScheduleType;
    return { total, hiddenByVisibility, hiddenByOnline, hiddenByOffline, hiddenByProspective, hiddenByScheduleType };
  }, [projects, scheduleTypeFilter, showOnline, showOffline, showProspective]);

  const showAllProjects = useCallback(async () => {
    setShowOnline(true);
    setShowOffline(true);
    setShowProspective(true);
    setScheduleTypeFilter('all');
    // Re-enable any individually-hidden projects on the server in one batch
    // so we don't trigger N re-renders / N invalidations.
    const hidden = projects.filter(p => !p.isVisible);
    if (hidden.length === 0) return;
    try {
      await Promise.all(
        hidden.map(p =>
          apiRequest(`/api/business-schedule/projects/${p.id}`, "PATCH", { isVisible: true })
        )
      );
    } catch (err) {
      console.error("Failed to show all projects", err);
      toast({ title: "Some projects could not be shown", variant: "destructive" });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["/api/business-schedule/projects"] });
    }
  }, [projects, toast]);

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveSortOrder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(orderedIds.map((id, idx) =>
        apiRequest(`/api/business-schedule/projects/${id}`, 'PATCH', { sortOrder: idx + 1 })
      ));
    },
    onSuccess: () => {
      setLocalOrder(null);
      queryClient.invalidateQueries({ queryKey: ['/api/business-schedule/projects'] });
    },
    onError: () => setLocalOrder(null),
  });

  const orderedVisibleProjects = useMemo(() => {
    if (!localOrder) return visibleProjects;
    const orderMap = new Map(localOrder.map((id, i) => [id, i]));
    return [...visibleProjects].sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 9999;
      const bi = orderMap.get(b.id) ?? 9999;
      return ai - bi;
    });
  }, [visibleProjects, localOrder]);

  // Bulk-fetch schedule items for every visible project so the Week view can
  // hide rows that have no items in the current week. Only enabled in Week
  // view to avoid extra requests on the other tabs.
  const weekItemsQueries = useQueries({
    queries: orderedVisibleProjects.map(p => ({
      queryKey: ['/api/business-schedule/projects', p.id, 'schedule-items'],
      enabled: viewMode === 'week',
    })),
  });
  const weekItemsByProject = useMemo(() => {
    const m = new Map<string, WeekScheduleItem[]>();
    orderedVisibleProjects.forEach((p, i) => {
      const data = weekItemsQueries[i]?.data as WeekScheduleItem[] | undefined;
      if (data) m.set(p.id, data);
    });
    return m;
  }, [orderedVisibleProjects, weekItemsQueries]);

  // Filter-button state: how many filters are non-default? Used for the badge
  // count next to the new single Filter button in the Week toolbar.
  const hiddenProjectsCount = useMemo(
    () => projects.filter(p => !p.isVisible).length,
    [projects],
  );
  const activeFilterCount =
    (weekCompanyOnly ? 1 : 0) +
    (showOnline ? 0 : 1) +
    (showProspective ? 0 : 1) +
    (showOffline ? 1 : 0) +
    hiddenProjectsCount;

  // Reset to the Week-view canonical defaults (matches activeFilterCount === 0).
  // We can't reuse showAllProjects() here because it flips Offline ON, which
  // the new filter UX treats as a non-default state — that would leave the
  // badge stuck at 1 right after pressing Reset. Instead we explicitly set
  // each control and then unhide projects on the server.
  const resetWeekFilters = useCallback(async () => {
    setWeekCompanyOnly(false);
    setShowOnline(true);
    setShowOffline(false);
    setShowProspective(true);
    setScheduleTypeFilter('all');
    const hidden = projects.filter(p => !p.isVisible);
    if (hidden.length === 0) return;
    try {
      await Promise.all(
        hidden.map(p =>
          apiRequest(`/api/business-schedule/projects/${p.id}`, "PATCH", { isVisible: true })
        )
      );
    } catch (err) {
      console.error("Failed to reset filters / unhide projects", err);
      toast({ title: "Some projects could not be shown", variant: "destructive" });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["/api/business-schedule/projects"] });
    }
  }, [projects, toast]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedVisibleProjects.findIndex(p => p.id === active.id);
    const newIdx = orderedVisibleProjects.findIndex(p => p.id === over.id);
    const newOrder = arrayMove(orderedVisibleProjects, oldIdx, newIdx);
    setLocalOrder(newOrder.map(p => p.id));
    saveSortOrder.mutate(newOrder.map(p => p.id));
  }

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const now = new Date();
    let earliest = now;
    let latest = addDays(now, 90);

    for (const p of visibleProjects) {
      const dates = getProjectDates(p);
      if (dates.start && dates.start < earliest) earliest = dates.start;
      if (dates.end && dates.end > latest) latest = dates.end;
    }

    const start = addDays(startOfWeek(earliest, { weekStartsOn: 1 }), -14);
    const end = addDays(latest, 30);
    const days = differenceInDays(end, start);
    return { timelineStart: start, timelineEnd: end, totalDays: days };
  }, [visibleProjects]);

  const totalWidth = totalDays * pixelsPerDay;

  const getPosition = useCallback((date: Date) => {
    return differenceInDays(date, timelineStart) * pixelsPerDay;
  }, [timelineStart, pixelsPerDay]);

  const todayPosition = getPosition(new Date());

  useEffect(() => {
    if (timelineRef.current) {
      const todayOffset = todayPosition - timelineRef.current.clientWidth / 3;
      timelineRef.current.scrollLeft = Math.max(0, todayOffset);
    }
  }, [todayPosition, zoomLevel]);

  const handleSyncScroll = useCallback((e: any) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.target.scrollTop;
    }
  }, []);

  const weeks = useMemo(() => {
    return eachWeekOfInterval({ start: timelineStart, end: timelineEnd }, { weekStartsOn: 1 });
  }, [timelineStart, timelineEnd]);

  const months = useMemo(() => {
    return eachMonthOfInterval({ start: timelineStart, end: timelineEnd });
  }, [timelineStart, timelineEnd]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  }, [timelineStart, timelineEnd]);

  const handleContextMenu = useCallback((e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectId });
  }, []);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const getBarStyle = (project: BusinessProject) => {
    if (project.category === "prospective") {
      return {
        backgroundColor: "transparent",
        border: "2px dotted #9ca3af",
        opacity: 0.7,
      };
    }
    if (project.category === "offline") {
      return {
        backgroundColor: "transparent",
        border: `2px dashed ${project.color || TYPE_COLORS_HEX.task}`,
        opacity: 0.8,
      };
    }
    return {
      backgroundColor: project.color || TYPE_COLORS_HEX.task,
      border: "none",
      opacity: 1,
    };
  };

  const panelWidth = 220;

  const ViewModeTabs = ({ active }: { active: "schedule" | "workload" | "schedules" | "week" }) => {
    const tabs: { id: "week" | "schedules" | "schedule" | "workload"; label: string }[] = [
      { id: "week", label: "Week" },
      { id: "schedules", label: "Schedules" },
      { id: "schedule", label: "Projects" },
      { id: "workload", label: "Workload" },
    ];
    return (
      <div className="flex items-center gap-1 -mb-1" data-testid="business-schedule-tabs">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => !isActive && setViewMode(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors relative",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  if (viewMode === "workload") {
    return (
      <div className="flex flex-col h-full bg-background" data-testid="business-schedule-page">
        <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
          <ViewModeTabs active="workload" />
        </div>
        <CompanyWorkload className="flex-1 min-h-0" />
      </div>
    );
  }

  if (viewMode === "schedules") {
    return (
      <div className="flex flex-col h-full bg-background" data-testid="business-schedule-page">
        <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
          <ViewModeTabs active="schedules" />
        </div>
        <MasterScheduleGantt className="flex-1 min-h-0" />
      </div>
    );
  }

  if (viewMode === "week") {
    const weekStart = startOfWeek(weekViewDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = format(today, 'yyyy-MM-dd');

    // Hide projects with no leaf items overlapping this week. Group/summary
    // headers don't count. With Company-only on, only company items count.
    // While items are still loading for a project, keep it visible so rows
    // don't pop in/out — once data arrives the filter applies cleanly.
    const projectsWithItemsThisWeek = orderedVisibleProjects.filter(p => {
      const items = weekItemsByProject.get(p.id);
      if (!items) return true;
      const candidates = (weekCompanyOnly ? items.filter(isCompanyItem) : items)
        .filter(i => i.type !== 'group');
      return candidates.some(item => {
        if (!item.startDate || !item.endDate) return false;
        const s = new Date(item.startDate); s.setHours(0, 0, 0, 0);
        const e = new Date(item.endDate); e.setHours(23, 59, 59, 999);
        return s <= weekEnd && e >= weekStart;
      });
    });

    const hiddenForEmptyWeek = orderedVisibleProjects.length - projectsWithItemsThisWeek.length;

    return (
      <div className="flex flex-col h-full bg-background" data-testid="business-schedule-page">
        {/* Tabs row */}
        <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
          <ViewModeTabs active="week" />
        </div>
        {/* Toolbar — Filter icon (left) + date nav (right) */}
        <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
          <Popover open={showFilter} onOpenChange={setShowFilter}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                data-testid="button-week-filter"
                aria-label="Filter"
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                    data-testid="badge-week-filter-count"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <div className="max-h-[28rem] overflow-y-auto">
                {/* Layout — group rows by project or by assignee */}
                <div className="px-3 py-3 border-b border-border">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Group by
                  </div>
                  <div className="flex items-center border rounded-md overflow-hidden w-full">
                    <button
                      className={cn(
                        "flex-1 h-7 px-2.5 text-xs",
                        weekSwimlaneGroup === 'project' ? "bg-primary text-primary-foreground" : "hover-elevate"
                      )}
                      onClick={() => setWeekSwimlaneGroup('project')}
                      data-testid="toggle-week-group-project"
                    >By Project</button>
                    <button
                      className={cn(
                        "flex-1 h-7 px-2.5 text-xs",
                        weekSwimlaneGroup === 'assignee' ? "bg-primary text-primary-foreground" : "hover-elevate"
                      )}
                      onClick={() => setWeekSwimlaneGroup('assignee')}
                      data-testid="toggle-week-group-assignee"
                    >By Assignee</button>
                  </div>
                </div>

                {/* Item filters */}
                <div className="px-3 py-3 border-b border-border">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Item filters
                  </div>
                  <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                    <span className="text-xs">Company only</span>
                    <Switch
                      checked={weekCompanyOnly}
                      onCheckedChange={setWeekCompanyOnly}
                      data-testid="switch-week-company-only"
                    />
                  </label>
                </div>

                {/* Project categories */}
                <div className="px-3 py-3 border-b border-border">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Project categories
                  </div>
                  <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
                      Online
                    </span>
                    <Switch
                      checked={showOnline}
                      onCheckedChange={setShowOnline}
                      data-testid="switch-week-online"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-dashed border-amber-600" />
                      Offline
                    </span>
                    <Switch
                      checked={showOffline}
                      onCheckedChange={setShowOffline}
                      data-testid="switch-week-offline"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-dotted border-border-strong" />
                      Prospective
                    </span>
                    <Switch
                      checked={showProspective}
                      onCheckedChange={setShowProspective}
                      data-testid="switch-week-prospective"
                    />
                  </label>
                </div>

                {/* Per-project visibility */}
                <div className="px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Show projects
                  </div>
                  {projects.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-1">No projects.</div>
                  ) : (
                    projects.map(p => (
                      <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer">
                        <Checkbox
                          checked={p.isVisible}
                          onCheckedChange={(checked) => {
                            updateProjectMutation.mutate({ projectId: p.id, isVisible: !!checked });
                          }}
                          data-testid={`checkbox-week-project-${p.id}`}
                        />
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-xs truncate flex-1">{p.name}</span>
                        <Badge variant="outline" className="text-label h-4 px-1 capitalize shrink-0">
                          {p.category}
                        </Badge>
                      </label>
                    ))
                  )}
                </div>
              </div>
              {/* Reset footer */}
              <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {activeFilterCount === 0 ? 'No filters active' : `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={resetWeekFilters}
                  disabled={activeFilterCount === 0}
                  data-testid="button-week-filter-reset"
                >
                  Reset
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setWeekViewDate(addDays(weekViewDate, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <button
              className="h-7 px-2 text-xs hover-elevate rounded"
              onClick={() => setWeekViewDate(new Date())}
            >
              Today
            </button>
            <span className="text-xs font-medium px-1 min-w-[160px] text-center">
              {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setWeekViewDate(addDays(weekViewDate, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {weekSwimlaneGroup === 'assignee' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">By Assignee view coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Switch to By Project to see this week's schedule</p>
            </div>
          </div>
        ) : (
          /* Swimlane grid — row-major layout */
          <div className="flex flex-col flex-1 overflow-auto">
            {/* Sticky header row */}
            <div className="flex sticky top-0 z-20 bg-background border-b border-border flex-shrink-0">
              {/* Corner spacer — matches sticky-left width */}
              <div className="w-52 flex-shrink-0 border-r border-border bg-muted/20 h-9 shrink-0" style={{ position: 'sticky', left: 0, zIndex: 21 }} />
              {weekDays.map((day, colIdx) => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const isToday = dayStr === todayStr;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div key={colIdx} className={cn(
                    "flex-1 min-w-[80px] border-r border-border/30 h-9 flex flex-col items-center justify-center text-data font-medium",
                    isToday ? "bg-primary/20 text-[#7c5cbf]" : isWeekend ? "bg-muted/30 text-muted-foreground/50" : "bg-muted/10 text-muted-foreground"
                  )}>
                    <span>{format(day, 'EEE')}</span>
                    <span className={cn("text-table font-semibold", isToday ? "text-[#7c5cbf]" : "")}>{format(day, 'd')}</span>
                  </div>
                );
              })}
            </div>
            {/* Project rows — items already fetched in bulk above and passed
                down so each row doesn't refetch. Reorder shares sortOrder
                with the main Projects view. */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={projectsWithItemsThisWeek.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {projectsWithItemsThisWeek.map(project => (
                  <SortableProjectWeekRow
                    key={project.id}
                    id={project.id}
                    project={project}
                    weekDays={weekDays}
                    todayStr={todayStr}
                    companyOnly={weekCompanyOnly}
                    companyColor=""
                    onNavigate={(id) => navigate(`/projects/${id}/schedule`)}
                    items={weekItemsByProject.get(project.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {orderedVisibleProjects.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">No projects visible.</div>
            ) : projectsWithItemsThisWeek.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground text-center space-y-2">
                <div>No projects have schedule items this week.</div>
                {hiddenForEmptyWeek > 0 && (
                  <div className="text-[11px]">
                    {hiddenForEmptyWeek} project{hiddenForEmptyWeek === 1 ? '' : 's'} hidden because nothing is scheduled in this range.
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowFilter(true)}
                  data-testid="button-week-empty-open-filter"
                >
                  Open filter
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Active filter count for the Projects (gantt) view's consolidated Filter
  // popover. Schedule type, category toggles, and per-project visibility all
  // contribute. Zoom level is a layout choice, not a filter.
  const projectsActiveFilterCount = (
    (scheduleTypeFilter !== 'all' ? 1 : 0) +
    (!showOnline ? 1 : 0) +
    (!showOffline ? 1 : 0) +
    (!showProspective ? 1 : 0) +
    (projects.some(p => !p.isVisible) ? 1 : 0)
  );
  const resetProjectsFilters = () => {
    setScheduleTypeFilter('all');
    setShowOnline(true);
    setShowOffline(true);
    setShowProspective(true);
    projects.filter(p => !p.isVisible).forEach(p => {
      updateProjectMutation.mutate({ projectId: p.id, isVisible: true });
    });
  };

  return (
    <div className="flex flex-col h-full bg-background" data-testid="business-schedule-page">
      {/* Tabs row */}
      <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
        <ViewModeTabs active="schedule" />
      </div>
      {/* Toolbar — Filter icon (left) + zoom (right). Projects view is a
          continuous gantt so there's no date range; zoom acts as the
          equivalent right-hand control. */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <Popover open={showFilter} onOpenChange={setShowFilter}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="button-filter-projects"
              aria-label="Filter"
            >
              <Filter className="w-4 h-4" />
              {projectsActiveFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                  data-testid="badge-projects-filter-count"
                >
                  {projectsActiveFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <div className="max-h-[28rem] overflow-y-auto">
              {/* Schedule type */}
              <div className="px-3 py-3 border-b border-border">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Schedule type
                </div>
                <div className="flex items-center border rounded-md overflow-hidden w-full">
                  <button
                    className={cn(
                      "flex-1 h-7 px-2.5 text-xs",
                      scheduleTypeFilter === 'all' ? "bg-primary text-primary-foreground" : "hover-elevate"
                    )}
                    onClick={() => setScheduleTypeFilter('all')}
                  >All</button>
                  <button
                    className={cn(
                      "flex-1 h-7 px-2.5 text-xs",
                      scheduleTypeFilter === 'construction' ? "bg-primary text-primary-foreground" : "hover-elevate"
                    )}
                    onClick={() => setScheduleTypeFilter('construction')}
                  >Construction</button>
                  <button
                    className={cn(
                      "flex-1 h-7 px-2.5 text-xs",
                      scheduleTypeFilter === 'precon' ? "bg-primary text-primary-foreground" : "hover-elevate"
                    )}
                    onClick={() => setScheduleTypeFilter('precon')}
                  >Pre-con</button>
                </div>
              </div>

              {/* Project categories */}
              <div className="px-3 py-3 border-b border-border">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Project categories
                </div>
                <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                  <span className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
                    Online
                  </span>
                  <Switch
                    checked={showOnline}
                    onCheckedChange={setShowOnline}
                    data-testid="switch-projects-online"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                  <span className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-dashed border-amber-600" />
                    Offline
                  </span>
                  <Switch
                    checked={showOffline}
                    onCheckedChange={setShowOffline}
                    data-testid="switch-projects-offline"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 py-1 cursor-pointer">
                  <span className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-dotted border-border-strong" />
                    Prospective
                  </span>
                  <Switch
                    checked={showProspective}
                    onCheckedChange={setShowProspective}
                    data-testid="switch-projects-prospective"
                  />
                </label>
              </div>

              {/* Per-project visibility */}
              <div className="px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Show projects
                </div>
                {projects.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-1">No projects.</div>
                ) : (
                  projects.map(p => (
                    <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <Checkbox
                        checked={p.isVisible}
                        onCheckedChange={(checked) => {
                          updateProjectMutation.mutate({ projectId: p.id, isVisible: !!checked });
                        }}
                        data-testid={`checkbox-projects-project-${p.id}`}
                      />
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs truncate flex-1">{p.name}</span>
                      <Badge variant="outline" className="text-label h-4 px-1 capitalize shrink-0">
                        {p.category}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            </div>
            {/* Reset footer */}
            <div className="border-t border-border px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {projectsActiveFilterCount === 0 ? 'No filters active' : `${projectsActiveFilterCount} filter${projectsActiveFilterCount === 1 ? '' : 's'} active`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={resetProjectsFilters}
                disabled={projectsActiveFilterCount === 0}
                data-testid="button-projects-filter-reset"
              >
                Reset
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-1">
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              className={`h-7 px-2 text-xs ${zoomLevel === 'day' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setZoomLevel('day')}
            >Day</button>
            <button
              className={`h-7 px-2 text-xs ${zoomLevel === 'week' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setZoomLevel('week')}
            >Week</button>
            <button
              className={`h-7 px-2 text-xs ${zoomLevel === 'month' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setZoomLevel('month')}
            >Month</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="h-8 flex items-center px-3 gap-4 border-b border-border/50 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <div className="w-5 h-3 rounded-sm bg-blue-500" />
              <span className="text-data text-muted-foreground">Online</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Schedule is published and visible to external users</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <div className="w-5 h-3 rounded-sm border-2 border-dashed border-amber-600" />
              <span className="text-data text-muted-foreground">Offline</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Schedule is hidden from external users</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <div className="w-5 h-3 rounded-sm border-2 border-dotted border-border-strong" />
              <span className="text-data text-muted-foreground">Prospective</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Lead or pre-construction projects not yet confirmed</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Project names */}
        <div
          ref={leftPanelRef}
          className="flex-shrink-0 border-r border-border overflow-hidden"
          style={{ width: panelWidth }}
        >
          {/* Header rows */}
          <div className="h-[60px] border-b border-border flex items-end px-2 pb-1">
            <span className="text-xs font-medium text-muted-foreground">Project</span>
          </div>

          {/* Project rows — drag to reorder */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedVisibleProjects.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-hidden">
                {orderedVisibleProjects.map((project) => (
                  <SortableProjectRow
                    key={project.id}
                    project={project}
                    onNavigate={(id) => navigate(`/projects/${id}/schedule`)}
                    onSettings={setSettingsProject}
                    onContextMenu={handleContextMenu}
                  />
                ))}
                {orderedVisibleProjects.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No projects visible. Use the filter to show projects.
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Right panel - Timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Timeline header */}
          <div className="h-[60px] border-b border-border flex-shrink-0 overflow-hidden">
            <div
              className="h-full relative"
              style={{ width: totalWidth, transform: `translateX(-${timelineRef.current?.scrollLeft || 0}px)` }}
            >
              {/* Month row */}
              <div className="h-[30px] flex items-center relative">
                {months.map((monthStart, i) => {
                  const left = getPosition(monthStart);
                  const nextMonth = i < months.length - 1 ? months[i + 1] : timelineEnd;
                  const width = differenceInDays(nextMonth, monthStart) * pixelsPerDay;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-center px-3 text-table font-medium text-muted-foreground border-l border-border/50"
                      style={{ left, width }}
                    >
                      {format(monthStart, 'MMMM yyyy')}
                    </div>
                  );
                })}
              </div>

              {/* Day row */}
              <div className="h-[30px] flex items-center relative">
                {zoomLevel === 'day' && days.map((day, i) => {
                  const left = getPosition(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const isHol = holidaySet.has(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 h-full flex items-center justify-center text-label border-l border-border/30",
                        (isWeekend || isHol) ? "bg-muted/30 text-muted-foreground/50" : "text-muted-foreground"
                      )}
                      style={{ left, width: pixelsPerDay }}
                    >
                      {format(day, 'EEE d')}
                    </div>
                  );
                })}
                {zoomLevel === 'week' && days.map((day, i) => {
                  const left = getPosition(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  if (day.getDay() === 1 || day.getDay() === 3 || day.getDay() === 5) {
                    return (
                      <div
                        key={i}
                        className="absolute top-0 h-full flex items-center justify-center text-label text-muted-foreground border-l border-border/30"
                        style={{ left, width: pixelsPerDay }}
                      >
                        {format(day, 'EEE')}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>

          {/* Timeline body */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-auto relative"
            onScroll={(e) => {
              handleSyncScroll(e);
              const headerEl = (e.target as HTMLElement).previousElementSibling?.querySelector('div') as HTMLElement;
              if (headerEl) {
                headerEl.style.transform = `translateX(-${(e.target as HTMLElement).scrollLeft}px)`;
              }
            }}
          >
            <div className="relative" style={{ width: totalWidth, minHeight: orderedVisibleProjects.length * ROW_HEIGHT }}>
              {/* Week grid lines */}
              {weeks.map((weekStart, i) => {
                const left = getPosition(weekStart);
                return (
                  <div
                    key={`grid-${i}`}
                    className="absolute top-0 bottom-0 border-l border-border/20"
                    style={{ left }}
                  />
                );
              })}

              {/* Weekend shading */}
              {zoomLevel !== 'month' && days.map((day, i) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const isHoliday = holidaySet.has(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`);
                if (!isWeekend && !isHoliday) return null;
                const left = getPosition(day);
                return (
                  <div
                    key={`nonwork-${i}`}
                    className="absolute top-0 bottom-0 bg-muted/30"
                    style={{ left, width: pixelsPerDay }}
                  />
                );
              })}

              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none z-20"
                style={{ left: todayPosition }}
              />

              {/* Project bars */}
              {orderedVisibleProjects.map((project) => {
                const dates = getProjectDates(project);
                if (!dates.start || !dates.end) {
                  return (
                    <div key={project.id} style={{ height: ROW_HEIGHT }} className="relative border-b border-border/10">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-data text-muted-foreground/50 italic">No dates set</span>
                      </div>
                    </div>
                  );
                }

                const barStart = getPosition(dates.start);
                const barDuration = differenceInDays(dates.end, dates.start) + 1;
                const barWidth = Math.max(barDuration * pixelsPerDay, 20);
                const barStyle = getBarStyle(project);
                const nameFitsInBar = project.name.length * 7 + 16 <= barWidth;

                return (
                  <div key={project.id} style={{ height: ROW_HEIGHT }} className="relative border-b border-border/10 group/row">
                    <div
                      className="absolute top-2 h-6 rounded-sm cursor-pointer transition-opacity hover:opacity-90"
                      style={{
                        left: barStart,
                        width: barWidth,
                        ...barStyle,
                      }}
                      onContextMenu={(e) => handleContextMenu(e, project.id)}
                      data-testid={`bar-${project.id}`}
                    >
                      {project.category === "online" && (
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                          {nameFitsInBar && (
                            <span className="text-data font-medium text-white truncate drop-shadow-sm">
                              {project.name}
                            </span>
                          )}
                        </div>
                      )}
                      {project.category !== "online" && (
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                          {nameFitsInBar && (
                            <span className="text-data font-medium text-muted-foreground truncate">
                              {project.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover-elevate flex items-center gap-2"
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) {
                navigate(`/projects/${project.id}/schedule`);
              }
            }}
            data-testid="context-open-schedule"
          >
            <ExternalLink className="w-3 h-3" />
            Open Schedule
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover-elevate flex items-center gap-2"
            onClick={() => {
              const project = projects.find(p => p.id === contextMenu.projectId);
              if (project) setSettingsProject(project);
            }}
            data-testid="context-date-settings"
          >
            <Settings className="w-3 h-3" />
            Date Settings
          </button>
        </div>
      )}

      {/* Date mode settings popover */}
      {settingsProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setSettingsProject(null)}>
          <div className="bg-popover border rounded-lg shadow-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold mb-3">{settingsProject.name} - Date Settings</h4>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Date Source</Label>
                <Select
                  value={settingsProject.dateMode}
                  onValueChange={(value) => {
                    updateProjectMutation.mutate({ projectId: settingsProject.id, dateMode: value });
                    setSettingsProject({ ...settingsProject, dateMode: value });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Project Dates, then Schedule Items)</SelectItem>
                    <SelectItem value="milestone">Build Start / End Markers</SelectItem>
                    <SelectItem value="project">Project Start & End Dates</SelectItem>
                    <SelectItem value="items">First & Last Schedule Item</SelectItem>
                    <SelectItem value="custom">Custom Start + Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settingsProject.dateMode === "custom" && (
                <>
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={settingsProject.customStartDate ? format(new Date(settingsProject.customStartDate), 'yyyy-MM-dd') : ''}
                      onChange={(e) => {
                        updateProjectMutation.mutate({ projectId: settingsProject.id, customStartDate: e.target.value || null });
                        setSettingsProject({ ...settingsProject, customStartDate: e.target.value || null });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Number of Weeks</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      min={1}
                      max={260}
                      value={settingsProject.customWeeks || ''}
                      onChange={(e) => {
                        const weeks = parseInt(e.target.value) || null;
                        updateProjectMutation.mutate({ projectId: settingsProject.id, customWeeks: weeks });
                        setSettingsProject({ ...settingsProject, customWeeks: weeks });
                      }}
                    />
                  </div>
                </>
              )}

              <div className="text-data text-muted-foreground space-y-1 mt-2">
                {settingsProject.milestoneStartDate && (
                  <div className="text-emerald-600 dark:text-emerald-400">Build Start: {format(new Date(settingsProject.milestoneStartDate), 'MMM d, yyyy')}{settingsProject.milestoneEndDate ? ` — Build End: ${format(new Date(settingsProject.milestoneEndDate), 'MMM d, yyyy')}` : ''}</div>
                )}
                {settingsProject.projectStartDate && (
                  <div>Project dates: {format(new Date(settingsProject.projectStartDate), 'MMM d, yyyy')} - {settingsProject.projectEndDate ? format(new Date(settingsProject.projectEndDate), 'MMM d, yyyy') : 'not set'}</div>
                )}
                {settingsProject.itemStartDate && (
                  <div>Schedule items: {format(new Date(settingsProject.itemStartDate), 'MMM d, yyyy')} - {format(new Date(settingsProject.itemEndDate!), 'MMM d, yyyy')}</div>
                )}
                {settingsProject.dateMode === "milestone" && !settingsProject.milestoneStartDate && (
                  <div className="text-amber-600">No Build Start marker set. Right-click a task in the schedule to set one.</div>
                )}
                {!settingsProject.projectStartDate && !settingsProject.itemStartDate && settingsProject.dateMode !== "custom" && settingsProject.dateMode !== "milestone" && (
                  <div className="text-amber-600">No dates available. Use custom mode to set dates manually.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Button size="sm" variant="ghost" onClick={() => setSettingsProject(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
