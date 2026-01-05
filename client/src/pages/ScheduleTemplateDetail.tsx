import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type ScheduleTemplate, type Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ArrowLeft,
  Plus,
  GanttChart,
  List,
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
  Calendar,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  duration: number;
  type: "task" | "milestone" | "inspection" | "delivery" | "meeting";
  assigneeName?: string;
  category?: string;
  predecessorNames?: string[];
  predecessorRelation?: "FS" | "SS" | "FF" | "SF";
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
  index,
  onEdit,
  onDelete,
  onDuplicate,
  onBarChange,
  onToggleCollapse,
  totalDuration,
  dayWidth,
  isParent,
  isCollapsed,
  hasChildren,
  isChild,
}: { 
  item: TemplateItem;
  index: number;
  onEdit: (item: TemplateItem) => void;
  onDelete: (id: string) => void;
  onDuplicate: (item: TemplateItem) => void;
  onBarChange: (id: string, newStartDay: number, newDuration: number) => void;
  onToggleCollapse?: (id: string) => void;
  totalDuration: number;
  dayWidth: number;
  isParent?: boolean;
  isCollapsed?: boolean;
  hasChildren?: boolean;
  isChild?: boolean;
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

  const startDay = currentStartDay;
  const barLeft = startDay * dayWidth;
  const barWidth = Math.max(currentDuration * dayWidth, 20);

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
      
      <div className={`w-64 px-2 py-2 flex items-center gap-2 border-r border-border shrink-0 ${isChild ? 'pl-8' : ''}`}>
        {isParent && hasChildren && onToggleCollapse && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(item.id);
            }}
            className="p-0.5 hover:bg-accent rounded flex-shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
        {isParent && !hasChildren && <div className="w-5 flex-shrink-0" />}
        <Badge 
          variant="outline" 
          className="text-white border-0 h-4 px-1.5 text-[10px] shrink-0"
          style={{ backgroundColor: item.color || TYPE_COLORS[item.type] }}
        >
          {item.type}
        </Badge>
        <span className={`text-sm truncate flex-1 ${isParent ? 'font-medium' : 'text-muted-foreground'}`} title={item.name}>
          {item.name}
        </span>
      </div>
      
      <div className="w-16 px-2 text-center text-xs text-muted-foreground border-r border-border shrink-0">
        {currentDuration} {currentDuration === 1 ? 'day' : 'days'}
      </div>
      
      <div className="w-20 px-2 text-center text-xs text-muted-foreground border-r border-border shrink-0">
        Day {startDay}
      </div>
      
      <div 
        className="flex-1 relative h-10 overflow-hidden"
        style={{ minWidth: `${totalDuration * dayWidth}px` }}
      >
        {/* Weekend backgrounds */}
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
        {/* Day 0 indicator */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-20"
          style={{ left: '0px' }}
        />
        {/* Bar - matching Gantt.tsx styling with drag handles */}
        <div 
          className={`absolute top-1 h-6 mx-1 rounded-sm flex items-center z-10 group/bar ${isDragging ? 'cursor-grabbing shadow-lg scale-105' : 'cursor-move hover:scale-105 hover:shadow-md'} transition-all`}
          style={{ 
            left: `${barLeft}px`,
            width: `${barWidth}px`,
            backgroundColor: TYPE_COLORS[item.type],
          }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={() => onEdit(item)}
        >
          {/* Left resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity rounded-l-sm"
            onPointerDown={(e) => handlePointerDown(e, 'resize-left')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          
          {barWidth > 60 && (
            <span className="text-xs font-medium text-white truncate pointer-events-none px-2 flex-1">{item.name}</span>
          )}
          
          {/* Right resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 opacity-0 group-hover/bar:opacity-100 transition-opacity rounded-r-sm"
            onPointerDown={(e) => handlePointerDown(e, 'resize-right')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>
      </div>
      
      <div className="w-10 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
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
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive" 
              onClick={() => onDelete(item.id)}
            >
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
  
  const [activeView, setActiveView] = useState<"gantt" | "list">("gantt");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const dayWidth = useMemo(() => {
    switch (zoomLevel) {
      case "day": return 30;
      case "week": return 15;
      case "month": return 5;
      default: return 30;
    }
  }, [zoomLevel]);

  const { parentItems, childItemsByParent } = useMemo(() => {
    const parents: TemplateItem[] = [];
    const children: Record<string, TemplateItem[]> = {};

    items.forEach(item => {
      if (item.parentItemId) {
        if (!children[item.parentItemId]) {
          children[item.parentItemId] = [];
        }
        children[item.parentItemId].push(item);
      } else {
        parents.push(item);
      }
    });

    parents.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    Object.keys(children).forEach(parentId => {
      children[parentId].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    });

    return { parentItems: parents, childItemsByParent: children };
  }, [items]);

  const toggleCollapse = (id: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getEffectiveDates = (parentItem: TemplateItem) => {
    const children = childItemsByParent[parentItem.id] || [];
    if (children.length === 0) {
      return {
        startDay: parentItem.relativeStartDay || 0,
        endDay: (parentItem.relativeStartDay || 0) + parentItem.duration,
      };
    }
    const allDays = children.flatMap(child => [
      child.relativeStartDay || 0,
      (child.relativeStartDay || 0) + child.duration
    ]);
    return {
      startDay: Math.min(...allDays),
      endDay: Math.max(...allDays),
    };
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
      toast({
        title: "Template saved",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save template.",
        variant: "destructive",
      });
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
      toast({
        title: "Template updated",
        description: "Template settings have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template settings.",
        variant: "destructive",
      });
    },
  });

  const handleSaveTemplateSettings = () => {
    if (!templateFormData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Template name is required.",
        variant: "destructive",
      });
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
      const scheduleResponse = await fetch(`/api/projects/${projectId}/schedule`, {
        credentials: "include",
      });
      const schedule = await scheduleResponse.json();
      
      if (!schedule?.id) {
        const createResponse = await apiRequest("/api/schedules", "POST", { projectId });
        return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", {
          scheduleId: createResponse.id,
          startDate,
        });
      }
      
      return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", {
        scheduleId: schedule.id,
        startDate,
      });
    },
    onSuccess: (_, variables) => {
      setShowApplyDialog(false);
      toast({
        title: "Template applied",
        description: "The template has been applied to the project schedule.",
      });
      navigate(`/projects/${variables.projectId}/schedule`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to apply template to project.",
        variant: "destructive",
      });
    },
  });

  const totalDuration = useMemo(() => {
    if (items.length === 0) return 30;
    const maxEndDay = Math.max(...items.map(item => (item.relativeStartDay || 0) + item.duration));
    return Math.max(maxEndDay + 5, 30);
  }, [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
        ...item,
        sortOrder: index,
      }));
      setItems(newItems);
      setHasUnsavedChanges(true);
    }
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      description: "",
      duration: 1,
      type: "task",
      assigneeName: "",
      relativeStartDay: 0,
      parentItemId: null,
    });
    setShowItemDialog(true);
  };

  const handleEditItem = (item: TemplateItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      duration: item.duration,
      type: item.type,
      assigneeName: item.assigneeName || "",
      relativeStartDay: item.relativeStartDay || 0,
      parentItemId: item.parentItemId || null,
    });
    setShowItemDialog(true);
  };

  const handleSaveItem = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Item name is required.",
        variant: "destructive",
      });
      return;
    }

    if (editingItem) {
      const updatedItems = items.map(item =>
        item.id === editingItem.id
          ? { ...item, ...formData }
          : item
      );
      setItems(updatedItems);
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
    setItems(items.filter(item => item.id !== id));
    setHasUnsavedChanges(true);
    setShowDeleteConfirm(null);
  };

  const handleBarChange = (id: string, newStartDay: number, newDuration: number) => {
    const updatedItems = items.map(item =>
      item.id === id
        ? { ...item, relativeStartDay: newStartDay, duration: newDuration }
        : item
    );
    setItems(updatedItems);
    setHasUnsavedChanges(true);
  };

  const handleDuplicateItem = (item: TemplateItem) => {
    const newItem: TemplateItem = {
      ...item,
      id: `item-${Date.now()}`,
      name: `${item.name} (Copy)`,
      sortOrder: items.length,
    };
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
        name: item.name,
        description: item.description,
        duration: item.duration,
        type: item.type,
        assigneeName: item.assigneeName,
        category: item.category,
        relativeStartDay: item.relativeStartDay,
        parentItemId: item.parentItemId,
        sortOrder: item.sortOrder,
        color: item.color,
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

    toast({
      title: "Template exported",
      description: "The template has been downloaded as a JSON file.",
    });
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
      {/* Row 1 - Template Controls (matches project Schedule Row 1) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Back + Template Name */}
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
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
          )}
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              Unsaved
            </Badge>
          )}
        </div>

        {/* Right: Action Buttons */}
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
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 disabled:opacity-50"
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

      {/* Row 2 - Views & Controls (matches project Schedule Row 2) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveView("gantt")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'gantt' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-gantt"
          >
            <GanttChart className="w-3 h-3 inline mr-0.5" />
            Gantt
          </button>
          <button
            onClick={() => setActiveView("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'list' ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' : 'hover-elevate'} active-elevate-2`}
            data-testid="button-view-list"
          >
            <List className="w-3 h-3 inline mr-0.5" />
            List
          </button>
          
          <div className="ml-2 h-4 w-px bg-border" />
          
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2"
            onClick={handleAddItem}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3 inline mr-0.5" />
            Add Item
          </button>
        </div>
        
        {/* Right: Item count & Zoom controls */}
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs no-default-hover-elevate">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
          
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
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <Calendar className="h-12 w-12 opacity-50" />
            <p className="text-sm">No items in this template yet</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              data-testid="button-add-first-item"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Item
            </Button>
          </div>
        ) : activeView === "list" ? (
          <div className="p-4">
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 border-b px-4 py-2 grid grid-cols-[1fr_100px_100px_120px_80px] gap-2 text-xs font-medium">
                <div>Name</div>
                <div className="text-center">Type</div>
                <div className="text-center">Duration</div>
                <div className="text-center">Start Day</div>
                <div className="text-right">Actions</div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {parentItems.map((parentItem) => {
                    const isCollapsed = collapsedItems.has(parentItem.id);
                    const childItems = childItemsByParent[parentItem.id] || [];
                    const hasChildren = childItems.length > 0;

                    return (
                      <div key={parentItem.id}>
                        <div className="border-b last:border-b-0 px-4 py-2 grid grid-cols-[1fr_100px_100px_120px_80px] gap-2 items-center text-sm hover:bg-muted/30">
                          <div className="flex items-center gap-2">
                            {hasChildren && (
                              <button
                                onClick={() => toggleCollapse(parentItem.id)}
                                className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded"
                              >
                                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                            {!hasChildren && <div className="w-5" />}
                            <span className="font-medium truncate">{parentItem.name}</span>
                          </div>
                          <div className="text-center">
                            <Badge variant="outline" className="text-xs capitalize">
                              {parentItem.type}
                            </Badge>
                          </div>
                          <div className="text-center text-muted-foreground">{parentItem.duration}d</div>
                          <div className="text-center text-muted-foreground">Day {parentItem.relativeStartDay || 0}</div>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditItem(parentItem)}>
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setShowDeleteConfirm(parentItem.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {!isCollapsed && childItems.map((childItem) => (
                          <div key={childItem.id} className="border-b last:border-b-0 px-4 py-2 grid grid-cols-[1fr_100px_100px_120px_80px] gap-2 items-center text-sm hover:bg-muted/30 bg-muted/10">
                            <div className="flex items-center gap-2 pl-7">
                              <span className="truncate">{childItem.name}</span>
                            </div>
                            <div className="text-center">
                              <Badge variant="outline" className="text-xs capitalize">
                                {childItem.type}
                              </Badge>
                            </div>
                            <div className="text-center text-muted-foreground">{childItem.duration}d</div>
                            <div className="text-center text-muted-foreground">Day {childItem.relativeStartDay || 0}</div>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditItem(childItem)}>
                                <Edit3 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setShowDeleteConfirm(childItem.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        ) : (
          <div className="min-w-max">
            {/* Double-row header like project Gantt */}
            <div className="sticky top-0 z-10 bg-card">
              {/* Top row - Week labels */}
              <div className="flex items-center border-b border-border h-[30px]">
                <div className="w-8 shrink-0" />
                <div className="w-64 border-r border-border shrink-0" />
                <div className="w-16 border-r border-border shrink-0" />
                <div className="w-20 border-r border-border shrink-0" />
                <div 
                  className="flex-1 flex"
                  style={{ minWidth: `${totalDuration * dayWidth}px` }}
                >
                  {Array.from({ length: Math.ceil(totalDuration / 7) }).map((_, weekIdx) => {
                    const weekWidth = Math.min(7, totalDuration - weekIdx * 7) * dayWidth;
                    return (
                      <div 
                        key={weekIdx}
                        className="text-xs font-semibold text-muted-foreground flex items-center justify-center border-r border-border"
                        style={{ width: `${weekWidth}px` }}
                      >
                        Week {weekIdx + 1}
                      </div>
                    );
                  })}
                </div>
                <div className="w-10 shrink-0" />
              </div>
              
              {/* Bottom row - Day labels + column headers */}
              <div className="flex items-center border-b border-border h-[30px]">
                <div className="w-8 shrink-0" />
                <div className="w-64 px-2 text-xs font-medium border-r border-border shrink-0 flex items-center">
                  Task Name
                </div>
                <div className="w-16 px-2 text-xs font-medium text-center border-r border-border shrink-0 flex items-center justify-center">
                  Duration
                </div>
                <div className="w-20 px-2 text-xs font-medium text-center border-r border-border shrink-0 flex items-center justify-center">
                  Start Day
                </div>
                <div 
                  className="flex-1 flex"
                  style={{ minWidth: `${totalDuration * dayWidth}px` }}
                >
                  {Array.from({ length: totalDuration }).map((_, dayIdx) => {
                    const dayOfWeek = dayIdx % 7;
                    const dayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
                    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
                    const isDay0 = dayIdx === 0;
                    return (
                      <div 
                        key={dayIdx}
                        className={`text-xs flex items-center justify-center border-r border-border whitespace-nowrap overflow-hidden px-0.5 ${isWeekend ? 'bg-[#f3f4f6] dark:bg-muted/50' : ''} ${isDay0 ? 'text-[#bba7db] font-semibold' : 'text-foreground'}`}
                        style={{ width: `${dayWidth}px` }}
                      >
                        {dayNames[dayOfWeek]} {dayIdx}
                      </div>
                    );
                  })}
                </div>
                <div className="w-10 shrink-0" />
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {parentItems.map((parentItem, parentIdx) => {
                  const isCollapsed = collapsedItems.has(parentItem.id);
                  const childItems = childItemsByParent[parentItem.id] || [];
                  const hasChildren = childItems.length > 0;

                  return (
                    <div key={parentItem.id}>
                      <SortableItem
                        item={parentItem}
                        index={parentIdx}
                        onEdit={handleEditItem}
                        onDelete={(id) => setShowDeleteConfirm(id)}
                        onDuplicate={handleDuplicateItem}
                        onBarChange={handleBarChange}
                        onToggleCollapse={toggleCollapse}
                        totalDuration={totalDuration}
                        dayWidth={dayWidth}
                        isParent={true}
                        isCollapsed={isCollapsed}
                        hasChildren={hasChildren}
                        isChild={false}
                      />
                      {!isCollapsed && childItems.map((childItem, childIdx) => (
                        <SortableItem
                          key={childItem.id}
                          item={childItem}
                          index={parentIdx * 1000 + childIdx + 1}
                          onEdit={handleEditItem}
                          onDelete={(id) => setShowDeleteConfirm(id)}
                          onDuplicate={handleDuplicateItem}
                          onBarChange={handleBarChange}
                          totalDuration={totalDuration}
                          dayWidth={dayWidth}
                          isParent={false}
                          isCollapsed={false}
                          hasChildren={false}
                          isChild={true}
                        />
                      ))}
                    </div>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent data-testid="dialog-item">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the item details." : "Add a new item to the schedule template."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Pour footings"
                data-testid="input-item-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as TemplateItem["type"] })}
                >
                  <SelectTrigger data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="parentItem">Parent Item</Label>
                <Select
                  value={formData.parentItemId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, parentItemId: value === "none" ? null : value })}
                >
                  <SelectTrigger data-testid="select-parent-item">
                    <SelectValue placeholder="No parent (top level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent (top level)</SelectItem>
                    {parentItems
                      .filter(p => p.id !== editingItem?.id)
                      .map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          {parent.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (days)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 1 })}
                  data-testid="input-item-duration"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="relativeStartDay">Start Day</Label>
                <Input
                  id="relativeStartDay"
                  type="number"
                  min={0}
                  value={formData.relativeStartDay}
                  onChange={(e) => setFormData({ ...formData, relativeStartDay: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                  data-testid="input-item-start-day"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                data-testid="textarea-item-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigneeName">Default Assignee</Label>
              <Input
                id="assigneeName"
                value={formData.assigneeName}
                onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
                placeholder="e.g., Concreter"
                data-testid="input-item-assignee"
              />
              <p className="text-xs text-muted-foreground">
                Role or trade name (will be matched when applying template)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveItem} data-testid="button-save-item">
              {editingItem ? "Update" : "Add"} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent data-testid="dialog-apply-template">
          <DialogHeader>
            <DialogTitle>Apply Template to Project</DialogTitle>
            <DialogDescription>
              Select a project and start date to apply this schedule template.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.filter(p => !p.isArchived).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={applyStartDate}
                onChange={(e) => setApplyStartDate(e.target.value)}
                data-testid="input-start-date"
              />
              <p className="text-xs text-muted-foreground">
                All template items will be scheduled relative to this date.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => applyTemplateMutation.mutate({ projectId: selectedProjectId, startDate: applyStartDate })}
              disabled={!selectedProjectId || applyTemplateMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyTemplateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => showDeleteConfirm && handleDeleteItem(showDeleteConfirm)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent data-testid="dialog-template-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update the template name and description.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">Name *</Label>
              <Input
                id="templateName"
                value={templateFormData.name}
                onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                placeholder="Template name"
                data-testid="input-template-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateDescription">Description</Label>
              <Textarea
                id="templateDescription"
                value={templateFormData.description}
                onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                placeholder="Brief description of the template..."
                rows={3}
                data-testid="textarea-template-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveTemplateSettings}
              disabled={updateTemplateMetaMutation.isPending}
              data-testid="button-save-template-settings"
            >
              {updateTemplateMetaMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
