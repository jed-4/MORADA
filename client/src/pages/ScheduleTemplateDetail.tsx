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
  totalDuration,
  dayWidth,
}: { 
  item: TemplateItem;
  index: number;
  onEdit: (item: TemplateItem) => void;
  onDelete: (id: string) => void;
  onDuplicate: (item: TemplateItem) => void;
  totalDuration: number;
  dayWidth: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startDay = item.relativeStartDay || 0;
  const barLeft = startDay * dayWidth;
  const barWidth = Math.max(item.duration * dayWidth, 20);

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
      
      <div className="w-64 px-2 py-2 flex items-center gap-2 border-r border-border shrink-0">
        <Badge 
          variant="outline" 
          className="text-white border-0 h-4 px-1.5 text-[10px] shrink-0"
          style={{ backgroundColor: TYPE_COLORS[item.type] }}
        >
          {item.type}
        </Badge>
        <span className="text-sm truncate flex-1 font-medium" title={item.name}>
          {item.name}
        </span>
      </div>
      
      <div className="w-16 px-2 text-center text-xs text-muted-foreground border-r border-border shrink-0">
        {item.duration} {item.duration === 1 ? 'day' : 'days'}
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
        {/* Bar - matching Gantt.tsx styling */}
        <div 
          className="absolute top-1 h-6 mx-1 rounded-sm flex items-center cursor-pointer hover:scale-105 hover:shadow-md transition-all z-10 group/bar"
          style={{ 
            left: `${barLeft}px`,
            width: `${barWidth}px`,
            backgroundColor: TYPE_COLORS[item.type],
          }}
          onClick={() => onEdit(item)}
        >
          {barWidth > 60 && (
            <span className="text-xs font-medium text-white truncate pointer-events-none pl-2">{item.name}</span>
          )}
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
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    duration: 1,
    type: "task" as TemplateItem["type"],
    assigneeName: "",
    relativeStartDay: 0,
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
    <div className="h-full flex flex-col">
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => navigate("/templates")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold truncate" data-testid="text-template-name">
            {template.name}
          </h2>
          {template.category && (
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
          )}
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
              Unsaved changes
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowApplyDialog(true)}
            data-testid="button-apply-template"
          >
            <Upload className="h-3 w-3 mr-1" />
            Apply to Project
          </Button>
          
          <Button
            size="sm"
            className="h-6 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90"
            onClick={handleSaveTemplate}
            disabled={!hasUnsavedChanges || updateTemplateMutation.isPending}
            data-testid="button-save-template"
          >
            {updateTemplateMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={handleAddItem}
            data-testid="button-add-item"
          >
            <Plus className="h-3 w-3" />
            Add Item
          </Button>
          
          <div className="flex items-center border rounded-md h-6">
            <Button
              variant={activeView === "gantt" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-r-none"
              onClick={() => setActiveView("gantt")}
            >
              <GanttChart className="h-3 w-3" />
            </Button>
            <Button
              variant={activeView === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 rounded-l-none"
              onClick={() => setActiveView("list")}
            >
              <List className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Badge>
          
          <div className="flex items-center border rounded-md h-6">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5"
              onClick={() => setZoomLevel(prev => prev === "day" ? "week" : prev === "week" ? "month" : "month")}
              disabled={zoomLevel === "month"}
            >
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-xs px-1 min-w-12 text-center capitalize">{zoomLevel}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5"
              onClick={() => setZoomLevel(prev => prev === "month" ? "week" : prev === "week" ? "day" : "day")}
              disabled={zoomLevel === "day"}
            >
              <ZoomIn className="h-3 w-3" />
            </Button>
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
                {items.map((item, index) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    index={index}
                    onEdit={handleEditItem}
                    onDelete={(id) => setShowDeleteConfirm(id)}
                    onDuplicate={handleDuplicateItem}
                    totalDuration={totalDuration}
                    dayWidth={dayWidth}
                  />
                ))}
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="relativeStartDay">Relative Start Day</Label>
              <Input
                id="relativeStartDay"
                type="number"
                min={0}
                value={formData.relativeStartDay}
                onChange={(e) => setFormData({ ...formData, relativeStartDay: parseInt(e.target.value) || 0 })}
                placeholder="0 = project start"
                data-testid="input-item-start-day"
              />
              <p className="text-xs text-muted-foreground">
                Days from project start date when this item begins
              </p>
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
    </div>
  );
}
