import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileSpreadsheet, ChevronRight, Clock, CheckCircle, AlertCircle, Calendar, ListTodo, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from "date-fns";
import type { Estimate, Project, FieldOption, FieldCategory, ScheduleItem, Task } from "@shared/schema";
import type { Widget } from "@/types/widgets";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

interface ActionableItemsWidgetProps {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  isConfiguring: boolean;
  onCloseConfig: () => void;
  userId: string;
}

type ItemType = 'estimate' | 'schedule' | 'task';

interface ActionableItem {
  id: string;
  type: ItemType;
  name: string;
  status: string;
  statusColor: string;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  updatedAt: Date;
  dueDate?: Date;
  icon: React.ElementType;
  href: string;
}

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  estimate: 'Estimates',
  schedule: 'Schedule',
  task: 'Tasks',
};

export default function ActionableItemsWidget({
  widget,
  onUpdate,
  isConfiguring,
  onCloseConfig,
  userId,
}: ActionableItemsWidgetProps) {
  const { effectiveTimezone } = useTimezone();
  const config = (widget.config as {
    showEstimates?: boolean;
    showSchedule?: boolean;
    showTasks?: boolean;
    onlyMine?: boolean;
    maxItems?: number;
  }) || {};

  const showEstimates = config.showEstimates ?? true;
  const showSchedule = config.showSchedule ?? true;
  const showTasks = config.showTasks ?? false;
  const onlyMine = config.onlyMine ?? true;
  const maxItems = config.maxItems ?? 10;

  const [configState, setConfigState] = useState({
    showEstimates,
    showSchedule,
    showTasks,
    onlyMine,
    maxItems,
  });

  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
    enabled: showEstimates,
  });

  const { data: scheduleItems = [], isLoading: scheduleLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedule-items"],
    enabled: showSchedule,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: showTasks,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: fieldCategories = [], isLoading: categoriesLoading } = useQuery<FieldCategory[]>({
    queryKey: ["/api/field-categories"],
  });

  const { data: fieldOptions = [], isLoading: optionsLoading } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-options"],
  });

  const isLoading = (showEstimates && estimatesLoading) || 
                    (showSchedule && scheduleLoading) || 
                    (showTasks && tasksLoading) || 
                    categoriesLoading || optionsLoading;

  const projectMap = useMemo(() => {
    const map: Record<string, { name: string; color?: string }> = {};
    projects.forEach(p => {
      map[p.id] = { name: p.name, color: p.color || undefined };
    });
    return map;
  }, [projects]);

  const getActionableStatusKeys = (categoryKey: string) => {
    const category = fieldCategories.find(c => c.key === categoryKey);
    if (!category) return new Set<string>();
    const options = fieldOptions.filter(
      o => o.categoryId === category.id && o.isActionable === true && o.isActive !== false
    );
    return new Set(options.map(o => o.key));
  };

  const getStatusOption = (categoryKey: string, statusKey: string): FieldOption | undefined => {
    const category = fieldCategories.find(c => c.key === categoryKey);
    if (!category) return undefined;
    return fieldOptions.find(o => o.categoryId === category.id && o.key === statusKey);
  };

  const actionableItems = useMemo(() => {
    const items: ActionableItem[] = [];

    if (showEstimates) {
      const actionableEstimateStatuses = getActionableStatusKeys("estimate.status");
      estimates
        .filter(est => {
          if (!actionableEstimateStatuses.has(est.status)) return false;
          if (onlyMine) {
            const isOwner = est.ownerId === userId;
            const assignees = est.assigneeIds ?? [];
            const isAssignee = Array.isArray(assignees) && assignees.includes(userId);
            if (!isOwner && !isAssignee) return false;
          }
          return true;
        })
        .forEach(est => {
          const statusOption = getStatusOption("estimate.status", est.status);
          items.push({
            id: est.id,
            type: 'estimate',
            name: est.name,
            status: statusOption?.label || est.status,
            statusColor: statusOption?.color || '#6B7280',
            projectId: est.projectId,
            projectName: projectMap[est.projectId]?.name,
            projectColor: projectMap[est.projectId]?.color,
            updatedAt: new Date(est.updatedAt),
            icon: FileSpreadsheet,
            href: `/projects/${est.projectId}/estimates/${est.id}`,
          });
        });
    }

    if (showSchedule) {
      const actionableScheduleStatuses = getActionableStatusKeys("schedule_item.status");
      scheduleItems
        .filter(item => {
          if (!actionableScheduleStatuses.has(item.status || '')) return false;
          if (onlyMine) {
            const assignees = item.assigneeIds ?? [];
            if (!Array.isArray(assignees) || !assignees.includes(userId)) return false;
          }
          return true;
        })
        .forEach(item => {
          const statusOption = getStatusOption("schedule_item.status", item.status || '');
          const startDate = item.startDate ? new Date(item.startDate) : undefined;
          items.push({
            id: item.id,
            type: 'schedule',
            name: item.name,
            status: statusOption?.label || item.status || 'Scheduled',
            statusColor: statusOption?.color || '#3B82F6',
            projectId: item.projectId,
            projectName: projectMap[item.projectId]?.name,
            projectColor: projectMap[item.projectId]?.color,
            updatedAt: startDate || new Date(),
            dueDate: startDate,
            icon: Calendar,
            href: `/projects/${item.projectId}/schedule`,
          });
        });
    }

    if (showTasks) {
      const actionableTaskStatuses = getActionableStatusKeys("task.status");
      tasks
        .filter(task => {
          if (!actionableTaskStatuses.has(task.status || '')) return false;
          if (onlyMine && task.assigneeId !== userId) return false;
          return true;
        })
        .forEach(task => {
          const statusOption = getStatusOption("task.status", task.status || '');
          const dueDate = task.dueDate ? new Date(task.dueDate) : undefined;
          items.push({
            id: task.id.toString(),
            type: 'task',
            name: task.title,
            status: statusOption?.label || task.status || 'To Do',
            statusColor: statusOption?.color || '#8B5CF6',
            projectId: task.projectId || undefined,
            projectName: task.projectId ? projectMap[task.projectId]?.name : undefined,
            projectColor: task.projectId ? projectMap[task.projectId]?.color : undefined,
            updatedAt: dueDate || new Date(),
            dueDate,
            icon: ListTodo,
            href: task.projectId ? `/projects/${task.projectId}/tasks` : '/tasks',
          });
        });
    }

    return items
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return a.dueDate.getTime() - b.dueDate.getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, maxItems);
  }, [estimates, scheduleItems, tasks, projectMap, fieldCategories, fieldOptions, showEstimates, showSchedule, showTasks, onlyMine, userId, maxItems]);

  const hasAnyActionableStatuses = useMemo(() => {
    const estimateStatuses = getActionableStatusKeys("estimate.status");
    const scheduleStatuses = getActionableStatusKeys("schedule_item.status");
    const taskStatuses = getActionableStatusKeys("task.status");
    return (showEstimates && estimateStatuses.size > 0) ||
           (showSchedule && scheduleStatuses.size > 0) ||
           (showTasks && taskStatuses.size > 0);
  }, [fieldCategories, fieldOptions, showEstimates, showSchedule, showTasks]);

  const handleSaveConfig = () => {
    onUpdate({
      ...widget,
      config: configState,
    });
  };

  const formatDueDate = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isPast(date)) return `Overdue: ${formatInTimezone(date, effectiveTimezone, { month: 'short', day: 'numeric' })}`;
    return formatInTimezone(date, effectiveTimezone, { month: 'short', day: 'numeric' });
  };

  if (isConfiguring) {
    return (
      <div className="p-3 space-y-4">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Shows items with statuses marked as "actionable" in Settings &gt; Field Settings.
          </p>
          
          <div className="space-y-2 pb-2 border-b">
            <span className="text-xs font-medium">Item Types</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={configState.showEstimates}
                onCheckedChange={(checked) => 
                  setConfigState(prev => ({ ...prev, showEstimates: !!checked }))
                }
              />
              <span className="text-xs">Estimates</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={configState.showSchedule}
                onCheckedChange={(checked) => 
                  setConfigState(prev => ({ ...prev, showSchedule: !!checked }))
                }
              />
              <span className="text-xs">Schedule Items</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={configState.showTasks}
                onCheckedChange={(checked) => 
                  setConfigState(prev => ({ ...prev, showTasks: !!checked }))
                }
              />
              <span className="text-xs">Tasks</span>
            </label>
          </div>
          
          <label className="flex items-start gap-2 cursor-pointer pb-2 border-b">
            <Checkbox
              checked={configState.onlyMine}
              onCheckedChange={(checked) => 
                setConfigState(prev => ({ ...prev, onlyMine: !!checked }))
              }
              className="mt-0.5"
            />
            <div>
              <span className="text-xs font-medium">Only show my items</span>
              <p className="text-[10px] text-muted-foreground">Filter to items where you are assigned</p>
            </div>
          </label>

          <div className="pt-2">
            <label className="text-xs text-muted-foreground">Max items to show</label>
            <select
              value={configState.maxItems}
              onChange={(e) => setConfigState(prev => ({ ...prev, maxItems: parseInt(e.target.value) }))}
              className="w-full mt-1 h-7 text-xs rounded-md border bg-background px-2"
            >
              {[5, 10, 15, 20, 30].map(n => (
                <option key={n} value={n}>{n} items</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onCloseConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-12 bg-muted rounded-md" />
        ))}
      </div>
    );
  }

  if (!hasAnyActionableStatuses) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[120px]">
        <AlertCircle className="h-6 w-6 text-amber-500 mb-2" />
        <p className="text-xs text-muted-foreground">
          No statuses marked as actionable.
        </p>
        <Link href="/settings/fields">
          <Button variant="link" size="sm" className="h-6 text-[10px] mt-1">
            Configure in Field Settings
          </Button>
        </Link>
      </div>
    );
  }

  if (actionableItems.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full min-h-[120px]">
        <CheckCircle className="h-6 w-6 text-green-500 mb-2" />
        <p className="text-xs text-muted-foreground">All caught up! No actionable items.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {actionableItems.map(item => {
          const ItemIcon = item.icon;
          const isOverdue = item.dueDate && isPast(item.dueDate) && !isToday(item.dueDate);

          return (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.href}
              className="block"
            >
              <div className="p-2 border rounded-md hover-elevate cursor-pointer">
                <div className="flex items-start gap-2">
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-sm flex items-center justify-center text-white"
                    style={{ backgroundColor: item.statusColor }}
                  >
                    <ItemIcon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{item.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 flex-shrink-0">
                        {ITEM_TYPE_LABELS[item.type]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.dueDate ? (
                        <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          <Calendar className="h-2.5 w-2.5" />
                          {formatDueDate(item.dueDate)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDistanceToNow(item.updatedAt, { addSuffix: true })}
                        </span>
                      )}
                      {item.projectName && (
                        <span 
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                          style={{ backgroundColor: item.projectColor || '#6b7280' }}
                        >
                          {item.projectName}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
