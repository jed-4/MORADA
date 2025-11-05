import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown } from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval } from "date-fns";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import type { GanttStage, GanttSubtask } from "@shared/schema";

type ZoomLevel = 'day' | 'week' | 'month';

export default function Gantt() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    type: 'stage' | 'subtask';
    id: string;
    startX: number;
    originalStart: Date;
    duration: number;
  } | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);

  // Fetch stages
  const { data: stages = [], isLoading } = useQuery<GanttStage[]>({
    queryKey: [`/api/projects/${projectId}/gantt/stages`],
  });

  // Fetch subtasks for all stages
  const stageIds = useMemo(() => stages.map(s => s.id), [stages]);
  const { data: subtasksByStage = {} } = useQuery({
    queryKey: [`/api/projects/${projectId}/gantt/subtasks`, ...stageIds],
    queryFn: async () => {
      const result: Record<string, GanttSubtask[]> = {};
      await Promise.all(
        stageIds.map(async (stageId) => {
          const response = await fetch(`/api/projects/${projectId}/gantt/stages/${stageId}/subtasks`);
          result[stageId] = response.ok ? await response.json() : [];
        })
      );
      return result;
    },
    enabled: stageIds.length > 0,
  });

  // Update mutations
  const updateStageMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startDate, endDate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Stage updated" });
    },
  });

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/subtasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startDate, endDate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      toast({ title: "Subtask updated" });
    },
  });

  // Calculate timeline bounds
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    if (stages.length === 0) {
      const start = startOfWeek(new Date());
      const end = addDays(start, 90);
      return { timelineStart: start, timelineEnd: end, totalDays: 90 };
    }

    const allDates = stages.flatMap(s => [new Date(s.startDate), new Date(s.endDate)]);
    Object.values(subtasksByStage).flat().forEach(st => {
      allDates.push(new Date(st.startDate), new Date(st.endDate));
    });

    const start = startOfWeek(new Date(Math.min(...allDates.map(d => d.getTime()))));
    const end = addDays(new Date(Math.max(...allDates.map(d => d.getTime()))), 14);
    const days = differenceInDays(end, start);

    return { timelineStart: start, timelineEnd: end, totalDays: days };
  }, [stages, subtasksByStage]);

  // Generate timeline headers based on zoom level
  const timelineHeaders = useMemo(() => {
    if (zoomLevel === 'week') {
      return eachWeekOfInterval({ start: timelineStart, end: timelineEnd }).map(week => ({
        date: week,
        label: format(week, 'MMM d'),
        width: 140, // pixels per week
      }));
    } else if (zoomLevel === 'day') {
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map(day => ({
        date: day,
        label: format(day, 'd'),
        width: 40, // pixels per day
      }));
    } else {
      // month view - group by weeks
      return eachWeekOfInterval({ start: timelineStart, end: timelineEnd }).map(week => ({
        date: week,
        label: format(week, 'MMM d'),
        width: 80, // pixels per week in month view
      }));
    }
  }, [timelineStart, timelineEnd, zoomLevel]);

  const timelineWidth = timelineHeaders.reduce((sum, h) => sum + h.width, 0);
  const pixelsPerDay = timelineWidth / totalDays;

  // Convert date to pixel position
  const getPosition = (date: Date) => {
    const days = differenceInDays(date, timelineStart);
    return days * pixelsPerDay;
  };

  // Get bar color based on status
  const getBarColor = (status?: string, isDelayed?: boolean) => {
    if (isDelayed) return '#ef4444'; // red for overdue
    if (status === 'completed') return '#22c55e'; // green
    if (status === 'in-progress') return '#eab308'; // yellow
    return '#bba7db'; // default lilac
  };

  // Drag handlers
  const handleBarMouseDown = (
    e: React.MouseEvent,
    type: 'stage' | 'subtask',
    id: string,
    startDate: Date,
    endDate: Date
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragging({
      type,
      id,
      startX: e.clientX,
      originalStart: startDate,
      duration: differenceInDays(endDate, startDate),
    });

    // Ripple effect
    setRipple({ x: e.clientX, y: e.clientY });
    setTimeout(() => setRipple(null), 600);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging || !timelineRef.current) return;

    const deltaX = e.clientX - dragging.startX;
    const deltaDays = Math.round(deltaX / pixelsPerDay);
    
    if (deltaDays === 0) return; // No change

    const newStart = addDays(dragging.originalStart, deltaDays);
    const newEnd = addDays(newStart, dragging.duration);

    if (dragging.type === 'stage') {
      updateStageMutation.mutate({
        id: dragging.id,
        startDate: newStart,
        endDate: newEnd,
      });
    } else {
      updateSubtaskMutation.mutate({
        id: dragging.id,
        startDate: newStart,
        endDate: newEnd,
      });
    }

    setDragging(null);
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Attach global listeners
  useMemo(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging]);

  const toggleCollapse = (stageId: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  // Today line
  const todayPosition = getPosition(new Date());

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading timeline...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-semibold" style={{ fontFamily: 'Clash Grotesk, sans-serif' }}>
          Project Timeline
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel('day')}
            className={zoomLevel === 'day' ? 'bg-accent' : ''}
            data-testid="button-zoom-day"
          >
            Day
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel('week')}
            className={zoomLevel === 'week' ? 'bg-accent' : ''}
            data-testid="button-zoom-week"
          >
            Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel('month')}
            className={zoomLevel === 'month' ? 'bg-accent' : ''}
            data-testid="button-zoom-month"
          >
            Month
          </Button>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task Names Column (Fixed) */}
        <div className="w-64 border-r flex flex-col bg-card">
          {/* Header spacer */}
          <div className="h-12 border-b flex items-center px-4 text-sm font-medium text-muted-foreground">
            Task Name
          </div>
          
          {/* Task rows */}
          <div className="flex-1 overflow-y-auto">
            {stages.map((stage) => {
              const isCollapsed = collapsedStages.has(stage.id);
              const subtasks = subtasksByStage[stage.id] || [];

              return (
                <div key={stage.id}>
                  {/* Stage row */}
                  <div
                    className="h-10 flex items-center px-2 border-b hover-elevate active-elevate-2 cursor-pointer group"
                    data-testid={`row-stage-${stage.id}`}
                  >
                    <button
                      onClick={() => toggleCollapse(stage.id)}
                      className="p-1 hover:bg-accent rounded mr-1"
                      data-testid={`button-toggle-${stage.id}`}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <span className="font-medium text-sm truncate flex-1">{stage.name}</span>
                  </div>

                  {/* Subtask rows */}
                  {!isCollapsed && subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="h-10 flex items-center pl-10 pr-2 border-b hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`row-subtask-${subtask.id}`}
                    >
                      <span className="text-sm text-muted-foreground truncate">{subtask.name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Scroll Container */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div style={{ width: `${timelineWidth}px`, position: 'relative' }}>
            {/* Timeline Header */}
            <div className="h-12 border-b bg-card sticky top-0 z-10 flex">
              {timelineHeaders.map((header, idx) => (
                <div
                  key={idx}
                  className="border-r text-sm font-medium text-center py-3"
                  style={{ width: `${header.width}px` }}
                >
                  {header.label}
                </div>
              ))}
            </div>

            {/* Timeline Bars */}
            <div className="relative">
              {stages.map((stage) => {
                const isCollapsed = collapsedStages.has(stage.id);
                const subtasks = subtasksByStage[stage.id] || [];
                const stageStart = getPosition(new Date(stage.startDate));
                const stageDuration = differenceInDays(new Date(stage.endDate), new Date(stage.startDate)) + 1;
                const stageWidth = stageDuration * pixelsPerDay;
                const barColor = getBarColor(stage.status, stage.isDelayed);

                return (
                  <div key={stage.id}>
                    {/* Stage bar row */}
                    <div className="h-10 border-b relative group">
                      <div
                        className="absolute top-2 h-6 rounded flex items-center px-2 cursor-move shadow-sm hover:shadow-md transition-shadow"
                        style={{
                          left: `${stageStart}px`,
                          width: `${stageWidth}px`,
                          backgroundColor: barColor,
                          border: stage.isDelayed ? '2px dashed #dc2626' : 'none',
                        }}
                        onMouseDown={(e) => handleBarMouseDown(e, 'stage', stage.id, new Date(stage.startDate), new Date(stage.endDate))}
                        data-testid={`bar-stage-${stage.id}`}
                      >
                        <span className="text-xs font-medium text-white truncate">
                          {format(new Date(stage.startDate), 'MMM d')} - {format(new Date(stage.endDate), 'MMM d')}
                        </span>
                      </div>
                    </div>

                    {/* Subtask bar rows */}
                    {!isCollapsed && subtasks.map((subtask) => {
                      const subtaskStart = getPosition(new Date(subtask.startDate));
                      const subtaskDuration = differenceInDays(new Date(subtask.endDate), new Date(subtask.startDate)) + 1;
                      const subtaskWidth = subtaskDuration * pixelsPerDay;
                      const subtaskColor = getBarColor(subtask.status, subtask.isDelayed);

                      return (
                        <div key={subtask.id} className="h-10 border-b relative group">
                          <div
                            className="absolute top-2 h-6 rounded flex items-center px-2 cursor-move shadow-sm hover:shadow-md transition-shadow"
                            style={{
                              left: `${subtaskStart}px`,
                              width: `${subtaskWidth}px`,
                              backgroundColor: subtaskColor,
                              border: '2px dotted rgba(255, 255, 255, 0.6)',
                            }}
                            onMouseDown={(e) => handleBarMouseDown(e, 'subtask', subtask.id, new Date(subtask.startDate), new Date(subtask.endDate))}
                            data-testid={`bar-subtask-${subtask.id}`}
                          >
                            <span className="text-xs font-medium text-white truncate">
                              {format(new Date(subtask.startDate), 'MMM d')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                style={{ left: `${todayPosition}px` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ripple effect */}
      {ripple && (
        <div
          className="fixed w-12 h-12 rounded-full bg-primary/20 pointer-events-none animate-ping"
          style={{
            left: ripple.x - 24,
            top: ripple.y - 24,
          }}
        />
      )}
    </div>
  );
}
