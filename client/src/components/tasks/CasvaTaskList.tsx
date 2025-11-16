import { Task } from "@shared/schema";
import { CasvaTaskRow } from "./CasvaTaskRow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";

export interface CasvaTaskListProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
  onAddTask?: () => void;
  showCheckboxes?: boolean;
  maxHeight?: string;
}

export function CasvaTaskList({ 
  tasks, 
  onEditTask, 
  onToggleComplete,
  onAddTask,
  showCheckboxes = false,
  maxHeight = "calc(100vh - 280px)"
}: CasvaTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">No tasks found</p>
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="h-9 px-4 rounded-md border border-border hover-elevate active-elevate-2 flex items-center gap-2 text-sm"
            data-testid="button-add-first-task"
          >
            <Plus className="h-4 w-4" />
            Add your first task
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 h-[60px] px-3 border-b-2 border-border bg-white sticky top-0 z-10">
        <div className="w-4 flex-shrink-0"></div>
        {showCheckboxes && <div className="w-5 flex-shrink-0"></div>}
        <div className="flex-1 text-xs font-medium text-muted-foreground">TASK</div>
        <div className="flex-shrink-0 w-32 text-xs font-medium text-muted-foreground">ASSIGNEE</div>
        <div className="flex-shrink-0 w-28 text-xs font-medium text-muted-foreground">DUE DATE</div>
        <div className="flex-shrink-0 w-24 text-xs font-medium text-muted-foreground text-right">STATUS</div>
        <div className="flex-shrink-0 w-6"></div>
      </div>

      {/* Task List */}
      <ScrollArea style={{ maxHeight }} className="w-full">
        <div className="divide-y-0">
          {tasks.map((task) => (
            <CasvaTaskRow
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onToggleComplete={onToggleComplete ? () => onToggleComplete(task) : undefined}
              showCheckbox={showCheckboxes}
              isDraggable={true}
            />
          ))}
        </div>
      </ScrollArea>
      
      {/* Inline Add Row */}
      {onAddTask && (
        <div 
          className="group flex items-center gap-3 h-10 px-3 transition-all duration-200 hover:bg-gray-50 cursor-pointer border-t border-border"
          onClick={onAddTask}
          data-testid="button-add-task-inline"
        >
          <div className="w-4 flex-shrink-0"></div>
          <Plus className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-500 group-hover:text-gray-700">Add task</span>
        </div>
      )}

      {/* Task Count Footer */}
      <div className="h-6 px-3 border-t border-border bg-white flex items-center justify-between text-xs text-muted-foreground">
        <span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
      </div>
    </div>
  );
}
