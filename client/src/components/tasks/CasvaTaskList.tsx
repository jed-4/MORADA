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
    <div className="border rounded-lg bg-card overflow-hidden">
      <ScrollArea style={{ maxHeight }} className="w-full">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/50 z-10">
            <TableRow className="hover:bg-transparent border-b-2 h-10">
              {showCheckboxes && <TableHead className="w-12 h-10 py-2"></TableHead>}
              <TableHead className="font-semibold h-10 py-2">Task</TableHead>
              <TableHead className="font-semibold w-32 h-10 py-2">Status</TableHead>
              <TableHead className="font-semibold w-32 h-10 py-2">Priority</TableHead>
              <TableHead className="font-semibold w-40 h-10 py-2">Assignee</TableHead>
              <TableHead className="font-semibold w-32 h-10 py-2">Due Date</TableHead>
              <TableHead className="w-12 h-10 py-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow 
                key={task.id} 
                className="group casva-row h-10 hover:bg-accent/5 transition-colors border-b"
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
      <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <span>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
        <span className="text-primary font-medium">20+ items visible</span>
      </div>
    </div>
  );
}
