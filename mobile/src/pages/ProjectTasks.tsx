import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Task, Project } from "@shared/schema";
import { useState } from "react";
import { useRoute } from "wouter";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TaskDetailSheet } from "@/components/TaskDetailSheet";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";

export function ProjectTasks() {
  const [, params] = useRoute("/projects/:id/tasks");
  const projectId = params?.id;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Project not found");
        }
        if (res.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to fetch project");
      }
      return res.json();
    },
    enabled: !!projectId,
    retry: false,
  });

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { projectId }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/tasks?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Tasks not found");
        }
        if (res.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to fetch tasks");
      }
      return res.json();
    },
    enabled: !!projectId,
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { projectId }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { projectId }] });
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

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sortedTasks = filteredTasks.sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title={project?.name || "Project Tasks"} showBack />
      
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

      <main 
        ref={pullToRefresh.containerRef}
        className="flex-1 overflow-y-auto"
        {...pullToRefresh.touchHandlers}
      >
        <PullToRefreshIndicator 
          isRefreshing={pullToRefresh.isRefreshing}
          pullDistance={pullToRefresh.pullDistance}
          pullPercentage={pullToRefresh.pullPercentage}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 pt-4 pb-safe space-y-2">
            {sortedTasks.map((task) => (
              <SwipeableCard
                key={task.id}
                onSwipeRight={() => handleCompleteTask(task)}
                onSwipeLeft={() => handleDeleteTask(task.id)}
                onClick={() => handleTaskClick(task)}
                data-testid={`task-card-${task.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${
                    task.priority === "high" ? "bg-red-500" :
                    task.priority === "medium" ? "bg-yellow-500" :
                    "bg-muted"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-sm mb-0.5 ${
                      task.status === "done" ? "line-through text-muted-foreground" : ""
                    }`}>
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.dueDate && (
                        <span className={
                          new Date(task.dueDate) < new Date() && task.status !== "done"
                            ? "text-destructive font-medium"
                            : ""
                        }>
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {task.assignedToName && (
                        <>
                          <span>•</span>
                          <span>{task.assignedToName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                    task.status === "done" ? "bg-green-500/10 text-green-600" :
                    task.status === "in-progress" ? "bg-blue-500/10 text-blue-600" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {task.status === "done" ? "Done" :
                     task.status === "in-progress" ? "In Progress" :
                     "To Do"}
                  </span>
                </div>
              </SwipeableCard>
            ))}
            
            {sortedTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No tasks found for this project</p>
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
