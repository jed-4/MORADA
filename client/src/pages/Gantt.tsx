import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown, User, Search, Filter, Columns, MoreVertical, FileText, Edit, Eye, Copy, Check, Palette, Trash2 } from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval } from "date-fns";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useScheduleItemStatusOptions } from "@/hooks/useScheduleItemStatusOptions";
import type { ScheduleItem } from "@shared/schema";

type ZoomLevel = 'day' | 'week' | 'month';

interface GanttProps {
  onEditItem?: (item: ScheduleItem) => void;
}

export default function Gantt({ onEditItem }: GanttProps = {}) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { getStatusInfo } = useScheduleItemStatusOptions();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    originalStart: Date;
    duration: number;
  } | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    assignee: true,
    status: true,
    completion: false,
  });
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Fetch schedule items for this project
  const { data: allItems = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
  });

  // Separate items into parent items and child items, with search filtering
  const { parentItems, childItemsByParent } = useMemo(() => {
    const parents: ScheduleItem[] = [];
    const children: Record<string, ScheduleItem[]> = {};

    // Apply search filter
    const filteredItems = searchQuery
      ? allItems.filter(item =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : allItems;

    filteredItems.forEach(item => {
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
  }, [allItems, searchQuery]);

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
        dateLabel: format(day, 'd'),
        dayLabel: format(day, 'EEE'),
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
          dateLabel: format(week, 'MMM d'),
          dayLabel: format(week, 'EEE'),
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
          dateLabel: format(week, 'MMM d'),
          dayLabel: '',
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

  // Get bar color - using custom color if set, otherwise neutral gray
  const getBarColor = (item: ScheduleItem) => {
    // Use custom color if set
    if (item.color) return item.color;
    
    // Check if overdue
    const isOverdue = new Date(item.endDate) < new Date() && item.status !== 'completed';
    if (isOverdue) return '#ef4444'; // red for overdue
    
    // Use neutral gray color as default
    return '#9ca3af'; // neutral gray
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

  // Menu action handlers
  const handleEditItem = (item: ScheduleItem) => {
    if (onEditItem) {
      onEditItem(item);
    } else {
      // Fallback for standalone usage
      setEditingItem(item);
      setShowEditDialog(true);
    }
  };

  const handleViewItem = (item: ScheduleItem) => {
    setSelectedTask(item);
  };

  const handleDuplicateItem = async (item: ScheduleItem) => {
    try {
      const duplicatedItem = {
        scheduleId: item.scheduleId,
        name: `${item.name} (Copy)`,
        description: item.description,
        notes: item.notes,
        type: item.type,
        status: "not_started",
        priority: item.priority,
        startDate: item.startDate,
        endDate: item.endDate,
        assignedToId: item.assignedToId,
        parentItemId: item.parentItemId,
        progressPercent: 0,
        color: item.color,
      };
      
      await apiRequest("/api/schedule-items", "POST", duplicatedItem);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item duplicated", description: "Schedule item has been copied." });
    } catch (error) {
      toast({ title: "Failed to duplicate", description: "Could not duplicate item.", variant: "destructive" });
    }
  };

  const handleToggleComplete = async (item: ScheduleItem) => {
    try {
      const newStatus = item.status === "completed" ? "not_started" : "completed";
      await apiRequest(`/api/schedule-items/${item.id}`, "PATCH", { status: newStatus });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: newStatus === "completed" ? "Marked complete" : "Marked incomplete" });
    } catch (error) {
      toast({ title: "Failed to update", description: "Could not update item status.", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (item: ScheduleItem) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
    
    try {
      await apiRequest(`/api/schedule-items/${item.id}`, "DELETE");
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item deleted", description: "Schedule item has been removed." });
    } catch (error) {
      toast({ title: "Failed to delete", description: "Could not delete item.", variant: "destructive" });
    }
  };

  // Today line
  const todayPosition = getPosition(new Date());

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading timeline...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search and Filter Bar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b">
        {/* Left: Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search schedule items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-items"
          />
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel('day')}
              className={`h-7 px-2 text-xs ${zoomLevel === 'day' ? 'bg-accent' : ''}`}
              data-testid="button-zoom-day"
            >
              Day
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel('week')}
              className={`h-7 px-2 text-xs ${zoomLevel === 'week' ? 'bg-accent' : ''}`}
              data-testid="button-zoom-week"
            >
              Week
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel('month')}
              className={`h-7 px-2 text-xs ${zoomLevel === 'month' ? 'bg-accent' : ''}`}
              data-testid="button-zoom-month"
            >
              Month
            </Button>
          </div>

          {/* Filter Button */}
          <Button variant="outline" size="sm" className="h-8" data-testid="button-filter">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>

          {/* Column Config Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8"
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            data-testid="button-column-config"
          >
            <Columns className="w-4 h-4 mr-2" />
            Columns
          </Button>
        </div>
      </div>

      {/* Column Config Dropdown */}
      {showColumnConfig && (
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium text-muted-foreground">Show in left panel:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns.status}
                onChange={(e) => setVisibleColumns({ ...visibleColumns, status: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Status</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns.assignee}
                onChange={(e) => setVisibleColumns({ ...visibleColumns, assignee: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Assignee</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns.completion}
                onChange={(e) => setVisibleColumns({ ...visibleColumns, completion: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Completion %</span>
            </label>
          </div>
        </div>
      )}

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
            {parentItems.map((parentItem, parentIdx) => {
              const isCollapsed = collapsedItems.has(parentItem.id);
              const childItems = childItemsByParent[parentItem.id] || [];

              return (
                <div key={parentItem.id}>
                  {/* Parent item row */}
                  <div
                    className={`h-10 flex items-center px-2 border-b hover-elevate active-elevate-2 cursor-pointer group ${parentIdx % 2 === 0 ? 'bg-muted/30' : ''}`}
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
                      {visibleColumns.status && parentItem.status && (() => {
                        const statusInfo = getStatusInfo(parentItem.status);
                        return (
                          <Badge 
                            variant="outline" 
                            className="text-xs px-1.5 h-5 border-2"
                            style={{
                              backgroundColor: `${statusInfo.color}15`,
                              borderColor: statusInfo.color,
                              color: statusInfo.color
                            }}
                          >
                            {statusInfo.name}
                          </Badge>
                        );
                      })()}
                      {visibleColumns.completion && (
                        <span className="text-xs text-muted-foreground">{parentItem.progressPercent || 0}%</span>
                      )}
                      {visibleColumns.assignee && parentItem.assignedToName && (
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-[10px]">
                            {parentItem.assignedToName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-menu-${parentItem.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid={`menu-${parentItem.id}`}>
                          <DropdownMenuItem onClick={() => handleEditItem(parentItem)} data-testid="menu-edit">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewItem(parentItem)} data-testid="menu-view">
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateItem(parentItem)} data-testid="menu-duplicate">
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleComplete(parentItem)} data-testid="menu-complete">
                            <Check className="mr-2 h-4 w-4" />
                            {parentItem.status === "completed" ? "Mark Incomplete" : "Mark Complete"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteItem(parentItem)} className="text-destructive" data-testid="menu-delete">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Child item rows */}
                  {!isCollapsed && childItems.map((childItem, childIdx) => {
                    const rowIdx = parentIdx * 1000 + childIdx + 1;
                    return (
                      <div
                        key={childItem.id}
                        className={`h-10 flex items-center pl-10 pr-2 border-b hover-elevate active-elevate-2 cursor-pointer ${rowIdx % 2 === 0 ? 'bg-muted/30' : ''}`}
                        data-testid={`row-child-${childItem.id}`}
                      >
                        <span className="text-sm text-muted-foreground truncate flex-1">{childItem.name}</span>
                        <div className="flex items-center gap-1 ml-2">
                          {visibleColumns.status && childItem.status && (() => {
                            const statusInfo = getStatusInfo(childItem.status);
                            return (
                              <Badge 
                                variant="outline" 
                                className="text-xs px-1.5 h-5 border-2"
                                style={{
                                  backgroundColor: `${statusInfo.color}15`,
                                  borderColor: statusInfo.color,
                                  color: statusInfo.color
                                }}
                              >
                                {statusInfo.name}
                              </Badge>
                            );
                          })()}
                          {visibleColumns.completion && (
                            <span className="text-xs text-muted-foreground">{childItem.progressPercent || 0}%</span>
                          )}
                          {visibleColumns.assignee && childItem.assignedToName && (
                            <Avatar className="w-5 h-5">
                              <AvatarFallback className="text-[10px]">
                                {childItem.assignedToName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-menu-${childItem.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-testid={`menu-${childItem.id}`}>
                              <DropdownMenuItem onClick={() => handleEditItem(childItem)} data-testid="menu-edit">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewItem(childItem)} data-testid="menu-view">
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicateItem(childItem)} data-testid="menu-duplicate">
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleComplete(childItem)} data-testid="menu-complete">
                                <Check className="mr-2 h-4 w-4" />
                                {childItem.status === "completed" ? "Mark Incomplete" : "Mark Complete"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDeleteItem(childItem)} className="text-destructive" data-testid="menu-delete">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
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
            <div className="h-12 border-b bg-card sticky top-0 z-10 flex" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {timelineHeaders.map((header, idx) => {
                const isToday = format(header.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                return (
                  <div
                    key={idx}
                    className={`border-r text-xs text-center py-2 flex flex-col justify-center ${isToday ? 'bg-[#bba7db]/20 text-[#bba7db]' : ''}`}
                    style={{ width: `${header.width}px` }}
                  >
                    <div>{header.dateLabel}</div>
                    {header.dayLabel && <div className="text-[10px] text-muted-foreground">{header.dayLabel}</div>}
                  </div>
                );
              })}
            </div>

            {/* Timeline Bars */}
            <div className="relative">
              {/* Vertical grid lines */}
              <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none z-0">
                {timelineHeaders.map((header, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-r border-border"
                    style={{ left: `${timelineHeaders.slice(0, idx + 1).reduce((sum, h) => sum + h.width, 0)}px` }}
                  />
                ))}
              </div>

              {/* Today column background */}
              <div
                className="absolute top-0 bottom-0 bg-[#bba7db]/10 pointer-events-none z-0"
                style={{ 
                  left: `${Math.max(0, todayPosition - pixelsPerDay / 2)}px`,
                  width: `${pixelsPerDay}px`
                }}
              />
              
              {parentItems.map((parentItem, parentIdx) => {
                const isCollapsed = collapsedItems.has(parentItem.id);
                const childItems = childItemsByParent[parentItem.id] || [];
                
                // Calculate effective dates (span across children if they exist)
                const effectiveDates = getEffectiveDates(parentItem);
                const parentStart = getPosition(effectiveDates.startDate);
                const parentDuration = differenceInDays(effectiveDates.endDate, effectiveDates.startDate) + 1;
                const parentWidth = parentDuration * pixelsPerDay;
                const barColor = getBarColor(parentItem);
                const isOverdue = new Date(parentItem.endDate) < new Date() && parentItem.status !== 'completed';

                // Check if name fits in bar (approximate: 7px per character + 16px padding)
                const approximateTextWidth = parentItem.name.length * 7 + 16;
                const nameFitsInBar = approximateTextWidth <= parentWidth;

                return (
                  <div key={parentItem.id}>
                    {/* Parent item bar row */}
                    <div className={`h-10 border-b relative group ${parentIdx % 2 === 0 ? 'bg-muted/30' : ''}`}>
                      <div
                        className="absolute top-2 h-6 rounded flex items-center px-2 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all z-10"
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
                        {nameFitsInBar && (
                          <span className="text-xs font-medium text-white truncate">
                            {parentItem.name}
                          </span>
                        )}
                      </div>
                      {!nameFitsInBar && (
                        <div
                          className="absolute top-2 h-6 flex items-center pl-2 z-20"
                          style={{ left: `${parentStart + parentWidth + 4}px` }}
                        >
                          <span className="text-xs font-medium whitespace-nowrap">
                            {parentItem.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Child item bar rows */}
                    {!isCollapsed && childItems.map((childItem, childIdx) => {
                      const childStart = getPosition(new Date(childItem.startDate));
                      const childDuration = differenceInDays(new Date(childItem.endDate), new Date(childItem.startDate)) + 1;
                      const childWidth = childDuration * pixelsPerDay;
                      const childColor = getBarColor(childItem);
                      const rowIdx = parentIdx * 1000 + childIdx + 1;

                      // Check if child name fits in bar
                      const childTextWidth = childItem.name.length * 7 + 16;
                      const childNameFits = childTextWidth <= childWidth;

                      return (
                        <div key={childItem.id} className={`h-10 border-b relative group ${rowIdx % 2 === 0 ? 'bg-muted/30' : ''}`}>
                          <div
                            className="absolute top-2 h-6 rounded flex items-center px-2 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all z-10"
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
                            {childNameFits && (
                              <span className="text-xs font-medium text-white truncate">
                                {childItem.name}
                              </span>
                            )}
                          </div>
                          {!childNameFits && (
                            <div
                              className="absolute top-2 h-6 flex items-center pl-2 z-20"
                              style={{ left: `${childStart + childWidth + 4}px` }}
                            >
                              <span className="text-xs font-medium whitespace-nowrap">
                                {childItem.name}
                              </span>
                            </div>
                          )}
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
