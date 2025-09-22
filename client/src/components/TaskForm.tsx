import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type InsertTask } from "@shared/schema";
import { z } from "zod";
import { useProject } from "@/contexts/ProjectContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Check,
  Plus,
  X,
} from "lucide-react";

// Simple form schema for task creation/editing
const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["todo", "in-progress", "done"]).default("todo"),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(), // HTML date input returns string
  tags: z.array(z.string()).default([]),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  task?: Task; // If provided, we're editing; otherwise creating
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  initialStatus?: "todo" | "in-progress" | "done";
}

export default function TaskForm({ task, open, onOpenChange, trigger, initialStatus = "todo" }: TaskFormProps) {
  const [tagInput, setTagInput] = useState("");
  const { toast } = useToast();
  const { currentProject } = useProject();
  
  const isEditing = !!task;

  // Don't render if no project is selected
  if (!currentProject) {
    return null;
  }

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title || "",
      content: task?.content || "",
      priority: (task?.priority as "low" | "medium" | "high") || "medium",
      status: (task?.status as "todo" | "in-progress" | "done") || initialStatus,
      assigneeName: task?.assigneeName || "",
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : "",
      tags: (task?.tags as string[]) || [],
    },
  });

  // Watch tags to manage them
  const watchedTags = form.watch("tags");

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      // Convert form data to InsertTask format
      const payload: InsertTask = {
        title: data.title,
        content: data.content,
        author: "Current User", // TODO: Get from auth context
        type: "task",
        priority: data.priority,
        status: data.status,
        projectId: currentProject.id,
        assigneeName: data.assigneeName || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        tags: data.tags,
      };
      const response = await apiRequest("POST", "/api/tasks", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", currentProject.id] });
      toast({ title: "Task created successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to create task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (!task) throw new Error("No task to update");
      
      // Convert form data to update format
      const payload: Partial<InsertTask> = {
        title: data.title,
        content: data.content,
        priority: data.priority,
        status: data.status,
        assigneeName: data.assigneeName || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        tags: data.tags,
      };
      const response = await apiRequest("PATCH", `/api/tasks/${task.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", currentProject.id] });
      toast({ title: "Task updated successfully" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: TaskFormData) => {
    if (isEditing) {
      updateTaskMutation.mutate(data);
    } else {
      createTaskMutation.mutate(data);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !watchedTags?.includes(tagInput.trim())) {
      const newTags = [...(watchedTags || []), tagInput.trim()];
      form.setValue("tags", newTags);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = (watchedTags || []).filter(tag => tag !== tagToRemove);
    form.setValue("tags", newTags);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Task" : "Create New Task"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Make changes to your task here."
              : "Create a new task to track your work and progress."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Complete foundation inspection"
                      {...field}
                      data-testid="task-title-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the task details..."
                      rows={3}
                      {...field}
                      data-testid="task-description-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="task-priority-select">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="task-status-select">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assigneeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., John Smith"
                        {...field}
                        data-testid="task-assignee-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="task-due-date-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Tags Management */}
            <div className="space-y-2">
              <FormLabel>Tags</FormLabel>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                  data-testid="task-tag-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  disabled={!tagInput.trim() || watchedTags?.includes(tagInput.trim())}
                  data-testid="task-add-tag-button"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {watchedTags && watchedTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {watchedTags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                        data-testid={`task-remove-tag-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="task-form-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createTaskMutation.isPending || updateTaskMutation.isPending}
                data-testid="task-form-submit"
              >
                {createTaskMutation.isPending || updateTaskMutation.isPending ? 
                  (isEditing ? "Updating..." : "Creating...") :
                  (isEditing ? "Update Task" : "Create Task")
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}