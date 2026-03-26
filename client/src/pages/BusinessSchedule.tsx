import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Filter, ChevronLeft, ChevronRight, ExternalLink, Settings, MoreHorizontal, GanttChart, Users, Layers, CalendarDays, GripVertical } from "lucide-react";
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
  assignedToColor: string | null;
  parentItemId: string | null;
  type: string | null;
}

function ProjectWeekRow({ project, weekDays, todayStr, onNavigate }: {
  project: BusinessProject;
  weekDays: Date[];
  todayStr: string;
  onNavigate: (id: string) => void;
}) {
  const { data: items = [] } = useQuery<WeekScheduleItem[]>({
    queryKey: ['/api/business-schedule/projects', project.id, 'schedule-items'],
  });

  // Show all items except group/summary headers (which have no meaningful date span of their own)
  const leafItems = items.filter(item => item.type !== 'group');

  const maxPerDay = Math.max(1, ...weekDays.map(day => {
    return leafItems.filter(item => {
      if (!item.startDate || !item.endDate) return false;
      const s = new Date(item.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(item.endDate); e.setHours(23, 59, 59, 999);
      const d = new Date(day); d.setHours(12, 0, 0, 0);
      return d >= s && d <= e;
    }).length;
  }));
  const ITEM_H = 16;
  const rowH = Math.max(ROW_HEIGHT, maxPerDay * (ITEM_H + 2) + 8);

  return (
    <div className="flex flex-shrink-0" style={{ minHeight: rowH }}>
      {/* Sticky left — project name */}
      <div
        className="w-52 flex-shrink-0 border-r border-b border-border/30 flex items-start pt-1.5 px-2 gap-2 cursor-pointer hover-elevate group/row"
        style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--background)', minHeight: rowH }}
        onClick={() => onNavigate(project.id)}
      >
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
        const dates = getProjectDates(project);
        let projectActive = false;
        if (dates.start && dates.end) {
          const s = new Date(dates.start); s.setHours(0, 0, 0, 0);
          const e = new Date(dates.end); e.setHours(23, 59, 59, 999);
          const d = new Date(day); d.setHours(12, 0, 0, 0);
          projectActive = d >= s && d <= e;
        }
        return (
          <div
            key={colIdx}
            className={cn(
              "flex-1 min-w-[80px] border-r border-b border-border/20 flex flex-col pt-1 px-0.5 gap-0.5",
              isWknd ? "bg-muted/20" : "",
              isToday ? "bg-[#bba7db]/5" : ""
            )}
            style={{ minHeight: rowH }}
          >
            {activeItems.length > 0 ? (
              activeItems.map(item => (
                <div
                  key={item.id}
                  className="w-full rounded-sm flex items-center px-1 overflow-hidden shrink-0"
                  style={{
                    height: ITEM_H,
                    backgroundColor: item.assignedToColor || project.color || '#3b82f6',
                    opacity: 0.8,
                  }}
                >
                  <span className="text-[9px] text-white font-medium truncate leading-none">{item.name}</span>
                </div>
              ))
            ) : projectActive ? (
              <div
                className="w-full rounded-sm shrink-0"
                style={{
                  height: ITEM_H,
                  backgroundColor: project.category === 'online' ? (project.color || '#3b82f6') : 'transparent',
                  border: project.category === 'offline'
                    ? '2px dashed #d97706'
                    : project.category === 'prospective'
                      ? '2px dotted #9ca3af'
                      : 'none',
                  opacity: project.category === 'online' ? 0.75 : 0.6,
                }}
              />
            ) : null}
          </div>
        );
      })}
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
      className="flex items-center px-1 gap-1 border-b border-border/30 group/row bg-background"
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
  const [viewMode, setViewMode] = useState<"schedule" | "workload" | "schedules" | "week">("schedule");
  const [weekViewDate, setWeekViewDate] = useState(new Date());
  const [weekSwimlaneGroup, setWeekSwimlaneGroup] = useState<"project" | "assignee">("project");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("week");
  const pixelsPerDay = ZOOM_LEVELS[zoomLevel] / 7;
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<'all' | 'construction' | 'precon'>('all');
  const [showOffline, setShowOffline] = useState(true);
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
      if (!showOffline && p.category === 'offline') return false;
      if (scheduleTypeFilter === 'construction') {
        return p.currentSystemPhase === 'construction' || p.currentSystemPhase === 'post_construction';
      }
      if (scheduleTypeFilter === 'precon') {
        return p.currentSystemPhase === 'lead' || p.currentSystemPhase === 'pre_construction';
      }
      return true;
    });
  }, [projects, scheduleTypeFilter, showOffline]);

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
        border: `2px dashed ${project.color || "#3b82f6"}`,
        opacity: 0.8,
      };
    }
    return {
      backgroundColor: project.color || "#3b82f6",
      border: "none",
      opacity: 1,
    };
  };

  const panelWidth = 220;

  const ViewModeTabs = ({ active }: { active: "schedule" | "workload" | "schedules" | "week" }) => (
    <div className="flex items-center border rounded-md overflow-hidden">
      <button
        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${active === 'schedule' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
        onClick={() => active !== 'schedule' && setViewMode('schedule')}
      >
        <GanttChart className="w-3 h-3" />
        Projects
      </button>
      <button
        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${active === 'week' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
        onClick={() => active !== 'week' && setViewMode('week')}
      >
        <CalendarDays className="w-3 h-3" />
        Week
      </button>
      <button
        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${active === 'workload' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
        onClick={() => active !== 'workload' && setViewMode('workload')}
      >
        <Users className="w-3 h-3" />
        Workload
      </button>
      <button
        className={`h-7 px-2.5 text-xs flex items-center gap-1.5 ${active === 'schedules' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
        onClick={() => active !== 'schedules' && setViewMode('schedules')}
      >
        <Layers className="w-3 h-3" />
        Schedules
      </button>
    </div>
  );

  if (viewMode === "workload") {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-950" data-testid="business-schedule-page">
        <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
          <ViewModeTabs active="workload" />
        </div>
        <CompanyWorkload className="flex-1 min-h-0" />
      </div>
    );
  }

  if (viewMode === "schedules") {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-950" data-testid="business-schedule-page">
        <div className="h-10 flex items-center px-3 border-b border-border flex-shrink-0">
          <ViewModeTabs active="schedules" />
        </div>
        <MasterScheduleGantt />
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

    const activeProjectsThisWeek = orderedVisibleProjects.filter(p => {
      const dates = getProjectDates(p);
      if (!dates.start || !dates.end) return false;
      const s = new Date(dates.start); s.setHours(0, 0, 0, 0);
      const e = new Date(dates.end); e.setHours(23, 59, 59, 999);
      return s <= weekEnd && e >= weekStart;
    });

    return (
      <div className="flex flex-col h-full bg-white dark:bg-zinc-950" data-testid="business-schedule-page">
        {/* Toolbar */}
        <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
          <div className="flex items-center gap-2">
            <ViewModeTabs active="week" />
            <div className="flex items-center border rounded-md overflow-hidden">
              <button
                className={`h-7 px-2.5 text-xs ${weekSwimlaneGroup === 'project' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
                onClick={() => setWeekSwimlaneGroup('project')}
              >By Project</button>
              <button
                className={`h-7 px-2.5 text-xs ${weekSwimlaneGroup === 'assignee' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
                onClick={() => setWeekSwimlaneGroup('assignee')}
              >By Assignee</button>
            </div>
          </div>
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

        {/* What's On strip */}
        <div className="h-8 flex items-center px-3 gap-3 border-b border-border/50 bg-muted/30 flex-shrink-0 overflow-hidden">
          <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
            {activeProjectsThisWeek.length} project{activeProjectsThisWeek.length !== 1 ? 's' : ''} active this week
          </span>
          {activeProjectsThisWeek.slice(0, 6).map(p => (
            <div key={p.id} className="flex items-center gap-1 shrink-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#6b7280' }} />
              <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">{p.name}</span>
            </div>
          ))}
          {activeProjectsThisWeek.length > 6 && (
            <span className="text-[10px] text-muted-foreground shrink-0">+{activeProjectsThisWeek.length - 6} more</span>
          )}
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
                    "flex-1 min-w-[80px] border-r border-border/30 h-9 flex flex-col items-center justify-center text-[10px] font-medium",
                    isToday ? "bg-[#bba7db]/20 text-[#7c5cbf]" : isWeekend ? "bg-muted/30 text-muted-foreground/50" : "bg-muted/10 text-muted-foreground"
                  )}>
                    <span>{format(day, 'EEE')}</span>
                    <span className={cn("text-[11px] font-semibold", isToday ? "text-[#7c5cbf]" : "")}>{format(day, 'd')}</span>
                  </div>
                );
              })}
            </div>
            {/* Project rows — each row fetches its own items */}
            {orderedVisibleProjects.map(project => (
              <ProjectWeekRow
                key={project.id}
                project={project}
                weekDays={weekDays}
                todayStr={todayStr}
                onNavigate={(id) => navigate(`/projects/${id}/schedule`)}
              />
            ))}
            {orderedVisibleProjects.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground text-center">No projects visible.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950" data-testid="business-schedule-page">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <ViewModeTabs active="schedule" />

          {/* Con / Precon toggle */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              className={`h-7 px-2.5 text-xs ${scheduleTypeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setScheduleTypeFilter('all')}
            >All</button>
            <button
              className={`h-7 px-2.5 text-xs ${scheduleTypeFilter === 'construction' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setScheduleTypeFilter('construction')}
            >Construction</button>
            <button
              className={`h-7 px-2.5 text-xs ${scheduleTypeFilter === 'precon' ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
              onClick={() => setScheduleTypeFilter('precon')}
            >Pre-con</button>
          </div>

          {/* Offline toggle */}
          <button
            className={`h-7 px-2.5 text-xs rounded-md border flex items-center gap-1.5 ${showOffline ? 'bg-primary text-primary-foreground border-primary' : 'hover-elevate border-border'}`}
            onClick={() => setShowOffline(v => !v)}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-dashed" style={{ borderColor: 'currentColor', opacity: 0.8 }} />
            Offline
          </button>

          {/* Project visibility filter — moved to left */}
          <Popover open={showFilter} onOpenChange={setShowFilter}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-filter-projects">
                <Filter className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 max-h-80 overflow-y-auto">
              <div className="text-xs font-medium mb-2">Show Projects</div>
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={p.isVisible}
                    onCheckedChange={(checked) => {
                      updateProjectMutation.mutate({ projectId: p.id, isVisible: !!checked });
                    }}
                  />
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-xs truncate">{p.name}</span>
                  <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 capitalize shrink-0">
                    {p.category}
                  </Badge>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>
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
              <span className="text-[10px] text-muted-foreground">Online</span>
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
              <span className="text-[10px] text-muted-foreground">Offline</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Schedule is hidden from external users</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <div className="w-5 h-3 rounded-sm border-2 border-dotted border-gray-400" />
              <span className="text-[10px] text-muted-foreground">Prospective</span>
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
                      className="absolute top-0 h-full flex items-center px-3 text-[11px] font-medium text-muted-foreground border-l border-border/50"
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
                        "absolute top-0 h-full flex items-center justify-center text-[9px] border-l border-border/30",
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
                        className="absolute top-0 h-full flex items-center justify-center text-[9px] text-muted-foreground border-l border-border/30"
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
                className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                style={{ left: todayPosition }}
              />

              {/* Project bars */}
              {orderedVisibleProjects.map((project) => {
                const dates = getProjectDates(project);
                if (!dates.start || !dates.end) {
                  return (
                    <div key={project.id} style={{ height: ROW_HEIGHT }} className="relative border-b border-border/10">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground/50 italic">No dates set</span>
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
                            <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                              {project.name}
                            </span>
                          )}
                        </div>
                      )}
                      {project.category !== "online" && (
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                          {nameFitsInBar && (
                            <span className="text-[10px] font-medium text-muted-foreground truncate">
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

              <div className="text-[10px] text-muted-foreground space-y-1 mt-2">
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
