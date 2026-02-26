import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type ScheduleTemplate, type Project, type ScheduleItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft,
  Plus,
  GanttChart,
  List as ListIcon,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Save,
  Loader2,
  ChevronRight,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Upload,
  Download,
  Settings,
  Calendar as CalendarIcon,
  Search,
  Columns3,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./schedule-calendar.css";
import { CasvaScheduleList } from "@/components/schedule/CasvaScheduleList";

const localizer = momentLocalizer(moment);

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  duration: number;
  type: "task" | "milestone" | "inspection" | "delivery" | "meeting";
  assigneeName?: string;
  category?: string;
  labels?: string[];
  sortOrder: number;
  relativeStartDay?: number;
  parentItemId?: string | null;
  color?: string;
}

const ITEM_TYPES = [
  { value: "task", label: "Task" },
  { value: "milestone", label: "Milestone" },
  { value: "inspection", label: "Inspection" },
  { value: "delivery", label: "Delivery" },
  { value: "meeting", label: "Meeting" },
];

const TYPE_COLORS: Record<string, string> = {
  task: "#bba7db",
  milestone: "#9b87c7",
  inspection: "#c9b8e8",
  delivery: "#a494cc",
  meeting: "#d4c7f0",
};

function SortableItem({
  item,
  onEdit,
  onDelete,
  onDuplicate,
  onBarChange,
  onToggleCollapse,
  onAddChild,
  totalDuration,
  dayWidth,
  isParent,
  isCollapsed,
  hasChildren,
  depth,
  effectiveStartDay,
  effectiveDuration,
}: {
  item: TemplateItem;
  onEdit: (item: TemplateItem) => void;
  onDelete: (id: string) => void;
  onDuplicate: (item: TemplateItem) => void;
  onBarChange: (id: string, newStartDay: number, newDuration: number) => void;
  onToggleCollapse?: (id: string) => void;
  onAddChild?: (item: TemplateItem) => void;
  totalDuration: number;
  dayWidth: number;
  isParent?: boolean;
  isCollapsed?: boolean;
  hasChildren?: boolean;
  depth: 0 | 1 | 2;
  effectiveStartDay?: number;
  effectiveDuration?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [originalStartDay, setOriginalStartDay] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [currentStartDay, setCurrentStartDay] = useState(item.relativeStartDay || 0);
  const [currentDuration, setCurrentDuration] = useState(item.duration);

  useEffect(() => {
    setCurrentStartDay(item.relativeStartDay || 0);
    setCurrentDuration(item.duration);
  }, [item.relativeStartDay, item.duration]);

  const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'resize-left' | 'resize-right') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    setDragStartX(e.clientX);
    setOriginalStartDay(item.relativeStartDay || 0);
    setOriginalDuration(item.duration);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !dragType) return;
    const deltaX = e.clientX - dragStartX;
    const daysDelta = Math.round(deltaX / dayWidth);
    if (dragType === 'move') {
      const newStartDay = Math.max(0, Math.min(totalDuration - originalDuration, originalStartDay + daysDelta));
      setCurrentStartDay(newStartDay);
    } else if (dragType === 'resize-left') {
      const newStartDay = Math.max(0, Math.min(originalStartDay + originalDuration - 1, originalStartDay + daysDelta));
      const newDuration = Math.max(1, originalDuration - daysDelta);
      if (newStartDay + newDuration <= totalDuration) {
        setCurrentStartDay(newStartDay);
        setCurrentDuration(newDuration);
      }
    } else if (dragType === 'resize-right') {
      const newDuration = Math.max(1, Math.min(totalDuration - originalStartDay, originalDuration + daysDelta));
      setCurrentDuration(newDuration);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (currentStartDay !== (item.relativeStartDay || 0) || currentDuration !== item.duration) {
      onBarChange(item.id, currentStartDay, currentDuration);
    }
    setIsDragging(false);
    setDragType(null);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const displayStartDay = effectiveStartDay ?? currentStartDay;
  const displayDuration = effectiveDuration ?? currentDuration;
  const barLeft = displayStartDay * dayWidth;
  const barWidth = Math.max(displayDuration * dayWidth, 20);
  const barColor = item.color || TYPE_COLORS[item.type] || TYPE_COLORS.task;

  const indentClass = depth === 1 ? 'pl-6' : depth === 2 ? 'pl-12' : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center border-b border-border hover:bg-accent/30 group h-10"
    >
      <div
        className="w-8 flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
        {...attributes}
        {...listeners}
      >
        <div className="w-1 h-4 bg-muted-foreground/30 rounded" />
      </div>

      <div className={`w-64 px-2 py-2 flex items-center gap-2 border-r border-border shrink-0 ${indentClass}`}>
        {isParent && hasChildren && onToggleCollapse && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(item.id); }}
            className="p-0.5 hover:bg-accent rounded flex-shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
        {isParent && !hasChildren && <div className="w-5 flex-shrink-0" />}
        {depth === 2 && <div className="w-5 flex-shrink-0" />}
        <Badge
          variant="outline"
          className="text-white border-0 h-4 px-1.5 text-[10px] shrink-0"
          style={{ backgroundColor: barColor }}
        >
          {item.type}
        </Badge>
        <span
          className={`text-sm truncate flex-1 ${depth === 0 ? 'font-medium' : 'text-muted-foreground'}`}
          title={item.name}
        >
          {item.name}
        </span>
        {depth < 2 && onAddChild && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddChild(item); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-accent rounded flex-shrink-0"
            title={depth === 0 ? "Add Item" : "Add Sub-item"}
          >
            <Plus className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="w-16 px-2 text-center text-xs text-muted-foreground border-r border-border shrink-0">
        {displayDuration} {displayDuration === 1 ? 'day' : 'days'}
      </div>

      <div className="w-20 px-2 text-center text-xs text-muted-foreground border-r border-border shrink-0">
        Day {displayStartDay}
      </div>

      <div
        className="flex-1 relative h-10 overflow-hidden"
        style={{ minWidth: `${totalDuration * dayWidth}px` }}
      >
        {Array.from({ length: totalDuration }).map((_, i) => {
          const dayOfWeek = i % 7;
          if (dayOfWeek === 5 || dayOfWeek === 6) {
            return (
              <div
                key={`weekend-${i}`}
                className="absolute top-0 bottom-0 bg-[#f3f4f6] dark:bg-muted/50"
                style={{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }}
              />
            );
          }
          return null;
        })}
        <div className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20" style={{ left: '0px' }} />
        <div
          className={`absolute top-1 h-6 mx-1 rounded-sm flex items-center z-10 group/bar ${isDragging ? 'cursor-grabbing shadow-lg scale-105' : 'cursor-move hover:scale-105 hover:shadow-md'} transition-all`}
          style={{
            left: `${barLeft}px`,
            width: `${barWidth}px`,
            backgroundColor: barColor,
            opacity: depth === 0 && hasChildren ? 0.6 : 1,
          }}
          onPointerDown={(e) => !hasChildren && handlePointerDown(e, 'move')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {!hasChildren && (
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
              onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'resize-left'); }}
            />
          )}
          {barWidth > 60 && (
            <span className="text-white text-[10px] px-2 truncate pointer-events-none">
              {item.name}
            </span>
          )}
          {!hasChildren && (
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
              onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'resize-right'); }}
            />
          )}
        </div>
      </div>

      <div className="w-16 flex items-center justify-center gap-0.5 shrink-0 border-l border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Edit3 className="h-3 w-3 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(item)}>
              <Copy className="h-3 w-3 mr-2" />
              Duplicate
            </DropdownMenuItem>
            {depth < 2 && onAddChild && (
              <DropdownMenuItem onClick={() => onAddChild(item)}>
                <Plus className="h-3 w-3 mr-2" />
                {depth === 0 ? "Add Item" : "Add Sub-item"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(item.id)}>
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}


export default function ScheduleTemplateDetail() {
  const { templateId } = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [activeView, setActiveView] = useState<"gantt" | "list" | "calendar">("gantt");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [applyStartDate, setApplyStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"item" | "group">("item");
  const [searchQuery, setSearchQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [filters, setFilters] = useState({ status: "all", assignee: "all", type: "all" });
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('template-schedule-visible-columns');
    return saved ? JSON.parse(saved) : {
      item: true, assignee: true, type: true, dueDate: true, status: false, completion: false,
    };
  });
  const [referenceDate, setReferenceDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const [templateFormData, setTemplateFormData] = useState({
    name: "",
    description: "",
    category: "",
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    duration: 1,
    type: "task" as TemplateItem["type"],
    assigneeName: "",
    relativeStartDay: 0,
    parentItemId: null as string | null,
  });

  useEffect(() => {
    localStorage.setItem('template-schedule-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev: Record<string, boolean>) => ({ ...prev, [key]: !prev[key] }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case "day": return 30;
      case "week": return 15;
      case "month": return 5;
      default: return 30;
    }
  }, [zoomLevel]);

  const { topLevelItems, childItemsByParent, subItemsByParent, itemDepthMap } = useMemo(() => {
    const top: TemplateItem[] = [];
    const children: Record<string, TemplateItem[]> = {};
    const subs: Record<string, TemplateItem[]> = {};
    const depthMap: Record<string, 0 | 1 | 2> = {};

    const topSet = new Set(items.filter(i => !i.parentItemId).map(i => i.id));
    const childSet = new Set(items.filter(i => i.parentItemId && topSet.has(i.parentItemId)).map(i => i.id));

    items.forEach(item => {
      if (!item.parentItemId) {
        top.push(item);
        depthMap[item.id] = 0;
      } else if (topSet.has(item.parentItemId)) {
        if (!children[item.parentItemId]) children[item.parentItemId] = [];
        children[item.parentItemId].push(item);
        depthMap[item.id] = 1;
      } else {
        if (!subs[item.parentItemId]) subs[item.parentItemId] = [];
        subs[item.parentItemId].push(item);
        depthMap[item.id] = 2;
      }
    });

    top.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    Object.keys(children).forEach(k => children[k].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    Object.keys(subs).forEach(k => subs[k].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));

    return { topLevelItems: top, childItemsByParent: children, subItemsByParent: subs, itemDepthMap: depthMap };
  }, [items]);

  const getAllDescendantDays = useCallback((itemId: string): number[] => {
    const directChildren = childItemsByParent[itemId] || [];
    const subItems = subItemsByParent[itemId] || [];
    const result: number[] = [];
    [...directChildren, ...subItems].forEach(child => {
      result.push(child.relativeStartDay || 0, (child.relativeStartDay || 0) + child.duration);
      result.push(...getAllDescendantDays(child.id));
    });
    return result;
  }, [childItemsByParent, subItemsByParent]);

  const getEffectiveDates = useCallback((item: TemplateItem) => {
    const descendantDays = getAllDescendantDays(item.id);
    if (descendantDays.length === 0) {
      return {
        startDay: item.relativeStartDay || 0,
        endDay: (item.relativeStartDay || 0) + item.duration,
      };
    }
    return {
      startDay: Math.min(...descendantDays),
      endDay: Math.max(...descendantDays),
    };
  }, [getAllDescendantDays]);

  const toggleCollapse = (id: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data: template, isLoading } = useQuery<ScheduleTemplate>({
    queryKey: ["/api/schedule-templates", templateId],
    enabled: !!templateId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  useEffect(() => {
    if (template?.templateData) {
      const templateItems = (template.templateData as TemplateItem[]).map((item, index) => ({
        ...item,
        id: item.id || `item-${index}`,
        sortOrder: item.sortOrder ?? index,
        relativeStartDay: item.relativeStartDay ?? 0,
      }));
      setItems(templateItems);
    }
    if (template) {
      setTemplateFormData({
        name: template.name,
        description: template.description || "",
        category: template.category || "",
      });
    }
  }, [template]);

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: { templateData: TemplateItem[] }) => {
      return await apiRequest(`/api/schedule-templates/${templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates", templateId] });
      setHasUnsavedChanges(false);
      toast({ title: "Template saved", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    },
  });

  const updateTemplateMetaMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category?: string }) => {
      return await apiRequest(`/api/schedule-templates/${templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates", templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      setShowSettingsDialog(false);
      toast({ title: "Template updated", description: "Template settings have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template settings.", variant: "destructive" });
    },
  });

  const handleSaveTemplateSettings = () => {
    if (!templateFormData.name.trim()) {
      toast({ title: "Validation error", description: "Template name is required.", variant: "destructive" });
      return;
    }
    updateTemplateMetaMutation.mutate({
      name: templateFormData.name.trim(),
      description: templateFormData.description.trim() || undefined,
      category: templateFormData.category || undefined,
    });
  };

  const applyTemplateMutation = useMutation({
    mutationFn: async ({ projectId, startDate }: { projectId: string; startDate: string }) => {
      const scheduleResponse = await fetch(`/api/projects/${projectId}/schedule`, { credentials: "include" });
      const schedule = await scheduleResponse.json();
      if (!schedule?.id) {
        const createResponse = await apiRequest("/api/schedules", "POST", { projectId });
        return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", { scheduleId: createResponse.id, startDate });
      }
      return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", { scheduleId: schedule.id, startDate });
    },
    onSuccess: (_, variables) => {
      setShowApplyDialog(false);
      toast({ title: "Template applied", description: "The template has been applied to the project schedule." });
      navigate(`/projects/${variables.projectId}/schedule`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to apply template to project.", variant: "destructive" });
    },
  });

  const totalDuration = useMemo(() => {
    if (items.length === 0) return 30;
    const maxEndDay = Math.max(...items.map(item => (item.relativeStartDay || 0) + item.duration));
    return Math.max(maxEndDay + 5, 30);
  }, [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;
    const draggedDepth = itemDepthMap[draggedId] ?? 0;

    if (draggedDepth === 0) {
      const draggedItem = topLevelItems.find(i => i.id === draggedId);
      const targetItem = topLevelItems.find(i => i.id === targetId);
      if (!draggedItem || !targetItem) return;

      const draggedGroupIds = new Set([draggedId, ...(childItemsByParent[draggedId] || []).map(c => c.id), ...(childItemsByParent[draggedId] || []).flatMap(c => (subItemsByParent[c.id] || []).map(s => s.id))]);
      const otherItems = items.filter(i => !draggedGroupIds.has(i.id));
      const targetIndex = otherItems.findIndex(i => i.id === targetId);
      const draggedBlock = [draggedItem, ...(childItemsByParent[draggedId] || []), ...(childItemsByParent[draggedId] || []).flatMap(c => subItemsByParent[c.id] || [])];
      const newItems = [...otherItems.slice(0, targetIndex), ...draggedBlock, ...otherItems.slice(targetIndex)];
      setItems(newItems.map((item, idx) => ({ ...item, sortOrder: idx })));
    } else {
      const oldIndex = items.findIndex(i => i.id === draggedId);
      const newIndex = items.findIndex(i => i.id === targetId);
      const newItems = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sortOrder: idx }));
      setItems(newItems);
    }
    setHasUnsavedChanges(true);
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setDialogMode("item");
    setFormData({ name: "", description: "", duration: 1, type: "task", assigneeName: "", relativeStartDay: 0, parentItemId: null });
    setShowItemDialog(true);
  };

  const handleAddGroup = () => {
    setEditingItem(null);
    setFormData({ name: "", description: "", duration: 5, type: "task", assigneeName: "", relativeStartDay: 0, parentItemId: null });
    setDialogMode("group");
    setShowItemDialog(true);
  };

  const handleAddChild = (parentItem: TemplateItem) => {
    setEditingItem(null);
    setFormData({ name: "", description: "", duration: 1, type: "task", assigneeName: "", relativeStartDay: parentItem.relativeStartDay || 0, parentItemId: parentItem.id });
    setDialogMode("item");
    setShowItemDialog(true);
  };

  const handleEditItem = (item: TemplateItem) => {
    setEditingItem(item);
    setDialogMode("item");
    setFormData({ name: item.name, description: item.description || "", duration: item.duration, type: item.type, assigneeName: item.assigneeName || "", relativeStartDay: item.relativeStartDay || 0, parentItemId: item.parentItemId || null });
    setShowItemDialog(true);
  };

  const handleSaveItem = () => {
    if (!formData.name.trim()) {
      toast({ title: "Validation error", description: "Item name is required.", variant: "destructive" });
      return;
    }
    if (editingItem) {
      setItems(items.map(item => item.id === editingItem.id ? { ...item, ...formData } : item));
    } else {
      const newItem: TemplateItem = {
        id: `item-${Date.now()}`,
        ...formData,
        sortOrder: items.length,
      };
      setItems([...items, newItem]);
    }
    setHasUnsavedChanges(true);
    setShowItemDialog(false);
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(item => item.id !== id && item.parentItemId !== id));
    setHasUnsavedChanges(true);
    setShowDeleteConfirm(null);
  };

  const handleBarChange = (id: string, newStartDay: number, newDuration: number) => {
    setItems(items.map(item => item.id === id ? { ...item, relativeStartDay: newStartDay, duration: newDuration } : item));
    setHasUnsavedChanges(true);
  };

  const handleDuplicateItem = (item: TemplateItem) => {
    const newItem: TemplateItem = { ...item, id: `item-${Date.now()}`, name: `${item.name} (Copy)`, sortOrder: items.length };
    setItems([...items, newItem]);
    setHasUnsavedChanges(true);
  };

  const handleSaveTemplate = () => {
    updateTemplateMutation.mutate({ templateData: items });
  };

  const handleExportTemplate = () => {
    if (!template) return;
    const exportData = {
      name: template.name,
      description: template.description,
      category: template.category,
      templateData: items.map(item => ({
        name: item.name, description: item.description, duration: item.duration, type: item.type,
        assigneeName: item.assigneeName, category: item.category, relativeStartDay: item.relativeStartDay,
        parentItemId: item.parentItemId, sortOrder: item.sortOrder, color: item.color,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name.replace(/[^a-z0-9]/gi, "_")}_template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Template exported", description: "The template has been downloaded as a JSON file." });
  };

  const refDate = useMemo(() => new Date(referenceDate + "T00:00:00"), [referenceDate]);

  const listItems = useMemo((): ScheduleItem[] => {
    const filtered = searchQuery
      ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items;
    const typeFiltered = filters.type !== "all" ? filtered.filter(i => i.type === filters.type) : filtered;

    return typeFiltered.map(item => {
      const startDay = item.relativeStartDay || 0;
      const startDate = addDays(refDate, startDay);
      const endDate = addDays(refDate, startDay + item.duration - 1);
      return {
        id: item.id,
        name: item.name,
        description: item.description || null,
        notes: null,
        type: item.type,
        status: "not_started",
        priority: "medium",
        startDate: startDate,
        endDate: endDate,
        duration: item.duration,
        progressPercent: 0,
        sortOrder: item.sortOrder,
        parentItemId: item.parentItemId || null,
        scheduleId: "",
        assignedToId: null,
        projectId: null,
        useWorkingDaysOverride: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ScheduleItem;
    });
  }, [items, refDate, searchQuery, filters.type]);

  const calendarEvents = useMemo(() => {
    return items.map(item => {
      const startDay = item.relativeStartDay || 0;
      const start = addDays(refDate, startDay);
      const end = addDays(refDate, startDay + item.duration);
      return {
        id: item.id,
        title: item.name,
        start,
        end,
        resource: item,
        allDay: true,
      };
    });
  }, [items, refDate]);

  const eventStyleGetter = (event: any) => {
    const item = event.resource as TemplateItem;
    const color = item.color || TYPE_COLORS[item.type] || TYPE_COLORS.task;
    return {
      style: {
        backgroundColor: color,
        borderRadius: '4px',
        border: 'none',
        color: 'white',
        fontSize: '11px',
      },
    };
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Row 1 - Template Controls */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/templates")}
            className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate active-elevate-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold truncate" data-testid="text-template-name">
            {template.name}
          </h2>
          {template.category && (
            <Badge variant="outline" className="text-xs">{template.category}</Badge>
          )}
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Unsaved
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={handleExportTemplate}
            data-testid="button-export-template"
          >
            <Download className="w-3 h-3 inline mr-0.5" />
            Export
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={() => setShowApplyDialog(true)}
            data-testid="button-apply-template"
          >
            <Upload className="w-3 h-3 inline mr-0.5" />
            Apply to Project
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-primary-foreground border-primary/20 active-elevate-2 disabled:opacity-50"
            onClick={handleSaveTemplate}
            disabled={!hasUnsavedChanges || updateTemplateMutation.isPending}
            data-testid="button-save-template"
          >
            {updateTemplateMutation.isPending ? (
              <Loader2 className="w-3 h-3 inline mr-0.5 animate-spin" />
            ) : (
              <Save className="w-3 h-3 inline mr-0.5" />
            )}
            Save
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowSettingsDialog(true)}
            data-testid="button-template-settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Row 2 - Views & Controls (identical to project Schedule) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          {/* View Toggle */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setActiveView('gantt')}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'gantt' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
              data-testid="button-view-gantt"
            >
              <GanttChart className="w-3 h-3 inline mr-0.5" />
              Gantt
            </button>
            <button
              onClick={() => setActiveView('calendar')}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'calendar' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
              data-testid="button-view-calendar"
            >
              <CalendarIcon className="w-3 h-3 inline mr-0.5" />
              Calendar
            </button>
            <button
              onClick={() => setActiveView('list')}
              className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'list' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
              data-testid="button-view-list"
            >
              <ListIcon className="w-3 h-3 inline mr-0.5" />
              List
            </button>
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Add buttons */}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={handleAddGroup}
            data-testid="button-add-group"
          >
            <Plus className="w-3 h-3 inline mr-0.5" />
            Add Group
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={handleAddItem}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3 inline mr-0.5" />
            Add Item
          </button>

          {/* Search + collapse for list/calendar views */}
          {activeView !== 'gantt' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setAllCollapsed(prev => !prev)}
              title={allCollapsed ? "Expand all" : "Collapse all"}
            >
              {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
            </Button>
          )}
          {activeView !== 'gantt' && (
            <div className="relative w-40">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-0 h-6 text-xs border rounded-md"
                data-testid="input-search-items"
              />
            </div>
          )}

          {/* Type filter pill */}
          <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
            <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${filters.type !== 'all' ? 'bg-primary/10 border-primary/30' : 'border-border'} [&>svg]:hidden`}>
              <span>{filters.type !== 'all' ? filters.type.charAt(0).toUpperCase() + filters.type.slice(1) : 'Type'}</span>
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
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          {activeView === 'calendar' && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  const d = new Date(calendarDate);
                  calendarView === 'month' ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - (calendarView === 'week' ? 7 : 1));
                  setCalendarDate(d);
                }}
                className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
              >
                <ChevronRight className="w-3 h-3 rotate-180" />
              </button>
              <button onClick={() => setCalendarDate(new Date())} className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2">
                Today
              </button>
              <button
                onClick={() => {
                  const d = new Date(calendarDate);
                  calendarView === 'month' ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + (calendarView === 'week' ? 7 : 1));
                  setCalendarDate(d);
                }}
                className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              {(['month', 'week', 'day', 'agenda'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md ${calendarView === v ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Reference date for converting relative days to calendar dates */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Start:</span>
            <Input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="h-6 text-xs border rounded-md w-32 px-1"
            />
          </div>

          {/* Columns icon for list */}
          {activeView === 'list' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2" data-testid="button-column-config">
                  <Columns3 className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1 border-2">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-medium px-2 py-1">Visible Columns</DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />
                {[
                  { key: 'item', label: 'Item' },
                  { key: 'assignee', label: 'Assignee' },
                  { key: 'type', label: 'Type' },
                  { key: 'dueDate', label: 'Due Date & Duration' },
                ].map(({ key, label }) => (
                  <DropdownMenuItem key={key} onClick={() => toggleColumn(key)} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    <Checkbox checked={visibleColumns[key]} className="pointer-events-none h-3.5 w-3.5" />
                    <span>{label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Zoom for Gantt */}
          {activeView === 'gantt' && (
            <div className="flex items-center gap-0.5">
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center disabled:opacity-50"
                onClick={() => setZoomLevel(prev => prev === "day" ? "week" : prev === "week" ? "month" : "month")}
                disabled={zoomLevel === "month"}
                data-testid="button-zoom-out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-xs px-1 min-w-12 text-center capitalize">{zoomLevel}</span>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center disabled:opacity-50"
                onClick={() => setZoomLevel(prev => prev === "month" ? "week" : prev === "week" ? "day" : "day")}
                disabled={zoomLevel === "day"}
                data-testid="button-zoom-in"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          )}

          <Badge variant="secondary" className="text-xs no-default-hover-elevate">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 opacity-50" />
            <p className="text-sm">No items in this template yet</p>
            <Button variant="outline" size="sm" onClick={handleAddItem} data-testid="button-add-first-item">
              <Plus className="h-4 w-4 mr-2" />
              Add First Item
            </Button>
          </div>
        ) : activeView === "list" ? (
          <div className="h-full">
            <CasvaScheduleList
              items={listItems}
              onEditItem={(item) => {
                const templateItem = items.find(i => i.id === item.id);
                if (templateItem) handleEditItem(templateItem);
              }}
              onDuplicateItem={(item) => {
                const templateItem = items.find(i => i.id === item.id);
                if (templateItem) handleDuplicateItem(templateItem);
              }}
              onDeleteItem={(itemId) => setShowDeleteConfirm(itemId)}
              onAddSubItem={(parentItem) => {
                const templateItem = items.find(i => i.id === parentItem.id);
                if (templateItem) handleAddChild(templateItem);
              }}
              onReorderItem={(itemId, afterItemId, newParentId) => {
                const reorderedItem = items.find(i => i.id === itemId);
                if (!reorderedItem) return;
                const filtered = items.filter(i => i.id !== itemId);
                const insertIdx = afterItemId ? filtered.findIndex(i => i.id === afterItemId) + 1 : 0;
                const updated = [...filtered.slice(0, insertIdx), { ...reorderedItem, parentItemId: newParentId }, ...filtered.slice(insertIdx)];
                setItems(updated.map((item, idx) => ({ ...item, sortOrder: idx })));
                setHasUnsavedChanges(true);
              }}
              visibleColumns={visibleColumns}
              allCollapsed={allCollapsed}
              locked={false}
              maxHeight="calc(100vh - 130px)"
            />
          </div>
        ) : activeView === "calendar" ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-center py-1.5">
              <span className="text-sm font-medium">
                {calendarDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div className="flex-1 p-1" style={{ minHeight: '600px' }}>
              <BigCalendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                eventPropGetter={eventStyleGetter}
                onSelectEvent={(event) => {
                  const templateItem = items.find(i => i.id === (event.resource as TemplateItem).id);
                  if (templateItem) handleEditItem(templateItem);
                }}
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                view={calendarView}
                onView={(v) => setCalendarView(v as "month" | "week" | "day" | "agenda")}
                date={calendarDate}
                onNavigate={(date) => setCalendarDate(date)}
                popup
                toolbar={false}
              />
            </div>
          </div>
        ) : (
          /* Gantt View */
          <div className="relative">
            {/* Header row */}
            <div className="flex items-center border-b border-border bg-muted/30 sticky top-0 z-30 h-8">
              <div className="w-8 shrink-0" />
              <div className="w-64 px-2 text-xs font-medium border-r border-border shrink-0 flex items-center h-full">Name</div>
              <div className="w-16 px-2 text-center text-xs font-medium border-r border-border shrink-0 flex items-center justify-center h-full">Duration</div>
              <div className="w-20 px-2 text-center text-xs font-medium border-r border-border shrink-0 flex items-center justify-center h-full">Start Day</div>
              <div className="flex-1 relative h-8 overflow-hidden" style={{ minWidth: `${totalDuration * dayWidth}px` }}>
                {Array.from({ length: Math.ceil(totalDuration / (zoomLevel === 'day' ? 1 : zoomLevel === 'week' ? 7 : 30)) }).map((_, i) => {
                  const day = i * (zoomLevel === 'day' ? 1 : zoomLevel === 'week' ? 7 : 30);
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-border/50 flex items-center"
                      style={{ left: `${day * dayWidth}px`, width: `${(zoomLevel === 'day' ? 1 : zoomLevel === 'week' ? 7 : 30) * dayWidth}px` }}
                    >
                      <span className="text-[10px] text-muted-foreground px-1">
                        {zoomLevel === 'day' ? `D${day}` : zoomLevel === 'week' ? `W${i + 1}` : `M${i + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="w-16 shrink-0" />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {topLevelItems.map((parentItem) => {
                  const isCollapsed = collapsedItems.has(parentItem.id);
                  const childItems = childItemsByParent[parentItem.id] || [];
                  const hasChildren = childItems.length > 0;
                  const effective = hasChildren ? getEffectiveDates(parentItem) : undefined;

                  return (
                    <div key={parentItem.id}>
                      <SortableItem
                        item={parentItem}
                        onEdit={handleEditItem}
                        onDelete={(id) => setShowDeleteConfirm(id)}
                        onDuplicate={handleDuplicateItem}
                        onBarChange={handleBarChange}
                        onToggleCollapse={toggleCollapse}
                        onAddChild={handleAddChild}
                        totalDuration={totalDuration}
                        dayWidth={dayWidth}
                        isParent={true}
                        isCollapsed={isCollapsed}
                        hasChildren={hasChildren}
                        depth={0}
                        effectiveStartDay={effective?.startDay}
                        effectiveDuration={effective ? effective.endDay - effective.startDay : undefined}
                      />
                      {!isCollapsed && childItems.map((childItem) => {
                        const isChildCollapsed = collapsedItems.has(childItem.id);
                        const subItems = subItemsByParent[childItem.id] || [];
                        const childHasChildren = subItems.length > 0;
                        const childEffective = childHasChildren ? getEffectiveDates(childItem) : undefined;

                        return (
                          <div key={childItem.id}>
                            <SortableItem
                              item={childItem}
                              onEdit={handleEditItem}
                              onDelete={(id) => setShowDeleteConfirm(id)}
                              onDuplicate={handleDuplicateItem}
                              onBarChange={handleBarChange}
                              onToggleCollapse={toggleCollapse}
                              onAddChild={handleAddChild}
                              totalDuration={totalDuration}
                              dayWidth={dayWidth}
                              isParent={childHasChildren}
                              isCollapsed={isChildCollapsed}
                              hasChildren={childHasChildren}
                              depth={1}
                              effectiveStartDay={childEffective?.startDay}
                              effectiveDuration={childEffective ? childEffective.endDay - childEffective.startDay : undefined}
                            />
                            {!isChildCollapsed && subItems.map((subItem) => (
                              <SortableItem
                                key={subItem.id}
                                item={subItem}
                                onEdit={handleEditItem}
                                onDelete={(id) => setShowDeleteConfirm(id)}
                                onDuplicate={handleDuplicateItem}
                                onBarChange={handleBarChange}
                                onAddChild={handleAddChild}
                                totalDuration={totalDuration}
                                dayWidth={dayWidth}
                                isParent={false}
                                isCollapsed={false}
                                hasChildren={false}
                                depth={2}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* Add/Edit Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={(open) => { setShowItemDialog(open); if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-lg" data-testid="dialog-item">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Item" : dialogMode === "group" ? "Add Group / Phase" : "Add Schedule Item"}
            </DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the item details." : dialogMode === "group" ? "Create a top-level group or phase to organise items under." : "Add a new item to the schedule template."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={dialogMode === "group" ? "e.g., Framing Phase" : "e.g., Pour footings"}
                data-testid="input-item-name"
              />
            </div>

            <div className={`grid gap-4 ${dialogMode === "group" ? "grid-cols-1" : "grid-cols-2"}`}>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as TemplateItem["type"] })}>
                  <SelectTrigger data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {dialogMode !== "group" && (
                <div className="space-y-2">
                  <Label>Parent Group / Item</Label>
                  <Select
                    value={formData.parentItemId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, parentItemId: value === "none" ? null : value })}
                  >
                    <SelectTrigger data-testid="select-parent-item">
                      <SelectValue placeholder="No parent (top level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No parent (top level)</SelectItem>
                      {topLevelItems.filter(p => p.id !== editingItem?.id).map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          {parent.name}
                        </SelectItem>
                      ))}
                      {topLevelItems.filter(p => p.id !== editingItem?.id).flatMap(parent =>
                        (childItemsByParent[parent.id] || []).filter(c => c.id !== editingItem?.id).map(child => (
                          <SelectItem key={child.id} value={child.id}>
                            &nbsp;&nbsp;↳ {child.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 1 })}
                  data-testid="input-item-duration"
                />
              </div>
              <div className="space-y-2">
                <Label>Start Day</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.relativeStartDay ?? ""}
                  onChange={(e) => setFormData({ ...formData, relativeStartDay: e.target.value === "" ? 0 : parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  data-testid="input-item-start-day"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                data-testid="textarea-item-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Default Assignee</Label>
              <Input
                value={formData.assigneeName}
                onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
                placeholder="e.g., Concreter"
                data-testid="input-item-assignee"
              />
              <p className="text-xs text-muted-foreground">Role or trade name (matched when applying template)</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveItem} data-testid="button-save-item">
              {editingItem ? "Update" : "Add"} {dialogMode === "group" ? "Group" : "Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent data-testid="dialog-apply-template">
          <DialogHeader>
            <DialogTitle>Apply Template to Project</DialogTitle>
            <DialogDescription>Select a project and start date to apply this schedule template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project <span className="text-destructive">*</span></Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.filter(p => !p.isArchived).map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={applyStartDate} onChange={(e) => setApplyStartDate(e.target.value)} data-testid="input-start-date" />
              <p className="text-xs text-muted-foreground">All template items will be scheduled relative to this date.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
            <Button
              onClick={() => applyTemplateMutation.mutate({ projectId: selectedProjectId, startDate: applyStartDate })}
              disabled={!selectedProjectId || applyTemplateMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyTemplateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</> : "Apply Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this item? Child items will also be deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => showDeleteConfirm && handleDeleteItem(showDeleteConfirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent data-testid="dialog-template-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>Update the template name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={templateFormData.name}
                onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                placeholder="Template name"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={templateFormData.description}
                onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                placeholder="Brief description..."
                rows={3}
                data-testid="textarea-template-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={templateFormData.category}
                onChange={(e) => setTemplateFormData({ ...templateFormData, category: e.target.value })}
                placeholder="e.g., Residential, Commercial"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplateSettings} disabled={updateTemplateMetaMutation.isPending} data-testid="button-save-template-settings">
              {updateTemplateMetaMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
