import { useState, useEffect, useMemo } from "react";
import { getWorkspacePreferences } from "@/lib/workspacePreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskTooltip } from "@/components/ui/task-tooltip";
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
  CloudRain,
  ChevronsUpDown,
  ChevronsDownUp,
  Timer,
  Clock,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { useLocation } from "wouter";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { type Task, type Project, type FocusBlock } from "@shared/schema";
import { generateNotionColors } from "@/lib/taskColors";
import { getPriorityStyle } from "@/lib/priorityConfig";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import { FocusBlockCreator } from "@/components/FocusBlockCreator";
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
  { id: "focus", visible: true, collapsed: false },
];

const SECTION_LABELS: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  overdue: { label: "Overdue", icon: AlertTriangle },
  today: { label: "Today's Tasks", icon: CheckSquare },
  schedule: { label: "Today's Schedule", icon: CalendarDays },
  focus: { label: "Focus Blocks", icon: Timer },
};

function FocusBlockItem({ block }: { block: FocusBlock }) {
  const { data: blockTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/focus-blocks", block.id, "tasks"],
    queryFn: () => apiRequest(`/api/focus-blocks/${block.id}/tasks`, "GET"),
    staleTime: 60 * 1000,
  });

  return (
    <div
      className="ml-4 rounded-md border overflow-hidden"
      style={{ borderLeft: `3px solid ${block.color}` }}
      data-testid={`myday-focus-${block.id}`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: block.color }} />
        <span className="text-xs font-medium truncate flex-1">{block.title}</span>
        <span className="text-data text-muted-foreground flex-shrink-0">
          {block.startTime} – {block.endTime}
        </span>
      </div>
      {blockTasks.length > 0 && (
        <div className="px-2 pb-1.5 space-y-0.5">
          {blockTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-1.5 pl-1">
              <div
                className="w-1 h-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: getPriorityStyle(task.priority).color }}
              />
              <span className="text-data text-muted-foreground truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { effectiveTimezone } = useTimezone();
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
  const [showFocusCreator, setShowFocusCreator] = useState(false);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  useEffect(() => {
    if (!initialized || JSON.stringify(editingSections) !== JSON.stringify(sections)) {
      setEditingSections(sections);
      const initial: Record<string, boolean> = {};
      const { defaultExpanded } = getWorkspacePreferences();
      sections.forEach(s => { initial[s.id] = defaultExpanded ? false : s.collapsed; });
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
      const response = await fetch(`/api/schedule-items/all?startDate=${todayStr}&endDate=${todayStr}`, { credentials: 'include' });
      if (!response.ok) return [];
      const items = await response.json();
      return items.filter((item: ScheduleItem) => {
        const itemDate = new Date(item.startDate);
        return isToday(itemDate);
      });
    },
    enabled: !!userId && sections.some(s => s.id === 'schedule' && s.visible),
  });

  const { data: allFocusBlocks = [] } = useQuery<FocusBlock[]>({
    queryKey: ["/api/focus-blocks"],
    enabled: !!userId && sections.some(s => s.id === 'focus' && s.visible),
    staleTime: 60 * 1000,
  });

  const todayFocusBlocks = useMemo(() => {
    const todayDow = today.getDay();
    const todayStr = format(today, 'yyyy-MM-dd');
    return allFocusBlocks.filter(fb => {
      if (fb.isRecurring) {
        return (fb.daysOfWeek as number[] || []).includes(todayDow);
      } else {
        return fb.specificDate === todayStr;
      }
    });
  }, [allFocusBlocks, today]);

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

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
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
        itemColor = "text-bp-coral";
        break;
      case "today":
        items = todaysTasks;
        emptyMessage = "No tasks due today";
        itemColor = "";
        break;
      case "schedule":
        items = scheduleItems;
        emptyMessage = "No schedule items today";
        itemColor = "text-bp-teal";
        break;
      case "focus":
        items = todayFocusBlocks;
        emptyMessage = "No focus blocks today";
        itemColor = "text-bp-purple";
        break;
    }

    const count = items.length;

    return (
      <Collapsible 
        key={sectionConfig.id} 
        open={!isCollapsed}
        onOpenChange={() => toggleCollapsed(sectionConfig.id)}
      >
        <CollapsibleTrigger className={`flex items-center gap-2 w-full py-1.5 px-2 border-l-2 cursor-pointer transition-colors ${
          sectionConfig.id === 'overdue' 
            ? 'border-l-bp-coral bg-bp-coral/10' 
            : sectionConfig.id === 'schedule'
            ? 'border-l-bp-teal bg-bp-teal/10'
            : sectionConfig.id === 'focus'
            ? 'border-l-bp-purple bg-bp-purple/10'
            : 'border-l-bp-purple bg-bp-purple/5'
        }`}>
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-bp-muted" />
          ) : (
            <ChevronDown className="h-3 w-3 text-bp-muted" />
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wide flex-1 text-left ${
            sectionConfig.id === 'overdue' && count > 0 
              ? 'text-bp-coral' 
              : sectionConfig.id === 'schedule'
              ? 'text-bp-teal'
              : sectionConfig.id === 'focus'
              ? 'text-bp-purple'
              : 'text-foreground/80'
          }`}>
            {sectionDef.label}
          </span>
          <span className={`text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${
            sectionConfig.id === 'overdue' && count > 0 
              ? 'bg-bp-coral text-white' 
              : 'bg-bp-subtle text-bp-muted'
          }`}>
            {count}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1 space-y-1">
          {items.length === 0 ? (
            <div className="text-data text-muted-foreground pl-6 py-1">{emptyMessage}</div>
          ) : (
            <>
              {sectionConfig.id === "schedule" && items.map((item: ScheduleItem) => (
                <div 
                  key={item.id}
                  className="flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer ml-4"
                  onClick={() => item.projectId && setLocation(`/projects/${item.projectId}/schedule`)}
                  data-testid={`myday-schedule-${item.id}`}
                >
                  <CalendarDays className="h-3.5 w-3.5 text-bp-teal flex-shrink-0" />
                  <TaskTooltip content={item.title}>
                    <span className="text-xs truncate flex-1 cursor-default">{item.title}</span>
                  </TaskTooltip>
                  {item.startTime && (
                    <span className="text-data text-muted-foreground">{item.startTime}</span>
                  )}
                </div>
              ))}
              {sectionConfig.id === "focus" && (items as FocusBlock[]).map((fb) => (
                <FocusBlockItem key={fb.id} block={fb} />
              ))}
              {sectionConfig.id !== "schedule" && sectionConfig.id !== "focus" && (items as Task[]).map((task) => {
                const project = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                return (
                  <div 
                    key={task.id}
                    className={`flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer ml-4 ${
                      sectionConfig.id === 'overdue' ? 'bg-bp-coral/10 border-bp-coral/30' : 'border-bp-border'
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
                      <Circle className={`h-3.5 w-3.5 ${sectionConfig.id === 'overdue' ? 'text-bp-coral' : 'text-bp-muted'}`} />
                    </button>
                    <TaskTooltip content={task.title}>
                      <span className="text-xs truncate flex-1 cursor-default">{task.title}</span>
                    </TaskTooltip>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {task.dueDate && (
                        <span className="text-data text-muted-foreground w-12 text-right">
                          {formatInTimezone(new Date(task.dueDate), effectiveTimezone, { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {project && (() => {
                        const colors = generateNotionColors(project.color);
                        return (
                          <span 
                            className="text-label px-1.5 py-0.5 rounded truncate max-w-[80px]"
                            style={{ backgroundColor: colors.pastelBg, color: colors.darkText }}
                            title={project.name}
                          >
                            {project.name}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const allCollapsed = useMemo(() => {
    return visibleSections.every(s => collapsedState[s.id]);
  }, [visibleSections, collapsedState]);

  const toggleAllSections = () => {
    const newState: Record<string, boolean> = {};
    const shouldCollapse = !allCollapsed;
    visibleSections.forEach(s => {
      newState[s.id] = shouldCollapse;
    });
    setCollapsedState(prev => ({ ...prev, ...newState }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-muted-foreground">{formatInTimezone(new Date(), effectiveTimezone, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setShowFocusCreator(true)}
            title="New Focus Block"
          >
            <Clock className="h-3 w-3" />
          </Button>
          {visibleSections.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={toggleAllSections}
              data-testid="button-toggle-all-myday"
              title={allCollapsed ? "Expand all" : "Collapse all"}
            >
              {allCollapsed ? (
                <ChevronsUpDown className="h-3 w-3" />
              ) : (
                <ChevronsDownUp className="h-3 w-3" />
              )}
            </Button>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudSun className="h-3.5 w-3.5 text-bp-amber" />
            <span>--°C</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <WidgetSkeleton rows={3} />
      ) : visibleSections.length === 0 ? (
        <WidgetEmpty
          icon={Sun}
          title="No sections enabled"
          message="Configure widget to show sections"
        />
      ) : (
        <div className="space-y-1">
          {visibleSections.map(section => renderSection(section))}
        </div>
      )}
      
      <TaskDetailModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        onEdit={(task) => setEditingTask(task)}
      />
      
      <TaskEditModal
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
      />

      <FocusBlockCreator
        open={showFocusCreator}
        onOpenChange={setShowFocusCreator}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
        }}
      />
    </div>
  );
}
