import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Filter,
  Calendar,
} from "lucide-react";
import {
  format,
  differenceInDays,
  addDays,
  addWeeks,
  startOfWeek,
  eachWeekOfInterval,
  eachDayOfInterval,
} from "date-fns";

const LEFT_PANEL_WIDTH = 240;
const PROJECT_ROW_HEIGHT = 36;
const ITEM_ROW_HEIGHT = 28;
const PIXELS_PER_DAY = 28;

interface MasterProject {
  id: string;
  name: string;
  color: string;
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
  contractStartDate: string | null;
  contractEndDate: string | null;
  milestoneStartItemId: string | null;
  milestoneEndItemId: string | null;
  milestoneStartDate: string | null;
  milestoneEndDate: string | null;
}

interface ScheduleItem {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  assignedToName: string | null;
  assignedToColor: string | null;
  parentItemId: string | null;
  sortOrder: number;
  type: string;
}

function getProjectDates(project: MasterProject): { start: Date | null; end: Date | null } {
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
      return { start, end: addWeeks(start, project.customWeeks) };
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function ProjectItems({ projectId, project, windowStart, windowEnd, totalWidth, getPos }: {
  projectId: string;
  project: MasterProject;
  windowStart: Date;
  windowEnd: Date;
  totalWidth: number;
  getPos: (d: Date) => number;
}) {
  const { data: items = [] } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/business-schedule/projects", projectId, "schedule-items"],
    queryFn: async () => {
      const res = await fetch(`/api/business-schedule/projects/${projectId}/schedule-items`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const color = project.color || "#3b82f6";

  return (
    <>
      {items.map((item) => {
        const hasStart = !!item.startDate;
        const hasEnd = !!item.endDate;
        const isCompanyAssigned = !item.assignedToColor && !!item.assignedToName;
        const barFill = isCompanyAssigned ? hexToRgba(color, 0.75) : hexToRgba(color, 0.35);
        const barBorder = isCompanyAssigned ? color : hexToRgba(color, 0.6);

        let barLeft = 0;
        let barWidth = 0;
        let showLeftArrow = false;
        let showRightArrow = false;

        if (hasStart && hasEnd) {
          const rawLeft = getPos(new Date(item.startDate!));
          const rawRight = getPos(new Date(item.endDate!));
          showLeftArrow = rawLeft < 0;
          showRightArrow = rawRight > totalWidth;
          barLeft = Math.max(rawLeft, 0);
          const clippedRight = Math.min(rawRight, totalWidth);
          barWidth = Math.max(clippedRight - barLeft, 4);
        }

        return (
          <div
            key={item.id}
            style={{ height: ITEM_ROW_HEIGHT }}
            className="relative border-b border-border/10 flex items-center"
          >
            {hasStart && hasEnd ? (
              <div
                className="absolute rounded-sm"
                style={{
                  left: barLeft,
                  width: barWidth,
                  top: 4,
                  bottom: 4,
                  backgroundColor: barFill,
                  border: `1px solid ${barBorder}`,
                }}
              >
                {showLeftArrow && (
                  <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[8px] text-white/80 font-bold">◀</span>
                )}
                {showRightArrow && (
                  <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[8px] text-white/80 font-bold">▶</span>
                )}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-[9px] text-muted-foreground/40 italic">No date</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ProjectItemsLeft({ projectId, project }: { projectId: string; project: MasterProject }) {
  const { data: items = [] } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/business-schedule/projects", projectId, "schedule-items"],
    queryFn: async () => {
      const res = await fetch(`/api/business-schedule/projects/${projectId}/schedule-items`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          style={{ height: ITEM_ROW_HEIGHT }}
          className="flex items-center px-3 border-b border-border/10 gap-1.5"
        >
          <div className="w-3 shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate pl-2">{item.name}</span>
          {item.assignedToName && (
            <span
              className="text-[9px] ml-auto shrink-0 truncate max-w-[60px]"
              style={{ color: item.assignedToColor || undefined }}
            >
              {item.assignedToName}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

export default function MasterScheduleGantt() {
  const [windowWeeks, setWindowWeeks] = useState<2 | 4 | 6>(4);
  const [windowStart, setWindowStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  const windowEnd = addWeeks(windowStart, windowWeeks);
  const totalDays = windowWeeks * 7;
  const totalWidth = totalDays * PIXELS_PER_DAY;

  const { data: projects = [] } = useQuery<MasterProject[]>({
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

  const visibleProjects = useMemo(() => projects.filter((p) => p.isVisible), [projects]);

  const hiddenCount = projects.length - visibleProjects.length;

  const getPos = useCallback((date: Date) => {
    return differenceInDays(date, windowStart) * PIXELS_PER_DAY;
  }, [windowStart]);

  const todayPos = getPos(new Date());

  const weeks = useMemo(() => {
    return eachWeekOfInterval({ start: windowStart, end: addDays(windowEnd, -1) }, { weekStartsOn: 1 });
  }, [windowStart, windowEnd]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: windowStart, end: addDays(windowEnd, -1) });
  }, [windowStart, windowEnd]);

  const goToToday = useCallback(() => {
    setWindowStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }, []);

  const goPrev = useCallback(() => {
    setWindowStart((s) => addWeeks(s, -windowWeeks));
  }, [windowWeeks]);

  const goNext = useCallback(() => {
    setWindowStart((s) => addWeeks(s, windowWeeks));
  }, [windowWeeks]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSyncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (leftRef.current) {
      leftRef.current.scrollTop = (e.target as HTMLElement).scrollTop;
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          {/* Window navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-7 w-7">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday} className="h-7 px-2 text-xs">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-7 w-7">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <span className="text-xs text-muted-foreground border-l pl-2">
            {format(windowStart, "d MMM")} – {format(addDays(windowEnd, -1), "d MMM yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Window size */}
          <div className="flex items-center border rounded-md overflow-hidden">
            {([2, 4, 6] as const).map((w) => (
              <button
                key={w}
                className={`h-7 px-2.5 text-xs ${windowWeeks === w ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                onClick={() => setWindowWeeks(w)}
              >
                {w}w
              </button>
            ))}
          </div>

          {/* Filter */}
          <Popover open={showFilter} onOpenChange={setShowFilter}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 relative">
                <Filter className="w-3.5 h-3.5" />
                {hiddenCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                    {hiddenCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 max-h-80 overflow-y-auto">
              <div className="text-xs font-medium mb-2">Show Projects</div>
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={p.isVisible}
                    onCheckedChange={(checked) => {
                      updateProjectMutation.mutate({ projectId: p.id, isVisible: !!checked });
                    }}
                  />
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-xs truncate">{p.name}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div
          style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
          className="flex flex-col border-r border-border overflow-hidden flex-shrink-0"
        >
          {/* Header spacer matching timeline header */}
          <div className="flex-shrink-0 border-b border-border" style={{ height: 52 }}>
            <div className="h-full flex items-end pb-1 px-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Project / Item</span>
            </div>
          </div>
          {/* Rows */}
          <div ref={leftRef} className="overflow-y-hidden flex-1">
            {visibleProjects.map((project) => {
              const isExpanded = expandedProjects.has(project.id);
              return (
                <div key={project.id}>
                  {/* Project header row */}
                  <div
                    style={{ height: PROJECT_ROW_HEIGHT }}
                    className="flex items-center px-2 border-b border-border/20 gap-1.5 cursor-pointer hover-elevate"
                    onClick={() => toggleExpanded(project.id)}
                  >
                    <span className="text-muted-foreground/60 shrink-0">
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                    <div
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: project.color || "#3b82f6" }}
                    />
                    <span className="text-xs font-medium truncate">{project.name}</span>
                  </div>
                  {/* Item rows */}
                  {isExpanded && (
                    <ProjectItemsLeft projectId={project.id} project={project} />
                  )}
                </div>
              );
            })}
            {visibleProjects.length === 0 && (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                No visible projects
              </div>
            )}
          </div>
        </div>

        {/* Right timeline panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Timeline header */}
          <div className="flex-shrink-0 border-b border-border overflow-hidden" style={{ height: 52 }}>
            <div style={{ width: totalWidth }}>
              {/* Month/week label row */}
              <div className="flex" style={{ height: 26 }}>
                {weeks.map((weekStart, i) => (
                  <div
                    key={i}
                    className="border-l border-border/30 flex items-center px-1.5"
                    style={{ width: 7 * PIXELS_PER_DAY, minWidth: 7 * PIXELS_PER_DAY }}
                  >
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {format(weekStart, "d MMM")}
                    </span>
                  </div>
                ))}
              </div>
              {/* Day labels row */}
              <div className="flex" style={{ height: 26 }}>
                {days.map((day, i) => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`border-l border-border/20 flex items-center justify-center ${isWeekend ? "bg-muted/30" : ""}`}
                      style={{ width: PIXELS_PER_DAY, minWidth: PIXELS_PER_DAY }}
                    >
                      <span className="text-[9px] text-muted-foreground/70">{format(day, "EEE")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Timeline body */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-auto"
            onScroll={handleSyncScroll}
          >
            <div className="relative" style={{ width: totalWidth }}>
              {/* Weekend shading */}
              {days.map((day, i) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                if (!isWeekend) return null;
                return (
                  <div
                    key={`weekend-${i}`}
                    className="absolute top-0 bottom-0 bg-muted/25 pointer-events-none"
                    style={{ left: i * PIXELS_PER_DAY, width: PIXELS_PER_DAY }}
                  />
                );
              })}

              {/* Week grid lines */}
              {weeks.map((weekStart, i) => (
                <div
                  key={`grid-${i}`}
                  className="absolute top-0 bottom-0 border-l border-border/20 pointer-events-none"
                  style={{ left: getPos(weekStart) }}
                />
              ))}

              {/* Today line */}
              {todayPos >= 0 && todayPos <= totalWidth && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                  style={{ left: todayPos }}
                />
              )}

              {/* Project rows */}
              {visibleProjects.map((project) => {
                const isExpanded = expandedProjects.has(project.id);
                const dates = getProjectDates(project);
                const color = project.color || "#3b82f6";

                let projectBarLeft = 0;
                let projectBarWidth = 0;
                let showLeftArrow = false;
                let showRightArrow = false;
                let hasProjectDates = false;

                if (dates.start && dates.end) {
                  hasProjectDates = true;
                  const rawLeft = getPos(dates.start);
                  const rawRight = getPos(dates.end);
                  showLeftArrow = rawLeft < 0;
                  showRightArrow = rawRight > totalWidth;
                  projectBarLeft = Math.max(rawLeft, 0);
                  const clippedRight = Math.min(rawRight, totalWidth);
                  projectBarWidth = Math.max(clippedRight - projectBarLeft, 8);
                }

                // Milestone / contract lines for this project
                const milestoneLines: { pos: number; label: string; solid: boolean }[] = [];
                if (project.contractStartDate) {
                  const p = getPos(new Date(project.contractStartDate));
                  if (p >= 0 && p <= totalWidth) milestoneLines.push({ pos: p, label: "Start", solid: false });
                }
                if (project.contractEndDate) {
                  const p = getPos(new Date(project.contractEndDate));
                  if (p >= 0 && p <= totalWidth) milestoneLines.push({ pos: p, label: "End", solid: false });
                }
                if (project.milestoneStartDate) {
                  const p = getPos(new Date(project.milestoneStartDate));
                  if (p >= 0 && p <= totalWidth) milestoneLines.push({ pos: p, label: "Build Start", solid: true });
                }
                if (project.milestoneEndDate) {
                  const p = getPos(new Date(project.milestoneEndDate));
                  if (p >= 0 && p <= totalWidth) milestoneLines.push({ pos: p, label: "Build End", solid: true });
                }

                return (
                  <div key={project.id} className="relative">
                    {/* Milestone vertical lines for this project group */}
                    {milestoneLines.map((line, li) => {
                      const rowCount = 1 + (isExpanded ? 0 : 0); // approximate; we use CSS height
                      return (
                        <div
                          key={`line-${li}`}
                          className="absolute top-0 pointer-events-none z-10"
                          style={{
                            left: line.pos,
                            width: 2,
                            bottom: 0,
                            borderLeft: `2px ${line.solid ? "solid" : "dashed"} ${color}`,
                          }}
                        >
                          <span
                            className="absolute top-0.5 left-1 text-[8px] font-semibold whitespace-nowrap"
                            style={{ color }}
                          >
                            {line.label}
                          </span>
                        </div>
                      );
                    })}

                    {/* Project header bar row */}
                    <div
                      style={{ height: PROJECT_ROW_HEIGHT }}
                      className="relative border-b border-border/20 cursor-pointer"
                      onClick={() => toggleExpanded(project.id)}
                    >
                      {hasProjectDates ? (
                        <div
                          className="absolute rounded-sm"
                          style={{
                            left: projectBarLeft,
                            width: projectBarWidth,
                            top: 6,
                            bottom: 6,
                            backgroundColor: hexToRgba(color, 0.18),
                            border: `1.5px solid ${color}`,
                          }}
                        >
                          {showLeftArrow && (
                            <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[8px] font-bold" style={{ color }}>◀</span>
                          )}
                          {showRightArrow && (
                            <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[8px] font-bold" style={{ color }}>▶</span>
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center px-2">
                          <span className="text-[9px] text-muted-foreground/40 italic">No dates</span>
                        </div>
                      )}
                    </div>

                    {/* Expanded schedule items */}
                    {isExpanded && (
                      <ProjectItems
                        projectId={project.id}
                        project={project}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                        totalWidth={totalWidth}
                        getPos={getPos}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

