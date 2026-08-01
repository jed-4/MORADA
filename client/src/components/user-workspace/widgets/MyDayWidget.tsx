import { useState, useEffect, useMemo } from "react";
import { getWorkspacePreferences } from "@/lib/workspacePreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  ArrowRight,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { useLocation } from "wouter";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { type Task, type Project, type FocusBlock } from "@shared/schema";
import { generateNotionColors } from "@/lib/taskColors";
import { TaskRow, TaskCard } from "@/components/widgets/shared/TaskRow";
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

export default function MyDayWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { effectiveTimezone } = useTimezone();
  const [, setLocation] = useLocation();
  // Stable per-mount value — rebuilding it every render invalidated every memo
  // below that lists it as a dependency.
  const today = useMemo(() => startOfDay(new Date()), []);

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

  // 'board' lays the sections out as columns instead of stacked rows.
  const view: 'list' | 'board' = (widget.config?.view as 'list' | 'board') ?? 'list';
  const [editingView, setEditingView] = useState<'list' | 'board'>(view);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  useEffect(() => {
    if (!initialized || JSON.stringify(editingSections) !== JSON.stringify(sections)) {
      setEditingSections(sections);
      setEditingView(view);
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

  // Header row: new focus block, collapse/expand all, hover arrow to Tasks
  useEffect(() => {
    onSetHeaderActions?.(
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setShowFocusCreator(true)}
              data-testid="button-new-focus-block"
              aria-label="New focus block"
            >
              <Clock className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">New focus block</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => setLocation("/tasks")}
              data-testid="myday-open-tasks"
              aria-label="Open tasks"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All tasks</TooltipContent>
        </Tooltip>
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same endpoint and cache key as PersonalTasksWidget, so ticking a task in
  // either widget updates both. Session-scoped server-side.
  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks/my"],
    enabled: !!userId,
  });

  // Supplies project colours for the task chips. Shared cache key, so this is
  // deduped with every other widget that needs it.
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: scheduleItems = [], isLoading: scheduleLoading, isError: scheduleError, refetch: refetchSchedule } = useQuery<ScheduleItem[]>({
    // Key mirrors the URL so this shares cache with other schedule consumers.
    queryKey: ["/api/schedule-items/all", { date: format(today, 'yyyy-MM-dd') }],
    queryFn: async () => {
      const todayStr = format(today, 'yyyy-MM-dd');
      const response = await fetch(`/api/schedule-items/all?startDate=${todayStr}&endDate=${todayStr}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Failed to load schedule (${response.status})`);
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
    if (t.status === 'done') return false;
    if (!t.dueDate) return false;
    return isToday(new Date(t.dueDate));
  }), [tasks]);

  const overdueTasks = useMemo(() => tasks.filter(t => {
    if (t.status === 'done') return false;
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
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  // Collapsing is a view preference, not a dashboard edit. It used to call
  // onUpdate on every click, which persisted the entire dashboard layout to the
  // server each time (~400ms round trip per collapse). Kept local now; the
  // configured defaults still come from widget.config.sections.
  const toggleCollapsed = (sectionId: string) => {
    setCollapsedState(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const isLoading = tasksLoading || scheduleLoading;
  const isError = tasksError || scheduleError;

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
          config: { ...widget.config, sections: editingSections, view: editingView }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      // Revert every draft so an abandoned edit doesn't reappear next open.
      setEditingTitle(widget.title);
      setEditingSections(sections);
      setEditingView(view);
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
          <Label className="text-xs">Layout</Label>
          <Select value={editingView} onValueChange={(v) => setEditingView(v as 'list' | 'board')}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">Stacked list</SelectItem>
              <SelectItem value="board">Board (sections as columns)</SelectItem>
            </SelectContent>
          </Select>
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

  /**
   * Each section owns one Morada tone, used only for its heading dot. Coral is
   * reserved for Overdue so that seeing coral anywhere in the widget always
   * means the same thing.
   */
  const SECTION_TONE: Record<string, string> = {
    overdue: "hsl(var(--coral))",
    today: "hsl(var(--primary))",
    schedule: "hsl(var(--teal))",
    focus: "hsl(var(--amber))",
  };

  const sectionItems = (id: string): any[] => {
    switch (id) {
      case "overdue": return overdueTasks;
      case "today": return todaysTasks;
      case "schedule": return scheduleItems;
      case "focus": return todayFocusBlocks;
      default: return [];
    }
  };

  // A section with nothing in it is noise, not information — hide it outright.
  const populatedSections = visibleSections.filter(s => sectionItems(s.id).length > 0);

  /** Section heading — shared by the stacked list and the board columns. */
  const renderSectionHeading = (sectionConfig: SectionConfig) => {
    const sectionDef = SECTION_LABELS[sectionConfig.id];
    const isOverdue = sectionConfig.id === "overdue";
    const tone = SECTION_TONE[sectionConfig.id] ?? "hsl(var(--muted-foreground))";
    return (
      <>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tone }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider text-left truncate"
          style={isOverdue ? { color: "hsl(var(--coral))" } : undefined}
        >
          {sectionDef.label}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {sectionItems(sectionConfig.id).length}
        </span>
      </>
    );
  };

  /** Section contents. `compact` switches task rows to stacked board cards. */
  const renderSectionBody = (sectionConfig: SectionConfig, compact = false) => {
    const items = sectionItems(sectionConfig.id);

    if (sectionConfig.id === "schedule") {
      return (items as ScheduleItem[]).map((item) => (
        <div
          key={item.id}
          className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/60 cursor-pointer ${compact ? 'border bg-card' : ''}`}
          onClick={() => item.projectId && setLocation(`/projects/${item.projectId}/schedule`)}
          data-testid={`myday-schedule-${item.id}`}
        >
          <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "hsl(var(--teal))" }} />
          <TaskTooltip content={item.title}>
            <span className={`truncate flex-1 leading-snug cursor-default ${compact ? 'text-xs' : 'text-sm'}`}>
              {item.title}
            </span>
          </TaskTooltip>
          {item.startTime && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
              {item.startTime}
            </span>
          )}
        </div>
      ));
    }

    if (sectionConfig.id === "focus") {
      return (items as FocusBlock[]).map((fb) => <FocusBlockItem key={fb.id} block={fb} />);
    }

    const Row = compact ? TaskCard : TaskRow;
    return (items as Task[]).map((task) => {
      const project = task.projectId ? projects.find(p => p.id === task.projectId) : null;
      return (
        <Row
          key={task.id}
          task={task as any}
          accentColor={project ? generateNotionColors(project.color).originalHex : null}
          accentLabel={project?.name ?? null}
          onToggle={() => toggleTaskMutation.mutate(task)}
          onClick={() => setSelectedTaskId(task.id)}
          testIdPrefix="myday-task"
        />
      );
    });
  };

  const renderSection = (sectionConfig: SectionConfig) => {
    const isCollapsed = collapsedState[sectionConfig.id] ?? sectionConfig.collapsed;
    const sectionDef = SECTION_LABELS[sectionConfig.id];
    const items = sectionItems(sectionConfig.id);
    const isOverdue = sectionConfig.id === "overdue";
    const tone = SECTION_TONE[sectionConfig.id] ?? "hsl(var(--muted-foreground))";

    return (
      <Collapsible
        key={sectionConfig.id}
        open={!isCollapsed}
        onOpenChange={() => toggleCollapsed(sectionConfig.id)}
      >
        <CollapsibleTrigger className="group/sec flex items-center gap-2 w-full py-1 cursor-pointer">
          {renderSectionHeading(sectionConfig)}
          {/* Hairline carries the eye across to the chevron instead of a filled bar. */}
          <span className="flex-1 h-px bg-border" />
          {isCollapsed
            ? <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/sec:opacity-100 transition-opacity" />
            : <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover/sec:opacity-100 transition-opacity" />}
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-0.5 pb-1 space-y-0.5">
          {renderSectionBody(sectionConfig)}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  // Collapse-all only concerns the sections actually on screen.
  const allCollapsed = useMemo(() => {
    return populatedSections.length > 0 && populatedSections.every(s => collapsedState[s.id]);
  }, [populatedSections, collapsedState]);

  const toggleAllSections = () => {
    const newState: Record<string, boolean> = {};
    const shouldCollapse = !allCollapsed;
    populatedSections.forEach(s => {
      newState[s.id] = shouldCollapse;
    });
    setCollapsedState(prev => ({ ...prev, ...newState }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-muted-foreground">{formatInTimezone(new Date(), effectiveTimezone, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <div className="flex items-center gap-1.5">
          {populatedSections.length > 0 && (
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
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Couldn't load your day
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => { refetchTasks(); refetchSchedule(); }}
          >
            Retry
          </Button>
        </div>
      ) : visibleSections.length === 0 ? (
        <WidgetEmpty
          icon={Sun}
          title="No sections enabled"
          message="Configure widget to show sections"
        />
      ) : populatedSections.length === 0 ? (
        // Sections are enabled, there's just nothing in any of them today.
        <WidgetEmpty
          icon={Sun}
          title="Nothing on today"
          message="No overdue work, tasks due, or scheduled items"
        />
      ) : view === 'board' ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {populatedSections.map(section => (
            <div
              key={section.id}
              className="flex-shrink-0 w-[190px] flex flex-col"
              data-testid={`myday-column-${section.id}`}
            >
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                {renderSectionHeading(section)}
              </div>
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-0.5">
                {renderSectionBody(section, true)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {populatedSections.map(section => renderSection(section))}
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
