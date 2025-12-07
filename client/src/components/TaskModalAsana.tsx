import { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  X,
  Heart,
  Paperclip,
  MoreHorizontal,
  ChevronDown,
  Plus,
  GripVertical,
  Pencil,
  Bell,
  FileText,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { DriveFilePicker } from "@/components/DriveFilePicker";

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""),
  status: z.string().default("todo"),
  priority: z.string().default("medium"),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringType: z.enum(["daily", "weekly", "monthly"]).optional(),
  recurringDays: z.array(z.number()).default([]),
  estimatedCost: z.number().optional(),
  estimatedUnits: z.number().optional(),
  projectId: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface TaskModalAsanaProps {
  task?: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  initialStatus?: string;
}

export default function TaskModalAsana({ task, open, onOpenChange, projectId, initialStatus }: TaskModalAsanaProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task?.title || "");
  const [isRepeatsOpen, setIsRepeatsOpen] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [showDriveFilePicker, setShowDriveFilePicker] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch field categories for status options
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Fetch users for assignee dropdown
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Fetch subtasks
  const { data: subtasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", task?.id, "subtasks"],
    enabled: !!task?.id,
  });

  // Fetch Drive file attachments
  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ["/api/drive-attachments", "task", task?.id],
    queryFn: async () => {
      if (!task?.id) return [];
      const response = await fetch(`/api/drive-attachments/task/${task.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!task?.id,
  });

  // Mutation to add attachment
  const addAttachmentMutation = useMutation({
    mutationFn: async (file: { id: string; name: string; mimeType: string; webViewLink?: string }) => {
      return await apiRequest("/api/drive-attachments", "POST", {
        driveFileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        attachedToType: "task",
        attachedToId: task?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive-attachments", "task", task?.id] });
      toast({ title: "File attached successfully" });
    },
    onError: () => {
      toast({ title: "Failed to attach file", variant: "destructive" });
    },
  });

  // Mutation to remove attachment
  const removeAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return await apiRequest(`/api/drive-attachments/${attachmentId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive-attachments", "task", task?.id] });
      toast({ title: "Attachment removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove attachment", variant: "destructive" });
    },
  });

  const handleFilesSelected = (files: any[]) => {
    files.forEach(file => {
      addAttachmentMutation.mutate(file);
    });
  };

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusOptions.find(opt => opt.isCompleted);
  const isCompleted = task?.status === completedOption?.key;
  
  const priorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
  const priorityOptions = priorityCategory?.options || [];

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: task?.title || "New Task",
      content: task?.content || "",
      status: task?.status || initialStatus || "todo",
      priority: (task?.priority as any) || "medium",
      assigneeId: task?.assigneeId || undefined,
      dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
      startTime: task?.startTime || undefined,
      endTime: task?.endTime || undefined,
      isRecurring: task?.isRecurring || false,
      recurringType: (task?.recurringType as any) || undefined,
      recurringDays: (task?.recurringDays as number[]) || [],
      estimatedCost: task?.estimatedCost || undefined,
      estimatedUnits: task?.estimatedUnits || undefined,
      projectId: task?.projectId || projectId || undefined,
    },
  });

  // Reset form when task or open state changes
  useEffect(() => {
    if (open) {
      const newDefaults = {
        title: task?.title || "New Task",
        content: task?.content || "",
        status: task?.status || initialStatus || "todo",
        priority: (task?.priority as any) || "medium",
        assigneeId: task?.assigneeId || undefined,
        dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
        startTime: task?.startTime || undefined,
        endTime: task?.endTime || undefined,
        isRecurring: task?.isRecurring || false,
        recurringType: (task?.recurringType as any) || undefined,
        recurringDays: (task?.recurringDays as number[]) || [],
        estimatedCost: task?.estimatedCost || undefined,
        estimatedUnits: task?.estimatedUnits || undefined,
        projectId: task?.projectId || projectId || undefined,
      };
      form.reset(newDefaults);
      setTitleValue(newDefaults.title);
    }
  }, [task, open, initialStatus, projectId, form]);

  // Update title when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Create or update task mutation
  const saveTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      if (task) {
        return await apiRequest(`/api/tasks/${task.id}`, "PATCH", data);
      } else {
        return await apiRequest("/api/tasks", "POST", { ...data, type: "task" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: task ? "Task updated" : "Task created" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add subtask mutation
  const addSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiRequest("/api/tasks", "POST", {
        title,
        type: "task",
        parentTaskId: task?.id,
        projectId,
        status: "todo",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSubtaskInput("");
      setShowSubtaskInput(false);
    },
  });

  // Toggle completion mutation
  const toggleCompleteMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      const newStatus = checked ? (completedOption?.key || "done") : "todo";
      return await apiRequest(`/api/tasks/${task?.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const onSubmit = (data: TaskFormData) => {
    saveTaskMutation.mutate(data);
  };

  const handleTitleSave = () => {
    if (titleValue.trim()) {
      form.setValue("title", titleValue, { shouldDirty: true, shouldTouch: true });
      setIsEditingTitle(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      form.handleSubmit(onSubmit)();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  const handleAddSubtask = () => {
    if (subtaskInput.trim() && task) {
      addSubtaskMutation.mutate(subtaskInput);
    }
  };

  const weekDays = [
    { label: "M", value: 1 },
    { label: "T", value: 2 },
    { label: "W", value: 3 },
    { label: "T", value: 4 },
    { label: "F", value: 5 },
    { label: "S", value: 6 },
    { label: "S", value: 0 },
  ];

  const selectedDays = form.watch("recurringDays");
  const toggleDay = (day: number) => {
    const current = selectedDays || [];
    if (current.includes(day)) {
      form.setValue("recurringDays", current.filter(d => d !== day), { shouldDirty: true, shouldTouch: true });
    } else {
      form.setValue("recurringDays", [...current, day], { shouldDirty: true, shouldTouch: true });
    }
  };

  const assignee = users.find(u => u.id === form.watch("assigneeId"));
  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl p-0 rounded-xl overflow-hidden bg-background border-gray-200 shadow-sm"
        onKeyDown={handleKeyDown}
        data-testid="task-modal-asana"
      >
        <DialogTitle className="sr-only">
          {task ? "Edit Task" : "Create Task"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Edit task details, assignee, due date, and other properties
        </DialogDescription>
        {/* Header - Sticky */}
        <div className="sticky top-0 z-10 bg-background flex items-start justify-between p-4 border-b border-gray-200">
          <div className="flex items-start gap-2 flex-1">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={(checked) => task && toggleCompleteMutation.mutate(!!checked)}
              className="mt-1"
              data-testid="checkbox-complete-task"
            />
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitleValue(form.watch("title"));
                    setIsEditingTitle(false);
                  }
                }}
                className="text-xl font-bold bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500"
                data-testid="input-task-title"
              />
            ) : (
              <h2
                className="text-xl font-bold text-gray-900 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                onClick={() => {
                  setTitleValue(form.watch("title"));
                  setIsEditingTitle(true);
                }}
                data-testid="text-task-title"
              >
                {form.watch("title")}
              </h2>
            )}
          </div>

          {/* Top-right action icons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-gray-100 text-gray-600"
              data-testid="button-like-task"
            >
              <Heart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-gray-100 text-gray-600"
              onClick={() => task && setShowDriveFilePicker(true)}
              disabled={!task}
              data-testid="button-attach-file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-gray-100 text-gray-600"
                  data-testid="button-more-actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background border-gray-200">
                {task && (
                  <DropdownMenuItem 
                    className="text-gray-900 hover:bg-gray-50"
                    onClick={() => setShowReminderDialog(true)}
                    data-testid="menu-item-set-reminder"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Set Reminder
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-gray-900 hover:bg-gray-50">Duplicate</DropdownMenuItem>
                <DropdownMenuItem className="text-gray-900 hover:bg-gray-50">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Split Layout */}
        <div className="flex h-[600px]">
          {/* Left Panel - Subtasks (40%) */}
          <div className="w-[40%] border-r border-gray-200 overflow-y-auto bg-gray-50">
            <div className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Subtasks</h3>
              
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-background group"
                  data-testid={`subtask-${subtask.id}`}
                >
                  <GripVertical className="h-3 w-3 text-gray-400" />
                  <Checkbox className="h-3.5 w-3.5" />
                  <span className="text-sm text-gray-900 flex-1">{subtask.title}</span>
                  <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
              ))}

              {showSubtaskInput ? (
                <div className="flex items-center gap-2 p-2">
                  <Input
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSubtask();
                      if (e.key === "Escape") {
                        setShowSubtaskInput(false);
                        setSubtaskInput("");
                      }
                    }}
                    placeholder="Subtask name"
                    className="bg-background border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    data-testid="input-add-subtask"
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-background"
                  onClick={() => setShowSubtaskInput(true)}
                  data-testid="button-add-subtask"
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Add subtask
                </Button>
              )}

              {/* Attachments Section */}
              {task && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Attachments</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-gray-600 hover:text-gray-900"
                      onClick={() => setShowDriveFilePicker(true)}
                      data-testid="button-add-attachment"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  {attachments.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No files attached</p>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map((attachment: any) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-background group"
                          data-testid={`attachment-${attachment.id}`}
                        >
                          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          <span className="text-sm text-gray-900 flex-1 truncate">{attachment.fileName}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            {attachment.webViewLink && (
                              <a
                                href={attachment.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 hover:bg-gray-200 rounded"
                                data-testid={`button-open-attachment-${attachment.id}`}
                              >
                                <ExternalLink className="h-3 w-3 text-gray-600" />
                              </a>
                            )}
                            <button
                              onClick={() => removeAttachmentMutation.mutate(attachment.id)}
                              className="p-1 hover:bg-red-100 rounded"
                              data-testid={`button-remove-attachment-${attachment.id}`}
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Details (60%) */}
          <div className="w-[60%] overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Quick Fields */}
              <div className="space-y-4">
                {/* Assignee */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">Assignee</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-7 px-2 hover:bg-gray-50 text-gray-900 justify-start"
                        data-testid="button-select-assignee"
                      >
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-xs bg-amber-100 text-amber-700">
                                {getInitials(assignee.name || assignee.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{assignee.name || assignee.email}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No assignee</span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-background border-gray-200">
                      {users.map((user) => (
                        <DropdownMenuItem
                          key={user.id}
                          onClick={() => form.setValue("assigneeId", user.id, { shouldDirty: true, shouldTouch: true })}
                          className="text-gray-900 hover:bg-gray-50"
                        >
                          <Avatar className="h-5 w-5 mr-2">
                            <AvatarFallback className="text-xs bg-amber-100 text-amber-700">
                              {getInitials(user.name || user.email)}
                            </AvatarFallback>
                          </Avatar>
                          {user.name || user.email}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Due Date */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">Due date</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      {...form.register("dueDate")}
                      className="h-7 text-xs bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500"
                      data-testid="input-due-date"
                    />
                    {form.watch("dueDate") && (
                      <Badge className="h-5 px-2 bg-red-100 text-red-700 border-red-200 no-default-hover-elevate">
                        <Calendar className="h-2.5 w-2.5 mr-1" />
                        {format(new Date(form.watch("dueDate")!), "MMM d")}
                        <X
                          className="h-2.5 w-2.5 ml-1 cursor-pointer hover:text-red-900"
                          onClick={() => form.setValue("dueDate", undefined, { shouldDirty: true, shouldTouch: true })}
                        />
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Start Time */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">Start time</span>
                  <Input
                    type="time"
                    {...form.register("startTime")}
                    className="h-7 w-32 text-xs bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500"
                    data-testid="input-start-time"
                  />
                </div>

                {/* End Time */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">End time</span>
                  <Input
                    type="time"
                    {...form.register("endTime")}
                    className="h-7 w-32 text-xs bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500"
                    data-testid="input-end-time"
                  />
                </div>

                {/* Priority */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">Priority</span>
                  <Select
                    value={form.watch("priority")}
                    onValueChange={(value) => form.setValue("priority", value as any, { shouldDirty: true, shouldTouch: true })}
                  >
                    <SelectTrigger className="h-7 w-32 bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-gray-200">
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key} className="text-gray-900 hover:bg-gray-50">
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge className={`h-5 px-2 border ${priorityColors[form.watch("priority")]} no-default-hover-elevate`}>
                    {form.watch("priority")}
                  </Badge>
                </div>

                {/* Status */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-24">Status</span>
                  <Select
                    value={form.watch("status")}
                    onValueChange={(value) => form.setValue("status", value, { shouldDirty: true, shouldTouch: true })}
                  >
                    <SelectTrigger className="h-7 w-40 bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-gray-200">
                      {statusOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key} className="text-gray-900 hover:bg-gray-50">
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Description</label>
                <div className="[&_.border]:border-gray-300 [&_.bg-border]:bg-gray-200 [&_button:hover]:bg-gray-100 [&_.prose]:text-gray-900 [&_.text-muted-foreground]:text-gray-500">
                  <Controller
                    name="content"
                    control={form.control}
                    render={({ field }) => (
                      <RichTextEditor
                        content={field.value}
                        onChange={(html, text) => {
                          field.onChange(html);
                        }}
                        placeholder="What is this task about?"
                        className="bg-background border-gray-300"
                        data-testid="editor-description"
                      />
                    )}
                  />
                </div>
              </div>

              {/* Repeats Panel */}
              <div className="border border-gray-300 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.watch("isRecurring")}
                      onCheckedChange={(checked) => {
                        form.setValue("isRecurring", !!checked, { shouldDirty: true, shouldTouch: true });
                        setIsRepeatsOpen(!!checked);
                      }}
                      data-testid="checkbox-repeats"
                    />
                    <span className="text-sm text-gray-700">Repeats</span>
                  </div>
                  {form.watch("isRecurring") && (
                    <Select
                      value={form.watch("recurringType")}
                      onValueChange={(value) => form.setValue("recurringType", value as any, { shouldDirty: true, shouldTouch: true })}
                    >
                      <SelectTrigger className="h-6 w-24 text-xs bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500">
                        <SelectValue placeholder="Weekly" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-gray-200">
                        <SelectItem value="daily" className="text-gray-900 hover:bg-gray-50">Daily</SelectItem>
                        <SelectItem value="weekly" className="text-gray-900 hover:bg-gray-50">Weekly</SelectItem>
                        <SelectItem value="monthly" className="text-gray-900 hover:bg-gray-50">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {form.watch("isRecurring") && form.watch("recurringType") === "weekly" && (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-600">On these days</label>
                    <div className="flex gap-1">
                      {weekDays.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                            selectedDays?.includes(day.value)
                              ? "bg-amber-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          data-testid={`button-day-${day.value}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-gray-600 hover:text-gray-900"
                      onClick={() => form.setValue("recurringDays", [], { shouldDirty: true, shouldTouch: true })}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Comments</h3>
                <div className="flex items-start gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-amber-100 text-amber-700">
                      JS
                    </AvatarFallback>
                  </Avatar>
                  <Input
                    placeholder="Add a comment"
                    className="flex-1 h-8 bg-background border-gray-300 text-gray-900 focus:ring-2 focus:ring-blue-500"
                    data-testid="input-add-comment"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="text-gray-600 hover:text-gray-900"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={saveTaskMutation.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  data-testid="button-save-task"
                >
                  {saveTaskMutation.isPending ? "Saving..." : task ? "Save changes" : "Create task"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Set Reminder Dialog */}
      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="task"
        linkedItemId={task?.id}
        linkedItemTitle={task?.title}
        projectId={projectId || task?.projectId}
      />

      {/* Drive File Picker */}
      <DriveFilePicker
        open={showDriveFilePicker}
        onOpenChange={setShowDriveFilePicker}
        onSelect={handleFilesSelected}
        projectId={projectId || task?.projectId}
        multiple={true}
        title="Attach File from Google Drive"
      />
    </Dialog>
  );
}
