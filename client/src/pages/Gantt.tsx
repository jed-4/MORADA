import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown, User, Search, Filter, Columns, MoreVertical, FileText, Edit, Eye, Copy, Check, Palette, Trash2, Settings, Download, Wifi, WifiOff, GanttChart, List as ListIcon, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

function SortableColumnItem({ 
  id, 
  label, 
  checked, 
  onChange 
}: { 
  id: string; 
  label: string; 
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 h-10 px-2 rounded-md hover:bg-accent"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      <span className="text-sm flex-1">{label}</span>
    </div>
  );
}

function SortableTaskRow({ 
  id, 
  children 
}: { 
  id: string; 
  children: (dragHandleProps: { attributes: any; listeners: any }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };
  
  return (
    <div ref={setNodeRef} style={style as React.CSSProperties}>
      {children({ attributes, listeners })}
    </div>
  );
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
    searchQuery,
    setSearchQuery,
    contacts,
    updateStatusMutation,
    setShowItemDialog,
    setEditingItem: setEditingItemContext,
  } = useScheduleView();
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);
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
  const [visibleColumns, setVisibleColumns] = useState({
    assignee: true,
    status: true,
    completion: false,
    notes: true,
  });
  
  // Column order for reordering
  const [columnOrder, setColumnOrder] = useState<string[]>(['status', 'notes', 'completion', 'assignee']);
  
  // Drag-drop sensors for column reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleColumnDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;
    
    if (over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Local session order state - resets on page refresh
  const [sessionItemOrder, setSessionItemOrder] = useState<string[]>([]);

  // Handle row drag end for reordering tasks (temporary, session-only)
  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Update the local session order
    setSessionItemOrder(currentOrder => {
      // If order is empty, initialize from current sortableItemIds
      const order = currentOrder.length > 0 ? [...currentOrder] : [...sortableItemIds];
      
      const oldIndex = order.indexOf(activeId);
      const newIndex = order.indexOf(overId);
      
      if (oldIndex === -1 || newIndex === -1) return order;
      
      return arrayMove(order, oldIndex, newIndex);
    });
  };
  
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
  
  // Left panel width state (user-controlled, separate from totalPanelWidth)
  // Initialize to undefined so it auto-sizes to totalPanelWidth on first render
  const [leftPanelWidth, setLeftPanelWidth] = useState<number | undefined>(undefined);
  
  // Track if preferences have been loaded
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // Resizing states
  const [resizingColumn, setResizingColumn] = useState<{
    column: keyof typeof columnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);
  
  const [resizingPanel, setResizingPanel] = useState<{
    startX: number;
    startWidth: number;
  } | null>(null);

  // Fetch project data
  const { data: project } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
  });

  // Load user view preferences for Gantt
  const { data: viewPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences/gantt"],
  });

  // Apply loaded preferences
  useEffect(() => {
    if (viewPreferences && (viewPreferences as any).preferences) {
      const prefs = (viewPreferences as any).preferences;
      if (prefs.columnWidths) setColumnWidths(prefs.columnWidths);
      if (prefs.visibleColumns) setVisibleColumns(prefs.visibleColumns);
      if (prefs.zoomLevel) setZoomLevel(prefs.zoomLevel);
      if (prefs.leftPanelWidth !== undefined) setLeftPanelWidth(prefs.leftPanelWidth);
      if (prefs.columnOrder) setColumnOrder(prefs.columnOrder);
      setPreferencesLoaded(true);
    } else if (viewPreferences === null || preferencesError) {
      // No saved preferences or error loading, use defaults
      setPreferencesLoaded(true);
    }
  }, [viewPreferences, preferencesError]);

  // Save view preferences mutation
  const saveViewPreferencesMutation = useMutation({
    mutationFn: async (preferences: any) => {
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "gantt",
        preferences,
      });
    },
  });

  // Auto-save preferences when they change (after initial load)
  useEffect(() => {
    if (preferencesLoaded) {
      const timer = setTimeout(() => {
        saveViewPreferencesMutation.mutate({
          columnWidths,
          visibleColumns,
          zoomLevel,
          leftPanelWidth,
          columnOrder,
        });
      }, 1000); // Debounce for 1 second
      return () => clearTimeout(timer);
    }
  }, [columnWidths, visibleColumns, zoomLevel, leftPanelWidth, columnOrder, preferencesLoaded]);

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

    // Sort parent items by startDate (resets to date order on page refresh)
    parents.sort((a, b) => {
      // Items without startDate go to the end
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

    // Sort child items within each parent by startDate
    Object.keys(children).forEach(parentId => {
      children[parentId].sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });
    });

    return { parentItems: parents, childItemsByParent: children };
  }, [allItems, searchQuery]);

  // Create flattened list of item IDs for SortableContext (sorted by date initially)
  const defaultItemIds = useMemo(() => {
    const ids: string[] = [];
    parentItems.forEach(parent => {
      ids.push(parent.id);
      if (!collapsedItems.has(parent.id)) {
        const children = childItemsByParent[parent.id] || [];
        children.forEach(child => ids.push(child.id));
      }
    });
    return ids;
  }, [parentItems, childItemsByParent, collapsedItems]);

  // Use session order if user has dragged, otherwise use default date-sorted order
  const sortableItemIds = useMemo(() => {
    if (sessionItemOrder.length === 0) return defaultItemIds;
    
    // Filter session order to only include items that still exist
    const validIds = new Set(defaultItemIds);
    const filtered = sessionItemOrder.filter(id => validIds.has(id));
    
    // Add any new items that aren't in the session order
    const sessionSet = new Set(filtered);
    defaultItemIds.forEach(id => {
      if (!sessionSet.has(id)) {
        filtered.push(id);
      }
    });
    
    return filtered;
  }, [sessionItemOrder, defaultItemIds]);

  // Build ordered items list for rendering based on sortableItemIds
  const orderedItems = useMemo(() => {
    const itemMap = new Map<string, ScheduleItem>();
    allItems.forEach(item => itemMap.set(item.id, item));
    
    return sortableItemIds
      .map(id => itemMap.get(id))
      .filter((item): item is ScheduleItem => item !== undefined);
  }, [allItems, sortableItemIds]);

  // Create global item map and row index map for dependency rendering
  const { globalItemMap, itemRowIndexMap } = useMemo(() => {
    const itemMap = new Map<string, ScheduleItem>();
    const rowIndexMap = new Map<string, number>();
    
    allItems.forEach(item => itemMap.set(item.id, item));
    
    // Calculate row index for each visible item
    let rowIndex = 0;
    parentItems.forEach(parent => {
      rowIndexMap.set(parent.id, rowIndex);
      rowIndex++;
      if (!collapsedItems.has(parent.id)) {
        const children = childItemsByParent[parent.id] || [];
        children.forEach(child => {
          rowIndexMap.set(child.id, rowIndex);
          rowIndex++;
        });
      }
    });
    
    return { globalItemMap: itemMap, itemRowIndexMap: rowIndexMap };
  }, [allItems, parentItems, childItemsByParent, collapsedItems]);

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

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async ({ id, progressPercent }: { id: string; progressPercent: number }) => {
      return apiRequest(`/api/schedule-items/${id}`, "PATCH", { progressPercent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
    },
  });

  // Progress drag state
  const [progressDrag, setProgressDrag] = useState<{
    itemId: string;
    barWidth: number;
    startX: number;
    startProgress: number;
  } | null>(null);

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
        dayLabel: format(day, 'EEE').slice(0, 2),
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
          dayLabel: format(week, 'EEE').slice(0, 2),
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
        label: `${format(day, 'EEE').slice(0, 2)} ${format(day, 'd')}`,
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
    
    // For dependency drag, calculate timeline-relative coordinates
    let startX = e.clientX;
    let startY = e.clientY;
    
    if (dragType === 'dependency' && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollLeft = timelineRef.current.scrollLeft;
      const scrollTop = timelineRef.current.scrollTop;
      
      // Convert to timeline-relative coordinates
      // Account for the 60px header by NOT subtracting it (the SVG is positioned after the header)
      startX = e.clientX - rect.left + scrollLeft;
      startY = e.clientY - rect.top + scrollTop - 60; // Subtract header height
    }
    
    setDragging({
      id: item.id,
      type: dragType,
      startX,
      startY,
      originalStart: new Date(item.startDate),
      originalEnd: new Date(item.endDate),
      currentX: startX,
      currentY: startY,
    });
  };

  // Attach global listeners with proper cleanup
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;

      // For dependency drag, convert to timeline-relative coordinates
      let currentX = e.clientX;
      let currentY = e.clientY;
      
      if (dragging.type === 'dependency' && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const scrollTop = timelineRef.current.scrollTop;
        
        currentX = e.clientX - rect.left + scrollLeft;
        currentY = e.clientY - rect.top + scrollTop - 60; // Subtract header height
      }

      // Update current position for dependency line drawing
      setDragging(prev => prev ? { ...prev, currentX, currentY } : null);
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

  // Progress drag effect
  useEffect(() => {
    if (!progressDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressDrag) return;
      
      const deltaX = e.clientX - progressDrag.startX;
      const deltaPercent = (deltaX / progressDrag.barWidth) * 100;
      const newProgress = Math.max(0, Math.min(100, Math.round(progressDrag.startProgress + deltaPercent)));
      
      // Update local state for immediate feedback (optimistic)
      // The actual update happens on mouseup
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!progressDrag) return;
      
      const deltaX = e.clientX - progressDrag.startX;
      const deltaPercent = (deltaX / progressDrag.barWidth) * 100;
      const newProgress = Math.max(0, Math.min(100, Math.round(progressDrag.startProgress + deltaPercent)));
      
      await updateProgressMutation.mutateAsync({
        id: progressDrag.itemId,
        progressPercent: newProgress,
      });
      
      setProgressDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [progressDrag, updateProgressMutation]);

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

  // Panel resize effect
  useEffect(() => {
    if (!resizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingPanel) return;
      
      const deltaX = e.clientX - resizingPanel.startX;
      // Min: 40px (can collapse to hide columns), Max: totalPanelWidth (right edge of assignee column)
      const newWidth = Math.min(Math.max(40, resizingPanel.startWidth + deltaX), totalPanelWidth);
      
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setResizingPanel(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingPanel, totalPanelWidth]);

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

  // Scroll synchronization between left panel and timeline
  const handleLeftPanelScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollSyncing.current) return;
    isScrollSyncing.current = true;
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => { isScrollSyncing.current = false; });
  };

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollSyncing.current) return;
    isScrollSyncing.current = true;
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => { isScrollSyncing.current = false; });
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
      {/* Timeline Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task Names Column (Resizable Panel) */}
        <div 
          style={{ width: leftPanelWidth ?? totalPanelWidth }} 
          className="border-r flex flex-col bg-card flex-shrink-0 overflow-x-auto relative"
        >
          {/* Content wrapper with actual column widths */}
          <div style={{ width: totalPanelWidth }} className="flex flex-col flex-1 overflow-hidden">
            {/* Double-row header to match timeline (60px total) */}
            
            {/* Top row - Search bar (30px) */}
            <div className="h-[30px] flex items-center px-2 border-b border-border gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2 py-0 h-6 text-xs border"
                  data-testid="input-search-gantt-tasks"
                />
              </div>
              
              {/* Columns visibility/reorder popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-columns">
                    <Columns className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2" data-testid="popover-columns">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2">Show & Reorder Columns</div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
                      {columnOrder.map((colId) => {
                        const labels: Record<string, string> = {
                          status: 'Status',
                          notes: 'Notes',
                          completion: 'Completion %',
                          assignee: 'Assignee',
                        };
                        return (
                          <SortableColumnItem
                            key={colId}
                            id={colId}
                            label={labels[colId] || colId}
                            checked={visibleColumns[colId as keyof typeof visibleColumns]}
                            onChange={(checked) => setVisibleColumns(prev => ({ ...prev, [colId]: checked }))}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Bottom row - Column names (30px) */}
            <div className="h-[30px] flex items-center px-2 text-xs font-medium text-muted-foreground relative border-b border-border">
            <div style={{ width: columnWidths.taskName }} className="px-1 flex-shrink-0">Task Name</div>
            
            {(() => {
              let cumulativeOffset = columnWidths.taskName + 8; // Start after task name + padding
              return (
                <>
                  {visibleColumns.status && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'taskName')}
                        data-testid="divider-taskName"
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
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'status')}
                        data-testid="divider-status"
                      />
                      <div style={{ width: columnWidths.notes }} className="text-center flex-shrink-0"></div>
                      {(() => { cumulativeOffset += columnWidths.notes; return null; })()}
                    </>
                  )}
                  
                  {visibleColumns.completion && (
                    <>
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'notes')}
                        data-testid="divider-notes"
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
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'completion')}
                        data-testid="divider-completion"
                      />
                      <div style={{ width: columnWidths.assignee }} className="text-center flex-shrink-0">Assignee</div>
                      {(() => { cumulativeOffset += columnWidths.assignee; return null; })()}
                      <div
                        className="w-0.5 bg-border hover:bg-primary/50 cursor-col-resize absolute top-0 bottom-0 z-10"
                        style={{ left: cumulativeOffset }}
                        onMouseDown={(e) => handleColumnDividerMouseDown(e, 'assignee')}
                        data-testid="divider-assignee"
                      />
                    </>
                  )}
                  
                  <div style={{ width: columnWidths.menu }} className="flex-shrink-0"></div>
                </>
              );
            })()}
          </div>
          
          {/* Task rows */}
          <div ref={leftPanelRef} onScroll={handleLeftPanelScroll} className="flex-1 overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRowDragEnd}
            >
              <SortableContext items={sortableItemIds} strategy={verticalListSortingStrategy}>
            {orderedItems.map((item, idx) => {
              const isParent = !item.parentItemId;
              const childItems = childItemsByParent[item.id] || [];
              const isCollapsed = collapsedItems.has(item.id);

              return (
                <SortableTaskRow key={item.id} id={item.id}>
                  {({ attributes, listeners }) => (
                  <div
                    className={`h-10 flex items-center px-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer group border-b border-border`}
                    data-testid={`row-${isParent ? 'parent' : 'child'}-${item.id}`}
                  >
                    {/* Task name column */}
                    <div style={{ width: columnWidths.taskName }} className={`flex items-center min-w-0 flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all ${!isParent ? 'pl-4' : ''}`}>
                      <div 
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-accent rounded flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`drag-handle-${item.id}`}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      {isParent && childItems.length > 0 && (
                        <button
                          onClick={() => toggleCollapse(item.id)}
                          className="p-1 hover:bg-accent rounded flex-shrink-0"
                          data-testid={`button-toggle-${item.id}`}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {(isParent && childItems.length === 0) && <div className="w-6 flex-shrink-0" />}
                      <span className={`text-sm truncate ${isParent ? 'font-medium' : 'text-muted-foreground ml-1'}`}>{item.name}</span>
                    </div>

                    {/* Status column */}
                    {visibleColumns.status && (
                      <div style={{ width: columnWidths.status }} className="flex items-center justify-center flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all">
                        {item.status && (() => {
                          const statusInfo = getStatusInfo(item.status);
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
                      <div style={{ width: columnWidths.notes }} className="flex items-center justify-center flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all">
                        <ActivityNotesPopover 
                          scheduleItemId={item.id} 
                          externalNoteCount={noteCounts[item.id] || 0}
                        />
                      </div>
                    )}

                    {/* Completion column */}
                    {visibleColumns.completion && (
                      <div style={{ width: columnWidths.completion }} className="flex items-center justify-center flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all">
                        <span className="text-xs text-muted-foreground">{item.progressPercent || 0}%</span>
                      </div>
                    )}

                    {/* Assignee column */}
                    {visibleColumns.assignee && (
                      <div style={{ width: columnWidths.assignee }} className="flex items-center justify-center flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all">
                        {item.assignedToName && (
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[10px]">
                              {item.assignedToName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}

                    {/* Menu column */}
                    <div style={{ width: columnWidths.menu }} className="flex items-center justify-center flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-menu-${item.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-testid={`menu-${item.id}`}>
                          <DropdownMenuItem onClick={() => handleEditItem(item)} data-testid="menu-edit">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewItem(item)} data-testid="menu-view">
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateItem(item)} data-testid="menu-duplicate">
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleComplete(item)} data-testid="menu-complete">
                            <Check className="mr-2 h-4 w-4" />
                            {item.status === "completed" ? "Mark Incomplete" : "Mark Complete"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            asChild
                            onSelect={(e) => e.preventDefault()}
                            data-testid="menu-colour"
                            onMouseEnter={() => handleColorPickerMouseEnter(item.id)}
                            onMouseLeave={handleColorPickerMouseLeave}
                          >
                            <div className="flex items-center cursor-pointer">
                              <Palette className="mr-2 h-4 w-4" />
                              <span className="flex-1">Colour</span>
                              <ScheduleColorPicker
                                currentColor={item.color}
                                assigneeId={item.assignedToId}
                                assigneeName={item.assignedToName}
                                onColorChange={(color) => {
                                  handleColorChange(item, color);
                                  setColorPickerOpen(null);
                                }}
                                align="end"
                                open={colorPickerOpen === item.id}
                                onMouseEnter={() => handleColorPickerMouseEnter(item.id)}
                                onMouseLeave={handleColorPickerMouseLeave}
                                triggerButton={
                                  <div className="w-4 h-4 rounded border ml-2" style={{ backgroundColor: item.color || '#9ca3af' }} />
                                }
                              />
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteItem(item)} className="text-destructive" data-testid="menu-delete">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  )}
                </SortableTaskRow>
              );
            })}
              </SortableContext>
            </DndContext>
          </div>
          </div>

          {/* Panel resize divider */}
          <div
            className="absolute top-0 right-0 bottom-0 w-1 hover:bg-primary/50 cursor-col-resize z-20 bg-border/50"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setResizingPanel({
                startX: e.clientX,
                startWidth: leftPanelWidth ?? totalPanelWidth,
              });
            }}
            data-testid="divider-panel"
          />
        </div>

        {/* Timeline Scroll Container */}
        <div
          ref={timelineRef}
          onScroll={handleTimelineScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div style={{ width: `${timelineWidth}px`, position: 'relative' }}>
            {/* Timeline Header - ClickUp Style Double Header (60px) */}
            {groupedTimelineHeaders ? (
              <div className="h-[60px] bg-card sticky top-0 z-30 flex flex-col">
                {/* Top Row: Week Numbers */}
                <div className="h-[30px] flex border-b border-border">
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
                <div className="h-[30px] flex border-b border-border">
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
              /* Fallback for week/month zoom levels (60px) */
              <div className="h-[60px] bg-card sticky top-0 z-30 flex border-b border-border">
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
                    <div className={`h-10 relative group/row`}>
                      {/* Bar wrapper for positioning dots relative to bar */}
                      <div 
                        className="absolute top-1 h-6"
                        style={{ left: `${parentStart}px`, width: `${parentWidth}px` }}
                      >
                        {/* Left dependency dot (for incoming) - centered on bar height */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -left-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30"
                          title="Drop here for dependency"
                          data-testid={`dependency-target-${parentItem.id}`}
                        >
                          <div className="w-2 h-2 rounded-full bg-[#9b7fc7]" />
                        </div>
                        
                        {/* Main bar */}
                        <div
                          className="absolute inset-0 rounded-sm flex items-center cursor-move hover:shadow-md transition-all z-10 group/bar overflow-hidden"
                          style={{
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
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, parentItem, 'resize-left');
                          }}
                          data-testid={`resize-left-${parentItem.id}`}
                        />
                        
                        {nameFitsInBar && (
                          <span className="text-xs font-medium text-white truncate pointer-events-none pl-2">
                            {parentItem.name}
                          </span>
                        )}
                        
                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleBarMouseDown(e, parentItem, 'resize-right');
                          }}
                          data-testid={`resize-right-${parentItem.id}`}
                        />
                        
                        {/* Progress overlay - darkens completed portion */}
                        <div 
                          className="absolute inset-0 pointer-events-none rounded-sm"
                          style={{ 
                            background: `linear-gradient(to right, rgba(0,0,0,0.25) ${parentItem.progressPercent ?? 0}%, transparent ${parentItem.progressPercent ?? 0}%)` 
                          }}
                        />
                        
                        {/* Progress slider handle at bottom - appears on hover */}
                        <div
                          className="absolute bottom-0 left-0 right-0 h-2 opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-ew-resize"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const barRect = e.currentTarget.parentElement?.getBoundingClientRect();
                            if (!barRect) return;
                            const clickX = e.clientX - barRect.left;
                            const clickPercent = Math.max(0, Math.min(100, Math.round((clickX / barRect.width) * 100)));
                            updateProgressMutation.mutate({ id: parentItem.id, progressPercent: clickPercent });
                          }}
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          data-testid={`progress-track-${parentItem.id}`}
                        >
                          {/* Track line */}
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30" />
                          {/* Slider thumb */}
                          <div 
                            className="absolute bottom-0 w-2 h-2 bg-white rounded-full shadow-md -translate-x-1/2 cursor-ew-resize hover:scale-125 transition-transform"
                            style={{ left: `${parentItem.progressPercent ?? 0}%` }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const barRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                              if (!barRect) return;
                              setProgressDrag({
                                itemId: parentItem.id,
                                barWidth: barRect.width,
                                startX: e.clientX,
                                startProgress: parentItem.progressPercent ?? 0,
                              });
                            }}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            data-testid={`progress-thumb-${parentItem.id}`}
                          />
                        </div>
                      </div>
                      
                      {/* Right dependency dot (for outgoing) - centered on bar height */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -right-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleBarMouseDown(e, parentItem, 'dependency');
                        }}
                        title="Drag to create dependency"
                        data-testid={`dependency-handle-${parentItem.id}`}
                      >
                        <div className="w-2 h-2 rounded-full bg-[#9b7fc7] hover:scale-150 transition-transform" />
                      </div>
                    </div>
                      
                      {!nameFitsInBar && (
                        <div
                          className="absolute top-2 h-6 flex items-center pl-2 z-20"
                          style={{ left: `${parentStart + parentWidth + 20}px` }}
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
                        <div key={childItem.id} className={`h-10 relative group/row`}>
                          {/* Bar wrapper for positioning dots relative to bar */}
                          <div 
                            className="absolute top-1 h-6"
                            style={{ left: `${childStart}px`, width: `${childWidth}px` }}
                          >
                            {/* Left dependency dot (for incoming) - centered on bar height */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -left-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30"
                              title="Drop here for dependency"
                              data-testid={`dependency-target-${childItem.id}`}
                            >
                              <div className="w-2 h-2 rounded-full bg-[#9b7fc7]" />
                            </div>
                            
                            {/* Main bar */}
                            <div
                              className="absolute inset-0 rounded-sm flex items-center cursor-move hover:shadow-md transition-all z-10 group/bar overflow-hidden"
                              style={{
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
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleBarMouseDown(e, childItem, 'resize-left');
                                }}
                                data-testid={`resize-left-${childItem.id}`}
                              />
                              
                              {childNameFits && (
                                <span className="text-xs font-medium text-white truncate pointer-events-none pl-2">
                                  {childItem.name}
                                </span>
                              )}
                              
                              {/* Right resize handle */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  handleBarMouseDown(e, childItem, 'resize-right');
                                }}
                                data-testid={`resize-right-${childItem.id}`}
                              />
                              
                              {/* Progress overlay - darkens completed portion */}
                              <div 
                                className="absolute inset-0 pointer-events-none rounded-sm"
                                style={{ 
                                  background: `linear-gradient(to right, rgba(0,0,0,0.25) ${childItem.progressPercent ?? 0}%, transparent ${childItem.progressPercent ?? 0}%)` 
                                }}
                              />
                              
                              {/* Progress slider handle at bottom - appears on hover */}
                              <div
                                className="absolute bottom-0 left-0 right-0 h-2 opacity-0 group-hover/bar:opacity-100 transition-opacity cursor-ew-resize"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const barRect = e.currentTarget.parentElement?.getBoundingClientRect();
                                  if (!barRect) return;
                                  const clickX = e.clientX - barRect.left;
                                  const clickPercent = Math.max(0, Math.min(100, Math.round((clickX / barRect.width) * 100)));
                                  updateProgressMutation.mutate({ id: childItem.id, progressPercent: clickPercent });
                                }}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                data-testid={`progress-track-${childItem.id}`}
                              >
                                {/* Track line */}
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30" />
                                {/* Slider thumb */}
                                <div 
                                  className="absolute bottom-0 w-2 h-2 bg-white rounded-full shadow-md -translate-x-1/2 cursor-ew-resize hover:scale-125 transition-transform"
                                  style={{ left: `${childItem.progressPercent ?? 0}%` }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const barRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                                    if (!barRect) return;
                                    setProgressDrag({
                                      itemId: childItem.id,
                                      barWidth: barRect.width,
                                      startX: e.clientX,
                                      startProgress: childItem.progressPercent ?? 0,
                                    });
                                  }}
                                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                  data-testid={`progress-thumb-${childItem.id}`}
                                />
                              </div>
                            </div>
                            
                            {/* Right dependency dot (for outgoing) - centered on bar height */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 -right-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleBarMouseDown(e, childItem, 'dependency');
                              }}
                              title="Drag to create dependency"
                              data-testid={`dependency-handle-${childItem.id}`}
                            >
                              <div className="w-2 h-2 rounded-full bg-[#9b7fc7] hover:scale-150 transition-transform" />
                            </div>
                          </div>
                          
                          {!childNameFits && (
                            <div
                              className="absolute top-2 h-6 flex items-center pl-2 z-20"
                              style={{ left: `${childStart + childWidth + 20}px` }}
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
                {/* Render all dependency arrows using global item maps */}
                {allItems.flatMap((item) => {
                  if (!item.dependencies || item.dependencies.length === 0) return [];
                  
                  // Get target item's row index
                  const targetRowIdx = itemRowIndexMap.get(item.id);
                  if (targetRowIdx === undefined) return []; // Item not visible
                  
                  const targetY = targetRowIdx * 40 + 20;
                  const targetChildItems = childItemsByParent[item.id] || [];
                  const targetEffective = item.parentId === null && targetChildItems.length > 0 
                    ? getEffectiveDates(item) 
                    : null;
                  const targetStart = targetEffective 
                    ? getPosition(targetEffective.startDate)
                    : getPosition(new Date(item.startDate));
                  
                  return item.dependencies.map((dep: any) => {
                    // Find the predecessor item from GLOBAL map
                    const predItem = globalItemMap.get(dep.id);
                    if (!predItem) return null;
                    
                    // Get predecessor's row index
                    const predRowIdx = itemRowIndexMap.get(predItem.id);
                    if (predRowIdx === undefined) return null; // Predecessor not visible
                    
                    const predY = predRowIdx * 40 + 20;
                    
                    const predChildItems = childItemsByParent[predItem.id] || [];
                    const predEffective = predItem.parentId === null && predChildItems.length > 0
                      ? getEffectiveDates(predItem)
                      : null;
                    const predEnd = predEffective
                      ? getPosition(predEffective.endDate) + (differenceInDays(predEffective.endDate, predEffective.startDate) + 1) * pixelsPerDay
                      : getPosition(new Date(predItem.endDate)) + (differenceInDays(new Date(predItem.endDate), new Date(predItem.startDate)) + 1) * pixelsPerDay;
                    
                    // Create curved arrow path (Finish-to-Start) with orientation-aware control points
                    const startX = predEnd;
                    const startY = predY;
                    const endX = targetStart;
                    const endY = targetY;
                    
                    const deltaX = endX - startX;
                    const deltaY = endY - startY;
                    
                    // Minimum horizontal offset for curves (prevents ugly straight lines)
                    const minHorizOffset = 24;
                    const horizOffset = Math.max(minHorizOffset, Math.abs(deltaX) / 3);
                    
                    // Add vertical bias based on row direction (above/below)
                    const vertBias = Math.max(16, Math.abs(deltaY) / 4);
                    
                    let path: string;
                    if (deltaX >= 0) {
                      // Forward dependency (normal case: predecessor ends before successor starts)
                      const ctrl1X = startX + horizOffset;
                      const ctrl1Y = startY + (deltaY > 0 ? vertBias : deltaY < 0 ? -vertBias : 0);
                      const ctrl2X = endX - horizOffset;
                      const ctrl2Y = endY + (deltaY > 0 ? -vertBias : deltaY < 0 ? vertBias : 0);
                      path = `M ${startX} ${startY} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${endX} ${endY}`;
                    } else {
                      // Backward dependency (predecessor ends after successor starts - loop around)
                      const loopOffset = Math.max(40, Math.abs(deltaX) / 2);
                      const midY = (startY + endY) / 2 + (deltaY >= 0 ? loopOffset : -loopOffset);
                      path = `M ${startX} ${startY} Q ${startX + loopOffset} ${startY}, ${startX + loopOffset} ${midY} T ${endX} ${endY}`;
                    }
                    
                    return (
                      <g key={`${item.id}-${dep.id}`}>
                        {/* Clean dependency line */}
                        <path
                          d={path}
                          stroke="#9b7fc7"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          markerEnd="url(#arrow-elegant)"
                        />
                      </g>
                    );
                  }).filter(Boolean);
                })}
                
                {/* Arrow marker definitions */}
                <defs>
                  {/* Clean minimal arrowhead */}
                  <marker
                    id="arrow-elegant"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path 
                      d="M 1 1 L 7 4 L 1 7" 
                      fill="none"
                      stroke="#9b7fc7"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </marker>
                  {/* Arrow for drag preview */}
                  <marker
                    id="arrow-drag"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path 
                      d="M 1 1 L 7 4 L 1 7" 
                      fill="none"
                      stroke="#9b7fc7"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </marker>
                </defs>
                
                {/* Drag-to-create dependency visual feedback */}
                {dragging?.type === 'dependency' && dragging.currentX && dragging.currentY && (
                  <path
                    d={`M ${dragging.startX} ${dragging.startY} Q ${(dragging.startX + dragging.currentX) / 2 + 20} ${(dragging.startY + dragging.currentY) / 2}, ${dragging.currentX} ${dragging.currentY}`}
                    stroke="#9b7fc7"
                    strokeWidth="1.5"
                    strokeDasharray="4,3"
                    strokeLinecap="round"
                    fill="none"
                    markerEnd="url(#arrow-drag)"
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
