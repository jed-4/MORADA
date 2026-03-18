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
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
const MIN_PIXELS_PER_DAY = 20;

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
}

function getProjectDates(project: MasterProject): { start: Date | null; end: Date | null } {
  const mode = project.dateMode || "auto";

  if (mode === "custom" && project.customStartDate && project.customWeeks) {
    const start = new Date(project.customStartDate);
    return { start, end: addWeeks(start, project.customWeeks) };
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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(100,100,100,${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(100,100,100,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

function ProjectItems({ projectId, project, windowStart, windowEnd, totalWidth, getPos, pixelsPerDay }: {
  projectId: string;
  project: MasterProject;
  windowStart: Date;
  windowEnd: Date;
  totalWidth: number;
  getPos: (d: Date) => number;
  pixelsPerDay: number;
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
          const rawRight = getPos(new Date(item.endDate!)) + pixelsPerDay;
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

function SortableProjectRow({
  project,
  isExpanded,
  onToggle,
}: {
  project: MasterProject;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{ height: PROJECT_ROW_HEIGHT, borderLeft: `3px solid ${project.color || "#3b82f6"}` }}
        className="flex items-center pl-1.5 pr-2 border-b border-border/20 gap-1.5"
      >
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing touch-none"
          style={{ lineHeight: 0 }}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          onClick={() => onToggle(project.id)}
        >
          <span className="text-muted-foreground/60 shrink-0">
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          <div
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: project.color || "#3b82f6" }}
          />
          <span className="text-xs font-medium truncate">{project.name}</span>
        </button>
      </div>
      {isExpanded && (
        <ProjectItemsLeft projectId={project.id} project={project} />
      )}
    </div>
  );
}

export default function MasterScheduleGantt() {
  const [windowWeeks, setWindowWeeks] = useState<2 | 4 | 6>(4);
  const [windowStart, setWindowStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const windowEnd = addWeeks(windowStart, windowWeeks);
  const totalDays = windowWeeks * 7;
  const pixelsPerDay = Math.max(Math.floor(containerWidth / totalDays), MIN_PIXELS_PER_DAY);
  const totalWidth = totalDays * pixelsPerDay;

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

  const allVisibleProjects = useMemo(() => projects.filter((p) => p.isVisible), [projects]);
  const hiddenCount = projects.length - allVisibleProjects.length;

  const visibleProjects = useMemo(() => {
    return allVisibleProjects.filter((p) => {
      const dates = getProjectDates(p);
      if (!dates.start && !dates.end) return true; // keep projects with no dates
      const projectStart = dates.start ?? dates.end!;
      const projectEnd = dates.end ?? dates.start!;
      return projectStart < windowEnd && projectEnd >= windowStart;
    });
  }, [allVisibleProjects, windowStart, windowEnd]);

  // ResizeObserver: track right panel width to keep pixelsPerDay responsive
  useEffect(() => {
    const el = rightPanelRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    setContainerWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);


  const getPos = useCallback((date: Date) => {
    return differenceInDays(date, windowStart) * pixelsPerDay;
  }, [windowStart, pixelsPerDay]);

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

  // Drag-to-reorder sensors (require 8px movement to start drag, avoids accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visibleProjects.findIndex((p) => p.id === active.id);
    const newIndex = visibleProjects.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(visibleProjects, oldIndex, newIndex);

    // Optimistically update the cache so both panels reorder immediately
    queryClient.setQueryData<MasterProject[]>(["/api/business-schedule/projects"], (old = []) => {
      const visible = new Map(reordered.map((p, i) => [p.id, i]));
      return old
        .map((p) => ({
          ...p,
          sortOrder: visible.has(p.id) ? visible.get(p.id)! : p.sortOrder + reordered.length,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    });

    // Persist new sortOrders for affected projects
    reordered.forEach((project, index) => {
      if (project.sortOrder !== index) {
        updateProjectMutation.mutate({ projectId: project.id, sortOrder: index });
      }
    });
  }, [visibleProjects, updateProjectMutation]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
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
          <div className="flex-shrink-0 border-b border-border" style={{ height: 52 }}>
            <div className="h-full flex items-end pb-1 px-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Project / Item</span>
            </div>
          </div>
          <div ref={leftRef} className="overflow-y-hidden flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={visibleProjects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {visibleProjects.map((project) => (
                  <SortableProjectRow
                    key={project.id}
                    project={project}
                    isExpanded={expandedProjects.has(project.id)}
                    onToggle={toggleExpanded}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {visibleProjects.length === 0 && (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                No visible projects
              </div>
            )}
          </div>
        </div>

        {/* Right timeline panel */}
        <div ref={rightPanelRef} className="flex flex-col flex-1 overflow-hidden">
          {/* Timeline header */}
          <div className="flex-shrink-0 border-b border-border overflow-hidden" style={{ height: 52 }}>
            <div style={{ width: totalWidth }}>
              <div className="flex" style={{ height: 26 }}>
                {weeks.map((weekStart, i) => (
                  <div
                    key={i}
                    className="border-l border-border/30 flex items-center px-1.5"
                    style={{ width: 7 * pixelsPerDay, minWidth: 7 * pixelsPerDay }}
                  >
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {format(weekStart, "d MMM")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex" style={{ height: 26 }}>
                {days.map((day, i) => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`border-l border-border/20 flex items-center justify-center ${isWeekend ? "bg-muted/30" : ""}`}
                      style={{ width: pixelsPerDay, minWidth: pixelsPerDay }}
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
            className="flex-1 overflow-hidden"
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
                    style={{ left: i * pixelsPerDay, width: pixelsPerDay }}
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

              {/* Project rows — must match left panel order exactly */}
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
                  const rawRight = getPos(dates.end) + pixelsPerDay;
                  showLeftArrow = rawLeft < 0;
                  showRightArrow = rawRight > totalWidth;
                  projectBarLeft = Math.max(rawLeft, 0);
                  const clippedRight = Math.min(rawRight, totalWidth);
                  projectBarWidth = Math.max(clippedRight - projectBarLeft, 8);
                }

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
                    {milestoneLines.map((line, li) => (
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
                    ))}

                    {/* Project header bar row */}
                    <div
                      style={{ height: PROJECT_ROW_HEIGHT }}
                      className="relative border-b border-border/20 cursor-pointer"
                      onClick={() => toggleExpanded(project.id)}
                    >
                      {hasProjectDates ? (
                        <div
                          className="absolute rounded-sm overflow-hidden"
                          style={{
                            left: projectBarLeft,
                            width: projectBarWidth,
                            top: 6,
                            bottom: 6,
                            backgroundColor: hexToRgba(color, 0.28),
                            border: `2px solid ${color}`,
                          }}
                        >
                          {showLeftArrow && (
                            <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[8px] font-bold" style={{ color }}>◀</span>
                          )}
                          {showRightArrow && (
                            <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[8px] font-bold" style={{ color }}>▶</span>
                          )}
                          {projectBarWidth > 80 && !showLeftArrow && (
                            <span
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold truncate pointer-events-none"
                              style={{ color, maxWidth: projectBarWidth - 20 }}
                            >
                              {project.name}
                            </span>
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
                        pixelsPerDay={pixelsPerDay}
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
