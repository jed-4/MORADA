import { Task } from "@shared/schema";
import { CasvaTaskRow } from "./CasvaTaskRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CasvaTaskListProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
  showCheckboxes?: boolean;
  maxHeight?: string;
}

export function CasvaTaskList({ 
  tasks, 
  onEditTask, 
  onToggleComplete,
  showCheckboxes = false,
  maxHeight = "calc(100vh - 280px)"
}: CasvaTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No tasks found</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <ScrollArea style={{ maxHeight }} className="w-full">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow className="hover:bg-transparent border-b-2 border-border h-[60px]">
              {showCheckboxes && <TableHead className="w-12 h-[60px] py-0 text-xs font-medium"></TableHead>}
              <TableHead className="text-xs font-medium h-[60px] py-0">Task</TableHead>
              <TableHead className="text-xs font-medium w-32 h-[60px] py-0">Status</TableHead>
              <TableHead className="text-xs font-medium w-32 h-[60px] py-0">Priority</TableHead>
              <TableHead className="text-xs font-medium w-40 h-[60px] py-0">Assignee</TableHead>
              <TableHead className="text-xs font-medium w-32 h-[60px] py-0">Due Date</TableHead>
              <TableHead className="w-12 h-[60px] py-0"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow 
                key={task.id} 
                className="group h-9 hover-elevate border-b border-border"
                data-testid={`task-row-${task.id}`}
              >
                <CasvaTaskRow
                  task={task}
                  onEdit={() => onEditTask(task)}
                  onToggleComplete={onToggleComplete ? () => onToggleComplete(task) : undefined}
                  showCheckbox={showCheckboxes}
                />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      
      {/* Task Count Footer */}
      <div className="h-6 px-2 border-t border-border bg-white flex items-center justify-between text-xs text-muted-foreground">
        <span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
      </div>
    </div>
  );
}
