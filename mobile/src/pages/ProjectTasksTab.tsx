import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Task } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TaskDetailSheet } from "@/components/TaskDetailSheet";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";

export function ProjectTasksTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/tasks?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}/status`, "PATCH", { status });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const handleCompleteTask = (task: Task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskMutation.mutate({ taskId: task.id, status: newStatus });
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId);
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-tasks"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {(["all", "todo", "in_progress", "done"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`h-6 px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? "bg-[#bba7db] text-white"
                  : "bg-muted text-muted-foreground hover-elevate"
              }`}
              data-testid={`filter-${status}`}
            >
              {status === "all" ? "All" : status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.handlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No tasks found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <SwipeableCard
                key={task.id}
                onComplete={() => handleCompleteTask(task)}
                onDelete={() => handleDeleteTask(task.id)}
                isCompleted={task.status === "done"}
                data-testid={`task-card-${task.id}`}
              >
                <div
                  onClick={() => {
                    setSelectedTask(task);
                    setIsDetailOpen(true);
                  }}
                  className="flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <div className={`h-6 px-2 flex items-center justify-center rounded-md text-xs font-medium ${
                    task.status === "done" ? "bg-green-500/10 text-green-600" :
                    task.status === "in_progress" ? "bg-blue-500/10 text-blue-600" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {task.status === "in_progress" ? "In Progress" : task.status}
                  </div>
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}
      </div>

      <button
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center"
        data-testid="button-add-task"
      >
        <Plus className="w-6 h-6" />
      </button>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}
