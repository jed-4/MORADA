import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown, User, Search, Filter, Columns, MoreVertical, FileText, Edit, Eye, Copy, Check, Palette, Trash2, Settings, Download, Wifi, WifiOff, GanttChart, List as ListIcon } from "lucide-react";
import { useScheduleView } from "@/contexts/ScheduleViewContext";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval, getISOWeek, endOfWeek, getDay } from "date-fns";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useScheduleItemStatusOptions } from "@/hooks/useScheduleItemStatusOptions";
import { ScheduleColorPicker } from "@/components/schedule/ScheduleColorPicker";
import { ActivityNotesPopover } from "@/components/ActivityNotesPopover";
import type { ScheduleItem } from "@shared/schema";

type ZoomLevel = 'day' | 'week' | 'month';

interface GanttProps {
  onEditItem?: (item: ScheduleItem) => void;
}

export default function Gantt({ onEditItem }: GanttProps = {}) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { getStatusInfo } = useScheduleItemStatusOptions();
  const {
    schedule,
    activeView,
    setActiveView,
    filters,
    setFilters,
    contacts,
    updateStatusMutation,
    setShowItemDialog,
    setEditingItem: setEditingItemContext,
  } = useScheduleView();
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{
    id: string;
    type: 'move' | 'resize-left' | 'resize-right' | 'dependency';
    startX: number;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
    currentX?: number;
    currentY?: number;
  } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState({
    assignee: true,
    status: true,
    completion: false,
    notes: true,
  });
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const colorPickerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showOnlineConfirmDialog, setShowOnlineConfirmDialog] = useState(false);
  
  // Column width state for resizable columns
  const [columnWidths, setColumnWidths] = useState({
    taskName: 140,
    status: 70,
    notes: 32,
    completion: 40,
    assignee: 32,
    menu: 32,
  });
  
  // Calculate total panel width based on visible columns
  const totalPanelWidth = useMemo(() => {
    let width = columnWidths.taskName + columnWidths.menu + 16; // padding
    if (visibleColumns.status) width += columnWidths.status;
    if (visibleColumns.notes) width += columnWidths.notes;
    if (visibleColumns.completion) width += columnWidths.completion;
    if (visibleColumns.assignee) width += columnWidths.assignee;
    return width;
  }, [columnWidths, visibleColumns]);
  
  const [resizingColumn, setResizingColumn] = useState<{
    column: keyof typeof columnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Fetch project data
  const { data: project } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Fetch schedule items for this project
  const { data: allItems = [], isLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
  });

  // Fetch note counts for all schedule items
  const { data: noteCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/activity-notes/batch-counts', projectId],
    queryFn: async () => {
      const scheduleItemIds = allItems.map(item => item.id);
      if (scheduleItemIds.length === 0) return {};
      
      const response = await apiRequest('/api/activity-notes/batch-counts', 'POST', {
        scheduleItemIds
      });
      return response;
    },
    enabled: allItems.length > 0,
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

    // Sort parent items by startDate first, then sortOrder as tiebreaker
    parents.sort((a, b) => {
      // Items without startDate go to the end
      if (!a.startDate && !b.startDate) {
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      }
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      
      // Both have startDate, compare them
      const dateCompare = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (dateCompare !== 0) return dateCompare;
      
      // Dates are equal, use sortOrder as tiebreaker
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    // Sort child items within each parent by startDate first, then sortOrder
    Object.keys(children).forEach(parentId => {
      children[parentId].sort((a, b) => {
        // Items without startDate go to the end
        if (!a.startDate && !b.startDate) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        
        // Both have startDate, compare them
        const dateCompare = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        if (dateCompare !== 0) return dateCompare;
        
        // Dates are equal, use sortOrder as tiebreaker
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
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

  const createDependencyMutation = useMutation({
    mutationFn: async ({ itemId, predecessorId, type }: { itemId: string; predecessorId: string; type: string }) => {
      return apiRequest(`/api/schedule-items/${itemId}/dependencies`, "POST", { predecessorId, type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Dependency created" });
    },
    onError: (error: any) => {
      const errorMsg = error?.error || error?.message || "This would create a circular dependency";
      toast({ 
        title: "Failed to create dependency", 
        description: errorMsg,
        variant: "destructive" 
      });
    },
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: async ({ itemId, predecessorId }: { itemId: string; predecessorId: string }) => {
      return apiRequest(`/api/schedule-items/${itemId}/dependencies/${predecessorId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Dependency removed" });
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

  // Create week-grouped headers for double-row display (ClickUp style)
  const groupedTimelineHeaders = useMemo(() => {
    if (zoomLevel !== 'day') return null; // Only for day view
    
    const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
    const weeks: Array<{
      weekLabel: string;
      widthPx: number;
      days: Array<{ date: Date; label: string; widthPx: number; isWeekend: boolean }>;
    }> = [];
    
    let currentWeekStart = startOfWeek(days[0], { weekStartsOn: 1 }); // Monday
    let currentWeekDays: Array<{ date: Date; label: string; widthPx: number; isWeekend: boolean }> = [];
    
    days.forEach((day, idx) => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      const dayOfWeek = getDay(day);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
      
      // If we've moved to a new week, save the previous week
      if (weekStart.getTime() !== currentWeekStart.getTime() && currentWeekDays.length > 0) {
        const weekNumber = getISOWeek(currentWeekStart);
        weeks.push({
          weekLabel: `Week ${weekNumber}`,
          widthPx: currentWeekDays.length * 40,
          days: currentWeekDays,
        });
        currentWeekDays = [];
        currentWeekStart = weekStart;
      }
      
      currentWeekDays.push({
        date: day,
        label: `${format(day, 'EEE')} ${format(day, 'd')}`,
        widthPx: 40,
        isWeekend,
      });
    });
    
    // Add the last week
    if (currentWeekDays.length > 0) {
      const weekNumber = getISOWeek(currentWeekStart);
      weeks.push({
        weekLabel: `Week ${weekNumber}`,
        widthPx: currentWeekDays.length * 40,
        days: currentWeekDays,
      });
    }
    
    return weeks;
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
    item: ScheduleItem,
    dragType: 'move' | 'resize-left' | 'resize-right' | 'dependency' = 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragging({
      id: item.id,
      type: dragType,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: new Date(item.startDate),
      originalEnd: new Date(item.endDate),
      currentX: e.clientX,
      currentY: e.clientY,
    });
  };

  // Attach global listeners with proper cleanup
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;

      // Update current position for dependency line drawing
      setDragging(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragging || !timelineRef.current) {
        setDragging(null);
        return;
      }

      const deltaX = e.clientX - dragging.startX;
      const deltaDays = Math.round(deltaX / pixelsPerDay);

      if (dragging.type === 'move') {
        // Move the entire bar (reschedule)
        if (deltaDays !== 0) {
          const newStart = addDays(dragging.originalStart, deltaDays);
          const newEnd = addDays(dragging.originalEnd, deltaDays);

          await updateItemMutation.mutateAsync({
            id: dragging.id,
            startDate: newStart,
            endDate: newEnd,
          });
        }
      } else if (dragging.type === 'resize-left') {
        // Resize from the left (change start date)
        if (deltaDays !== 0) {
          const newStart = addDays(dragging.originalStart, deltaDays);
          
          // Ensure start is before end (minimum 1 day duration)
          if (newStart < dragging.originalEnd) {
            await updateItemMutation.mutateAsync({
              id: dragging.id,
              startDate: newStart,
              endDate: dragging.originalEnd,
            });
          }
        }
      } else if (dragging.type === 'resize-right') {
        // Resize from the right (change end date)
        if (deltaDays !== 0) {
          const newEnd = addDays(dragging.originalEnd, deltaDays);
          
          // Ensure end is after start (minimum 1 day duration)
          if (newEnd > dragging.originalStart) {
            await updateItemMutation.mutateAsync({
              id: dragging.id,
              startDate: dragging.originalStart,
              endDate: newEnd,
            });
          }
        }
      } else if (dragging.type === 'dependency') {
        // Handle dependency creation (check if dropped on another bar)
        if (hoveredBar && hoveredBar !== dragging.id) {
          await createDependencyMutation.mutateAsync({
            itemId: hoveredBar,
            predecessorId: dragging.id,
            type: 'finish-to-start',
          });
        }
      }

      setDragging(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, pixelsPerDay, updateItemMutation]);

  // Column resize handlers
  const handleColumnDividerMouseDown = (
    e: React.MouseEvent,
    column: keyof typeof columnWidths
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizingColumn({
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
    });
  };

  // Column resize effect
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return;
      
      const deltaX = e.clientX - resizingColumn.startX;
      const newWidth = Math.max(32, resizingColumn.startWidth + deltaX); // Min width 32px
      
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn.column]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

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

  const handleColorChange = async (item: ScheduleItem, color: string | null) => {
    try {
      await apiRequest(`/api/schedule-items/${item.id}`, "PATCH", { color });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Color updated", description: "Schedule item color has been changed." });
    } catch (error) {
      toast({ title: "Failed to update color", description: "Could not update item color.", variant: "destructive" });
    }
  };

  const handleColorPickerMouseEnter = (itemId: string) => {
    if (colorPickerTimeoutRef.current) {
      clearTimeout(colorPickerTimeoutRef.current);
      colorPickerTimeoutRef.current = null;
    }
    setColorPickerOpen(itemId);
  };

  const handleColorPickerMouseLeave = () => {
    if (colorPickerTimeoutRef.current) {
      clearTimeout(colorPickerTimeoutRef.current);
      colorPickerTimeoutRef.current = null;
    }
    colorPickerTimeoutRef.current = setTimeout(() => {
      setColorPickerOpen(null);
      colorPickerTimeoutRef.current = null;
    }, 200);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (colorPickerTimeoutRef.current) {
        clearTimeout(colorPickerTimeoutRef.current);
        colorPickerTimeoutRef.current = null;
      }
    };
  }, []);

  // Today line
  const todayPosition = getPosition(new Date());

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading timeline...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* JED'S 3-ROW BUILDER STYLE HEADER */}
      
      {/* Row 1 - Project Controls (40px) */}
      <div className="h-10 bg-white border-b flex items-center justify-between px-2 gap-4">
        {/* Left: Project Name + Online/Offline Toggle */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{project?.name ? `${project.name} Schedule` : 'Loading...'}</h2>
          <button
            onClick={() => {
              if (schedule?.status === "offline") {
                setShowOnlineConfirmDialog(true);
              } else {
                updateStatusMutation.mutate("offline");
              }
            }}
            className="flex items-center gap-1 hover-elevate active-elevate-2 px-1.5 py-0.5 rounded-md transition-all"
            data-testid="button-toggle-online"
          >
            {schedule?.status === "online" ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Online</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">Offline</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2"
            onClick={() => {
              setEditingItemContext(null);
              setShowItemDialog(true);
            }}
            disabled={schedule?.status === "locked"}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3 inline mr-0.5" />
            Add Item
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-export-pdf"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Row 2 - Views & Timeline Scale (36px) */}
      <div className="h-9 bg-white border-b flex items-center justify-between px-2">
        {/* Left: View Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveView('gantt')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'gantt' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-gantt"
          >
            <GanttChart className="w-3 h-3 inline mr-0.5" />
            Gantt
          </button>
          <button
            onClick={() => setActiveView('calendar')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'calendar' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-calendar"
          >
            <Calendar className="w-3 h-3 inline mr-0.5" />
            Calendar
          </button>
          <button
            onClick={() => setActiveView('list')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'list' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-list"
          >
            <ListIcon className="w-3 h-3 inline mr-0.5" />
            List
          </button>
        </div>

        {/* Right: Timeline Scale Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setZoomLevel('day')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${zoomLevel === 'day' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-zoom-day"
          >
            Day
          </button>
          <button
            onClick={() => setZoomLevel('week')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${zoomLevel === 'week' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-zoom-week"
          >
            Week
          </button>
          <button
            onClick={() => setZoomLevel('month')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${zoomLevel === 'month' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-zoom-month"
          >
            Month
          </button>
        </div>
      </div>

      {/* Row 3 - Search, Filters & Columns (32px) */}
      <div className="h-8 bg-white border-b flex items-center justify-between px-2 gap-1.5">
        {/* Left: Search + Filter Dropdowns */}
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-items"
            />
          </div>

          {/* Assignee Filter */}
          <Select value={filters.assignee} onValueChange={(value) => setFilters({ ...filters, assignee: value })}>
            <SelectTrigger className="h-6 w-auto px-2 text-xs border [&>svg]:hidden" data-testid="select-filter-assignee">
              <span>Assignee</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {contacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
            <SelectTrigger className="h-6 w-auto px-2 text-xs border [&>svg]:hidden" data-testid="select-filter-status">
              <span>Status</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
            <SelectTrigger className="h-6 w-auto px-2 text-xs border [&>svg]:hidden" data-testid="select-filter-type">
              <span>Type</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="milestone">Milestone</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <Select value={filters.dateRange} onValueChange={(value) => setFilters({ ...filters, dateRange: value })}>
            <SelectTrigger className="h-6 w-auto px-2 text-xs border [&>svg]:hidden" data-testid="select-filter-date-range">
              <span>Date</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right: Columns Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <button 
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              data-testid="button-column-config"
            >
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Show in left panel</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.status}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, status: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Status</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.assignee}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, assignee: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Assignee</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.completion}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, completion: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Completion %</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.notes}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, notes: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Notes</span>
                  </label>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        {/* Today Button */}
        <button
          onClick={() => {
            if (timelineRef.current) {
              const todayPos = getPosition(new Date());
              timelineRef.current.scrollLeft = todayPos - timelineRef.current.clientWidth / 2;
            }
          }}
          className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
          data-testid="button-scroll-to-today"
        >
          Today
        </button>
      </div>

      {/* Online Confirmation Dialog */}
      <AlertDialog open={showOnlineConfirmDialog} onOpenChange={setShowOnlineConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Schedule Online?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the schedule visible to all team members. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                updateStatusMutation.mutate("online");
                setShowOnlineConfirmDialog(false);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Timeline Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task Names Column (Resizable) */}
        <div style={{ width: totalPanelWidth }} className="border-r flex flex-col bg-card flex-shrink-0">
          {/* Header row - matches timeline header height */}
          <div className="h-12 border-b flex items-end pb-1 px-2 text-xs font-medium text-muted-foreground relative">
            <div style={{ width: columnWidths.taskName }} className="pl-2 flex-shrink-0">Task Name</div>
            
            {(() => {
              let cumulativeOffset = columnWidths.taskName + 8; // Start after task name + padding
              return (
                <>
                  {visibleColumns.status && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'status')}
                        data-testid="divider-status"
                      />
                      <div style={{ width: columnWidths.status }} className="text-center flex-shrink-0">Status</div>
                      {(() => { cumulativeOffset += columnWidths.status; return null; })()}
                    </>
                  )}
                  
                  {visibleColumns.notes && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'notes')}
                        data-testid="divider-notes"
                      />
                      <div style={{ width: columnWidths.notes }} className="text-center flex-shrink-0">Notes</div>
                      {(() => { cumulativeOffset += columnWidths.notes; return null; })()}
                    </>
                  )}
                  
                  {visibleColumns.completion && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'completion')}
                        data-testid="divider-completion"
                      />
                      <div style={{ width: columnWidths.completion }} className="text-center flex-shrink-0">%</div>
                      {(() => { cumulativeOffset += columnWidths.completion; return null; })()}
                    </>
                  )}
                  
                  {visibleColumns.assignee && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'assignee')}
                        data-testid="divider-assignee"
                      />
                      <div style={{ width: columnWidths.assignee }} className="text-center flex-shrink-0">User</div>
                    </>
                  )}
                  
                  <div style={{ width: columnWidths.menu }} className="flex-shrink-0"></div>
                </>
              );
            })()}
          </div>
          
          {/* Task rows */}
          <div className="flex-1 overflow-y-auto">
            {parentItems.map((parentItem, parentIdx) => {
              const isCollapsed = collapsedItems.has(parentItem.id);
              const childItems = childItemsByParent[parentItem.id] || [];

              return (
                <div key={parentItem.id}>
                  {/* Parent item row - compact height with border */}
                  <div
                    className={`h-8 flex items-center px-2 border-b hover-elevate active-elevate-2 cursor-pointer group`}
                    data-testid={`row-parent-${parentItem.id}`}
                  >
                    {/* Task name column */}
                    <div style={{ width: columnWidths.taskName }} className="flex items-center min-w-0 flex-shrink-0">
                      {childItems.length > 0 && (
                        <button
                          onClick={() => toggleCollapse(parentItem.id)}
                          className="p-1 hover:bg-accent rounded flex-shrink-0"
                          data-testid={`button-toggle-${parentItem.id}`}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {childItems.length === 0 && <div className="w-6 flex-shrink-0" />}
                      <span className="font-medium text-sm truncate">{parentItem.name}</span>
                    </div>

                    {/* Status column */}
                    {visibleColumns.status && (
                      <div style={{ width: columnWidths.status }} className="flex items-center justify-center flex-shrink-0">
                        {parentItem.status && (() => {
                          const statusInfo = getStatusInfo(parentItem.status);
                          return (
                            <Badge 
                              className="text-xs px-1.5 h-5 border-0"
                              style={{
                                backgroundColor: statusInfo.color,
                                color: '#ffffff'
                              }}
                            >
                              {statusInfo.name}
                            </Badge>
                          );
                        })()}
                      </div>
                    )}

                    {/* Notes column */}
                    {visibleColumns.notes && (
                      <div style={{ width: columnWidths.notes }} className="flex items-center justify-center flex-shrink-0">
                        <ActivityNotesPopover 
                          scheduleItemId={parentItem.id} 
                          externalNoteCount={noteCounts[parentItem.id] || 0}
                        />
                      </div>
                    )}

                    {/* Completion column */}
                    {visibleColumns.completion && (
                      <div style={{ width: columnWidths.completion }} className="flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{parentItem.progressPercent || 0}%</span>
                      </div>
                    )}

                    {/* Assignee column */}
                    {visibleColumns.assignee && (
                      <div style={{ width: columnWidths.assignee }} className="flex items-center justify-center flex-shrink-0">
                        {parentItem.assignedToName && (
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px]">
                              {parentItem.assignedToName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}

                    {/* Menu column */}
                    <div style={{ width: columnWidths.menu }} className="flex items-center justify-center flex-shrink-0">
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
                          <DropdownMenuItem
                            asChild
                            onSelect={(e) => e.preventDefault()}
                            data-testid="menu-colour"
                            onMouseEnter={() => handleColorPickerMouseEnter(parentItem.id)}
                            onMouseLeave={handleColorPickerMouseLeave}
                          >
                            <div className="flex items-center cursor-pointer">
                              <Palette className="mr-2 h-4 w-4" />
                              <span className="flex-1">Colour</span>
                              <ScheduleColorPicker
                                currentColor={parentItem.color}
                                assigneeId={parentItem.assignedToId}
                                assigneeName={parentItem.assignedToName}
                                onColorChange={(color) => {
                                  handleColorChange(parentItem, color);
                                  setColorPickerOpen(null);
                                }}
                                align="end"
                                open={colorPickerOpen === parentItem.id}
                                onMouseEnter={() => handleColorPickerMouseEnter(parentItem.id)}
                                onMouseLeave={handleColorPickerMouseLeave}
                                triggerButton={
                                  <div className="w-4 h-4 rounded border ml-2" style={{ backgroundColor: parentItem.color || '#9ca3af' }} />
                                }
                              />
                            </div>
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
                        className={`h-8 flex items-center px-2 border-b hover-elevate active-elevate-2 cursor-pointer`}
                        data-testid={`row-child-${childItem.id}`}
                      >
                        {/* Task name column */}
                        <div style={{ width: columnWidths.taskName }} className="flex items-center min-w-0 pl-8 flex-shrink-0">
                          <span className="text-sm text-muted-foreground truncate">{childItem.name}</span>
                        </div>

                        {/* Status column */}
                        {visibleColumns.status && (
                          <div style={{ width: columnWidths.status }} className="flex items-center justify-center flex-shrink-0">
                            {childItem.status && (() => {
                              const statusInfo = getStatusInfo(childItem.status);
                              return (
                                <Badge 
                                  className="text-xs px-1.5 h-5 border-0"
                                  style={{
                                    backgroundColor: statusInfo.color,
                                    color: '#ffffff'
                                  }}
                                >
                                  {statusInfo.name}
                                </Badge>
                              );
                            })()}
                          </div>
                        )}

                        {/* Notes column */}
                        {visibleColumns.notes && (
                          <div style={{ width: columnWidths.notes }} className="flex items-center justify-center flex-shrink-0">
                            <ActivityNotesPopover 
                              scheduleItemId={childItem.id} 
                              externalNoteCount={noteCounts[childItem.id] || 0}
                            />
                          </div>
                        )}

                        {/* Completion column */}
                        {visibleColumns.completion && (
                          <div style={{ width: columnWidths.completion }} className="flex items-center justify-center flex-shrink-0">
                            <span className="text-xs text-muted-foreground">{childItem.progressPercent || 0}%</span>
                          </div>
                        )}

                        {/* Assignee column */}
                        {visibleColumns.assignee && (
                          <div style={{ width: columnWidths.assignee }} className="flex items-center justify-center flex-shrink-0">
                            {childItem.assignedToName && (
                              <Avatar className="w-5 h-5">
                                <AvatarFallback className="text-[10px]">
                                  {childItem.assignedToName.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        )}

                        {/* Menu column */}
                        <div style={{ width: columnWidths.menu }} className="flex items-center justify-center flex-shrink-0">
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
                              <DropdownMenuItem
                                asChild
                                onSelect={(e) => e.preventDefault()}
                                data-testid="menu-colour"
                                onMouseEnter={() => handleColorPickerMouseEnter(childItem.id)}
                                onMouseLeave={handleColorPickerMouseLeave}
                              >
                                <div className="flex items-center cursor-pointer">
                                  <Palette className="mr-2 h-4 w-4" />
                                  <span className="flex-1">Colour</span>
                                  <ScheduleColorPicker
                                    currentColor={childItem.color}
                                    assigneeId={childItem.assignedToId}
                                    assigneeName={childItem.assignedToName}
                                    onColorChange={(color) => {
                                      handleColorChange(childItem, color);
                                      setColorPickerOpen(null);
                                    }}
                                    align="end"
                                    open={colorPickerOpen === childItem.id}
                                    onMouseEnter={() => handleColorPickerMouseEnter(childItem.id)}
                                    onMouseLeave={handleColorPickerMouseLeave}
                                    triggerButton={
                                      <div className="w-4 h-4 rounded border ml-2" style={{ backgroundColor: childItem.color || '#9ca3af' }} />
                                    }
                                  />
                                </div>
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
            {/* Timeline Header - ClickUp Style Double Header */}
            {groupedTimelineHeaders ? (
              <div className="h-12 border-b bg-card sticky top-0 z-10 flex flex-col">
                {/* Top Row: Week Numbers */}
                <div className="h-6 flex border-b">
                  {groupedTimelineHeaders.map((week, idx) => (
                    <div
                      key={idx}
                      className="border-r text-xs text-center font-semibold flex items-center justify-center text-muted-foreground whitespace-nowrap overflow-hidden px-0.5"
                      style={{ width: `${week.widthPx}px` }}
                    >
                      {week.weekLabel}
                    </div>
                  ))}
                </div>
                {/* Bottom Row: Day + Date */}
                <div className="h-6 flex">
                  {groupedTimelineHeaders.flatMap(week =>
                    week.days.map((day, dayIdx) => {
                      const isToday = format(day.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <div
                          key={`${week.weekLabel}-${dayIdx}`}
                          className={`border-r text-xs text-center flex items-center justify-center whitespace-nowrap overflow-hidden px-0.5 ${
                            day.isWeekend ? 'bg-[#f3f4f6] dark:bg-muted/50' : ''
                          } ${isToday ? 'text-[#bba7db] font-semibold' : 'text-foreground'}`}
                          style={{ width: `${day.widthPx}px` }}
                        >
                          {day.label}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Fallback for week/month zoom levels */
              <div className="h-8 border-b bg-card sticky top-0 z-10 flex">
                {timelineHeaders.map((header, idx) => {
                  const isToday = format(header.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <div
                      key={idx}
                      className={`border-r text-xs text-center py-1 flex items-center justify-center whitespace-nowrap overflow-hidden px-0.5 ${isToday ? 'bg-[#bba7db]/20 text-[#bba7db]' : ''}`}
                      style={{ width: `${header.width}px` }}
                    >
                      {header.dateLabel} {header.dayLabel && `${header.dayLabel}`}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Timeline Bars */}
            <div className="relative">
              {/* Weekend column backgrounds */}
              {groupedTimelineHeaders && (
                <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none z-0">
                  {groupedTimelineHeaders.flatMap(week =>
                    week.days.map((day, dayIdx) => {
                      if (!day.isWeekend) return null;
                      const previousDays = groupedTimelineHeaders
                        .slice(0, groupedTimelineHeaders.indexOf(week))
                        .reduce((sum, w) => sum + w.days.length, 0) + dayIdx;
                      return (
                        <div
                          key={`weekend-${week.weekLabel}-${dayIdx}`}
                          className="absolute top-0 bottom-0 bg-[#f3f4f6] dark:bg-muted/50"
                          style={{
                            left: `${previousDays * 40}px`,
                            width: '40px',
                          }}
                        />
                      );
                    })
                  ).filter(Boolean)}
                </div>
              )}

              {/* Vertical grid lines */}
              <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none z-0">
                {timelineHeaders.map((header, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-r border-border/30"
                    style={{ left: `${timelineHeaders.slice(0, idx + 1).reduce((sum, h) => sum + h.width, 0)}px` }}
                  />
                ))}
              </div>

              {/* Today line - lilac color */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                style={{ 
                  left: `${todayPosition}px`,
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
                    <div className={`h-8 relative group`}>
                      <div
                        className="absolute top-1 h-6 mx-1 rounded-sm flex items-center cursor-move hover:scale-105 hover:shadow-md transition-all z-10 group/bar"
                        style={{
                          left: `${parentStart}px`,
                          width: `${parentWidth}px`,
                          backgroundColor: barColor,
                          border: isOverdue ? '2px dashed #dc2626' : 'none',
                        }}
                        onClick={(e) => handleBarClick(e, parentItem)}
                        onMouseDown={(e) => handleBarMouseDown(e, parentItem, 'move')}
                        onMouseEnter={() => setHoveredBar(parentItem.id)}
                        onMouseLeave={() => setHoveredBar(null)}
                        data-testid={`bar-parent-${parentItem.id}`}
                      >
                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, parentItem, 'resize-left');
                          }}
                          data-testid={`resize-left-${parentItem.id}`}
                        />
                        
                        {nameFitsInBar && (
                          <span className="text-xs font-medium text-white truncate pointer-events-none">
                            {parentItem.name}
                          </span>
                        )}
                        
                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, parentItem, 'resize-right');
                          }}
                          data-testid={`resize-right-${parentItem.id}`}
                        />
                        
                        {/* Dependency connector circle (right side) */}
                        <div
                          className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-current opacity-0 group-hover/bar:opacity-100 cursor-crosshair transition-opacity z-20"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, parentItem, 'dependency');
                          }}
                          title="Drag to create dependency"
                          data-testid={`dependency-handle-${parentItem.id}`}
                        />
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
                        <div key={childItem.id} className={`h-8 relative group`}>
                          <div
                            className="absolute top-1 h-6 mx-1 rounded-sm flex items-center cursor-move hover:scale-105 hover:shadow-md transition-all z-10 group/bar"
                            style={{
                              left: `${childStart}px`,
                              width: `${childWidth}px`,
                              backgroundColor: childColor,
                              border: '2px dotted rgba(255, 255, 255, 0.6)',
                            }}
                            onClick={(e) => handleBarClick(e, childItem)}
                            onMouseDown={(e) => handleBarMouseDown(e, childItem, 'move')}
                            onMouseEnter={() => setHoveredBar(childItem.id)}
                            onMouseLeave={() => setHoveredBar(null)}
                            data-testid={`bar-child-${childItem.id}`}
                          >
                            {/* Left resize handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleBarMouseDown(e, childItem, 'resize-left');
                              }}
                              data-testid={`resize-left-${childItem.id}`}
                            />
                            
                            {childNameFits && (
                              <span className="text-xs font-medium text-white truncate pointer-events-none">
                                {childItem.name}
                              </span>
                            )}
                            
                            {/* Right resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleBarMouseDown(e, childItem, 'resize-right');
                              }}
                              data-testid={`resize-right-${childItem.id}`}
                            />
                            
                            {/* Dependency connector circle (right side) */}
                            <div
                              className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-current opacity-0 group-hover/bar:opacity-100 cursor-crosshair transition-opacity z-20"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleBarMouseDown(e, childItem, 'dependency');
                              }}
                              title="Drag to create dependency"
                              data-testid={`dependency-handle-${childItem.id}`}
                            />
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

              {/* Dependency arrows SVG overlay */}
              <svg
                className="absolute top-0 left-0 pointer-events-none z-15"
                style={{ width: `${timelineWidth}px`, height: '100%' }}
              >
                {parentItems.flatMap((parentItem, parentIdx) => {
                  const isCollapsed = collapsedItems.has(parentItem.id);
                  const childItems = childItemsByParent[parentItem.id] || [];
                  const allItems = [parentItem, ...(isCollapsed ? [] : childItems)];
                  
                  return allItems.flatMap((item, itemIdx) => {
                    if (!item.dependencies || item.dependencies.length === 0) return [];
                    
                    const targetY = (isCollapsed ? parentIdx : (parentIdx + itemIdx)) * 40 + 20;
                    const targetEffective = item === parentItem && childItems.length > 0 ? getEffectiveDates(item) : null;
                    const targetStart = targetEffective 
                      ? getPosition(targetEffective.startDate)
                      : getPosition(new Date(item.startDate));
                    
                    return item.dependencies.map((dep: any) => {
                      // Find the predecessor item
                      const predItem = allItems.find(i => i.id === dep.id);
                      if (!predItem) return null;
                      
                      // Calculate predecessor position
                      let predIdx = 0;
                      let predY = 0;
                      parentItems.forEach((p, pIdx) => {
                        if (p.id === predItem.id) {
                          predIdx = pIdx;
                          predY = pIdx * 40 + 20;
                        } else if (!collapsedItems.has(p.id)) {
                          const children = childItemsByParent[p.id] || [];
                          const childIdx = children.findIndex(c => c.id === predItem.id);
                          if (childIdx !== -1) {
                            predIdx = pIdx + childIdx + 1;
                            predY = (pIdx + childIdx + 1) * 40 + 20;
                          }
                        }
                      });
                      
                      const predEffective = predItem.parentId === null && (childItemsByParent[predItem.id]?.length || 0) > 0
                        ? getEffectiveDates(predItem)
                        : null;
                      const predEnd = predEffective
                        ? getPosition(predEffective.endDate) + (differenceInDays(predEffective.endDate, predEffective.startDate) + 1) * pixelsPerDay
                        : getPosition(new Date(predItem.endDate)) + (differenceInDays(new Date(predItem.endDate), new Date(predItem.startDate)) + 1) * pixelsPerDay;
                      
                      // Create curved arrow path
                      const startX = predEnd;
                      const startY = predY;
                      const endX = targetStart;
                      const endY = targetY;
                      
                      const midX = (startX + endX) / 2;
                      const controlOffset = Math.min(50, Math.abs(endX - startX) / 3);
                      
                      const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;
                      
                      return (
                        <g key={`${item.id}-${dep.id}`}>
                          <path
                            d={path}
                            stroke="#6366f1"
                            strokeWidth="2"
                            fill="none"
                            markerEnd="url(#arrowhead)"
                          />
                        </g>
                      );
                    }).filter(Boolean);
                  });
                })}
                
                {/* Arrow marker definition */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#6366f1" />
                  </marker>
                </defs>
                
                {/* Drag-to-create dependency visual feedback */}
                {dragging?.type === 'dependency' && dragging.currentX && dragging.currentY && (
                  <line
                    x1={dragging.startX}
                    y1={dragging.startY}
                    x2={dragging.currentX}
                    y2={dragging.currentY}
                    stroke="#6366f1"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                  />
                )}
              </svg>

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
