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
import { ZoomIn, ZoomOut, Filter, ChevronLeft, ChevronRight, Calendar, ExternalLink, Settings } from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval, getISOWeek, endOfWeek, addWeeks } from "date-fns";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const ROW_HEIGHT = 40;
const ZOOM_LEVELS = { day: 30, week: 150, month: 600 };

interface BusinessProject {
  id: string;
  name: string;
  color: string;
  projectStatus: string;
  currentSystemPhase: string;
  scheduleStatus: string;
  category: "scheduled" | "unscheduled" | "prospective";
  projectStartDate: string | null;
  projectEndDate: string | null;
  itemStartDate: string | null;
  itemEndDate: string | null;
  dateMode: string;
  customStartDate: string | null;
  customWeeks: number | null;
  isVisible: boolean;
  sortOrder: number;
}

function getProjectDates(project: BusinessProject): { start: Date | null; end: Date | null } {
  const mode = project.dateMode || "auto";

  if (mode === "project") {
    if (project.projectStartDate && project.projectEndDate) {
      return { start: new Date(project.projectStartDate), end: new Date(project.projectEndDate) };
    }
    return { start: null, end: null };
  }

  if (mode === "items") {
    if (project.itemStartDate && project.itemEndDate) {
      return { start: new Date(project.itemStartDate), end: new Date(project.itemEndDate) };
    }
    return { start: null, end: null };
  }

  if (mode === "custom") {
    if (project.customStartDate && project.customWeeks) {
      const start = new Date(project.customStartDate);
      const end = addWeeks(start, project.customWeeks);
      return { start, end };
    }
    return { start: null, end: null };
  }

  if (project.projectStartDate && project.projectEndDate) {
    return { start: new Date(project.projectStartDate), end: new Date(project.projectEndDate) };
  }
  if (project.itemStartDate && project.itemEndDate) {
    return { start: new Date(project.itemStartDate), end: new Date(project.itemEndDate) };
  }
  return { start: null, end: null };
}

export default function BusinessSchedule() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("week");
  const pixelsPerDay = ZOOM_LEVELS[zoomLevel] / 7;
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const [settingsProject, setSettingsProject] = useState<BusinessProject | null>(null);

  const { data: projects = [], isLoading } = useQuery<BusinessProject[]>({
    queryKey: ["/api/business-schedule/projects"],
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, ...data }: { projectId: string; [key: string]: any }) => {
      return apiRequest(`/api/business-schedule/projects/${projectId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-schedule/projects"] });
    },
  });

  const visibleProjects = useMemo(() => {
    return projects.filter(p => p.isVisible);
  }, [projects]);

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
    if (project.category === "unscheduled") {
      return {
        backgroundColor: "transparent",
        border: "2px dashed #d97706",
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

  return (
    <div className="flex flex-col h-full" data-testid="business-schedule-page">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Business Schedule</h3>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={showFilter} onOpenChange={setShowFilter}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-filter-projects">
                <Filter className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 max-h-80 overflow-y-auto">
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
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-sm bg-blue-500" />
          <span className="text-[10px] text-muted-foreground">Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-sm border-2 border-dashed border-amber-600" />
          <span className="text-[10px] text-muted-foreground">Unscheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-sm border-2 border-dotted border-gray-400" />
          <span className="text-[10px] text-muted-foreground">Prospective</span>
        </div>
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

          {/* Project rows */}
          <div className="overflow-hidden">
            {visibleProjects.map((project) => (
              <div
                key={project.id}
                style={{ height: ROW_HEIGHT }}
                className="flex items-center px-2 gap-2 border-b border-border/30 group/row"
              >
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: project.color }} />
                <span className="text-xs font-medium truncate flex-1">{project.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover/row:opacity-100 shrink-0"
                  onClick={() => setSettingsProject(project)}
                  data-testid={`settings-${project.id}`}
                >
                  <Settings className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {visibleProjects.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground text-center">
                No projects visible. Use the filter to show projects.
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Timeline header */}
          <div className="h-[60px] border-b border-border flex-shrink-0 overflow-hidden">
            <div
              className="h-full relative"
              style={{ width: totalWidth, transform: `translateX(-${timelineRef.current?.scrollLeft || 0}px)` }}
            >
              {/* Month/Week row */}
              <div className="h-[30px] flex items-center relative">
                {weeks.map((weekStart, i) => {
                  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                  const left = getPosition(weekStart);
                  const width = 7 * pixelsPerDay;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-center justify-center text-[10px] text-muted-foreground border-l border-border/50"
                      style={{ left, width }}
                    >
                      {zoomLevel === 'month'
                        ? format(weekStart, 'MMM yyyy')
                        : `W${getISOWeek(weekStart)} · ${format(weekStart, 'MMM d')}`}
                    </div>
                  );
                })}
              </div>

              {/* Day row */}
              <div className="h-[30px] flex items-center relative">
                {zoomLevel === 'day' && days.map((day, i) => {
                  const left = getPosition(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 h-full flex items-center justify-center text-[9px] border-l border-border/30",
                        isWeekend ? "text-muted-foreground/50" : "text-muted-foreground"
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
            <div className="relative" style={{ width: totalWidth, minHeight: visibleProjects.length * ROW_HEIGHT }}>
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
                if (day.getDay() === 0 || day.getDay() === 6) {
                  const left = getPosition(day);
                  return (
                    <div
                      key={`weekend-${i}`}
                      className="absolute top-0 bottom-0 bg-muted/30"
                      style={{ left, width: pixelsPerDay }}
                    />
                  );
                }
                return null;
              })}

              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                style={{ left: todayPosition }}
              />

              {/* Project bars */}
              {visibleProjects.map((project, rowIndex) => {
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
                      {project.category === "scheduled" && (
                        <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                          {nameFitsInBar && (
                            <span className="text-[10px] font-medium text-white truncate drop-shadow-sm">
                              {project.name}
                            </span>
                          )}
                        </div>
                      )}
                      {project.category !== "scheduled" && (
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
                {settingsProject.projectStartDate && (
                  <div>Project dates: {format(new Date(settingsProject.projectStartDate), 'MMM d, yyyy')} - {settingsProject.projectEndDate ? format(new Date(settingsProject.projectEndDate), 'MMM d, yyyy') : 'not set'}</div>
                )}
                {settingsProject.itemStartDate && (
                  <div>Schedule items: {format(new Date(settingsProject.itemStartDate), 'MMM d, yyyy')} - {format(new Date(settingsProject.itemEndDate!), 'MMM d, yyyy')}</div>
                )}
                {!settingsProject.projectStartDate && !settingsProject.itemStartDate && settingsProject.dateMode !== "custom" && (
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
