import { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  Paperclip,
  MoreHorizontal,
  Plus,
  GripVertical,
  Pencil,
  Bell,
  FileText,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Flag,
  CircleDot,
  FolderOpen,
  Clock,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { DriveFilePicker } from "@/components/DriveFilePicker";

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""),
  status: z.string().default("todo"),
  priority: z.string().default("low"),
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
  scope: z.enum(["personal", "project", "system", "business"]).default("project"),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface TaskModalAsanaProps {
  task?: Task;
  taskId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  initialStatus?: string;
  defaultAssigneeId?: string;
  defaultScope?: "personal" | "project" | "system" | "business";
}

export default function TaskModalAsana({ task: propTask, taskId, open, onOpenChange, projectId, initialStatus, defaultAssigneeId, defaultScope }: TaskModalAsanaProps) {
  // Use taskId from prop or from propTask to always fetch fresh data
  const effectiveTaskId = taskId || propTask?.id;
  
  const { data: fetchedTask } = useQuery<Task>({
    queryKey: ["/api/tasks", effectiveTaskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${effectiveTaskId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch task");
      return response.json();
    },
    enabled: !!effectiveTaskId && open,
  });

  // Use fetched task (which includes checklist) over propTask when available
  const task = fetchedTask || propTask;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task?.title || "");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [checklistItems, setChecklistItems] = useState<Array<{ id?: string; text: string; completed: boolean }>>([]);
  const [checklistInput, setChecklistInput] = useState("");
  const [showChecklistInput, setShowChecklistInput] = useState(false);
  const [isChecklistMutating, setIsChecklistMutating] = useState(false);
  const [showDriveFilePicker, setShowDriveFilePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const businessLabel = (user as any)?.companyNickname || "Business";

  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: subtasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", task?.id, "subtasks"],
    enabled: !!task?.id,
  });

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
      priority: (task?.priority as any) || "low",
      assigneeId: task?.assigneeId || defaultAssigneeId || undefined,
      dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
      startTime: task?.startTime || undefined,
      endTime: task?.endTime || undefined,
      isRecurring: task?.isRecurring || false,
      recurringType: (task?.recurringType as any) || undefined,
      recurringDays: (task?.recurringDays as number[]) || [],
      estimatedCost: task?.estimatedCost || undefined,
      estimatedUnits: task?.estimatedUnits || undefined,
      projectId: task?.projectId || projectId || undefined,
      // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
      scope: (task?.scope as any) || (task && !task.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
    },
  });

  useEffect(() => {
    if (open) {
      const newDefaults = {
        title: task?.title || "New Task",
        content: task?.content || "",
        status: task?.status || initialStatus || "todo",
        priority: (task?.priority as any) || "low",
        assigneeId: task?.assigneeId || defaultAssigneeId || undefined,
        dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
        startTime: task?.startTime || undefined,
        endTime: task?.endTime || undefined,
        isRecurring: task?.isRecurring || false,
        recurringType: (task?.recurringType as any) || undefined,
        recurringDays: (task?.recurringDays as number[]) || [],
        estimatedCost: task?.estimatedCost || undefined,
        estimatedUnits: task?.estimatedUnits || undefined,
        projectId: task?.projectId || projectId || undefined,
        // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
        scope: (task?.scope as any) || (task && !task.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
      };
      form.reset(newDefaults);
      setTitleValue(newDefaults.title);
      setShowAdvanced(newDefaults.isRecurring);
      // Initialize checklist from task - preserve existing IDs, only generate for items without IDs
      // Don't reset if we're in the middle of a mutation (to preserve optimistic updates)
      if (!isChecklistMutating) {
        if (task) {
          const taskChecklist = (task.checklist as Array<{ id?: string; text: string; completed: boolean }>) || [];
          setChecklistItems(taskChecklist.map(item => ({
            ...item,
            id: item.id || crypto.randomUUID(), // Only generate ID if item doesn't have one
          })));
        } else {
          // Clear checklist for new task creation
          setChecklistItems([]);
        }
      }
      setShowChecklistInput(false);
      setChecklistInput("");
    }
  }, [task, open, initialStatus, projectId, defaultAssigneeId, form, isChecklistMutating]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

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

  const addSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiRequest("/api/tasks", "POST", {
        title,
        type: "task",
        parentTaskId: task?.id,
        projectId: form.watch("projectId"),
        status: "todo",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSubtaskInput("");
      setShowSubtaskInput(false);
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      if (!task?.id) throw new Error("No task to update");
      const newStatus = checked ? (completedOption?.key || "done") : "todo";
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  // Checklist mutations and handlers
  const updateChecklistMutation = useMutation({
    mutationFn: async (newChecklist: Array<{ id?: string; text: string; completed: boolean }>) => {
      if (!task?.id) throw new Error("No task to update");
      setIsChecklistMutating(true);
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", { checklist: newChecklist });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      // Small delay to allow invalidation to complete before allowing reset
      setTimeout(() => setIsChecklistMutating(false), 500);
    },
    onError: (error: any) => {
      setIsChecklistMutating(false);
      toast({
        title: "Failed to update checklist",
        description: error.message,
        variant: "destructive",
      });
      // Revert to previous state on error by re-fetching
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const handleAddChecklistItem = () => {
    if (checklistInput.trim() && task) {
      const newItem = { id: crypto.randomUUID(), text: checklistInput.trim(), completed: false };
      const newChecklist = [...checklistItems, newItem];
      setChecklistItems(newChecklist);
      updateChecklistMutation.mutate(newChecklist);
      setChecklistInput("");
      setShowChecklistInput(false);
    }
  };

  const handleToggleChecklistItem = (itemId: string) => {
    if (!task) return;
    const newChecklist = checklistItems.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklistItems(newChecklist);
    updateChecklistMutation.mutate(newChecklist);
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    if (!task) return;
    const newChecklist = checklistItems.filter(item => item.id !== itemId);
    setChecklistItems(newChecklist);
    updateChecklistMutation.mutate(newChecklist);
  };

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
  const selectedProject = projects.find(p => p.id === form.watch("projectId"));
  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'medium': return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
      case 'low': return 'text-slate-500 bg-slate-50 dark:bg-slate-900/20';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusColor = (statusKey: string) => {
    const option = statusOptions.find(o => o.key === statusKey);
    if (option?.color) {
      return { backgroundColor: option.color + '20', color: option.color };
    }
    return {};
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 gap-0 rounded-lg overflow-hidden flex flex-col max-h-[85vh]"
        onKeyDown={handleKeyDown}
        data-testid="task-modal-asana"
      >
        <DialogTitle className="sr-only">
          {task ? "Edit Task" : "Create Task"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Edit task details, assignee, due date, and other properties
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            {task && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={(checked) => toggleCompleteMutation.mutate(!!checked)}
                  className="h-5 w-5"
                  data-testid="checkbox-complete-task"
                />
                {task.isRecurring && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" />
                    Recurring
                  </span>
                )}
              </div>
            )}
            <span className="text-sm font-medium text-muted-foreground">
              {task ? "Edit Task" : "New Task"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => task && setShowDriveFilePicker(true)}
              disabled={!task}
              data-testid="button-attach-file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-more-actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {task && (
                  <DropdownMenuItem onClick={() => setShowReminderDialog(true)} data-testid="menu-item-set-reminder">
                    <Bell className="h-4 w-4 mr-2" />
                    Set Reminder
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Content - Two Columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Column - Main Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Task Title - Editable */}
            <div className="space-y-1">
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
                  className="text-xl font-semibold border-0 shadow-none px-0 h-auto focus-visible:ring-0"
                  data-testid="input-task-title"
                />
              ) : (
                <h2
                  className={`text-xl font-semibold cursor-pointer hover:text-primary ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
                  onClick={() => {
                    setTitleValue(form.watch("title"));
                    setIsEditingTitle(true);
                  }}
                  data-testid="text-task-title"
                >
                  {form.watch("title") || "Untitled Task"}
                </h2>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <Controller
                name="content"
                control={form.control}
                render={({ field }) => (
                  <RichTextEditor
                    content={field.value}
                    onChange={(html) => field.onChange(html)}
                    placeholder="Add a description..."
                    className="min-h-[120px]"
                    data-testid="editor-description"
                  />
                )}
              />
            </div>

            {/* Subtasks */}
            {task && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">Subtasks</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowSubtaskInput(true)}
                    data-testid="button-add-subtask"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                
                <div className="space-y-1">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
                      data-testid={`subtask-${subtask.id}`}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      <Checkbox className="h-4 w-4" />
                      <span className="text-sm flex-1">{subtask.title}</span>
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer" />
                    </div>
                  ))}

                  {showSubtaskInput && (
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
                        placeholder="Subtask name..."
                        className="h-8 text-sm"
                        autoFocus
                        data-testid="input-add-subtask"
                      />
                    </div>
                  )}

                  {subtasks.length === 0 && !showSubtaskInput && (
                    <p className="text-xs text-muted-foreground italic py-2">No subtasks yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Checklist */}
            {task && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">Checklist</label>
                  <div className="flex items-center gap-2">
                    {checklistItems.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {checklistItems.filter(i => i.completed).length}/{checklistItems.length}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowChecklistInput(true)}
                      data-testid="button-add-checklist-item"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-1">
                  {checklistItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
                      data-testid={`checklist-item-${item.id}`}
                    >
                      <Checkbox 
                        className="h-4 w-4" 
                        checked={item.completed}
                        onCheckedChange={() => handleToggleChecklistItem(item.id!)}
                        data-testid={`checkbox-checklist-${item.id}`}
                      />
                      <span className={`text-sm flex-1 ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {item.text}
                      </span>
                      <button
                        onClick={() => handleRemoveChecklistItem(item.id!)}
                        className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100"
                        data-testid={`button-remove-checklist-${item.id}`}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  ))}

                  {showChecklistInput && (
                    <div className="flex items-center gap-2 p-2">
                      <Input
                        value={checklistInput}
                        onChange={(e) => setChecklistInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddChecklistItem();
                          if (e.key === "Escape") {
                            setShowChecklistInput(false);
                            setChecklistInput("");
                          }
                        }}
                        placeholder="Checklist item..."
                        className="h-8 text-sm"
                        autoFocus
                        data-testid="input-add-checklist-item"
                      />
                    </div>
                  )}

                  {checklistItems.length === 0 && !showChecklistInput && (
                    <p className="text-xs text-muted-foreground italic py-2">No checklist items yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Attachments */}
            {task && attachments.length > 0 && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Attachments</label>
                <div className="space-y-2">
                  {attachments.map((attachment: any) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 group"
                      data-testid={`attachment-${attachment.id}`}
                    >
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{attachment.fileName}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        {attachment.webViewLink && (
                          <a
                            href={attachment.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-muted rounded"
                            data-testid={`button-open-attachment-${attachment.id}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <button
                          onClick={() => removeAttachmentMutation.mutate(attachment.id)}
                          className="p-1 hover:bg-destructive/10 rounded"
                          data-testid={`button-remove-attachment-${attachment.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Properties Sidebar */}
          <div className="w-72 border-l bg-muted/20 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Project / Business */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FolderOpen className="h-3 w-3" />
                  Assign To
                </label>
                <Select
                  value={form.watch("scope") === "business" ? "business" : (form.watch("projectId") || "")}
                  onValueChange={(value) => {
                    if (value === "business") {
                      form.setValue("scope", "business", { shouldDirty: true, shouldTouch: true });
                      form.setValue("projectId", undefined, { shouldDirty: true, shouldTouch: true });
                    } else {
                      form.setValue("scope", "project", { shouldDirty: true, shouldTouch: true });
                      form.setValue("projectId", value || undefined, { shouldDirty: true, shouldTouch: true });
                    }
                  }}
                >
                  <SelectTrigger className="h-9" data-testid="select-project">
                    <SelectValue placeholder="Select project or business..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="font-medium">{businessLabel}</span>
                      </div>
                    </SelectItem>
                    <div className="h-px bg-border my-1" />
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: project.color || '#6b7280' }}
                          />
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  Assignee
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-9 font-normal"
                      data-testid="button-select-assignee"
                    >
                      {assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(assignee.name || assignee.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{assignee.name || assignee.email}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuItem onClick={() => form.setValue("assigneeId", undefined, { shouldDirty: true, shouldTouch: true })}>
                      <span className="text-muted-foreground">Unassigned</span>
                    </DropdownMenuItem>
                    {users.map((user) => (
                      <DropdownMenuItem
                        key={user.id}
                        onClick={() => form.setValue("assigneeId", user.id, { shouldDirty: true, shouldTouch: true })}
                      >
                        <Avatar className="h-5 w-5 mr-2">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(user.name || user.email)}
                          </AvatarFallback>
                        </Avatar>
                        {user.name || user.email}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CircleDot className="h-3 w-3" />
                  Status
                </label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(value) => form.setValue("status", value, { shouldDirty: true, shouldTouch: true })}
                >
                  <SelectTrigger className="h-9" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: option.color || '#6b7280' }}
                          />
                          {option.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Flag className="h-3 w-3" />
                  Priority
                </label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(value) => form.setValue("priority", value as any, { shouldDirty: true, shouldTouch: true })}
                >
                  <SelectTrigger className="h-9" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Due Date
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    {...form.register("dueDate")}
                    className="h-9 flex-1"
                    data-testid="input-due-date"
                  />
                  {form.watch("dueDate") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => form.setValue("dueDate", undefined, { shouldDirty: true, shouldTouch: true })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Time Range */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Time
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    {...form.register("startTime")}
                    className="h-9 flex-1"
                    placeholder="Start"
                    data-testid="input-start-time"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="time"
                    {...form.register("endTime")}
                    className="h-9 flex-1"
                    placeholder="End"
                    data-testid="input-end-time"
                  />
                </div>
              </div>

              {/* Advanced Options - Collapsible */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between h-8 px-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Settings2 className="h-3 w-3" />
                      Advanced
                    </span>
                    {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  {/* Recurring */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={form.watch("isRecurring")}
                        onCheckedChange={(checked) => form.setValue("isRecurring", !!checked, { shouldDirty: true, shouldTouch: true })}
                        data-testid="checkbox-repeats"
                      />
                      <label className="text-xs font-medium flex items-center gap-1.5">
                        <RotateCcw className="h-3 w-3" />
                        Repeats
                      </label>
                    </div>
                    
                    {form.watch("isRecurring") && (
                      <div className="space-y-3 pl-6">
                        <Select
                          value={form.watch("recurringType") || "weekly"}
                          onValueChange={(value) => form.setValue("recurringType", value as any, { shouldDirty: true, shouldTouch: true })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Weekly" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>

                        {form.watch("recurringType") === "weekly" && (
                          <div className="flex gap-1">
                            {weekDays.map((day) => (
                              <button
                                key={day.value}
                                type="button"
                                onClick={() => toggleDay(day.value)}
                                className={`h-6 w-6 rounded-full text-[10px] font-medium transition-colors ${
                                  selectedDays?.includes(day.value)
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                                data-testid={`button-day-${day.value}`}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>

        {/* Footer - Sticky */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={saveTaskMutation.isPending}
            data-testid="button-save-task"
          >
            {saveTaskMutation.isPending ? "Saving..." : task ? "Save Changes" : "Create Task"}
          </Button>
        </div>
      </DialogContent>

      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="task"
        linkedItemId={task?.id}
        linkedItemTitle={task?.title}
        projectId={projectId || task?.projectId}
      />

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
