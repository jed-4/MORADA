import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Task, InsertTask } from "@shared/schema";

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
      const response = await apiRequest("POST", `/api/tasks/${parentTaskId}/subtasks`, subtask);
      return response.json();
    },
    onSuccess: (_, { parentTaskId }) => {
      // Invalidate subtasks for the parent task
      queryClient.invalidateQueries({ queryKey: [`/api/tasks/${parentTaskId}/subtasks`] });
      // Also invalidate the main tasks list to reflect any changes
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });
}

// Hook to update a subtask (uses existing task update API)
export function useUpdateSubtask() {
  return useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, updates);
      return response.json();
    },
    onSuccess: (updatedTask: Task) => {
      // Invalidate subtasks for the parent task if it exists
      if (updatedTask.parentTaskId) {
        queryClient.invalidateQueries({ queryKey: [`/api/tasks/${updatedTask.parentTaskId}/subtasks`] });
      }
      // Also invalidate the main tasks list
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });
}

// Hook to delete a subtask (uses existing task delete API)
export function useDeleteSubtask() {
  return useMutation({
    mutationFn: async ({ taskId, parentTaskId }: { taskId: string; parentTaskId?: string }) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}`);
      return { taskId, parentTaskId };
    },
    onSuccess: ({ taskId, parentTaskId }) => {
      // Invalidate the specific parent's subtasks if we have the parent ID
      if (parentTaskId) {
        queryClient.invalidateQueries({ queryKey: [`/api/tasks/${parentTaskId}/subtasks`] });
      }
      // Also invalidate the main tasks list to reflect any changes
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });
}