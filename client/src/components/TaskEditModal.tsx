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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DropdownMenuSeparator,
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
  Tag,
  Check,
} from "lucide-react";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { DriveFilePicker } from "@/components/DriveFilePicker";

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().default(""),
  status: z.string().default("todo"),
  priority: z.string().default("low"),
  assigneeId: z.string().optional(), // Legacy single assignee
  assigneeIds: z.array(z.string()).default([]), // Multiple assignees
  dueDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringType: z.enum(["daily", "weekly", "monthly"]).optional(),
  recurringDays: z.array(z.number()).default([]),
  includeSaturday: z.boolean().default(false),
  includeSunday: z.boolean().default(false),
  recurringStartDate: z.string().optional(),
  recurringEndDate: z.string().optional(),
  dueDayOfMonth: z.number().optional(),
  recurringSchedule: z.array(z.object({
    dayOfWeek: z.number(),
    startTime: z.string(),
    duration: z.number(),
  })).default([]),
  estimatedCost: z.number().optional(),
  estimatedUnits: z.number().optional(),
  projectId: z.string().optional(),
  scope: z.enum(["personal", "project", "system", "business"]).default("project"),
  color: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface TaskEditModalProps {
  task?: Task;
  taskId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  initialStatus?: string;
  defaultAssigneeId?: string;
  defaultScope?: "personal" | "project" | "system" | "business";
  onDelete?: (taskId: string) => void;
}

export default function TaskEditModal({ task: propTask, taskId, open, onOpenChange, projectId, initialStatus, defaultAssigneeId, defaultScope, onDelete }: TaskEditModalProps) {
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
  // IMPORTANT: Only use fetchedTask if we have an effectiveTaskId, otherwise stale cache causes bugs
  const task = effectiveTaskId ? (fetchedTask || propTask) : undefined;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task?.title || "");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [checklistItems, setChecklistItems] = useState<Array<{ id?: string; text: string; completed: boolean; assigneeId?: string; assigneeName?: string }>>([]);
  const [checklistInput, setChecklistInput] = useState("");
  const [showChecklistInput, setShowChecklistInput] = useState(false);
  const [isChecklistMutating, setIsChecklistMutating] = useState(false);
  const [showDriveFilePicker, setShowDriveFilePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const labelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = labelCategory?.options || [];

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

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
  // Use optimistic state if set, otherwise derive from task status
  const isCompleted = optimisticCompleted !== null ? optimisticCompleted : task?.status === completedOption?.key;
  
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
      assigneeIds: (task as any)?.assigneeIds || (task?.assigneeId ? [task.assigneeId] : defaultAssigneeId ? [defaultAssigneeId] : []),
      dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
      startTime: task?.startTime || undefined,
      endTime: task?.endTime || undefined,
      isRecurring: task?.isRecurring || false,
      recurringType: (task?.recurringType as any) || undefined,
      recurringDays: (task?.recurringDays as number[]) || [],
      includeSaturday: task?.includeSaturday || false,
      includeSunday: task?.includeSunday || false,
      recurringStartDate: task?.recurringStartDate ? format(new Date(task.recurringStartDate), "yyyy-MM-dd") : undefined,
      recurringEndDate: task?.recurringEndDate ? format(new Date(task.recurringEndDate), "yyyy-MM-dd") : undefined,
      dueDayOfMonth: (task as any)?.dueDayOfMonth || 1,
      recurringSchedule: (task as any)?.recurringSchedule || [],
      estimatedCost: task?.estimatedCost || undefined,
      estimatedUnits: task?.estimatedUnits || undefined,
      projectId: task?.projectId || projectId || undefined,
      // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
      scope: (task?.scope as any) || (task && !task.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
      color: (task as any)?.color || undefined,
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
        assigneeIds: (task as any)?.assigneeIds || (task?.assigneeId ? [task.assigneeId] : defaultAssigneeId ? [defaultAssigneeId] : []),
        dueDate: task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : undefined,
        startTime: task?.startTime || undefined,
        endTime: task?.endTime || undefined,
        isRecurring: task?.isRecurring || false,
        recurringType: (task?.recurringType as any) || undefined,
        recurringDays: (task?.recurringDays as number[]) || [],
        includeSaturday: task?.includeSaturday || false,
        includeSunday: task?.includeSunday || false,
        recurringStartDate: task?.recurringStartDate ? format(new Date(task.recurringStartDate), "yyyy-MM-dd") : undefined,
        recurringEndDate: task?.recurringEndDate ? format(new Date(task.recurringEndDate), "yyyy-MM-dd") : undefined,
        dueDayOfMonth: (task as any)?.dueDayOfMonth || 1,
        recurringSchedule: (task as any)?.recurringSchedule || [],
        estimatedCost: task?.estimatedCost || undefined,
        estimatedUnits: task?.estimatedUnits || undefined,
        projectId: task?.projectId || projectId || undefined,
        // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
        scope: (task?.scope as any) || (task && !task.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
        color: (task as any)?.color || undefined,
      };
      form.reset(newDefaults);
      setTitleValue(newDefaults.title);
      setShowAdvanced(newDefaults.isRecurring);
      // Initialize checklist from task - preserve existing IDs, only generate for items without IDs
      // Don't reset if we're in the middle of a mutation (to preserve optimistic updates)
      if (!isChecklistMutating) {
        if (task) {
          const taskChecklist = (task.checklist as Array<{ id?: string; text: string; completed: boolean; assigneeId?: string; assigneeName?: string }>) || [];
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
      // Reset optimistic completion state when modal opens
      setOptimisticCompleted(null);
      // Initialize selected tags from task
      setSelectedTagIds((task?.tagIds as string[]) || []);
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
      // Build assigneeNames from assigneeIds for caching
      const selectedAssignees = users.filter(u => (data.assigneeIds || []).includes(u.id));
      const assigneeNames = selectedAssignees.map(u => getUserDisplayName(u));
      
      const payload = { 
        ...data, 
        tagIds: selectedTagIds,
        assigneeNames, // Cache names for display
      };
      if (task) {
        return await apiRequest(`/api/tasks/${task.id}`, "PATCH", payload);
      } else {
        // Include checklist items when creating a new task
        const createPayload = { ...payload, type: "task", checklist: checklistItems };
        return await apiRequest("/api/tasks", "POST", createPayload);
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

  // Get default status for reverting (from field categories or fallback)
  const defaultStatusOption = statusOptions.find(opt => opt.isDefault);
  const defaultStatus = defaultStatusOption?.key || "todo";

  const toggleCompleteMutation = useMutation({
    mutationFn: async (checked: boolean) => {
      if (!task?.id) throw new Error("No task to update");
      // Set optimistic state immediately
      setOptimisticCompleted(checked);
      const newStatus = checked ? (completedOption?.key || "done") : defaultStatus;
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id] });
      // Don't clear optimistic state here - let the useEffect below handle it
      // when task data actually reflects the change
    },
    onError: () => {
      // Revert optimistic state on error
      setOptimisticCompleted(null);
    },
  });
  
  // Clear optimistic state when task data catches up with the change
  useEffect(() => {
    if (optimisticCompleted !== null && task) {
      const taskIsCompleted = task.status === completedOption?.key;
      // If server state now matches optimistic state, clear the optimistic override
      if (taskIsCompleted === optimisticCompleted) {
        setOptimisticCompleted(null);
      }
    }
  }, [task?.status, optimisticCompleted, completedOption?.key]);

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
    if (checklistInput.trim()) {
      const newItem = { id: crypto.randomUUID(), text: checklistInput.trim(), completed: false };
      const newChecklist = [...checklistItems, newItem];
      setChecklistItems(newChecklist);
      // Only call API mutation for existing tasks
      if (task) {
        updateChecklistMutation.mutate(newChecklist);
      }
      setChecklistInput("");
      setShowChecklistInput(false);
    }
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const newChecklist = checklistItems.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklistItems(newChecklist);
    // Only call API mutation for existing tasks
    if (task) {
      updateChecklistMutation.mutate(newChecklist);
    }
    
    // Auto-complete: if all checklist items are now completed, mark the task as done
    // If unchecking an item and task was completed, revert to default/in-progress status
    // Only apply auto-complete for existing tasks (not during new task creation)
    if (task) {
      const allCompleted = newChecklist.length > 0 && newChecklist.every(item => item.completed);
      // Use isCompleted which already incorporates optimistic state
      const currentlyCompleted = isCompleted;
      
      if (allCompleted && !currentlyCompleted) {
        // All items checked - auto-complete the task
        toggleCompleteMutation.mutate(true);
      } else if (!allCompleted && currentlyCompleted) {
        // Unchecked an item on a completed task - revert to default status
        toggleCompleteMutation.mutate(false);
      }
    }
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    const newChecklist = checklistItems.filter(item => item.id !== itemId);
    setChecklistItems(newChecklist);
    // Only call API mutation for existing tasks
    if (task) {
      updateChecklistMutation.mutate(newChecklist);
    }
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

  const assigneeIds = form.watch("assigneeIds") || [];
  const assignees = users.filter(u => assigneeIds.includes(u.id));
  const assignee = users.find(u => u.id === form.watch("assigneeId")); // Legacy fallback
  const selectedProject = projects.find(p => p.id === form.watch("projectId"));
  
  const getUserDisplayName = (user: { firstName?: string | null; lastName?: string | null; email?: string | null }) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.email || 'Unknown User';
  };
  
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
    <>
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
              onClick={() => task && setShowReminderDialog(true)}
              disabled={!task}
              title="Set Reminder"
              data-testid="button-set-reminder"
            >
              <Bell className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => task && setShowDriveFilePicker(true)}
              disabled={!task}
              title="Attach File"
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
                {task && onDelete && (
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    data-testid="menu-item-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
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
                  className="text-xl font-semibold border-0 shadow-none p-0 h-auto leading-tight focus-visible:ring-0"
                  data-testid="input-task-title"
                />
              ) : (
                <h2
                  className={`text-xl font-semibold leading-tight cursor-pointer hover:text-primary ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
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
                      
                      {/* Checklist item assignee dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
                            data-testid={`button-assignee-checklist-${item.id}`}
                          >
                            {item.assigneeId ? (
                              <Avatar className="h-5 w-5 border border-border/50">
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(item.assigneeName || "")}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <User className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => {
                              const newChecklist = checklistItems.map(i =>
                                i.id === item.id ? { ...i, assigneeId: undefined, assigneeName: undefined } : i
                              );
                              setChecklistItems(newChecklist);
                              if (task) updateChecklistMutation.mutate(newChecklist);
                            }}
                          >
                            <span className="text-muted-foreground">Unassigned</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {/* Only show users who are assigned to the task */}
                          {assignees.length > 0 ? (
                            assignees.map((user) => (
                              <DropdownMenuItem
                                key={user.id}
                                onClick={() => {
                                  const newChecklist = checklistItems.map(i =>
                                    i.id === item.id ? { ...i, assigneeId: user.id, assigneeName: getUserDisplayName(user) } : i
                                  );
                                  setChecklistItems(newChecklist);
                                  if (task) updateChecklistMutation.mutate(newChecklist);
                                }}
                              >
                                <Avatar className="h-4 w-4 mr-2">
                                  <AvatarFallback className="text-[10px]">
                                    {getInitials(getUserDisplayName(user))}
                                  </AvatarFallback>
                                </Avatar>
                                {getUserDisplayName(user)}
                                {item.assigneeId === user.id && (
                                  <Check className="h-3 w-3 ml-auto" />
                                )}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                              Assign task users first
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
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
                      {assignees.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {assignees.slice(0, 3).map((user) => (
                              <Avatar key={user.id} className="h-5 w-5 border-2 border-background">
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(getUserDisplayName(user))}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {assignees.length > 3 && (
                              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] border-2 border-background">
                                +{assignees.length - 3}
                              </div>
                            )}
                          </div>
                          <span className="truncate text-xs">
                            {assignees.length === 1 
                              ? getUserDisplayName(assignees[0]) 
                              : `${assignees.length} assigned`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    {users.map((user) => {
                      const isSelected = assigneeIds.includes(user.id);
                      return (
                        <DropdownMenuItem
                          key={user.id}
                          onClick={(e) => {
                            e.preventDefault();
                            const currentIds = form.watch("assigneeIds") || [];
                            let newIds: string[];
                            if (isSelected) {
                              newIds = currentIds.filter((id: string) => id !== user.id);
                            } else {
                              newIds = [...currentIds, user.id];
                            }
                            form.setValue("assigneeIds", newIds, { shouldDirty: true, shouldTouch: true });
                            form.setValue("assigneeId", newIds[0] || undefined, { shouldDirty: true, shouldTouch: true });
                          }}
                        >
                          <Checkbox 
                            checked={isSelected} 
                            className="mr-2 pointer-events-none"
                          />
                          <Avatar className="h-5 w-5 mr-2">
                            <AvatarFallback className="text-[10px]">
                              {getInitials(getUserDisplayName(user))}
                            </AvatarFallback>
                          </Avatar>
                          {getUserDisplayName(user)}
                        </DropdownMenuItem>
                      );
                    })}
                    {assigneeIds.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => {
                            form.setValue("assigneeIds", [], { shouldDirty: true, shouldTouch: true });
                            form.setValue("assigneeId", undefined, { shouldDirty: true, shouldTouch: true });
                          }}
                        >
                          <span className="text-muted-foreground">Clear All</span>
                        </DropdownMenuItem>
                      </>
                    )}
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

              {/* Labels */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />
                  Labels
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedTagIds.map((tagId) => {
                    const label = labelOptions.find(l => l.id === tagId);
                    if (!label) return null;
                    return (
                      <div key={label.id} className="flex items-center gap-0.5" data-testid={`label-tag-${label.id}`}>
                        <Badge variant="secondary">
                          <div className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: label.color || '#6b7280' }} />
                          {label.name}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== label.id))}
                          data-testid={`button-remove-tag-${label.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (value && !selectedTagIds.includes(value)) {
                      setSelectedTagIds(prev => [...prev, value]);
                    }
                  }}
                >
                  <SelectTrigger className="h-9" data-testid="select-labels">
                    <SelectValue placeholder="Add label..." />
                  </SelectTrigger>
                  <SelectContent>
                    {labelOptions.filter(l => l.isActive && !selectedTagIds.includes(l.id)).length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No more labels available</div>
                    ) : (
                      labelOptions.filter(l => l.isActive && !selectedTagIds.includes(l.id)).map((label) => (
                        <SelectItem key={label.id} value={label.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: label.color || '#6b7280' }}
                            />
                            {label.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
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
                    step="900"
                    {...form.register("startTime")}
                    className="h-9 flex-1"
                    placeholder="Start"
                    data-testid="input-start-time"
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="time"
                    step="900"
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

                        {/* Daily - Time and Include Weekends */}
                        {form.watch("recurringType") === "daily" && (
                          <div className="space-y-2">
                            <div className="flex items-end gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground">Time</label>
                                <Input
                                  type="time"
                                  step="900"
                                  {...form.register("startTime")}
                                  className="h-8 text-xs w-24"
                                  data-testid="input-daily-time"
                                />
                              </div>
                              <div className="flex items-center gap-3 pb-1">
                                <div className="flex items-center gap-1.5">
                                  <Checkbox
                                    checked={form.watch("includeSaturday")}
                                    onCheckedChange={(checked) => form.setValue("includeSaturday", !!checked, { shouldDirty: true, shouldTouch: true })}
                                    data-testid="checkbox-include-saturday"
                                  />
                                  <label className="text-[10px] text-muted-foreground">Inc. Sat</label>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Checkbox
                                    checked={form.watch("includeSunday")}
                                    onCheckedChange={(checked) => form.setValue("includeSunday", !!checked, { shouldDirty: true, shouldTouch: true })}
                                    data-testid="checkbox-include-sunday"
                                  />
                                  <label className="text-[10px] text-muted-foreground">Inc. Sun</label>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Weekly - Days and Time per day */}
                        {form.watch("recurringType") === "weekly" && (
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground">Days</label>
                              <div className="flex gap-1 mt-1">
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
                            </div>

                            {selectedDays && selectedDays.length > 0 && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-medium text-muted-foreground">Start Times</label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {selectedDays.sort((a, b) => a - b).map((dayValue) => {
                                    const dayLabel = weekDays.find(d => d.value === dayValue)?.label || "";
                                    const schedule = form.watch("recurringSchedule")?.find((s: any) => s.dayOfWeek === dayValue);
                                    
                                    return (
                                      <div key={dayValue} className="flex items-center gap-1.5 px-2 py-1 bg-muted/30 rounded border">
                                        <span className="text-[10px] font-medium w-6">{dayLabel}</span>
                                        <Input
                                          type="time"
                                          step="900"
                                          value={schedule?.startTime || ""}
                                          onChange={(e) => {
                                            const currentSchedule = form.watch("recurringSchedule") || [];
                                            const existing = currentSchedule.findIndex((s: any) => s.dayOfWeek === dayValue);
                                            let newSchedule;
                                            if (existing >= 0) {
                                              newSchedule = [...currentSchedule];
                                              newSchedule[existing] = { ...newSchedule[existing], startTime: e.target.value };
                                            } else {
                                              newSchedule = [...currentSchedule, { dayOfWeek: dayValue, startTime: e.target.value, duration: 60 }];
                                            }
                                            form.setValue("recurringSchedule", newSchedule, { shouldDirty: true, shouldTouch: true });
                                          }}
                                          className="h-6 text-[10px] flex-1"
                                          data-testid={`input-time-${dayLabel.toLowerCase()}`}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Monthly - Day of month and Time */}
                        {form.watch("recurringType") === "monthly" && (
                          <div className="flex items-end gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground">Day of Month</label>
                              <Select
                                value={String(form.watch("dueDayOfMonth") || 1)}
                                onValueChange={(value) => form.setValue("dueDayOfMonth", parseInt(value), { shouldDirty: true, shouldTouch: true })}
                              >
                                <SelectTrigger className="h-8 text-xs w-20" data-testid="select-day-of-month">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                  {Array.from({ length: 31 }, (_, i) => (
                                    <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">
                                      {i + 1}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-medium text-muted-foreground">Time</label>
                              <Input
                                type="time"
                                step="900"
                                {...form.register("startTime")}
                                className="h-8 text-xs w-24"
                                data-testid="input-monthly-time"
                              />
                            </div>
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
    </Dialog>

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

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{task?.title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => {
              if (task && onDelete) {
                onDelete(task.id);
                setShowDeleteConfirm(false);
                onOpenChange(false);
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
