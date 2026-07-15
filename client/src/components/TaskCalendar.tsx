import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { User } from "lucide-react";
import type { Task, FieldCategoryWithOptions } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getPriorityStyle } from "@/lib/priorityConfig";
import { cn } from "@/lib/utils";
import {
  MoradaCalendar,
  type MoradaCalendarEvent,
  type MoradaCalendarView,
} from "@/components/calendar/MoradaCalendar";

interface TaskCalendarProps {
  tasks: Task[];
  projectId: string;
  onTaskClick: (task: Task) => void;
  currentDate: Date;
  /** Accepts legacy react-big-calendar view strings ("month" | "week" | "day" | "agenda" | "work_week"). */
  currentView: string;
  onNavigate: (date: Date) => void;
  onViewChange: (view: string) => void;
}

function toMoradaView(view: string): MoradaCalendarView {
  if (view === "month") return "month";
  if (view === "week" || view === "work_week") return "week";
  return "agenda";
}

const TaskCalendarEvent = ({ event }: { event: MoradaCalendarEvent }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const task = event.meta?.task as Task;

  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Find the task status category and its completed option
  const statusCategory = fieldCategories.find((cat) => cat.key === "task.status");
  const completedOption = statusCategory?.options.find((opt) => opt.isCompleted);
  const defaultOption = statusCategory?.options.find((opt) => opt.isDefault);

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: Partial<Task>) => {
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.projectId] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task status.",
        variant: "destructive",
      });
    },
  });

  const handleCompleteToggle = (checked: boolean | string) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }

    // Set status based on checked state
    const newStatus = checked ? completedOption.key : defaultOption?.key || "todo";
    updateTaskMutation.mutate({ status: newStatus });
  };

  const priorityStyle = getPriorityStyle(task.priority || "medium");

  const isCompleted = task.status === completedOption?.key;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted;

  return (
    <div
      className={cn("w-full rounded px-1.5 py-0.5 text-xs", isCompleted && "opacity-60")}
      style={
        isOverdue
          ? { backgroundColor: "hsl(var(--coral) / 0.18)", color: "hsl(var(--coral))" }
          : { backgroundColor: `${priorityStyle.color}20`, color: priorityStyle.color }
      }
      data-testid={`calendar-task-${task.id}`}
    >
      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleCompleteToggle}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 shrink-0"
          data-testid={`checkbox-task-${task.id}`}
        />
        <span className={cn("min-w-0 truncate font-medium", isCompleted && "line-through")}>
          {task.title}
        </span>
      </div>
      {task.assigneeName && (
        <div className="mt-0.5 flex items-center gap-1 opacity-70">
          <User className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate text-data">{task.assigneeName}</span>
        </div>
      )}
    </div>
  );
};

export function TaskCalendar({
  tasks,
  projectId: _projectId,
  onTaskClick,
  currentDate,
  currentView,
  onNavigate,
  onViewChange,
}: TaskCalendarProps) {
  // Convert tasks to calendar events
  const events: MoradaCalendarEvent[] = useMemo(() => {
    return tasks
      .filter((task) => task.dueDate)
      .map((task) => ({
        id: task.id,
        title: task.title,
        start: new Date(task.dueDate!),
        allDay: true,
        color: getPriorityStyle(task.priority || "medium").color,
        meta: { task },
      }));
  }, [tasks]);

  return (
    <div className="flex h-full w-full flex-col" data-testid="task-calendar">
      <div className="min-h-0 flex-1">
        <MoradaCalendar
          events={events}
          view={toMoradaView(currentView)}
          onViewChange={(view) => onViewChange(view)}
          date={currentDate}
          onDateChange={onNavigate}
          onEventClick={(event) => onTaskClick(event.meta?.task as Task)}
          renderEvent={(event) => <TaskCalendarEvent event={event} />}
          hideHeader
        />
      </div>
    </div>
  );
}
