import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import TaskBoard from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskModalAsana from "@/components/TaskModalAsana";
import type { User, Task } from "@shared/schema";

interface UserTasksProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserTasks({ user, isOwnPage }: UserTasksProps) {
  const [activeView, setActiveView] = useState<"list" | "board">("list");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch user's tasks
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: user.id }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?assigneeId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  // Fetch projects to show project badges
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Group tasks by project for display
  const tasksWithProjects = tasks.map(task => ({
    ...task,
    projectName: projects.find((p: any) => p.id === task.projectId)?.name || 'No Project'
  }));

  return (
    <div className="flex flex-col h-full" data-testid="user-tasks">
      {/* Header */}
      <div className="h-10 bg-white flex items-center justify-between px-4 gap-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">
            {isOwnPage ? 'My Tasks' : `${user.firstName}'s Tasks`}
          </h3>
          <Badge variant="outline" className="text-xs" data-testid="badge-task-count">
            {tasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "list" | "board")}>
            <TabsList className="h-8">
              <TabsTrigger value="list" className="text-xs" data-testid="tab-list">
                List
              </TabsTrigger>
              <TabsTrigger value="board" className="text-xs" data-testid="tab-board">
                Board
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {isOwnPage && (
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-create-task"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Task
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeView === "list" ? (
          <TaskListCompact
            tasks={tasksWithProjects}
            isLoading={isLoading}
            onTaskClick={(task) => setEditingTask(task)}
          />
        ) : (
          <TaskBoard
            tasks={tasksWithProjects}
            isLoading={isLoading}
            onTaskClick={(task) => setEditingTask(task)}
          />
        )}
      </div>

      {/* Task Modal */}
      {isOwnPage && (
        <>
          <TaskModalAsana
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
          />
          <TaskModalAsana
            task={editingTask || undefined}
            open={!!editingTask}
            onOpenChange={(open) => !open && setEditingTask(null)}
          />
        </>
      )}
    </div>
  );
}
