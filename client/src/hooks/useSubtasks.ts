import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Task, InsertTask } from "@shared/schema";
import { logActivity } from "@/lib/activityLogger";

// Hook to fetch subtasks for a parent task
export function useSubtasks(parentTaskId: string | undefined) {
  return useQuery<Task[]>({
    queryKey: [`/api/tasks/${parentTaskId}/subtasks`],
    enabled: !!parentTaskId,
  });
}

// Hook to create a new subtask
export function useCreateSubtask() {
  return useMutation({
    mutationFn: async ({ parentTaskId, subtask }: { parentTaskId: string; subtask: InsertTask }) => {
      const response = await apiRequest(`/api/tasks/${parentTaskId}/subtasks`, "POST", subtask);
      return response.json();
    },
    onSuccess: (task: Task, { parentTaskId }) => {
      // Invalidate subtasks for the parent task
      queryClient.invalidateQueries({ queryKey: [`/api/tasks/${parentTaskId}/subtasks`] });
      // Also invalidate the main tasks list to reflect any changes
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      
      // Log activity if we have task details
      if (task && task.projectId) {
        logActivity({
          projectId: task.projectId,
          userId: "current-user",
          activityType: "task",
          action: "created",
          description: `User created task '${task.title}'`,
          entityId: task.id,
          entityName: task.title,
          metadata: {},
        });
      }
    },
  });
}

// Hook to update a subtask (uses existing task update API)
export function useUpdateSubtask() {
  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const response = await apiRequest(`/api/tasks/${taskId}`, "PATCH", updates);
      return response.json();
    },
    onSuccess: (updatedTask: Task) => {
      // Invalidate subtasks for the parent task if it exists
      if (updatedTask.parentTaskId) {
        queryClient.invalidateQueries({ queryKey: [`/api/tasks/${updatedTask.parentTaskId}/subtasks`] });
      }
      // Also invalidate the main tasks list
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      
      // Log activity if we have task details
      if (updatedTask && updatedTask.projectId) {
        const action = updatedTask.status === "done" ? "completed" : "updated";
        logActivity({
          projectId: updatedTask.projectId,
          userId: "current-user",
          activityType: "task",
          action,
          description: `User ${action} task '${updatedTask.title}'`,
          entityId: updatedTask.id,
          entityName: updatedTask.title,
          metadata: {},
        });
      }
    },
  });
}

// Hook to delete a subtask (uses existing task delete API)
export function useDeleteSubtask() {
  return useMutation({
    mutationFn: async ({ taskId, parentTaskId, task }: { taskId: string; parentTaskId?: string; task?: Task }) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
      return { taskId, parentTaskId, task };
    },
    onSuccess: ({ taskId, parentTaskId, task }) => {
      // Invalidate the specific parent's subtasks if we have the parent ID
      if (parentTaskId) {
        queryClient.invalidateQueries({ queryKey: [`/api/tasks/${parentTaskId}/subtasks`] });
      }
      // Also invalidate the main tasks list to reflect any changes
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      
      // Log activity if we have task details
      if (task && task.projectId) {
        const userName = task.author || "User";
        logActivity({
          projectId: task.projectId,
          userId: "current-user",
          activityType: "task",
          action: "deleted",
          description: `${userName} deleted task '${task.title}'`,
          entityId: task.id,
          entityName: task.title,
          metadata: {},
        });
      }
    },
  });
}