import { MobileHeader } from "@/components/MobileHeader";
import { Plus, Search, Loader2, Check, Trash2, Filter, LayoutList, LayoutGrid } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Task, Project } from "@shared/schema";
import { useState, useMemo } from "react";
import { SwipeableCard } from "@/components/SwipeableCard";
import { TaskDetailSheet } from "@/components/TaskDetailSheet";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";
import { BottomSheet } from "@/components/BottomSheet";

export function Tasks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: true,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, projectFilter, searchQuery]);

  // Group tasks by status for board view
  const tasksByStatus = useMemo(() => {
    return {
      todo: filteredTasks.filter(t => t.status === "todo"),
      "in-progress": filteredTasks.filter(t => t.status === "in-progress"),
      done: filteredTasks.filter(t => t.status === "done"),
    };
  }, [filteredTasks]);

  const activeFiltersCount = [statusFilter, priorityFilter, projectFilter].filter(f => f !== "all").length;

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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Tasks" 
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode(viewMode === "list" ? "board" : "list")}
              className="p-2 hover-elevate active-elevate-2 rounded-md"
              data-testid="button-toggle-view"
            >
              {viewMode === "list" ? <LayoutGrid className="w-5 h-5" /> : <LayoutList className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsFilterOpen(true)}
              className="p-2 hover-elevate active-elevate-2 rounded-md relative"
              data-testid="button-filter-tasks"
            >
              <Filter className="w-5 h-5" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        }
      />
      
      {/* Search Bar */}
      <div className="bg-card border-b px-4 py-3">
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
        ) : viewMode === "list" ? (
          <div className="p-4 space-y-3">
            {filteredTasks.map((task) => (
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
            {filteredTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No tasks found</p>
              </div>
            )}
          </div>
        ) : (
          /* Board View */
          <div className="flex gap-3 p-3 overflow-x-auto min-h-0">
            {(["todo", "in-progress", "done"] as const).map((status) => (
              <div key={status} className="flex-shrink-0 w-72 flex flex-col">
                <div className={`px-3 py-2 rounded-t-lg font-medium text-sm ${
                  status === "done" ? "bg-green-500/10 text-green-700" :
                  status === "in-progress" ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {status === "todo" ? "To Do" : status === "in-progress" ? "In Progress" : "Done"}
                  <span className="ml-2 text-xs opacity-70">({tasksByStatus[status].length})</span>
                </div>
                <div className="flex-1 bg-muted/30 rounded-b-lg p-2 space-y-2 overflow-y-auto max-h-[60vh]">
                  {tasksByStatus[status].map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskClick(task)}
                      className="bg-card rounded-lg p-3 border hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`task-board-${task.id}`}
                    >
                      <h4 className="font-medium text-sm mb-1 line-clamp-2">{task.title}</h4>
                      <div className="flex items-center gap-2">
                        {task.priority && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            task.priority === "high" ? "bg-destructive/10 text-destructive" :
                            task.priority === "medium" ? "bg-primary/10 text-primary" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {task.priority}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasksByStatus[status].length === 0 && (
                    <div className="text-center py-4 text-muted-foreground text-xs">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* FAB for creating task */}
      <button
        onClick={() => setIsCreateOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center"
        data-testid="fab-create-task"
      >
        <Plus className="w-6 h-6 text-primary-foreground" />
      </button>

      {/* Filter Bottom Sheet */}
      <BottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filter Tasks"
      >
        <div className="p-4 space-y-6">
          {/* Status Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "All", value: "all" },
                { label: "To Do", value: "todo" },
                { label: "In Progress", value: "in-progress" },
                { label: "Done", value: "done" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={`px-3 h-8 rounded-md text-sm font-medium ${
                    statusFilter === filter.value
                      ? "bg-primary text-primary-foreground"
                      : "border hover-elevate"
                  }`}
                  data-testid={`filter-status-${filter.value}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Priority</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "All", value: "all" },
                { label: "High", value: "high" },
                { label: "Medium", value: "medium" },
                { label: "Low", value: "low" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setPriorityFilter(filter.value)}
                  className={`px-3 h-8 rounded-md text-sm font-medium ${
                    priorityFilter === filter.value
                      ? "bg-primary text-primary-foreground"
                      : "border hover-elevate"
                  }`}
                  data-testid={`filter-priority-${filter.value}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project Filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Project</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setProjectFilter("all")}
                className={`px-3 h-8 rounded-md text-sm font-medium ${
                  projectFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "border hover-elevate"
                }`}
                data-testid="filter-project-all"
              >
                All Projects
              </button>
              {projects.slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  onClick={() => setProjectFilter(project.id)}
                  className={`px-3 h-8 rounded-md text-sm font-medium truncate max-w-[150px] ${
                    projectFilter === project.id
                      ? "bg-primary text-primary-foreground"
                      : "border hover-elevate"
                  }`}
                  data-testid={`filter-project-${project.id}`}
                >
                  {project.name}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Filters */}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setStatusFilter("all");
                setPriorityFilter("all");
                setProjectFilter("all");
              }}
              className="w-full h-10 rounded-md border text-sm font-medium hover-elevate"
              data-testid="button-clear-filters"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Create Task Sheet - placeholder for now */}
      <BottomSheet
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New Task"
      >
        <div className="p-4 text-center text-muted-foreground">
          <p>Task creation form coming soon</p>
        </div>
      </BottomSheet>

      <TaskDetailSheet
        task={selectedTask}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onSave={handleSaveTask}
      />
    </div>
  );
}
