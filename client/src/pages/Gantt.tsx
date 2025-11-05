import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown, User } from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval } from "date-fns";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ScheduleItem } from "@shared/schema";

type ZoomLevel = 'day' | 'week' | 'month';

export default function Gantt() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('week');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    originalStart: Date;
    duration: number;
  } | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleItem | null>(null);

  // Fetch schedule items for this project
  const { data: allItems = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
  });

  // Separate items into parent items and child items
  const { parentItems, childItemsByParent } = useMemo(() => {
    const parents: ScheduleItem[] = [];
    const children: Record<string, ScheduleItem[]> = {};

    allItems.forEach(item => {
      if (item.parentItemId) {
        if (!children[item.parentItemId]) {
          children[item.parentItemId] = [];
        }
        children[item.parentItemId].push(item);
      } else {
        parents.push(item);
      }
    });

    // Sort parent items by sortOrder
    parents.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // Sort child items within each parent
    Object.keys(children).forEach(parentId => {
      children[parentId].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    });

    return { parentItems: parents, childItemsByParent: children };
  }, [allItems]);

  // Update mutation for schedule items
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/schedule-items/${id}`, "PATCH", { startDate, endDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item updated" });
    },
  });

  // Calculate timeline bounds
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    if (allItems.length === 0) {
      const start = startOfWeek(new Date());
      const end = addDays(start, 90);
      return { timelineStart: start, timelineEnd: end, totalDays: 90 };
    }

    const allDates = allItems.flatMap(item => [
      new Date(item.startDate), 
      new Date(item.endDate)
    ]);

    const start = startOfWeek(new Date(Math.min(...allDates.map(d => d.getTime()))));
    const end = addDays(new Date(Math.max(...allDates.map(d => d.getTime()))), 14);
    const days = differenceInDays(end, start) + 1;

    return { timelineStart: start, timelineEnd: end, totalDays: days };
  }, [allItems]);

  // Generate timeline headers based on zoom level
  const timelineHeaders = useMemo(() => {
    if (zoomLevel === 'day') {
      return eachDayOfInterval({ start: timelineStart, end: timelineEnd }).map(day => ({
        date: day,
        label: format(day, 'EEE d'),
        width: 40,
      }));
    } else if (zoomLevel === 'week') {
      const weeks = eachWeekOfInterval({ start: timelineStart, end: timelineEnd });
      return weeks.map((week, idx) => {
        const nextWeek = weeks[idx + 1];
        const segmentEnd = nextWeek ? addDays(nextWeek, -1) : timelineEnd;
        const daysInSegment = differenceInDays(segmentEnd, week) + 1;
        return {
          date: week,
          label: format(week, 'EEE MMM d'),
          width: daysInSegment * 20,
        };
      });
    } else {
      const weeks = eachWeekOfInterval({ start: timelineStart, end: timelineEnd });
      return weeks.map((week, idx) => {
        const nextWeek = weeks[idx + 1];
        const segmentEnd = nextWeek ? addDays(nextWeek, -1) : timelineEnd;
        const daysInSegment = differenceInDays(segmentEnd, week) + 1;
        return {
          date: week,
          label: format(week, 'MMM d'),
          width: daysInSegment * 10,
        };
      });
    }
  }, [timelineStart, timelineEnd, zoomLevel]);

  // Calculate pixels per day based on zoom level
  const pixelsPerDay = useMemo(() => {
    if (zoomLevel === 'day') return 40;
    if (zoomLevel === 'week') return 20;
    return 10;
  }, [zoomLevel]);

  const timelineWidth = totalDays * pixelsPerDay;

  // Convert date to pixel position
  const getPosition = (date: Date) => {
    const days = differenceInDays(date, timelineStart);
    return days * pixelsPerDay;
  };

  // Calculate effective dates for parent items (span across all children)
  const getEffectiveDates = (parentItem: ScheduleItem) => {
    const children = childItemsByParent[parentItem.id] || [];
    
    if (children.length === 0) {
      // No children, use parent's own dates
      return {
        startDate: new Date(parentItem.startDate),
        endDate: new Date(parentItem.endDate),
      };
    }
    
    // Get earliest start and latest end from children
    const childDates = children.flatMap(child => [
      new Date(child.startDate),
      new Date(child.endDate)
    ]);
    
    const minStart = new Date(Math.min(...childDates.map(d => d.getTime())));
    const maxEnd = new Date(Math.max(...childDates.map(d => d.getTime())));
    
    return {
      startDate: minStart,
      endDate: maxEnd,
    };
  };

  // Get bar color based on status or custom color
  const getBarColor = (item: ScheduleItem) => {
    // Use custom color if set
    if (item.color) return item.color;
    
    // Check if overdue
    const isOverdue = new Date(item.endDate) < new Date() && item.status !== 'completed';
    if (isOverdue) return '#ef4444'; // red for overdue
    
    // Status colors
    if (item.status === 'completed') return '#22c55e'; // green
    if (item.status === 'in_progress') return '#eab308'; // yellow
    return '#bba7db'; // default lilac
  };

  // Bar click handler - open modal or start drag
  const handleBarClick = (e: React.MouseEvent, item: ScheduleItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    setSelectedTask(item);

    // Ripple effect
    setRipple({ x: e.clientX, y: e.clientY });
    setTimeout(() => setRipple(null), 600);
  };

  // Drag handlers
  const handleBarMouseDown = (
    e: React.MouseEvent,
    item: ScheduleItem
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only start dragging if holding shift key (otherwise click opens modal)
    if (!e.shiftKey) return;
    
    setDragging({
      id: item.id,
      startX: e.clientX,
      originalStart: new Date(item.startDate),
      duration: differenceInDays(new Date(item.endDate), new Date(item.startDate)),
    });
  };

  // Attach global listeners with proper cleanup
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging || !timelineRef.current) return;

      const deltaX = e.clientX - dragging.startX;
      const deltaDays = Math.round(deltaX / pixelsPerDay);
      
      if (deltaDays === 0) return;

      const newStart = addDays(dragging.originalStart, deltaDays);
      const newEnd = addDays(newStart, dragging.duration);

      updateItemMutation.mutate({
        id: dragging.id,
        startDate: newStart,
        endDate: newEnd,
      });

      setDragging(null);
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, pixelsPerDay, updateItemMutation]);

  const toggleCollapse = (itemId: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
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
            {parentItems.map((parentItem) => {
              const isCollapsed = collapsedItems.has(parentItem.id);
              const childItems = childItemsByParent[parentItem.id] || [];

              return (
                <div key={parentItem.id}>
                  {/* Parent item row */}
                  <div
                    className="h-10 flex items-center px-2 border-b hover-elevate active-elevate-2 cursor-pointer group"
                    data-testid={`row-parent-${parentItem.id}`}
                  >
                    {childItems.length > 0 && (
                      <button
                        onClick={() => toggleCollapse(parentItem.id)}
                        className="p-1 hover:bg-accent rounded mr-1"
                        data-testid={`button-toggle-${parentItem.id}`}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {childItems.length === 0 && <div className="w-6" />}
                    <span className="font-medium text-sm truncate flex-1">{parentItem.name}</span>
                    <div className="flex items-center gap-1 ml-2">
                      {parentItem.status && (
                        <Badge variant="secondary" className="text-xs px-1.5 h-5">
                          {parentItem.status}
                        </Badge>
                      )}
                      {parentItem.assignedToName && (
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-[10px]">
                            {parentItem.assignedToName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </div>

                  {/* Child item rows */}
                  {!isCollapsed && childItems.map((childItem) => (
                    <div
                      key={childItem.id}
                      className="h-10 flex items-center pl-10 pr-2 border-b hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`row-child-${childItem.id}`}
                    >
                      <span className="text-sm text-muted-foreground truncate flex-1">{childItem.name}</span>
                      <div className="flex items-center gap-1 ml-2">
                        {childItem.status && (
                          <Badge variant="outline" className="text-xs px-1.5 h-5">
                            {childItem.status}
                          </Badge>
                        )}
                        {childItem.assignedToName && (
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px]">
                              {childItem.assignedToName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
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
              {parentItems.map((parentItem) => {
                const isCollapsed = collapsedItems.has(parentItem.id);
                const childItems = childItemsByParent[parentItem.id] || [];
                
                // Calculate effective dates (span across children if they exist)
                const effectiveDates = getEffectiveDates(parentItem);
                const parentStart = getPosition(effectiveDates.startDate);
                const parentDuration = differenceInDays(effectiveDates.endDate, effectiveDates.startDate) + 1;
                const parentWidth = parentDuration * pixelsPerDay;
                const barColor = getBarColor(parentItem);
                const isOverdue = new Date(parentItem.endDate) < new Date() && parentItem.status !== 'completed';

                return (
                  <div key={parentItem.id}>
                    {/* Parent item bar row */}
                    <div className="h-10 border-b relative group">
                      <div
                        className="absolute top-2 h-6 rounded flex items-center px-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                        style={{
                          left: `${parentStart}px`,
                          width: `${parentWidth}px`,
                          backgroundColor: barColor,
                          border: isOverdue ? '2px dashed #dc2626' : 'none',
                        }}
                        onClick={(e) => handleBarClick(e, parentItem)}
                        onMouseDown={(e) => handleBarMouseDown(e, parentItem)}
                        data-testid={`bar-parent-${parentItem.id}`}
                      >
                        <span className="text-xs font-medium text-white truncate">
                          {format(effectiveDates.startDate, 'MMM d')} - {format(effectiveDates.endDate, 'MMM d')}
                        </span>
                      </div>
                    </div>

                    {/* Child item bar rows */}
                    {!isCollapsed && childItems.map((childItem) => {
                      const childStart = getPosition(new Date(childItem.startDate));
                      const childDuration = differenceInDays(new Date(childItem.endDate), new Date(childItem.startDate)) + 1;
                      const childWidth = childDuration * pixelsPerDay;
                      const childColor = getBarColor(childItem);

                      return (
                        <div key={childItem.id} className="h-10 border-b relative group">
                          <div
                            className="absolute top-2 h-6 rounded flex items-center px-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                            style={{
                              left: `${childStart}px`,
                              width: `${childWidth}px`,
                              backgroundColor: childColor,
                              border: '2px dotted rgba(255, 255, 255, 0.6)',
                            }}
                            onClick={(e) => handleBarClick(e, childItem)}
                            onMouseDown={(e) => handleBarMouseDown(e, childItem)}
                            data-testid={`bar-child-${childItem.id}`}
                          >
                            <span className="text-xs font-medium text-white truncate">
                              {format(new Date(childItem.startDate), 'MMM d')}
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

      {/* Task Detail Modal */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-task-detail">
          <DialogHeader>
            <DialogTitle className="text-xl" style={{ fontFamily: 'Clash Grotesk, sans-serif' }}>
              {selectedTask?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedTask?.description && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                <p className="text-sm">{selectedTask.description}</p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Start Date</h3>
                <p className="text-sm font-medium">
                  {selectedTask && format(new Date(selectedTask.startDate), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">End Date</h3>
                <p className="text-sm font-medium">
                  {selectedTask && format(new Date(selectedTask.endDate), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
                <Badge variant="secondary" className="mt-1">
                  {selectedTask?.status || 'Not set'}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Assignee</h3>
                <div className="flex items-center gap-2 mt-1">
                  {selectedTask?.assignedToName ? (
                    <>
                      <Avatar className="w-6 h-6">
                        <AvatarFallback>
                          {selectedTask.assignedToName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{selectedTask.assignedToName}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not assigned</span>
                  )}
                </div>
              </div>
            </div>

            {selectedTask?.type && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Type</h3>
                <Badge variant="outline" className="mt-1">
                  {selectedTask.type}
                </Badge>
              </div>
            )}

            {selectedTask?.priority && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Priority</h3>
                <Badge variant="outline" className="mt-1">
                  {selectedTask.priority}
                </Badge>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
