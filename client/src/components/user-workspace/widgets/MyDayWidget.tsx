import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Sun, 
  Circle,
  Bell,
  ChevronDown,
  ChevronRight,
  GripVertical,
  AlertTriangle,
  CheckSquare,
  CalendarDays,
  CloudSun,
  Cloud,
  CloudRain
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { type Task, type Project } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TaskModalAsana from "@/components/TaskModalAsana";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Reminder {
  id: string;
  title: string;
  triggerAt: string;
  status: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  startDate: string;
  startTime?: string;
  endDate?: string;
  projectId?: string;
}

interface SectionConfig {
  id: string;
  visible: boolean;
  collapsed: boolean;
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "overdue", visible: true, collapsed: false },
  { id: "today", visible: true, collapsed: false },
  { id: "schedule", visible: true, collapsed: false },
];

const SECTION_LABELS: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  overdue: { label: "Overdue", icon: AlertTriangle },
  today: { label: "Today's Tasks", icon: CheckSquare },
  schedule: { label: "Today's Schedule", icon: CalendarDays },
};

function SortableSectionItem({ 
  section, 
  onToggleVisible,
}: { 
  section: SectionConfig;
  onToggleVisible: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sectionDef = SECTION_LABELS[section.id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 border rounded-md bg-background"
    >
      <button {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <sectionDef.icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm flex-1">{sectionDef.label}</span>
      <Switch
        checked={section.visible}
        onCheckedChange={() => onToggleVisible(section.id)}
      />
    </div>
  );
}

export default function MyDayWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const today = startOfDay(new Date());

  const sections: SectionConfig[] = useMemo(() => {
    const saved = widget.config?.sections as SectionConfig[] | undefined;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const existingIds = new Set(saved.map(s => s.id));
      const missingSections = DEFAULT_SECTIONS.filter(s => !existingIds.has(s.id));
      return [...saved, ...missingSections];
    }
    return DEFAULT_SECTIONS;
  }, [widget.config?.sections]);

  const [editingSections, setEditingSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  useEffect(() => {
    if (!initialized || JSON.stringify(editingSections) !== JSON.stringify(sections)) {
      setEditingSections(sections);
      const initial: Record<string, boolean> = {};
      sections.forEach(s => { initial[s.id] = s.collapsed; });
      setCollapsedState(initial);
      setInitialized(true);
    }
  }, [sections, initialized]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: scheduleItems = [], isLoading: scheduleLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedule-items", { date: format(today, 'yyyy-MM-dd') }],
    queryFn: async () => {
      const todayStr = format(today, 'yyyy-MM-dd');
      const response = await fetch(`/api/schedule-items?startDate=${todayStr}&endDate=${todayStr}`, { credentials: 'include' });
      if (!response.ok) return [];
      const items = await response.json();
      return items.filter((item: ScheduleItem) => {
        const itemDate = new Date(item.startDate);
        return isToday(itemDate);
      });
    },
    enabled: !!userId && sections.some(s => s.id === 'schedule' && s.visible),
  });

  const todaysTasks = useMemo(() => tasks.filter(t => {
    if (t.status === 'done' || t.status === 'complete') return false;
    if (!t.dueDate) return false;
    return isToday(new Date(t.dueDate));
  }), [tasks]);

  const overdueTasks = useMemo(() => tasks.filter(t => {
    if (t.status === 'done' || t.status === 'complete') return false;
    if (!t.dueDate) return false;
    return isBefore(new Date(t.dueDate), today);
  }), [tasks, today]);

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest("PATCH", `/api/tasks/${task.id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: userId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const toggleCollapsed = (sectionId: string) => {
    setCollapsedState(prev => {
      const newState = { ...prev, [sectionId]: !prev[sectionId] };
      if (onUpdate) {
        const updatedSections = sections.map(s => ({
          ...s,
          collapsed: s.id === sectionId ? !prev[sectionId] : prev[s.id] ?? s.collapsed
        }));
        onUpdate({ 
          ...widget, 
          config: { ...widget.config, sections: updatedSections } 
        });
      }
      return newState;
    });
  };

  const isLoading = tasksLoading || scheduleLoading;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditingSections((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleToggleVisible = (sectionId: string) => {
    setEditingSections(prev => prev.map(s => 
      s.id === sectionId ? { ...s, visible: !s.visible } : s
    ));
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ 
          ...widget, 
          title: editingTitle,
          config: { ...widget.config, sections: editingSections }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setEditingSections(sections);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure My Day</h4>
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Sections (drag to reorder)</Label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={editingSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {editingSections.map(section => (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    onToggleVisible={handleToggleVisible}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const visibleSections = sections.filter(s => s.visible);

  const renderSection = (sectionConfig: SectionConfig) => {
    const isCollapsed = collapsedState[sectionConfig.id] ?? sectionConfig.collapsed;
    const sectionDef = SECTION_LABELS[sectionConfig.id];
    
    let items: any[] = [];
    let emptyMessage = "";
    let itemColor = "";
    
    switch (sectionConfig.id) {
      case "overdue":
        items = overdueTasks;
        emptyMessage = "No overdue tasks";
        itemColor = "text-red-600 dark:text-red-400";
        break;
      case "today":
        items = todaysTasks;
        emptyMessage = "No tasks due today";
        itemColor = "";
        break;
      case "schedule":
        items = scheduleItems;
        emptyMessage = "No schedule items today";
        itemColor = "text-blue-600 dark:text-blue-400";
        break;
    }

    const count = items.length;

    return (
      <Collapsible 
        key={sectionConfig.id} 
        open={!isCollapsed}
        onOpenChange={() => toggleCollapsed(sectionConfig.id)}
      >
        <CollapsibleTrigger className={`flex items-center gap-2 w-full py-1.5 px-2 border-l-3 cursor-pointer transition-colors ${
          sectionConfig.id === 'overdue' 
            ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' 
            : sectionConfig.id === 'schedule'
            ? 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-l-primary bg-primary/5'
        }`}>
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={`text-[11px] font-semibold uppercase tracking-wide flex-1 text-left ${
            sectionConfig.id === 'overdue' && count > 0 
              ? 'text-red-700 dark:text-red-400' 
              : sectionConfig.id === 'schedule'
              ? 'text-blue-700 dark:text-blue-400'
              : 'text-foreground/80'
          }`}>
            {sectionDef.label}
          </span>
          <span className={`text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${
            sectionConfig.id === 'overdue' && count > 0 
              ? 'bg-red-500 text-white' 
              : 'bg-muted text-muted-foreground'
          }`}>
            {count}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1 space-y-1">
          {items.length === 0 ? (
            <div className="text-[10px] text-muted-foreground pl-6 py-1">{emptyMessage}</div>
          ) : (
            <>
              {sectionConfig.id === "schedule" && items.map((item: ScheduleItem) => (
                <div 
                  key={item.id}
                  className="flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer ml-4"
                  onClick={() => item.projectId && setLocation(`/projects/${item.projectId}/schedule`)}
                  data-testid={`myday-schedule-${item.id}`}
                >
                  <CalendarDays className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{item.title}</span>
                  {item.startTime && (
                    <span className="text-[10px] text-muted-foreground">{item.startTime}</span>
                  )}
                </div>
              ))}
              {sectionConfig.id !== "schedule" && (items as Task[]).slice(0, 5).map((task) => {
                const project = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                return (
                  <div 
                    key={task.id}
                    className={`flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer ml-4 ${
                      sectionConfig.id === 'overdue' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : ''
                    }`}
                    onClick={() => setSelectedTaskId(task.id)}
                    data-testid={`myday-task-${task.id}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTaskMutation.mutate(task);
                      }}
                      className="flex-shrink-0"
                    >
                      <Circle className={`h-3.5 w-3.5 ${sectionConfig.id === 'overdue' ? 'text-red-500' : 'text-muted-foreground'}`} />
                    </button>
                    <span className="text-xs truncate flex-1">{task.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground w-12 text-right">
                          {format(new Date(task.dueDate), 'MMM d')}
                        </span>
                      )}
                      {project && (
                        <span 
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[80px]"
                          title={project.name}
                        >
                          {project.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length > 5 && sectionConfig.id !== "schedule" && (
                <div className="text-[10px] text-muted-foreground pl-6 py-0.5">
                  +{items.length - 5} more
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CloudSun className="h-3.5 w-3.5 text-amber-500" />
          <span>--°C</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse p-2 border rounded-md">
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : visibleSections.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground">
          <Sun className="h-8 w-8 mx-auto mb-2 text-amber-400" />
          <p>No sections enabled</p>
          <p className="text-muted-foreground">Configure widget to show sections</p>
        </div>
      ) : (
        <div className="space-y-1">
          {visibleSections.map(section => renderSection(section))}
        </div>
      )}
      
      <TaskModalAsana
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        task={tasks.find(t => t.id === selectedTaskId)}
        taskId={selectedTaskId || undefined}
      />
    </div>
  );
}
