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
            <TableRow className="hover:bg-transparent border-b-2">
              {showCheckboxes && <TableHead className="w-12"></TableHead>}
              <TableHead className="font-semibold">Task</TableHead>
              <TableHead className="font-semibold w-32">Status</TableHead>
              <TableHead className="font-semibold w-32">Priority</TableHead>
              <TableHead className="font-semibold w-40">Assignee</TableHead>
              <TableHead className="font-semibold w-32">Due Date</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id} className="border-0 hover:bg-transparent h-10">
                <td colSpan={7} className="p-0">
                  <CasvaTaskRow
                    task={task}
                    onEdit={() => onEditTask(task)}
                    onToggleComplete={onToggleComplete ? () => onToggleComplete(task) : undefined}
                  />
                </td>
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
