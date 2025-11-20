import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search, Loader2, Check, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Task } from "@shared/schema";
import { useState } from "react";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TaskDetailSheet } from "@/components/TaskDetailSheet";
import { apiRequest, queryClient } from "@lib/queryClient";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function Tasks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: true,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}/status`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const handleCompleteTask = (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskMutation.mutate({ taskId: task.id, status: newStatus });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsDetailOpen(true);
  };

  const handleSaveTask = (updatedTask: Partial<Task>) => {
    if (!updatedTask.id) return;
    updateTaskMutation.mutate({ 
      taskId: updatedTask.id, 
      status: updatedTask.status || "todo" 
    });
  };

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="Tasks" />
      
      {/* Search and Filter Bar */}
      <div className="bg-card border-b px-4 py-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm"
            data-testid="input-search-tasks"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto">
          {[
            { label: "All", value: "all" },
            { label: "To Do", value: "todo" },
            { label: "In Progress", value: "in-progress" },
            { label: "Done", value: "done" },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 h-7 rounded-md text-xs font-medium whitespace-nowrap ${
                statusFilter === filter.value
                  ? "bg-[#bba7db] text-white"
                  : "border hover-elevate"
              }`}
              data-testid={`filter-${filter.value}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {tasks
              .filter((task) => {
                if (statusFilter !== "all" && task.status !== statusFilter) return false;
                if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
              })
              .map((task) => (
                <SwipeableCard
                  key={task.id}
                  onSwipeLeft={() => handleCompleteTask(task)}
                  onSwipeRight={() => handleDeleteTask(task.id)}
                  leftAction={{
                    icon: <Check className="w-5 h-5" />,
                    color: "bg-green-500",
                    label: task.status === "done" ? "Reopen" : "Complete",
                  }}
                  rightAction={{
                    icon: <Trash2 className="w-5 h-5" />,
                    color: "bg-destructive",
                    label: "Delete",
                  }}
                >
                  <div
                    className="bg-card rounded-xl p-4 border hover-elevate active-elevate-2"
                    onClick={() => handleTaskClick(task)}
                    data-testid={`task-card-${task.id}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-sm flex-1">{task.title}</h3>
                      {task.priority && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          task.priority === "high" ? "bg-destructive/10 text-destructive" :
                          task.priority === "medium" ? "bg-primary/10 text-primary" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                    {task.content && (
                      <div className="text-xs text-muted-foreground mb-2">{task.content}</div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        task.status === "done" ? "bg-green-500/10 text-green-600" :
                        task.status === "in-progress" ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {task.status === "todo" ? "To Do" :
                         task.status === "in-progress" ? "In Progress" :
                         task.status === "done" ? "Done" : task.status}
                      </span>
                      {task.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </SwipeableCard>
              ))}
            {tasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No tasks found</p>
              </div>
            )}
          </div>
        )}
      </main>

      <TaskDetailSheet
        task={selectedTask}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onSave={handleSaveTask}
      />
    </div>
  );
}
