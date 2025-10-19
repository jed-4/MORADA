import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type InsertTask, type FieldCategoryWithOptions } from "@shared/schema";
import { z } from "zod";
import { useProject } from "@/contexts/ProjectContext";
import { logActivity } from "@/lib/activityLogger";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Check,
  Plus,
  X,
  Settings,
  FileText,
  RefreshCw,
  Clock,
} from "lucide-react";

// Create dynamic task form schema based on available status options
const createTaskFormSchema = (statusOptions: string[] = ["todo", "in-progress", "done"]) => {
  const validStatuses = statusOptions.length > 0 ? statusOptions : ["todo", "in-progress", "done"];
  return z.object({
    // Basic Info Tab
    title: z.string().min(1, "Title is required"),
    content: z.string().default(""),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    status: z.enum(validStatuses as [string, ...string[]]).default(validStatuses[0]),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(), // HTML date input returns string
  tags: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  projectId: z.string().optional(),
  // Advanced Tab
  category: z.string().default("General"),
  customFields: z.record(z.any()).default({}),
  parentTaskId: z.string().optional(),
  // Recurring Tab
  isRecurring: z.boolean().default(false),
  recurringType: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]).optional(),
  recurringInterval: z.number().min(1).default(1),
  recurringDays: z.array(z.number()).default([]),
  recurringStartDate: z.string().optional(),
    recurringEndDate: z.string().optional(),
  });
};

// Default schema for initial render
const defaultTaskFormSchema = createTaskFormSchema();

type TaskFormData = z.infer<ReturnType<typeof createTaskFormSchema>>;

interface TaskFormProps {
  task?: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  initialStatus?: "todo" | "in-progress" | "done";
  projectId: string;
}

export default function TaskForm({ task, open, onOpenChange, trigger, initialStatus = "todo", projectId }: TaskFormProps) {
  const [tagInput, setTagInput] = useState("");
  const [activeTab, setActiveTab] = useState("basic");
  const { toast } = useToast();
  const { currentProject } = useProject();
  
  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Extract task status options with fallback handling
  const taskStatusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const availableStatusKeys = statusOptions.map(opt => opt.key);
  
  // Extract task label options
  const taskLabelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = taskLabelCategory?.options || [];
  
  // Ensure we always have valid status options (stable during loading)
  const defaultStatusKeys = ["todo", "in-progress", "done"];
  const validStatusKeys = availableStatusKeys.length > 0 ? availableStatusKeys : defaultStatusKeys;
  
  // If editing an existing task, ensure its current status is included in the options
  const taskCurrentStatus = task?.status;
  const finalStatusKeys = taskCurrentStatus && !validStatusKeys.includes(taskCurrentStatus) 
    ? [...validStatusKeys, taskCurrentStatus] 
    : validStatusKeys;
    
  const taskFormSchema = createTaskFormSchema(finalStatusKeys);
  
  const isEditing = !!task;

  // Don't render if no projectId is provided
  if (!projectId) {
    return null;
  }

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      // Basic Info
      title: task?.title || "",
      content: task?.content || "",
      priority: (task?.priority as "low" | "medium" | "high") || "medium",
      status: task?.status || finalStatusKeys[0] || "todo",
      assigneeName: task?.assigneeName || "",
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : "",
      tags: (task?.tags as string[]) || [],
      labels: (task?.labels as string[]) || [],
      projectId: task?.projectId || projectId,
      // Advanced
      category: task?.category || "General",
      customFields: (task?.customFields as Record<string, any>) || {},
      parentTaskId: task?.parentTaskId || undefined,
      // Recurring
      isRecurring: task?.isRecurring || false,
      recurringType: task?.recurringType as "daily" | "weekly" | "monthly" | "yearly" | "custom" | undefined,
      recurringInterval: task?.recurringInterval || 1,
      recurringDays: (task?.recurringDays as number[]) || [],
      recurringStartDate: task?.recurringStartDate ? new Date(task.recurringStartDate).toISOString().split('T')[0] : "",
      recurringEndDate: task?.recurringEndDate ? new Date(task.recurringEndDate).toISOString().split('T')[0] : "",
    },
  });

  // Watch fields for reactive behavior
  const watchedTags = form.watch("tags");
  const watchedLabels = form.watch("labels");
  const watchedIsRecurring = form.watch("isRecurring");
  const watchedRecurringType = form.watch("recurringType");

  // Fetch all projects for project dropdown
  const { data: allProjects = [] } = useQuery({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  // Fetch potential parent tasks for subtask selection
  const { data: parentTasks = [] } = useQuery({
    queryKey: ["/api/tasks", projectId, "parents"],
    queryFn: async () => {
      const response = await apiRequest(`/api/tasks?projectId=${projectId}`, "GET");
      return Array.isArray(response) ? response.filter((t: Task) => t.id !== task?.id) : [];
    },
    enabled: open && !!projectId,
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      const payload: InsertTask = {
        title: data.title,
        content: data.content,
        author: "Current User",
        type: "task",
        priority: data.priority,
        status: data.status,
        projectId: data.projectId || projectId,
        assigneeName: data.assigneeName || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        tags: Array.isArray(data.tags) ? data.tags : [],
        labels: Array.isArray(data.labels) ? data.labels : [],
        // Advanced fields
        category: data.category,
        customFields: data.customFields,
        parentTaskId: data.parentTaskId || undefined,
        // Recurring fields
        isRecurring: data.isRecurring,
        recurringType: data.recurringType,
        recurringInterval: data.isRecurring ? data.recurringInterval : undefined,
        recurringDays: data.isRecurring ? data.recurringDays : undefined,
        recurringStartDate: data.isRecurring && data.recurringStartDate ? new Date(data.recurringStartDate) : undefined,
        recurringEndDate: data.isRecurring && data.recurringEndDate ? new Date(data.recurringEndDate) : undefined,
      };
      return await apiRequest(`/api/tasks`, "POST", payload);
    },
    onSuccess: (createdTask: Task) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", projectId] });
      toast({ title: "Task created successfully" });
      
      const userName = createdTask.author || "User";
      logActivity({
        projectId: createdTask.projectId || projectId,
        userId: "current-user",
        activityType: "task",
        action: "created",
        description: `${userName} created task '${createdTask.title}'`,
        entityId: createdTask.id,
        entityName: createdTask.title,
        metadata: {},
      });
      
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
      
      const payload: Partial<InsertTask> = {
        title: data.title,
        content: data.content,
        priority: data.priority,
        status: data.status,
        projectId: data.projectId,
        assigneeName: data.assigneeName || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        tags: Array.isArray(data.tags) ? data.tags : [],
        labels: Array.isArray(data.labels) ? data.labels : [],
        // Advanced fields
        category: data.category,
        customFields: data.customFields,
        parentTaskId: data.parentTaskId || undefined,
        // Recurring fields
        isRecurring: data.isRecurring,
        recurringType: data.recurringType,
        recurringInterval: data.isRecurring ? data.recurringInterval : undefined,
        recurringDays: data.isRecurring ? data.recurringDays : undefined,
        recurringStartDate: data.isRecurring && data.recurringStartDate ? new Date(data.recurringStartDate) : undefined,
        recurringEndDate: data.isRecurring && data.recurringEndDate ? new Date(data.recurringEndDate) : undefined,
      };
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", payload);
    },
    onSuccess: (updatedTask: Task) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", projectId] });
      toast({ title: "Task updated successfully" });
      
      const oldStatus = task?.status;
      const newStatus = updatedTask.status;
      const isCompletion = newStatus === "done" && oldStatus !== "done";
      const action = isCompletion ? "completed" : "updated";
      const actionText = isCompletion ? "completed" : "updated";
      const userName = updatedTask.author || "User";
      
      logActivity({
        projectId: updatedTask.projectId || projectId,
        userId: "current-user",
        activityType: "task",
        action,
        description: `${userName} ${actionText} task '${updatedTask.title}'`,
        entityId: updatedTask.id,
        entityName: updatedTask.title,
        metadata: {},
      });
      
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

  const addLabel = (labelKey: string) => {
    if (!watchedLabels?.includes(labelKey)) {
      const newLabels = [...(watchedLabels || []), labelKey];
      form.setValue("labels", newLabels);
    }
  };

  const removeLabel = (labelToRemove: string) => {
    const newLabels = (watchedLabels || []).filter(label => label !== labelToRemove);
    form.setValue("labels", newLabels);
  };

  const weekDays = [
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
    { value: 0, label: "Sunday" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced
                </TabsTrigger>
                <TabsTrigger value="recurring" className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Recurring
                </TabsTrigger>
              </TabsList>
              
              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4">
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
                          rows={4}
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
                            {/* Use dynamic options if available, otherwise show loading fallback */}
                            {statusOptions.length > 0 ? (
                              statusOptions.map((option) => (
                                <SelectItem key={option.key} value={option.key}>
                                  <div className="flex items-center gap-2">
                                    {option.color && (
                                      <div 
                                        className="w-3 h-3 rounded-full border border-border" 
                                        style={{ backgroundColor: option.color }}
                                      />
                                    )}
                                    {option.name}
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              /* Fallback during loading */
                              finalStatusKeys.map((key) => {
                                const labels: Record<string, string> = {
                                  "todo": "To Do",
                                  "in-progress": "In Progress", 
                                  "done": "Done"
                                };
                                return (
                                  <SelectItem key={key} value={key}>
                                    {labels[key] || key}
                                  </SelectItem>
                                );
                              })
                            )}
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
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="task-project-select">
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allProjects.map((proj: any) => (
                              <SelectItem key={proj.id} value={proj.id}>
                                {proj.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

                {/* Labels Field */}
                <div className="space-y-2">
                  <FormLabel>Labels</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {labelOptions.map((option) => {
                      const isSelected = watchedLabels?.includes(option.key);
                      return (
                        <Button
                          key={option.key}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            if (isSelected) {
                              removeLabel(option.key);
                            } else {
                              addLabel(option.key);
                            }
                          }}
                          className="text-xs"
                          style={{
                            backgroundColor: isSelected ? option.color || undefined : undefined,
                            borderColor: option.color || undefined,
                            color: isSelected ? "#ffffff" : option.color || undefined,
                          }}
                          data-testid={`task-label-${option.key}`}
                        >
                          {option.name}
                          {isSelected && <Check className="h-3 w-3 ml-1" />}
                        </Button>
                      );
                    })}
                  </div>
                  {watchedLabels && watchedLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {watchedLabels.map((labelKey, index) => {
                        const labelOption = labelOptions.find(opt => opt.key === labelKey);
                        return (
                          <Badge 
                            key={index} 
                            variant="secondary" 
                            className="text-xs"
                            style={{
                              backgroundColor: labelOption?.color || "#6B7280",
                              color: "#ffffff"
                            }}
                          >
                            {labelOption?.name || labelKey}
                            <button
                              type="button"
                              onClick={() => removeLabel(labelKey)}
                              className="ml-1 hover:text-destructive"
                              data-testid={`task-remove-label-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
              
              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Site Work, Inspections"
                            {...field}
                            data-testid="task-category-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="parentTaskId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent Task (Subtask of)</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                          value={field.value || "none"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="task-parent-select">
                              <SelectValue placeholder="Select parent task (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No parent task</SelectItem>
                            {parentTasks.map((parentTask: Task) => (
                              <SelectItem key={parentTask.id} value={parentTask.id}>
                                {parentTask.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Custom Fields</CardTitle>
                    <CardDescription>
                      Project-specific data fields (coming soon)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Custom field management will be available in a future update.
                    </p>
                  </CardContent>
                </Card>

                {/* Timestamps display for editing mode */}
                {isEditing && task && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Created:</span>
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Updated:</span>
                        <span>{new Date(task.updatedAt).toLocaleString()}</span>
                      </div>
                      {task.completedAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Completed:</span>
                          <span>{new Date(task.completedAt).toLocaleString()}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              {/* Recurring Tab */}
              <TabsContent value="recurring" className="space-y-6">
                <FormField
                  control={form.control}
                  name="isRecurring"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="task-recurring-checkbox"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Make this a recurring task</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                {watchedIsRecurring && (
                  <div className="space-y-6">
                    {/* Start Date */}
                    <FormField
                      control={form.control}
                      name="recurringStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="task-recurring-start-date-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Frequency and Interval */}
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="recurringType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="task-recurring-type-select">
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="yearly">Yearly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="recurringInterval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Every</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="1"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                data-testid="task-recurring-interval-input"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Weekly Day Selection */}
                    {watchedRecurringType === "weekly" && (
                      <FormField
                        control={form.control}
                        name="recurringDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat on days</FormLabel>
                            <div className="grid grid-cols-7 gap-2">
                              {weekDays.map((day) => (
                                <div 
                                  key={day.value} 
                                  className="flex flex-col items-center space-y-2 p-2 rounded-lg border hover:bg-accent"
                                >
                                  <Checkbox
                                    checked={field.value.includes(day.value)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...field.value, day.value]);
                                      } else {
                                        field.onChange(field.value.filter((d: number) => d !== day.value));
                                      }
                                    }}
                                    data-testid={`task-recurring-day-${day.value}`}
                                  />
                                  <label className="text-xs font-medium cursor-pointer">
                                    {day.label.slice(0, 3)}
                                  </label>
                                </div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Monthly Date Selection */}
                    {watchedRecurringType === "monthly" && (
                      <FormField
                        control={form.control}
                        name="recurringDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat on dates</FormLabel>
                            <div className="grid grid-cols-7 gap-2">
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((date) => (
                                <Button
                                  key={date}
                                  type="button"
                                  variant={field.value.includes(date) ? "default" : "outline"}
                                  size="sm"
                                  className="h-10 w-10"
                                  onClick={() => {
                                    if (field.value.includes(date)) {
                                      field.onChange(field.value.filter((d: number) => d !== date));
                                    } else {
                                      field.onChange([...field.value, date]);
                                    }
                                  }}
                                  data-testid={`task-recurring-date-${date}`}
                                >
                                  {date}
                                </Button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Select one or more dates. If a month doesn't have the selected date, it will be skipped.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* End Date */}
                    <FormField
                      control={form.control}
                      name="recurringEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date (optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="task-recurring-end-date-input"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
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
                {createTaskMutation.isPending || updateTaskMutation.isPending ? "Saving..." : (isEditing ? "Update Task" : "Create Task")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}