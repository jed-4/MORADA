import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ZoomIn, ZoomOut, Calendar, ChevronRight, ChevronDown, User, Search, Filter, Columns, MoreVertical, FileText, Edit, Eye, Copy, Check, Palette, Trash2, Settings, Download, Wifi, WifiOff, GanttChart, List as ListIcon, GripVertical, Link, Unlink, X, RotateCcw, ArrowUpLeft } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useScheduleView } from "@/contexts/ScheduleViewContext";
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval, getISOWeek, endOfWeek, getDay } from "date-fns";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

type ZoomLevel = 'day' | 'week' | 'month';
const ROW_HEIGHT = 32;

interface GanttProps {
  onEditItem?: (item: ScheduleItem) => void;
  baselineItems?: any[];
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
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 50 : 'auto',
    boxShadow: isDragging ? '0 8px 24px rgba(187, 167, 219, 0.4)' : 'none',
    outline: isDragging ? '2px solid #bba7db' : 'none',
    borderRadius: isDragging ? '4px' : '0',
    background: isDragging ? 'var(--background)' : 'transparent',
  };
  
  return (
    <div ref={setNodeRef} style={style as React.CSSProperties}>
      {children({ attributes, listeners })}
    </div>
  );
}

export default function Gantt({ onEditItem, baselineItems = [] }: GanttProps = {}) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const weekStartDay = useWeekStartDay();
  const { getStatusInfo, statusOptions } = useScheduleItemStatusOptions();
  const {
    schedule,
    activeView,
    setActiveView,
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    contacts,
    updateItemStatusMutation,
    setShowItemDialog,
    setEditingItem: setEditingItemContext,
    setPendingAutoLink,
    insertAfterItemRef,
    scrollToTodayRef,
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
    startScrollLeft: number; // Timeline scrollLeft when drag started, for scroll-aware delta
    originalStart: Date;
    originalEnd: Date;
    currentX?: number;
    currentY?: number;
    currentDeltaX?: number; // For visual feedback during bar move/resize (scroll-aware)
    sourceAnchor?: 'start' | 'end'; // For dependency drag: which end the drag started from
    viewportStartX?: number;
    viewportStartY?: number;
  } | null>(null);
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  
  const allItemsRef = useRef<ScheduleItem[]>([]);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const hoveredBarRef = useRef(hoveredBar);
  hoveredBarRef.current = hoveredBar;
  const [hoveredAnchor, setHoveredAnchor] = useState<'start' | 'end' | null>(null);
  const hoveredAnchorRef = useRef(hoveredAnchor);
  hoveredAnchorRef.current = hoveredAnchor;
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<ScheduleItem | null>(null);
  const [hoveredDependency, setHoveredDependency] = useState<string | null>(null);
  const [selectedDependency, setSelectedDependency] = useState<{
    itemId: string;
    itemName: string;
    predecessorId: string;
    predecessorName: string;
    type: string;
    lag: number;
  } | null>(null);
  const [scrollVersion, setScrollVersion] = useState(0);
  const lastCursorPosition = useRef<{ x: number; y: number } | null>(null);
  const dragHappened = useRef<boolean>(false);
  const dragStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRafId = useRef<number | null>(null);
  
  // Context menu state for right-click on bars
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: ScheduleItem;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  // Inline editing state for task name in left table
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  
  // Pending predecessor mode: after clicking "Create Predecessor", the next bar click creates the link
  const [pendingPredecessor, setPendingPredecessor] = useState<number | null>(null);
  
  useEffect(() => {
    if (pendingPredecessor === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingPredecessor(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pendingPredecessor]);
  
  // Infinite scroll: track extra buffer days beyond data bounds
  const [timelineBuffer, setTimelineBuffer] = useState({ before: 60, after: 60 });
  const prevTimelineStartRef = useRef<Date | null>(null);
  const pendingScrollAdjustEarly = useRef<number>(0);
  const [visibleColumns, setVisibleColumns] = useState({
    assignee: true,
    status: true,
    completion: true,
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
  const [orderInitialized, setOrderInitialized] = useState(false);

  // Nest target state for drag-to-nest (drop item ON another to create parent-child)
  const [nestTargetId, setNestTargetId] = useState<string | null>(null);
  const nestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOverIdRef = useRef<string | null>(null);

  const canNestItem = (activeId: string, targetId: string): boolean => {
    const activeItem = allItems.find(i => i.id === activeId);
    const targetItem = allItems.find(i => i.id === targetId);
    if (!activeItem || !targetItem) return false;
    if (targetItem.parentItemId) return false;
    if (activeItem.parentItemId) return false;
    const activeHasChildren = allItems.some(i => i.parentItemId === activeId);
    if (activeHasChildren) return false;
    return true;
  };

  const handleRowDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over?.id as string | undefined;

    if (!overId || overId === (active.id as string)) {
      if (nestTimerRef.current) clearTimeout(nestTimerRef.current);
      setNestTargetId(null);
      lastOverIdRef.current = null;
      return;
    }

    if (overId !== lastOverIdRef.current) {
      lastOverIdRef.current = overId;
      setNestTargetId(null);
      if (nestTimerRef.current) clearTimeout(nestTimerRef.current);
      if (!canNestItem(active.id as string, overId)) return;
      nestTimerRef.current = setTimeout(() => {
        setNestTargetId(overId);
      }, 400);
    }
  };

  // Handle row drag end for reordering tasks (temporary, session-only)
  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const currentNestTarget = nestTargetId;

    if (nestTimerRef.current) clearTimeout(nestTimerRef.current);
    setNestTargetId(null);
    lastOverIdRef.current = null;
    
    if (!over || active.id === over.id) return;
    
    const activeId = active.id as string;
    const overId = over.id as string;

    if (currentNestTarget && currentNestTarget === overId) {
      if (!canNestItem(activeId, overId)) {
        toast({ title: "Cannot nest item", description: "Items can only be nested one level deep.", variant: "destructive" });
        return;
      }
      const activeItem = allItems.find(i => i.id === activeId);
      const targetItem = allItems.find(i => i.id === overId);
      if (activeItem && targetItem) {
        apiRequest(`/api/schedule-items/${activeId}`, "PATCH", {
          parentItemId: overId,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
          toast({ title: "Item nested", description: `"${activeItem.name}" is now a child of "${targetItem.name}"` });
        }).catch(() => {
          toast({ title: "Failed to nest item", variant: "destructive" });
        });
      }
      return;
    }
    
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
    completion: 90,
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
  allItemsRef.current = allItems;

  const draggingCascadeIds = useMemo(() => {
    if (!dragging || dragging.type !== 'move') return new Set<number | string>();
    const items = allItems || [];
    const visited = new Set<number | string>();
    const queue: (number | string)[] = [dragging.id];
    visited.add(dragging.id);
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const item of items) {
        if (!visited.has(item.id) && item.dependencies?.some((dep: any) => String(dep.id) === String(currentId))) {
          visited.add(item.id);
          queue.push(item.id);
        }
      }
    }
    const childQueue: (number | string)[] = [dragging.id];
    while (childQueue.length > 0) {
      const pid = childQueue.shift()!;
      for (const item of items) {
        if (item.parentItemId === pid && !visited.has(item.id)) {
          visited.add(item.id);
          childQueue.push(item.id);
        }
      }
    }
    visited.delete(dragging.id);
    return visited;
  }, [dragging?.id, dragging?.type, allItems]);

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

  // Separate items into parent items and child items, with search and filter applied
  const { parentItems, childItemsByParent } = useMemo(() => {
    const parents: ScheduleItem[] = [];
    const children: Record<string, ScheduleItem[]> = {};

    // Apply all filters
    let filteredItems = allItems;

    // Search filter
    if (searchQuery) {
      filteredItems = filteredItems.filter(item =>
        item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (filters.status && filters.status !== 'all') {
      filteredItems = filteredItems.filter(item => item.status === filters.status);
    }

    // Type filter
    if (filters.type && filters.type !== 'all') {
      filteredItems = filteredItems.filter(item => item.type === filters.type);
    }

    // Assignee filter
    if (filters.assignee && filters.assignee !== 'all') {
      filteredItems = filteredItems.filter(item => item.assignedTo === filters.assignee);
    }

    // Date range filter
    if (filters.dateRange && filters.dateRange !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      filteredItems = filteredItems.filter(item => {
        if (!item.startDate && !item.endDate) return false;
        const itemStart = item.startDate ? new Date(item.startDate) : null;
        const itemEnd = item.endDate ? new Date(item.endDate) : null;

        switch (filters.dateRange) {
          case 'today':
            return (itemStart && itemStart <= todayEnd && itemEnd && itemEnd >= today) ||
                   (itemStart && itemStart.toDateString() === today.toDateString()) ||
                   (itemEnd && itemEnd.toDateString() === today.toDateString());
          case 'this_week': {
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
            return (itemStart && itemStart <= weekEnd) && (itemEnd && itemEnd >= weekStart);
          }
          case 'this_month': {
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
            return (itemStart && itemStart <= monthEnd) && (itemEnd && itemEnd >= monthStart);
          }
          case 'overdue':
            return itemEnd && itemEnd < today && item.status !== 'completed';
          default:
            return true;
        }
      });
    }

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
  }, [allItems, searchQuery, filters]);

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

  // Initialize session order once items are loaded (freeze initial order for the session)
  useEffect(() => {
    if (!orderInitialized && defaultItemIds.length > 0) {
      setSessionItemOrder([...defaultItemIds]);
      setOrderInitialized(true);
    }
  }, [defaultItemIds, orderInitialized]);

  // Build ordered parent items list for rendering (respects session order)
  const orderedParentItems = useMemo(() => {
    if (sessionItemOrder.length === 0) return parentItems;
    
    // Create a map for quick lookup
    const parentMap = new Map<string, ScheduleItem>();
    parentItems.forEach(p => parentMap.set(p.id, p));
    
    // Get parent IDs from session order (filter to only parent items)
    const orderedIds = sessionItemOrder.filter(id => parentMap.has(id));
    
    // Add any parent items not in session order at the end
    const sessionSet = new Set(orderedIds);
    parentItems.forEach(p => {
      if (!sessionSet.has(p.id)) {
        orderedIds.push(p.id);
      }
    });
    
    return orderedIds.map(id => parentMap.get(id)!);
  }, [parentItems, sessionItemOrder]);

  // Create global item map and row index map for dependency rendering
  // Uses orderedItems (the same flat list as the left panel) for perfect sync
  const { globalItemMap, itemRowIndexMap } = useMemo(() => {
    const itemMap = new Map<string, ScheduleItem>();
    const rowIndexMap = new Map<string, number>();
    
    allItems.forEach(item => itemMap.set(item.id, item));
    
    // Calculate row index from orderedItems - same flat list the left panel iterates
    orderedItems.forEach((item, idx) => {
      rowIndexMap.set(item.id, idx);
    });
    
    return { globalItemMap: itemMap, itemRowIndexMap: rowIndexMap };
  }, [allItems, orderedItems]);

  // Update mutation for schedule items
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/schedule-items/${id}`, "PATCH", { startDate, endDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
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
      setSelectedDependency(null);
    },
  });

  const duplicateItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/schedule-items/${itemId}/duplicate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item duplicated" });
    },
  });

  const updateDependencyMutation = useMutation({
    mutationFn: async ({ itemId, predecessorId, type, lag }: { itemId: string; predecessorId: string; type?: string; lag?: number }) => {
      await apiRequest(`/api/schedule-items/${itemId}/dependencies/${predecessorId}`, "PATCH", { type, lag });
      const depType = type || 'FS';
      if (depType === 'FS' && lag !== undefined) {
        const successor = scheduleItems.find(i => i.id === itemId);
        const predecessor = scheduleItems.find(i => i.id === predecessorId);
        if (successor && predecessor?.endDate) {
          const predEnd = new Date(predecessor.endDate);
          const newStart = addWorkingDays(predEnd, lag + 1);
          const workDuration = countWorkingDays(new Date(successor.startDate), new Date(successor.endDate));
          const newEnd = addWorkingDays(newStart, Math.max(0, workDuration - 1));
          await apiRequest(`/api/schedule-items/${itemId}`, "PATCH", {
            startDate: newStart.toISOString().split('T')[0],
            endDate: newEnd.toISOString().split('T')[0],
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Dependency updated" });
      setSelectedDependency(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update dependency", 
        description: error?.message || "Unknown error",
        variant: "destructive" 
      });
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

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/schedule-items/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Task deleted" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete", 
        description: error?.message || "Could not delete the task",
        variant: "destructive",
      });
    },
  });

  // Progress drag state with live visual feedback
  const [progressDrag, setProgressDrag] = useState<{
    itemId: string;
    barWidth: number;
    startX: number;
    startProgress: number;
    currentProgress: number; // Live visual progress during drag
  } | null>(null);

  // Calculate timeline bounds with dynamic buffer for infinite scroll
  const { timelineStart, timelineEnd, totalDays, dataStart, dataEnd } = useMemo(() => {
    if (allItems.length === 0) {
      const dataStartDate = startOfWeek(new Date());
      const dataEndDate = addDays(dataStartDate, 60);
      const start = addDays(dataStartDate, -timelineBuffer.before);
      const end = addDays(dataEndDate, timelineBuffer.after);
      return { 
        timelineStart: start, 
        timelineEnd: end, 
        totalDays: differenceInDays(end, start) + 1,
        dataStart: dataStartDate,
        dataEnd: dataEndDate
      };
    }

    const allDates = allItems.flatMap(item => [
      new Date(item.startDate), 
      new Date(item.endDate)
    ]);

    const dataStartDate = startOfWeek(new Date(Math.min(...allDates.map(d => d.getTime()))));
    const dataEndDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Apply buffer to extend timeline beyond data bounds
    const start = addDays(dataStartDate, -timelineBuffer.before);
    const end = addDays(dataEndDate, timelineBuffer.after);
    const days = differenceInDays(end, start) + 1;

    return { timelineStart: start, timelineEnd: end, totalDays: days, dataStart: dataStartDate, dataEnd: dataEndDate };
  }, [allItems, timelineBuffer]);

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

  // Calculate project start date for relative week numbering
  const projectStartDate = useMemo(() => {
    if (allItems.length === 0) return timelineStart;
    const allStartDates = allItems.map(item => new Date(item.startDate).getTime());
    return startOfWeek(new Date(Math.min(...allStartDates)), { weekStartsOn: weekStartDay });
  }, [allItems, timelineStart]);

  // Create week-grouped headers for double-row display (ClickUp style)
  const groupedTimelineHeaders = useMemo(() => {
    if (zoomLevel !== 'day') return null; // Only for day view
    
    const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
    const weeks: Array<{
      weekLabel: string;
      widthPx: number;
      days: Array<{ date: Date; label: string; widthPx: number; isWeekend: boolean }>;
    }> = [];
    
    let currentWeekStart = startOfWeek(days[0], { weekStartsOn: weekStartDay }); // Monday
    let currentWeekDays: Array<{ date: Date; label: string; widthPx: number; isWeekend: boolean }> = [];
    
    // Calculate week number relative to project start
    const getProjectWeekNumber = (weekStart: Date) => {
      const weeksFromStart = Math.floor(differenceInDays(weekStart, projectStartDate) / 7);
      return weeksFromStart + 1; // Week 1 is the first week
    };
    
    days.forEach((day, idx) => {
      const weekStart = startOfWeek(day, { weekStartsOn: weekStartDay });
      const dayOfWeek = getDay(day);
      // Sunday (0) is non-working only if includeSunday is false/not set
      // Saturday (6) is non-working only if includeSaturday is false/not set
      const isWeekend = (dayOfWeek === 0 && !schedule?.includeSunday) || (dayOfWeek === 6 && !schedule?.includeSaturday);
      
      // If we've moved to a new week, save the previous week
      if (weekStart.getTime() !== currentWeekStart.getTime() && currentWeekDays.length > 0) {
        const weekNumber = getProjectWeekNumber(currentWeekStart);
        const monthLabel = format(currentWeekStart, 'MMM');
        weeks.push({
          weekLabel: `${monthLabel} - Wk ${weekNumber}`,
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
      const weekNumber = getProjectWeekNumber(currentWeekStart);
      const monthLabel = format(currentWeekStart, 'MMM');
      weeks.push({
        weekLabel: `${monthLabel} - Wk ${weekNumber}`,
        widthPx: currentWeekDays.length * 40,
        days: currentWeekDays,
      });
    }
    
    return weeks;
  }, [timelineStart, timelineEnd, zoomLevel, projectStartDate, schedule]);

  // Calculate pixels per day based on zoom level
  const pixelsPerDay = useMemo(() => {
    if (zoomLevel === 'day') return 40;
    if (zoomLevel === 'week') return 20;
    return 10;
  }, [zoomLevel]);

  useEffect(() => {
    if (prevTimelineStartRef.current && timelineRef.current && pendingScrollAdjustEarly.current === 0) {
      const shiftDays = differenceInDays(prevTimelineStartRef.current, timelineStart);
      if (shiftDays !== 0) {
        timelineRef.current.scrollLeft += shiftDays * pixelsPerDay;
      }
    }
    prevTimelineStartRef.current = timelineStart;
  }, [timelineStart, pixelsPerDay]);

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

  // Get bar color - priority: custom color > trade/contact color > default
  const getBarColor = (item: ScheduleItem) => {
    if (item.color) return item.color;
    if ((item as any).assignedToColor) return (item as any).assignedToColor;
    return '#9ca3af';
  };

  // Check if a date is a non-working day (weekend based on schedule settings)
  const isNonWorkingDay = (date: Date): boolean => {
    const day = getDay(date); // 0 = Sunday, 6 = Saturday
    if (day === 0 && !schedule?.includeSunday) return true;
    if (day === 6 && !schedule?.includeSaturday) return true;
    return false;
  };

  // Snap a date to the nearest working day in the given direction
  const snapToWorkingDay = (date: Date, direction: 'forward' | 'backward' = 'forward'): Date => {
    let d = new Date(date);
    const step = direction === 'forward' ? 1 : -1;
    let maxIterations = 7;
    while (isNonWorkingDay(d) && maxIterations > 0) {
      d = addDays(d, step);
      maxIterations--;
    }
    return d;
  };

  // Count working days between two dates (inclusive of start, exclusive of end)
  const countWorkingDays = (start: Date, end: Date): number => {
    let count = 0;
    const s = new Date(start);
    const e = new Date(end);
    const forward = s <= e;
    let current = new Date(s);
    if (forward) {
      while (current < e) {
        if (!isNonWorkingDay(current)) count++;
        current = addDays(current, 1);
      }
    } else {
      while (current > e) {
        current = addDays(current, -1);
        if (!isNonWorkingDay(current)) count++;
      }
    }
    return count;
  };

  // Add N working days from a date (skipping non-working days)
  const addWorkingDays = (date: Date, days: number): Date => {
    let d = new Date(date);
    let remaining = Math.abs(days);
    const step = days >= 0 ? 1 : -1;
    while (remaining > 0) {
      d = addDays(d, step);
      if (!isNonWorkingDay(d)) remaining--;
    }
    return d;
  };

  // Bar click handler - open modal (but not if a drag just happened)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleBarClick = (e: React.MouseEvent, item: ScheduleItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragHappened.current) {
      return;
    }
    
    // If in pending predecessor mode, create the dependency
    if (pendingPredecessor !== null) {
      if (item.id !== pendingPredecessor) {
        createDependencyMutation.mutate({
          itemId: pendingPredecessor,
          predecessorId: item.id,
          type: 'FS',
        });
      } else {
        toast({ title: "Cannot link to itself" });
      }
      setPendingPredecessor(null);
      return;
    }
    
    // Delay single-click to allow double-click to cancel it
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setSelectedTask(item);
      setRipple({ x: e.clientX, y: e.clientY });
      setTimeout(() => setRipple(null), 600);
    }, 300);
  };

  const pixelsPerDayRef = useRef(pixelsPerDay);
  pixelsPerDayRef.current = pixelsPerDay;
  const snapToWorkingDayRef = useRef(snapToWorkingDay);
  snapToWorkingDayRef.current = snapToWorkingDay;
  const countWorkingDaysRef = useRef(countWorkingDays);
  countWorkingDaysRef.current = countWorkingDays;
  const addWorkingDaysRef = useRef(addWorkingDays);
  addWorkingDaysRef.current = addWorkingDays;
  const updateItemMutationRef = useRef(updateItemMutation);
  updateItemMutationRef.current = updateItemMutation;
  const createDependencyMutationRef = useRef(createDependencyMutation);
  createDependencyMutationRef.current = createDependencyMutation;

  const handleBarMouseDown = (
    e: React.MouseEvent,
    item: ScheduleItem,
    dragType: 'move' | 'resize-left' | 'resize-right' | 'dependency' = 'move',
    anchor?: 'start' | 'end'
  ) => {
    if (e.button !== 0) return;
    if (schedule?.status === 'locked') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    dragHappened.current = false;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startScrollLeft = timelineRef.current?.scrollLeft ?? 0;
    
    const isParentItem = allItems.some(i => i.parentItemId === item.id);
    let effectiveStart: Date;
    let effectiveEnd: Date;
    if (isParentItem) {
      const effective = getEffectiveDates(item);
      effectiveStart = effective.startDate;
      effectiveEnd = effective.endDate;
    } else {
      effectiveStart = new Date(item.startDate);
      effectiveEnd = new Date(item.endDate);
    }
    
    setDragging({
      id: item.id,
      type: dragType,
      startX,
      startY,
      startScrollLeft,
      originalStart: effectiveStart,
      originalEnd: effectiveEnd,
      currentX: startX,
      currentY: startY,
      sourceAnchor: anchor,
      viewportStartX: dragType === 'dependency' ? startX : undefined,
      viewportStartY: dragType === 'dependency' ? startY : undefined,
    });
  };

  useEffect(() => {
    const startAutoScroll = () => {
      const tick = () => {
        const drag = draggingRef.current;
        const cursor = lastCursorPosition.current;
        if (!drag || !cursor || !timelineRef.current) {
          autoScrollRafId.current = null;
          return;
        }
        if (drag.type === 'move' || drag.type === 'resize-left' || drag.type === 'resize-right') {
          const rect = timelineRef.current.getBoundingClientRect();
          const edgeZone = 60;
          const scrollSpeed = 8;
          let scrolled = false;
          if (cursor.x < rect.left + edgeZone) {
            timelineRef.current.scrollLeft -= scrollSpeed;
            scrolled = true;
          } else if (cursor.x > rect.right - edgeZone) {
            timelineRef.current.scrollLeft += scrollSpeed;
            scrolled = true;
          }
          if (scrolled) {
            const scrollDelta = (timelineRef.current.scrollLeft) - drag.startScrollLeft;
            const currentDeltaX = (cursor.x - drag.startX) + scrollDelta;
            setDragging(prev => prev ? { ...prev, currentDeltaX } : null);
          }
        }
        autoScrollRafId.current = requestAnimationFrame(tick);
      };
      if (autoScrollRafId.current === null) {
        autoScrollRafId.current = requestAnimationFrame(tick);
      }
    };

    const stopAutoScroll = () => {
      if (autoScrollRafId.current !== null) {
        cancelAnimationFrame(autoScrollRafId.current);
        autoScrollRafId.current = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      const deltaX = Math.abs(e.clientX - drag.startX);
      const deltaY = Math.abs(e.clientY - drag.startY);
      if (deltaX > 3 || deltaY > 3) {
        dragHappened.current = true;
      }

      let currentX = e.clientX;
      let currentY = e.clientY;
      
      lastCursorPosition.current = { x: currentX, y: currentY };

      const scrollDelta = (timelineRef.current?.scrollLeft ?? 0) - drag.startScrollLeft;
      const currentDeltaX = (e.clientX - drag.startX) + scrollDelta;

      setDragging(prev => prev ? { ...prev, currentX, currentY, currentDeltaX } : null);

      startAutoScroll();
    };

    const handleMouseUp = async (e: MouseEvent) => {
      stopAutoScroll();
      const drag = draggingRef.current;
      if (!drag || !timelineRef.current) {
        setDragging(null);
        return;
      }

      const scrollDelta = (timelineRef.current?.scrollLeft ?? 0) - drag.startScrollLeft;
      const deltaX = (e.clientX - drag.startX) + scrollDelta;
      const deltaDays = Math.round(deltaX / pixelsPerDayRef.current);
      const cacheKey = `/api/projects/${projectIdRef.current}/schedule-items`;

      const updateCacheOptimistically = (itemId: number, newStart: Date, newEnd: Date) => {
        queryClient.setQueryData<ScheduleItem[]>([cacheKey], (oldData) => {
          if (!oldData) return oldData;
          return oldData.map(item => 
            item.id === itemId 
              ? { ...item, startDate: newStart, endDate: newEnd }
              : item
          );
        });
      };

      const currentItems = allItemsRef.current;
      const snap = snapToWorkingDayRef.current;
      const countWD = countWorkingDaysRef.current;
      const addWD = addWorkingDaysRef.current;
      const mutate = updateItemMutationRef.current;

      const calcFsLag = (predEnd: Date, succStart: Date): number => {
        const pEnd = new Date(predEnd);
        pEnd.setHours(0, 0, 0, 0);
        const sStart = new Date(succStart);
        sStart.setHours(0, 0, 0, 0);
        const diffMs = sStart.getTime() - pEnd.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays - 1);
      };

      const recalcLagForItem = (itemId: string | number, itemNewStart: Date, items: ScheduleItem[]) => {
        const item = items.find(i => i.id === itemId);
        if (!item?.dependencies || (item.dependencies as any[]).length === 0) return;
        const deps = item.dependencies as any[];
        const updatedDeps = deps.map((dep: any) => {
          if (dep.type && dep.type !== 'FS') return dep;
          const pred = items.find(i => String(i.id) === String(dep.id));
          if (!pred) return dep;
          const newLag = calcFsLag(new Date(pred.endDate), itemNewStart);
          return { ...dep, lag: newLag };
        });
        const changed = deps.some((d: any, i: number) => d.lag !== updatedDeps[i].lag);
        if (changed) {
          apiRequest(`/api/schedule-items/${itemId}`, "PATCH", { dependencies: updatedDeps })
            .then(() => queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectIdRef.current}/schedule-items`] }))
            .catch(() => {});
        }
      };

      const recalcLagForSuccessors = (predecessorId: string | number, predNewEnd: Date, items: ScheduleItem[]) => {
        const successors = items.filter(item =>
          (item.dependencies as any[] || []).some((dep: any) => String(dep.id) === String(predecessorId))
        );
        for (const succ of successors) {
          const deps = succ.dependencies as any[];
          const updatedDeps = deps.map((dep: any) => {
            if (String(dep.id) !== String(predecessorId)) return dep;
            if (dep.type && dep.type !== 'FS') return dep;
            const newLag = calcFsLag(predNewEnd, new Date(succ.startDate));
            return { ...dep, lag: newLag };
          });
          const changed = deps.some((d: any, i: number) => d.lag !== updatedDeps[i].lag);
          if (changed) {
            apiRequest(`/api/schedule-items/${succ.id}`, "PATCH", { dependencies: updatedDeps })
              .then(() => queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectIdRef.current}/schedule-items`] }))
              .catch(() => {});
          }
        }
      };

      if (drag.type === 'move') {
        if (deltaDays !== 0) {
          const workingDuration = countWD(drag.originalStart, drag.originalEnd);
          
          let newStart = addDays(drag.originalStart, deltaDays);
          const snapDir = deltaDays > 0 ? 'forward' : 'backward';
          newStart = snap(newStart, snapDir);
          let newEnd = addWD(newStart, workingDuration);
          
          const totalOffset = differenceInDays(newStart, drag.originalStart);

          const getAllDownstreamSuccessors = (rootId: number | string): ScheduleItem[] => {
            const visited = new Set<number | string>();
            const result: ScheduleItem[] = [];
            const queue = [rootId];
            visited.add(rootId);
            while (queue.length > 0) {
              const currentId = queue.shift()!;
              const successors = currentItems.filter(item =>
                item.dependencies?.some((dep: any) => String(dep.id) === String(currentId))
              );
              for (const s of successors) {
                if (!visited.has(s.id)) {
                  visited.add(s.id);
                  result.push(s);
                  queue.push(s.id);
                }
              }
            }
            return result;
          };

          const dependentItems = getAllDownstreamSuccessors(drag.id);

          const childItems: ScheduleItem[] = [];
          const childQ: (number | string)[] = [drag.id];
          while (childQ.length > 0) {
            const pid = childQ.shift()!;
            for (const ci of currentItems) {
              if (ci.parentItemId === pid) {
                childItems.push(ci);
                childQ.push(ci.id);
              }
            }
          }
          
          const snapDepItem = (depItem: ScheduleItem) => {
            const depWorkingDuration = countWD(new Date(depItem.startDate), new Date(depItem.endDate));
            let depNewStart = addDays(new Date(depItem.startDate), totalOffset);
            depNewStart = snap(depNewStart, snapDir);
            const depNewEnd = addWD(depNewStart, depWorkingDuration);
            return { depNewStart, depNewEnd };
          };

          updateCacheOptimistically(drag.id, newStart, newEnd);
          
          for (const child of childItems) {
            if (!dependentItems.some(d => d.id === child.id)) {
              const { depNewStart, depNewEnd } = snapDepItem(child);
              updateCacheOptimistically(child.id, depNewStart, depNewEnd);
            }
          }
          
          for (const depItem of dependentItems) {
            const { depNewStart, depNewEnd } = snapDepItem(depItem);
            updateCacheOptimistically(depItem.id, depNewStart, depNewEnd);
          }

          mutate.mutate({
            id: drag.id,
            startDate: newStart,
            endDate: newEnd,
          });
          
          for (const child of childItems) {
            if (!dependentItems.some(d => d.id === child.id)) {
              const { depNewStart, depNewEnd } = snapDepItem(child);
              mutate.mutate({
                id: child.id,
                startDate: depNewStart,
                endDate: depNewEnd,
              });
            }
          }
          
          for (const depItem of dependentItems) {
            const { depNewStart, depNewEnd } = snapDepItem(depItem);
            mutate.mutate({
              id: depItem.id,
              startDate: depNewStart,
              endDate: depNewEnd,
            });
          }

          recalcLagForItem(drag.id, newStart, currentItems);
        }
      } else if (drag.type === 'resize-left') {
        if (deltaDays !== 0) {
          let newStart = addDays(drag.originalStart, deltaDays);
          newStart = snap(newStart, deltaDays < 0 ? 'backward' : 'forward');
          
          if (newStart <= drag.originalEnd) {
            updateCacheOptimistically(drag.id, newStart, drag.originalEnd);
            
            mutate.mutate({
              id: drag.id,
              startDate: newStart,
              endDate: drag.originalEnd,
            });

            recalcLagForItem(drag.id, newStart, currentItems);
          }
        }
      } else if (drag.type === 'resize-right') {
        if (deltaDays !== 0) {
          let newEnd = addDays(drag.originalEnd, deltaDays);
          newEnd = snap(newEnd, deltaDays > 0 ? 'forward' : 'backward');
          
          if (newEnd >= drag.originalStart) {
            updateCacheOptimistically(drag.id, drag.originalStart, newEnd);
            
            mutate.mutate({
              id: drag.id,
              startDate: drag.originalStart,
              endDate: newEnd,
            });

            recalcLagForSuccessors(drag.id, newEnd, currentItems);
          }
        }
      } else if (drag.type === 'dependency') {
        const hBar = hoveredBarRef.current;
        const hAnchor = hoveredAnchorRef.current;
        if (hBar && hBar !== drag.id && hAnchor) {
          const sourceAnchor = drag.sourceAnchor || 'end';
          const targetAnchor = hAnchor || 'start';
          
          let dependencyType = 'FS';
          if (sourceAnchor === 'end' && targetAnchor === 'start') {
            dependencyType = 'FS';
          } else if (sourceAnchor === 'start' && targetAnchor === 'start') {
            dependencyType = 'SS';
          } else if (sourceAnchor === 'end' && targetAnchor === 'end') {
            dependencyType = 'FF';
          } else if (sourceAnchor === 'start' && targetAnchor === 'end') {
            dependencyType = 'SF';
          }
          
          await createDependencyMutationRef.current.mutateAsync({
            itemId: hBar,
            predecessorId: drag.id,
            type: dependencyType,
          });
        }
      }

      setDragging(null);
      setHoveredAnchor(null);
      
      setTimeout(() => {
        dragHappened.current = false;
      }, 50);
    };

    const handleScroll = () => {
      if (draggingRef.current?.type === 'dependency') {
        setScrollVersion(v => v + 1);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    const timeline = timelineRef.current;
    if (timeline) {
      timeline.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      stopAutoScroll();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (timeline) {
        timeline.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Progress drag effect - with live visual feedback
  useEffect(() => {
    if (!progressDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - progressDrag.startX;
      const deltaPercent = (deltaX / progressDrag.barWidth) * 100;
      const newProgress = Math.max(0, Math.min(100, Math.round(progressDrag.startProgress + deltaPercent)));
      
      // Update currentProgress for immediate visual feedback
      setProgressDrag(prev => prev ? { ...prev, currentProgress: newProgress } : null);
    };

    const handleMouseUp = async (e: MouseEvent) => {
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
  }, [progressDrag?.itemId, progressDrag?.startX, progressDrag?.barWidth, progressDrag?.startProgress, updateProgressMutation]);

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

  const ganttInitialScrollRef = useRef(false);

  const scrollToToday = useCallback(() => {
    if (!timelineRef.current) return;
    const todayPos = differenceInDays(new Date(), timelineStart) * pixelsPerDay;
    const containerWidth = timelineRef.current.clientWidth;
    timelineRef.current.scrollLeft = todayPos - containerWidth / 2;
  }, [timelineStart, pixelsPerDay]);

  useEffect(() => {
    if (scrollToTodayRef) {
      scrollToTodayRef.current = scrollToToday;
    }
    return () => {
      if (scrollToTodayRef) scrollToTodayRef.current = null;
    };
  }, [scrollToTodayRef, scrollToToday]);

  const latestDefaultItemIdsRef = useRef(defaultItemIds);
  latestDefaultItemIdsRef.current = defaultItemIds;

  useEffect(() => {
    if (insertAfterItemRef) {
      insertAfterItemRef.current = (newItemId: string, afterItemId: string) => {
        setSessionItemOrder(currentOrder => {
          const order = currentOrder.length > 0 ? [...currentOrder] : [...latestDefaultItemIdsRef.current];
          if (order.includes(newItemId)) return currentOrder;
          const afterIdx = order.indexOf(afterItemId);
          if (afterIdx === -1) {
            order.push(newItemId);
          } else {
            order.splice(afterIdx + 1, 0, newItemId);
          }
          return order;
        });
      };
    }
    return () => {
      if (insertAfterItemRef) insertAfterItemRef.current = null;
    };
  }, [insertAfterItemRef]);

  useEffect(() => {
    if (!ganttInitialScrollRef.current && allItems.length > 0 && timelineRef.current) {
      ganttInitialScrollRef.current = true;
      requestAnimationFrame(() => scrollToToday());
    }
  }, [allItems, scrollToToday]);

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const rect = contextMenuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      if (rect.bottom > viewportHeight) {
        const adjustedY = Math.max(0, contextMenu.y - (rect.bottom - viewportHeight) - 8);
        setContextMenu(prev => prev ? { ...prev, y: adjustedY } : null);
      }
      const viewportWidth = window.innerWidth;
      if (rect.right > viewportWidth) {
        const adjustedX = Math.max(0, contextMenu.x - (rect.right - viewportWidth) - 8);
        setContextMenu(prev => prev ? { ...prev, x: adjustedX } : null);
      }
    }
  }, [contextMenu?.x, contextMenu?.y]);

  // Scroll synchronization between left panel and timeline
  const handleLeftPanelScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollSyncing.current) return;
    isScrollSyncing.current = true;
    if (timelineRef.current) {
      timelineRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => { isScrollSyncing.current = false; });
  };

  const lastExtensionDirection = useRef<'left' | 'right' | null>(null);
  
  // Effect to adjust scroll position after extending left
  useEffect(() => {
    if (pendingScrollAdjustEarly.current > 0 && timelineRef.current) {
      timelineRef.current.scrollLeft += pendingScrollAdjustEarly.current;
      pendingScrollAdjustEarly.current = 0;
      lastExtensionDirection.current = null;
    }
  }, [timelineBuffer.before]);
  
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isScrollSyncing.current) return;
    isScrollSyncing.current = true;
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    requestAnimationFrame(() => { isScrollSyncing.current = false; });
    
    // Infinite scroll: extend timeline when near edges
    const target = e.currentTarget;
    const scrollLeft = target.scrollLeft;
    const scrollWidth = target.scrollWidth;
    const clientWidth = target.clientWidth;
    const edgeThreshold = 200; // Pixels from edge to trigger extension
    const extensionDays = 14; // Days to add when extending
    
    // Near left edge - extend timeline backward (guard against repeated triggers)
    if (scrollLeft < edgeThreshold && lastExtensionDirection.current !== 'left') {
      // Accumulate pixels to add based on current zoom level
      const pixelsToAdd = extensionDays * pixelsPerDay;
      pendingScrollAdjustEarly.current += pixelsToAdd;
      lastExtensionDirection.current = 'left';
      setTimelineBuffer(prev => ({ ...prev, before: prev.before + extensionDays }));
    }
    
    // Near right edge - extend timeline forward (guard against repeated triggers)
    if (scrollWidth - scrollLeft - clientWidth < edgeThreshold && lastExtensionDirection.current !== 'right') {
      lastExtensionDirection.current = 'right';
      setTimelineBuffer(prev => ({ ...prev, after: prev.after + extensionDays }));
    }
    
    // Reset guard when not near edges
    if (scrollLeft >= edgeThreshold && scrollWidth - scrollLeft - clientWidth >= edgeThreshold) {
      lastExtensionDirection.current = null;
    }
  };

  // Scroll timeline to show a specific item's bar
  const scrollToItem = (item: ScheduleItem) => {
    if (!timelineRef.current) return;
    
    const startDate = new Date(item.startDate);
    const barPosition = getPosition(startDate);
    const viewportWidth = timelineRef.current.clientWidth;
    
    // Scroll to show bar with some left margin (100px from left edge)
    const targetScroll = Math.max(0, barPosition - 100);
    
    timelineRef.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

  // Handle row click to scroll timeline to corresponding bar
  const handleRowClick = (e: React.MouseEvent, item: ScheduleItem) => {
    // Don't scroll if clicking on buttons, badges, interactive elements, or any focusable/clickable children
    const target = e.target as HTMLElement;
    const interactiveSelectors = [
      'button', 
      '[data-drag-handle]', 
      '.badge', 
      'input', 
      'select', 
      'a', 
      '[role="button"]',
      '[data-testid*="toggle"]',
      '[data-testid*="button"]'
    ];
    if (interactiveSelectors.some(sel => target.closest(sel))) {
      return;
    }
    scrollToItem(item);
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

  const handleCreatePredecessor = (item: ScheduleItem) => {
    const dayAfterEnd = addDays(new Date(item.endDate), 1);
    const newItem = {
      name: '',
      scheduleId: item.scheduleId,
      parentItemId: item.parentItemId,
      startDate: dayAfterEnd,
      endDate: dayAfterEnd,
      status: 'not_started',
      type: 'task',
      priority: 'medium',
      progressPercent: 0,
      sortOrder: (item.sortOrder || 0) + 1,
      dependencies: [{ id: item.id, type: 'FS', lag: 0, _name: item.name }],
    } as Partial<ScheduleItem>;
    
    if (setPendingAutoLink) {
      setPendingAutoLink({ predecessorId: item.id, insertAfterItemId: item.id, lag: 0 });
    }
    
    setEditingItemContext(newItem as any);
    setShowItemDialog(true);
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

  const handleInlineEditSave = async (itemId: number) => {
    const trimmed = inlineEditValue.trim();
    const originalItem = allItems.find(i => i.id === itemId);
    
    if (!trimmed) {
      setInlineEditId(null);
      setInlineEditValue('');
      return;
    }
    
    if (originalItem && trimmed === originalItem.name) {
      setInlineEditId(null);
      setInlineEditValue('');
      return;
    }
    
    try {
      await apiRequest(`/api/schedule-items/${itemId}`, "PATCH", { name: trimmed });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      setInlineEditId(null);
      setInlineEditValue('');
    } catch {
      toast({ title: "Failed to rename", variant: "destructive" });
    }
  };

  const handleAddChildItem = (parentItem: ScheduleItem) => {
    const rawStart = new Date(parentItem.startDate);
    const start = snapToWorkingDay(rawStart, 'forward');
    const end = new Date(start);
    const childItem = {
      name: '',
      scheduleId: parentItem.scheduleId,
      parentItemId: parentItem.id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: 'not_started',
    } as Partial<ScheduleItem>;
    setEditingItemContext(childItem as any);
    setShowItemDialog(true);
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
      {pendingPredecessor !== null && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 text-sm">
          <span className="text-blue-700 dark:text-blue-300">Click a bar to set it as predecessor. Press Escape to cancel.</span>
          <button onClick={() => setPendingPredecessor(null)} className="text-blue-500 hover:text-blue-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Timeline Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task Names Column (Resizable Panel) */}
        <div 
          style={{ width: leftPanelWidth ?? totalPanelWidth }} 
          className="border-r flex flex-col bg-card flex-shrink-0 overflow-x-auto relative"
        >
          {/* Top row - Search bar (30px) - outside inner wrapper so it resizes with panel */}
          <div className="h-[30px] flex items-center px-2 border-b border-border gap-2 flex-shrink-0">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-7 py-0 h-6 text-xs border"
                data-testid="input-search-gantt-tasks"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => {
                setSessionItemOrder([...defaultItemIds]);
              }}
              title="Reset order to start date"
              data-testid="button-reset-order"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" data-testid="button-columns">
                  <Columns className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2 z-[100]" data-testid="popover-columns">
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

          {/* Content wrapper with actual column widths */}
          <div style={{ width: totalPanelWidth }} className="flex flex-col flex-1 overflow-hidden">
            
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
                      <div style={{ width: columnWidths.completion }} className="text-center flex-shrink-0">Completion %</div>
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
          <div ref={leftPanelRef} onScroll={handleLeftPanelScroll} className="flex-1 overflow-y-auto pb-20">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragOver={handleRowDragOver}
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
                    className={`h-8 flex items-center px-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer group border-b border-border ${nestTargetId === item.id ? 'ring-2 ring-inset ring-primary bg-primary/10' : ''}`}
                    onClick={(e) => handleRowClick(e, item)}
                    data-testid={`row-${isParent ? 'parent' : 'child'}-${item.id}`}
                  >
                    {/* Task name column */}
                    <div style={{ width: columnWidths.taskName }} className={`flex items-center min-w-0 flex-shrink-0 px-1 rounded hover:ring-1 hover:ring-border/50 hover:bg-accent/5 transition-all`}>
                      {!isParent && <div className="w-6 flex-shrink-0" />}
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
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}
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
                      {inlineEditId === item.id ? (
                        <input
                          autoFocus
                          className="text-sm bg-transparent border-b border-primary outline-none flex-1 min-w-0 px-1"
                          value={inlineEditValue}
                          onChange={(e) => setInlineEditValue(e.target.value)}
                          onBlur={() => handleInlineEditSave(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleInlineEditSave(item.id);
                            if (e.key === 'Escape') { setInlineEditId(null); setInlineEditValue(''); }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`inline-edit-${item.id}`}
                        />
                      ) : (
                        <span
                          className={`text-sm truncate ${isParent ? 'font-medium' : 'text-muted-foreground ml-1'}`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (schedule?.status === 'locked') return;
                            setInlineEditId(item.id);
                            setInlineEditValue(item.name);
                          }}
                        >
                          {item.name}
                        </span>
                      )}
                    </div>

                    {/* Status column - clickable dropdown */}
                    {visibleColumns.status && (
                      <div style={{ width: columnWidths.status }} className="flex items-center justify-center flex-shrink-0 px-1">
                        {item.status && statusOptions.length > 0 ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="cursor-pointer hover-elevate rounded" data-testid={`status-dropdown-${item.id}`}>
                                {(() => {
                                  const statusInfo = getStatusInfo(item.status);
                                  return (
                                    <Badge 
                                      className="text-xs px-1.5 h-5 border-0 min-w-[72px] justify-center"
                                      style={{
                                        backgroundColor: statusInfo.color,
                                        color: '#ffffff'
                                      }}
                                    >
                                      {statusInfo.name}
                                    </Badge>
                                  );
                                })()}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="min-w-[140px]">
                              {statusOptions.map((opt) => {
                                const optInfo = getStatusInfo(opt.key);
                                return (
                                  <DropdownMenuItem
                                    key={opt.key}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (opt.key !== item.status) {
                                        updateItemStatusMutation.mutate({ itemId: item.id, status: opt.key });
                                      }
                                    }}
                                    className={opt.key === item.status ? "bg-accent" : ""}
                                    data-testid={`status-option-${opt.key}`}
                                  >
                                    <div 
                                      className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                                      style={{ backgroundColor: optInfo.color }} 
                                    />
                                    <span className="text-xs">{opt.name}</span>
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : item.status ? (
                          (() => {
                            const statusInfo = getStatusInfo(item.status);
                            return (
                              <Badge 
                                className="text-xs px-1.5 h-5 border-0 min-w-[72px] justify-center"
                                style={{
                                  backgroundColor: statusInfo.color,
                                  color: '#ffffff'
                                }}
                              >
                                {statusInfo.name}
                              </Badge>
                            );
                          })()
                        ) : null}
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
                      <div style={{ width: columnWidths.completion }} className="flex items-center justify-center gap-1.5 flex-shrink-0 px-1">
                        {(() => {
                          const percent = isParent && childItems.length > 0
                            ? Math.round(childItems.reduce((sum, c) => sum + (c.progressPercent ?? 0), 0) / childItems.length)
                            : (item.progressPercent || 0);
                          return (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isParent && childItems.length > 0) return;
                                  const newPercent = percent === 100 ? 0 : 100;
                                  updateProgressMutation.mutate({ id: item.id, progressPercent: newPercent });
                                }}
                                className={cn(
                                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                                  isParent && childItems.length > 0
                                    ? "cursor-default opacity-60"
                                    : "cursor-pointer",
                                  percent === 100
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40 hover:border-muted-foreground/70"
                                )}
                                data-testid={`gantt-completion-toggle-${item.id}`}
                              >
                                {percent === 100 && <Check className="w-2.5 h-2.5" />}
                              </button>
                              <span className="inline-flex items-center justify-center rounded-md bg-muted-foreground/20 text-muted-foreground text-[10px] font-medium px-1.5 py-0.5 min-w-[32px]">
                                {percent} %
                              </span>
                            </>
                          );
                        })()}
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
                          {schedule?.status !== 'locked' && (
                            <DropdownMenuItem onClick={() => handleEditItem(item)} data-testid="menu-edit">
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleViewItem(item)} data-testid="menu-view">
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          {schedule?.status !== 'locked' && (
                            <>
                              <DropdownMenuItem onClick={() => handleDuplicateItem(item)} data-testid="menu-duplicate">
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate
                              </DropdownMenuItem>
                              {!item.parentItemId && (
                                <DropdownMenuItem onClick={() => handleAddChildItem(item)} data-testid="menu-add-child">
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add Child Item
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => handleCreatePredecessor(item)} 
                                data-testid="menu-create-predecessor"
                              >
                                <Link className="mr-2 h-4 w-4" />
                                Create Predecessor
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
                            </>
                          )}
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

            {/* Timeline Bars - minHeight ensures scroll area matches left panel */}
            <div className="relative pb-20" style={{ minHeight: `${orderedItems.length * ROW_HEIGHT}px` }}>
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
                            left: `${previousDays * pixelsPerDay}px`,
                            width: `${pixelsPerDay}px`,
                          }}
                        />
                      );
                    })
                  ).filter(Boolean)}
                </div>
              )}

              {/* Vertical grid lines */}
              <div className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none z-0">
                {groupedTimelineHeaders ? (
                  // Day zoom: one line per day at exact pixelsPerDay intervals
                  groupedTimelineHeaders.flatMap((week, weekIdx) =>
                    week.days.map((day, dayIdx) => {
                      const totalDayIdx = groupedTimelineHeaders
                        .slice(0, weekIdx)
                        .reduce((sum, w) => sum + w.days.length, 0) + dayIdx;
                      return (
                        <div
                          key={`grid-${weekIdx}-${dayIdx}`}
                          className="absolute top-0 bottom-0 w-px bg-border/30"
                          style={{ left: `${(totalDayIdx + 1) * pixelsPerDay - 1}px` }}
                        />
                      );
                    })
                  )
                ) : (
                  // Week/month zoom: use timelineHeaders
                  timelineHeaders.map((header, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-r border-border/30"
                      style={{ left: `${timelineHeaders.slice(0, idx + 1).reduce((sum, h) => sum + h.width, 0)}px` }}
                    />
                  ))
                )}
              </div>

              {/* Today line - lilac color */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
                style={{ 
                  left: `${todayPosition}px`,
                }}
              />
              
              {/* Ghost preview bar during drag/resize */}
              {dragging && (dragging.type === 'move' || dragging.type === 'resize-left' || dragging.type === 'resize-right') && (() => {
                const dragItem = allItems.find(item => item.id === dragging.id);
                if (!dragItem) return null;
                
                const originalStart = getPosition(new Date(dragItem.startDate));
                const originalDuration = differenceInDays(new Date(dragItem.endDate), new Date(dragItem.startDate)) + 1;
                const originalWidth = originalDuration * pixelsPerDay;
                
                // Calculate preview dimensions based on drag type
                let previewLeft = originalStart;
                let previewWidth = originalWidth;
                const deltaX = dragging.currentDeltaX || 0;
                
                if (dragging.type === 'move') {
                  previewLeft = originalStart + deltaX;
                } else if (dragging.type === 'resize-left') {
                  previewLeft = originalStart + deltaX;
                  previewWidth = Math.max(pixelsPerDay, originalWidth - deltaX);
                } else if (dragging.type === 'resize-right') {
                  previewWidth = Math.max(pixelsPerDay, originalWidth + deltaX);
                }
                
                // Use itemRowIndexMap for row position (synced with left panel)
                const foundRow = itemRowIndexMap.get(dragging.id) ?? 0;
                
                return (
                  <div
                    className="absolute h-6 rounded-sm border-2 border-dashed border-[#bba7db] bg-[#bba7db]/30 pointer-events-none z-40"
                    style={{
                      left: `${previewLeft}px`,
                      width: `${previewWidth}px`,
                      top: `${foundRow * ROW_HEIGHT + 4}px`,
                    }}
                    data-testid="ghost-preview-bar"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-[#7c5fb3]">
                      {Math.max(1, Math.round(previewWidth / pixelsPerDay))}d
                    </div>
                  </div>
                );
              })()}
              
              {orderedItems.map((item) => {
                const isParent = !item.parentItemId;
                const childItems = childItemsByParent[item.id] || [];
                const hasChildren = isParent && childItems.length > 0;
                const isChild = !!item.parentItemId;

                const dates = hasChildren ? getEffectiveDates(item) : { startDate: new Date(item.startDate), endDate: new Date(item.endDate) };
                const barStart = getPosition(dates.startDate);
                const barDuration = differenceInDays(dates.endDate, dates.startDate) + 1;
                const barWidth = barDuration * pixelsPerDay;
                const barColor = getBarColor(item);

                const approximateTextWidth = item.name.length * 7 + 16;
                const nameFitsInBar = approximateTextWidth <= barWidth;

                const displayProgress = progressDrag?.itemId === item.id 
                  ? progressDrag.currentProgress 
                  : hasChildren 
                    ? Math.round(childItems.reduce((sum, c) => sum + (c.progressPercent ?? 0), 0) / (childItems.length || 1))
                    : (item.progressPercent ?? 0);

                return (
                  <div key={item.id} style={{ height: `${ROW_HEIGHT}px` }} className="relative group/row">
                    <div 
                      className={`absolute ${hasChildren ? 'top-[9px] h-[14px]' : 'top-1 h-6'}`}
                      style={{ 
                        left: `${barStart + (dragging?.id === item.id && dragging?.type === 'move' ? (dragging.currentDeltaX || 0) : 
                          (dragging?.type === 'move' && draggingCascadeIds.has(item.id) ? (dragging.currentDeltaX || 0) : 0))}px`, 
                        width: `${barWidth}px`,
                        opacity: (dragging?.id === item.id && dragging?.type === 'move') || 
                          (dragging?.type === 'move' && draggingCascadeIds.has(item.id)) ? 0.8 : 1,
                        transition: dragging?.id === item.id || (dragging?.type === 'move' && draggingCascadeIds.has(item.id)) ? 'none' : 'opacity 0.2s',
                      }}
                    >
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 -left-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30 ${hoveredBar === item.id && hoveredAnchor === 'start' ? 'scale-150' : ''}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleBarMouseDown(e, item, 'dependency', 'start');
                        }}
                        onMouseEnter={() => { setHoveredBar(item.id); setHoveredAnchor('start'); }}
                        onMouseLeave={() => { setHoveredBar(null); setHoveredAnchor(null); }}
                        title="Drag to create dependency from start"
                        data-testid={`dependency-start-${item.id}`}
                      >
                        <div className="w-2 h-2 rounded-full bg-[#9b7fc7] hover:scale-150 transition-transform" />
                      </div>
                      
                      <div
                        className={`absolute inset-0 rounded-sm flex items-center cursor-move transition-shadow z-10 group/bar overflow-hidden
                          ${dragging?.id === item.id ? 'shadow-lg ring-2 ring-[#bba7db]' : 'hover:shadow-md'}
                        `}
                        style={{
                          backgroundColor: barColor,
                        }}
                        onClick={(e) => handleBarClick(e, item)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (clickTimer.current) {
                            clearTimeout(clickTimer.current);
                            clickTimer.current = null;
                          }
                          setDragging(null);
                          dragHappened.current = false;
                          if (schedule?.status === 'locked') {
                            handleViewItem(item);
                          } else {
                            handleEditItem(item);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, item });
                        }}
                        onMouseDown={(e) => handleBarMouseDown(e, item, 'move')}
                        onMouseEnter={() => setHoveredBar(item.id)}
                        onMouseLeave={() => setHoveredBar(null)}
                        data-testid={`bar-${item.id}`}
                      >
                        {!hasChildren && (
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, item, 'resize-left');
                            }}
                            data-testid={`resize-left-${item.id}`}
                          />
                        )}
                        
                        {nameFitsInBar && (
                          <span className="text-xs font-medium text-white truncate pointer-events-none pl-2">
                            {item.name}
                          </span>
                        )}
                        
                        {!hasChildren && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-background/30 opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, item, 'resize-right');
                            }}
                            data-testid={`resize-right-${item.id}`}
                          />
                        )}
                        
                        <div 
                          className="absolute inset-0 pointer-events-none rounded-sm"
                          style={{ 
                            background: `linear-gradient(to right, rgba(0,0,0,0.25) ${displayProgress}%, transparent ${displayProgress}%)` 
                          }}
                        />
                        
                        {!hasChildren && (
                        <div
                          className={`absolute bottom-0 left-0 right-0 h-2 opacity-0 group-hover/bar:opacity-100 transition-opacity ${schedule?.status === 'offline' ? 'pointer-events-none' : 'cursor-ew-resize'}`}
                          onMouseDown={(e) => {
                            if (schedule?.status === 'offline') return;
                            e.stopPropagation();
                            e.preventDefault();
                            const barRect = e.currentTarget.parentElement?.getBoundingClientRect();
                            if (!barRect) return;
                            const clickX = e.clientX - barRect.left;
                            const clickPercent = Math.max(0, Math.min(100, Math.round((clickX / barRect.width) * 100)));
                            updateProgressMutation.mutate({ id: item.id, progressPercent: clickPercent });
                            setProgressDrag({
                              itemId: item.id,
                              barWidth: barRect.width,
                              startX: e.clientX,
                              startProgress: clickPercent,
                              currentProgress: clickPercent,
                            });
                          }}
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          data-testid={`progress-track-${item.id}`}
                        >
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30" />
                          <div 
                            className={`absolute bottom-0 w-2 h-2 bg-white rounded-full shadow-md -translate-x-1/2 transition-transform ${schedule?.status === 'offline' ? '' : 'cursor-ew-resize hover:scale-125'}`}
                            style={{ left: `${displayProgress}%` }}
                            onMouseDown={(e) => {
                              if (schedule?.status === 'offline') return;
                              e.stopPropagation();
                              e.preventDefault();
                              const barRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                              if (!barRect) return;
                              setProgressDrag({
                                itemId: item.id,
                                barWidth: barRect.width,
                                startX: e.clientX,
                                startProgress: item.progressPercent ?? 0,
                                currentProgress: item.progressPercent ?? 0,
                              });
                            }}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            data-testid={`progress-thumb-${item.id}`}
                          />
                        </div>
                        )}
                      </div>
                      
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 -right-4 w-4 h-4 flex items-center justify-center opacity-0 group-hover/row:opacity-100 cursor-crosshair transition-opacity z-30 ${hoveredBar === item.id && hoveredAnchor === 'end' ? 'scale-150' : ''}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleBarMouseDown(e, item, 'dependency', 'end');
                        }}
                        onMouseEnter={() => { setHoveredBar(item.id); setHoveredAnchor('end'); }}
                        onMouseLeave={() => { setHoveredBar(null); setHoveredAnchor(null); }}
                        title="Drag to create dependency from end"
                        data-testid={`dependency-end-${item.id}`}
                      >
                        <div className="w-2 h-2 rounded-full bg-[#9b7fc7] hover:scale-150 transition-transform" />
                      </div>
                    </div>
                      
                    {baselineItems.length > 0 && (() => {
                      const baselineItem = baselineItems.find((bi: any) => bi.scheduleItemId === item.id);
                      if (!baselineItem) return null;
                      const blStart = getPosition(new Date(baselineItem.startDate));
                      const blDuration = differenceInDays(new Date(baselineItem.endDate), new Date(baselineItem.startDate)) + 1;
                      const blWidth = blDuration * pixelsPerDay;
                      return (
                        <div
                          className="absolute h-2 rounded-sm border border-dashed border-purple-400/60 bg-purple-200/30 dark:bg-purple-800/20 pointer-events-none z-5"
                          style={{
                            left: `${blStart}px`,
                            width: `${blWidth}px`,
                            top: `${ROW_HEIGHT - 6}px`,
                          }}
                          title={`Baseline: ${format(new Date(baselineItem.startDate), 'MMM d')} – ${format(new Date(baselineItem.endDate), 'MMM d')}`}
                        />
                      );
                    })()}
                      
                    {!nameFitsInBar && (
                      <div
                        className="absolute top-1 h-6 flex items-center pl-2 z-20"
                        style={{ left: `${barStart + barWidth + 20}px` }}
                      >
                        <span className="text-xs font-medium whitespace-nowrap">
                          {item.name}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Dependency arrows SVG overlay */}
              <svg
                className="absolute top-0 left-0 z-15"
                style={{ width: `${timelineWidth}px`, height: '100%' }}
              >
                {/* Render all dependency arrows using global item maps */}
                {allItems.flatMap((item) => {
                  if (!item.dependencies || item.dependencies.length === 0) return [];
                  
                  // Get target item's row index
                  const targetRowIdx = itemRowIndexMap.get(item.id);
                  if (targetRowIdx === undefined) return []; // Item not visible
                  
                  const targetY = targetRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const targetChildItems = childItemsByParent[item.id] || [];
                  const targetEffective = item.parentId === null && targetChildItems.length > 0 
                    ? getEffectiveDates(item) 
                    : null;
                  let targetStart = targetEffective 
                    ? getPosition(targetEffective.startDate)
                    : getPosition(new Date(item.startDate));
                  
                  const dragDelta = dragging?.type === 'move' ? (dragging.currentDeltaX || 0) : 0;
                  if (dragging?.type === 'move' && (item.id === dragging.id || draggingCascadeIds.has(item.id))) {
                    targetStart += dragDelta;
                  }
                  
                  return item.dependencies.map((dep: any) => {
                    // Find the predecessor item from GLOBAL map
                    const predItem = globalItemMap.get(dep.id);
                    if (!predItem) return null;
                    
                    // Get predecessor's row index
                    const predRowIdx = itemRowIndexMap.get(predItem.id);
                    if (predRowIdx === undefined) return null; // Predecessor not visible
                    
                    const predY = predRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                    
                    const predChildItems = childItemsByParent[predItem.id] || [];
                    const predEffective = predItem.parentId === null && predChildItems.length > 0
                      ? getEffectiveDates(predItem)
                      : null;
                    let predStart = predEffective
                      ? getPosition(predEffective.startDate)
                      : getPosition(new Date(predItem.startDate));
                    
                    if (dragging?.type === 'move' && (predItem.id === dragging.id || draggingCascadeIds.has(predItem.id))) {
                      predStart += dragDelta;
                    }
                    
                    // Calculate end position: position of start date + bar width
                    const predDuration = predEffective
                      ? differenceInDays(predEffective.endDate, predEffective.startDate) + 1
                      : differenceInDays(new Date(predItem.endDate), new Date(predItem.startDate)) + 1;
                    const predEnd = predStart + predDuration * pixelsPerDay;
                    
                    // Get target end position for FF and SF dependencies
                    const targetDuration = targetEffective
                      ? differenceInDays(targetEffective.endDate, targetEffective.startDate) + 1
                      : differenceInDays(new Date(item.endDate), new Date(item.startDate)) + 1;
                    const targetEnd = targetStart + targetDuration * pixelsPerDay;
                    
                    // Determine start/end positions based on dependency type
                    // FS = Finish-to-Start, SS = Start-to-Start, FF = Finish-to-Finish, SF = Start-to-Finish
                    const depType = dep.type || 'FS';
                    let startX: number, endX: number;
                    if (depType === 'FS') {
                      startX = predEnd;
                      endX = targetStart;
                    } else if (depType === 'SS') {
                      startX = predStart;
                      endX = targetStart;
                    } else if (depType === 'FF') {
                      startX = predEnd;
                      endX = targetEnd;
                    } else if (depType === 'SF') {
                      startX = predStart;
                      endX = targetEnd;
                    } else {
                      startX = predEnd;
                      endX = targetStart;
                    }
                    const startY = predY;
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
                    
                    const depKey = `${item.id}-${dep.id}`;
                    const isHovered = hoveredDependency === depKey;
                    const isSelected = selectedDependency?.itemId === item.id && selectedDependency?.predecessorId === dep.id;
                    
                    return (
                      <g key={depKey}>
                        {/* Invisible hitbox for click/hover - thicker for easier clicking */}
                        <path
                          d={path}
                          stroke="transparent"
                          strokeWidth="12"
                          fill="none"
                          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredDependency(depKey)}
                          onMouseLeave={() => setHoveredDependency(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDependency({
                              itemId: item.id,
                              itemName: item.name,
                              predecessorId: dep.id,
                              predecessorName: predItem.name,
                              type: dep.type || 'FS',
                              lag: dep.lag || 0,
                            });
                          }}
                          data-testid={`dependency-line-${depKey}`}
                        />
                        {/* Visible dependency line */}
                        <path
                          d={path}
                          stroke={isHovered || isSelected ? '#7c5fb3' : '#9b7fc7'}
                          strokeWidth={isHovered || isSelected ? 2.5 : 1.5}
                          fill="none"
                          strokeLinecap="round"
                          markerEnd="url(#arrow-elegant)"
                          style={{ pointerEvents: 'none', transition: 'stroke-width 0.15s, stroke 0.15s' }}
                        />
                        {dep.lag != null && dep.lag > 0 && (() => {
                          const lagText = `+${dep.lag}`;
                          const labelW = Math.max(20, lagText.length * 7 + 6);
                          return (
                            <g>
                              <rect
                                x={(startX + endX) / 2 - labelW / 2}
                                y={(startY + endY) / 2 - 8}
                                width={labelW}
                                height={16}
                                rx={3}
                                fill="hsl(var(--background))"
                                stroke={isHovered || isSelected ? '#7c5fb3' : '#9b7fc7'}
                                strokeWidth={0.5}
                                style={{ pointerEvents: 'none' }}
                              />
                              <text
                                x={(startX + endX) / 2}
                                y={(startY + endY) / 2 + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={isHovered || isSelected ? '#7c5fb3' : '#9b7fc7'}
                                fontSize={9}
                                fontWeight={500}
                                style={{ pointerEvents: 'none' }}
                              >
                                {lagText}
                              </text>
                            </g>
                          );
                        })()}
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
                {dragging?.type === 'dependency' && dragging.currentX && dragging.currentY && timelineRef.current && (() => {
                  // Calculate the actual anchor position for the source item
                  const sourceItem = globalItemMap.get(dragging.id);
                  if (!sourceItem) return null;
                  
                  const sourceRowIdx = itemRowIndexMap.get(sourceItem.id);
                  if (sourceRowIdx === undefined) return null;
                  
                  const sourceY = sourceRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const sourceChildItems = childItemsByParent[sourceItem.id] || [];
                  const sourceEffective = sourceItem.parentId === null && sourceChildItems.length > 0
                    ? getEffectiveDates(sourceItem)
                    : null;
                  const sourceStart = sourceEffective
                    ? getPosition(sourceEffective.startDate)
                    : getPosition(new Date(sourceItem.startDate));
                  // Calculate end position: position of start date + bar width
                  const sourceDuration = sourceEffective
                    ? differenceInDays(sourceEffective.endDate, sourceEffective.startDate) + 1
                    : differenceInDays(new Date(sourceItem.endDate), new Date(sourceItem.startDate)) + 1;
                  const sourceEnd = sourceStart + sourceDuration * pixelsPerDay;
                  
                  // Determine start position based on sourceAnchor (already in timeline-relative coords)
                  const startX = dragging.sourceAnchor === 'start' ? sourceStart : sourceEnd;
                  const startY = sourceY;
                  
                  // Convert viewport cursor coordinates to timeline-relative using LIVE scroll offset
                  // This ensures the line updates correctly even when the user scrolls manually
                  const rect = timelineRef.current!.getBoundingClientRect();
                  const scrollLeft = timelineRef.current!.scrollLeft;
                  const scrollTop = timelineRef.current!.scrollTop;
                  const cursorX = dragging.currentX - rect.left + scrollLeft;
                  const cursorY = dragging.currentY - rect.top + scrollTop - 60;
                  
                  return (
                    <path
                      d={`M ${startX} ${startY} Q ${(startX + cursorX) / 2 + 20} ${(startY + cursorY) / 2}, ${cursorX} ${cursorY}`}
                      stroke="#9b7fc7"
                      strokeWidth="1.5"
                      strokeDasharray="4,3"
                      strokeLinecap="round"
                      fill="none"
                      markerEnd="url(#arrow-drag)"
                    />
                  );
                })()}
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

      {/* Dependency Edit Modal */}
      <Dialog open={!!selectedDependency} onOpenChange={() => setSelectedDependency(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-dependency-edit">
          <DialogHeader>
            <DialogTitle>Edit Dependency</DialogTitle>
            <DialogDescription>
              Modify or remove this dependency relationship.
            </DialogDescription>
          </DialogHeader>
          {selectedDependency && (
            <div className="space-y-4 mt-2">
              {/* Dependency Info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Predecessor:</span>
                  <span className="font-medium">{selectedDependency.predecessorName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Successor:</span>
                  <span className="font-medium">{selectedDependency.itemName}</span>
                </div>
              </div>

              {/* Dependency Type */}
              <div>
                <Label className="text-sm font-medium">Dependency Type</Label>
                <Select 
                  value={selectedDependency.type} 
                  onValueChange={(value) => setSelectedDependency({ ...selectedDependency, type: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="select-dependency-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FS">Finish-to-Start (FS)</SelectItem>
                    <SelectItem value="SS">Start-to-Start (SS)</SelectItem>
                    <SelectItem value="FF">Finish-to-Finish (FF)</SelectItem>
                    <SelectItem value="SF">Start-to-Finish (SF)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedDependency.type === 'FS' && 'Successor starts after predecessor finishes'}
                  {selectedDependency.type === 'SS' && 'Both tasks start at the same time'}
                  {selectedDependency.type === 'FF' && 'Both tasks finish at the same time'}
                  {selectedDependency.type === 'SF' && 'Predecessor starts after successor finishes'}
                </p>
              </div>

              {/* Lag Days */}
              <div>
                <Label className="text-sm font-medium">Lag Days</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    value={selectedDependency.lag ?? ""}
                    onChange={(e) => setSelectedDependency({ ...selectedDependency, lag: e.target.value === "" ? "" as any : parseInt(e.target.value) })}
                    onBlur={(e) => setSelectedDependency({ ...selectedDependency, lag: parseInt(e.target.value) || 0 })}
                    className="w-24"
                    data-testid="input-dependency-lag"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Positive = delay after predecessor, Negative = overlap with predecessor
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteDependencyMutation.mutate({
                      itemId: selectedDependency.itemId,
                      predecessorId: selectedDependency.predecessorId,
                    });
                  }}
                  disabled={deleteDependencyMutation.isPending}
                  data-testid="button-delete-dependency"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDependency(null)}
                    data-testid="button-cancel-dependency"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      updateDependencyMutation.mutate({
                        itemId: selectedDependency.itemId,
                        predecessorId: selectedDependency.predecessorId,
                        type: selectedDependency.type,
                        lag: selectedDependency.lag,
                      });
                    }}
                    disabled={updateDependencyMutation.isPending}
                    data-testid="button-save-dependency"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Right-click context menu for Gantt bars */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] rounded-md border-2 bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close on click outside */}
          <div
            className="fixed inset-0 z-[-1]"
            onClick={() => setContextMenu(null)}
          />
          
          {schedule?.status !== 'locked' && (
            <button
              className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
              onClick={() => {
                if (onEditItem) {
                  onEditItem(contextMenu.item);
                } else {
                  setEditingItemContext(contextMenu.item);
                  setShowItemDialog(true);
                }
                setContextMenu(null);
              }}
              data-testid="context-menu-edit"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Task
            </button>
          )}
          
          <button
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
            onClick={() => {
              setSelectedTask(contextMenu.item);
              setContextMenu(null);
            }}
            data-testid="context-menu-view"
          >
            <Eye className="w-4 h-4 mr-2" />
            View Details
          </button>
          
          {schedule?.status !== 'locked' && (
            <>
              <button
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
                onClick={() => {
                  duplicateItemMutation.mutate(contextMenu.item.id);
                  setContextMenu(null);
                }}
                data-testid="context-menu-duplicate"
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </button>
              
              {!contextMenu.item.parentItemId && (
                <button
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
                  onClick={() => {
                    handleAddChildItem(contextMenu.item);
                    setContextMenu(null);
                  }}
                  data-testid="context-menu-add-child"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Child Item
                </button>
              )}
              
              {contextMenu.item.parentItemId && (
                <button
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
                  onClick={async () => {
                    try {
                      await apiRequest(`/api/schedule-items/${contextMenu.item.id}`, "PATCH", { parentId: null });
                      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
                      toast({ title: "Item removed from parent" });
                    } catch (error) {
                      toast({ title: "Failed to remove parent", variant: "destructive" });
                    }
                    setContextMenu(null);
                  }}
                  data-testid="context-menu-remove-parent"
                >
                  <ArrowUpLeft className="w-4 h-4 mr-2" />
                  Remove Parent
                </button>
              )}
              
              <button
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
                onClick={() => {
                  handleCreatePredecessor(contextMenu.item);
                  setContextMenu(null);
                }}
                data-testid="context-menu-create-predecessor"
              >
                <Link className="w-4 h-4 mr-2" />
                Create Predecessor
              </button>
              
              <div className="-mx-1 my-1 h-0.5 bg-border" />
              
              <button
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left"
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.item.name);
                  toast({ title: "Copied", description: "Task name copied to clipboard" });
                  setContextMenu(null);
                }}
                data-testid="context-menu-copy-name"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Name
              </button>
              
              {contextMenu.item.dependencies && contextMenu.item.dependencies.length > 0 && (
                <button
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left text-orange-600 dark:text-orange-400"
                  onClick={() => {
                    const deps = contextMenu.item.dependencies as Array<{ id: string }>;
                    deps.forEach((dep) => {
                      deleteDependencyMutation.mutate({
                        itemId: contextMenu.item.id,
                        predecessorId: dep.id,
                      });
                    });
                    setContextMenu(null);
                  }}
                  data-testid="context-menu-remove-dependencies"
                >
                  <Unlink className="w-4 h-4 mr-2" />
                  Remove All Dependencies
                </button>
              )}
              
              <div className="-mx-1 my-1 h-0.5 bg-border" />
              
              <button
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground w-full text-left text-destructive"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${contextMenu.item.name}"?`)) {
                    deleteItemMutation.mutate(contextMenu.item.id);
                  }
                  setContextMenu(null);
                }}
                data-testid="context-menu-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Task
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
