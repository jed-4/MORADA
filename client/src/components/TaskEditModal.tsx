import { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions, type Project, type Reminder } from "@shared/schema";
import { z } from "zod";
import { format, addDays } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TimeSelect } from "@/components/ui/time-select";
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
  Upload,
  HardDrive,
  Lock,
  ClipboardList,
  Copy,
} from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { SetReminderDialog, PendingReminderData } from "@/components/SetReminderDialog";
import { DriveFilePicker } from "@/components/DriveFilePicker";
import { Switch } from "@/components/ui/switch";

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
  isPrivate: z.boolean().default(false),
  checklistInstanceId: z.string().nullable().optional(),
  checklistInstanceName: z.string().nullable().optional(),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface ChecklistItemData {
  id?: string;
  text: string;
  completed: boolean;
  assigneeId?: string;
  assigneeName?: string;
}

interface SortableChecklistItemProps {
  item: ChecklistItemData;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAssigneeChange: (id: string, userId: string | undefined, userName: string | undefined) => void;
  assignees: any[];
  getUserDisplayName: (user: any) => string;
  getInitials: (name: string) => string;
}

function SortableChecklistItem({ 
  item, 
  onToggle, 
  onRemove, 
  onAssigneeChange,
  assignees,
  getUserDisplayName,
  getInitials,
}: SortableChecklistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id || '' });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
      data-testid={`checklist-item-${item.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <Checkbox 
        className="h-4 w-4" 
        checked={item.completed}
        onCheckedChange={() => onToggle(item.id!)}
        data-testid={`checkbox-checklist-${item.id}`}
      />
      <span className={`text-sm flex-1 ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
        {item.text}
      </span>
      
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
          <DropdownMenuItem onClick={() => onAssigneeChange(item.id!, undefined, undefined)}>
            <span className="text-muted-foreground">Unassigned</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {assignees.length > 0 ? (
            assignees.map((user) => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => onAssigneeChange(item.id!, user.id, getUserDisplayName(user))}
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
        onClick={() => onRemove(item.id!)}
        className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100"
        data-testid={`button-remove-checklist-${item.id}`}
      >
        <X className="h-3 w-3 text-destructive" />
      </button>
    </div>
  );
}

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
  onDuplicate?: (taskData: Partial<Task>) => void;
  initialData?: Partial<Task>;
}

export default function TaskEditModal({ task: propTask, taskId, open, onOpenChange, projectId, initialStatus, defaultAssigneeId, defaultScope, onDelete, onDuplicate, initialData }: TaskEditModalProps) {
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
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ id: string; name: string; mimeType: string; webViewLink?: string }>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingReminder, setPendingReminder] = useState<PendingReminderData | null>(null);
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

  // Fetch checklists for linking to tasks
  const { data: allChecklistGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/checklist-instance-groups"],
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
      if (task) {
        addAttachmentMutation.mutate(file);
      } else {
        setPendingAttachments(prev => [...prev, {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
        }]);
        toast({ title: "File queued for attachment", description: "File will be attached when task is saved" });
      }
    });
  };

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response) => {
      const attachment = {
        id: response.objectPath,
        name: response.metadata.name,
        mimeType: response.metadata.contentType,
        webViewLink: response.objectPath,
      };
      if (task) {
        addAttachmentMutation.mutate(attachment);
      } else {
        setPendingAttachments(prev => [...prev, attachment]);
        toast({ title: "File queued for attachment", description: "File will be attached when task is saved" });
      }
    },
    onError: (error) => {
      toast({ title: "Failed to upload file", description: error.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await uploadFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusOptions.find(opt => opt.isCompleted);
  const defaultStatusFromOptions = statusOptions.find(opt => opt.isDefault)?.key || statusOptions[0]?.key;
  // Use optimistic state if set, otherwise derive from task status
  const isCompleted = optimisticCompleted !== null ? optimisticCompleted : task?.status === completedOption?.key;
  
  const priorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
  const priorityOptions = priorityCategory?.options || [];
  const defaultPriorityFromOptions = priorityOptions.find(opt => opt.isDefault)?.key || priorityOptions[0]?.key;

  // Use initialData for duplicate functionality, falling back to task or defaults
  const sourceData = task || initialData;
  
  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: sourceData?.title || "New Task",
      content: sourceData?.content || "",
      status: sourceData?.status || initialStatus || defaultStatusFromOptions || "todo",
      priority: (sourceData?.priority as any) || defaultPriorityFromOptions || "low",
      assigneeId: sourceData?.assigneeId || defaultAssigneeId || undefined,
      assigneeIds: (sourceData as any)?.assigneeIds || (sourceData?.assigneeId ? [sourceData.assigneeId] : defaultAssigneeId ? [defaultAssigneeId] : []),
      dueDate: sourceData?.dueDate ? format(new Date(sourceData.dueDate), "yyyy-MM-dd") : undefined,
      startTime: sourceData?.startTime || undefined,
      endTime: sourceData?.endTime || undefined,
      isRecurring: sourceData?.isRecurring || false,
      recurringType: (sourceData?.recurringType as any) || undefined,
      recurringDays: (sourceData?.recurringDays as number[]) || [],
      includeSaturday: sourceData?.includeSaturday || false,
      includeSunday: sourceData?.includeSunday || false,
      recurringStartDate: sourceData?.recurringStartDate ? format(new Date(sourceData.recurringStartDate), "yyyy-MM-dd") : undefined,
      recurringEndDate: sourceData?.recurringEndDate ? format(new Date(sourceData.recurringEndDate), "yyyy-MM-dd") : undefined,
      dueDayOfMonth: (sourceData as any)?.dueDayOfMonth || 1,
      recurringSchedule: (sourceData as any)?.recurringSchedule || [],
      estimatedCost: sourceData?.estimatedCost || undefined,
      estimatedUnits: sourceData?.estimatedUnits || undefined,
      projectId: sourceData?.projectId || projectId || undefined,
      // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
      scope: (sourceData?.scope as any) || (sourceData && !sourceData.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
      color: (sourceData as any)?.color || undefined,
      isPrivate: (sourceData as any)?.isPrivate || false,
      checklistInstanceId: (sourceData as any)?.checklistInstanceId || undefined,
    },
  });

  const watchedProjectId = form.watch("projectId");
  const checklistGroups = allChecklistGroups.filter(
    (g: any) => watchedProjectId && g.projectId === watchedProjectId
  );

  useEffect(() => {
    if (open) {
      const effectiveSourceData = task || initialData;
      const newDefaults = {
        title: effectiveSourceData?.title || "New Task",
        content: effectiveSourceData?.content || "",
        status: effectiveSourceData?.status || initialStatus || defaultStatusFromOptions || "todo",
        priority: (effectiveSourceData?.priority as any) || defaultPriorityFromOptions || "low",
        assigneeId: effectiveSourceData?.assigneeId || defaultAssigneeId || undefined,
        assigneeIds: (effectiveSourceData as any)?.assigneeIds || (effectiveSourceData?.assigneeId ? [effectiveSourceData.assigneeId] : defaultAssigneeId ? [defaultAssigneeId] : []),
        dueDate: effectiveSourceData?.dueDate ? format(new Date(effectiveSourceData.dueDate), "yyyy-MM-dd") : undefined,
        startTime: effectiveSourceData?.startTime || undefined,
        endTime: effectiveSourceData?.endTime || undefined,
        isRecurring: effectiveSourceData?.isRecurring || false,
        recurringType: (effectiveSourceData?.recurringType as any) || undefined,
        recurringDays: (effectiveSourceData?.recurringDays as number[]) || [],
        includeSaturday: effectiveSourceData?.includeSaturday || false,
        includeSunday: effectiveSourceData?.includeSunday || false,
        recurringStartDate: effectiveSourceData?.recurringStartDate ? format(new Date(effectiveSourceData.recurringStartDate), "yyyy-MM-dd") : undefined,
        recurringEndDate: effectiveSourceData?.recurringEndDate ? format(new Date(effectiveSourceData.recurringEndDate), "yyyy-MM-dd") : undefined,
        dueDayOfMonth: (effectiveSourceData as any)?.dueDayOfMonth || 1,
        recurringSchedule: (effectiveSourceData as any)?.recurringSchedule || [],
        estimatedCost: effectiveSourceData?.estimatedCost || undefined,
        estimatedUnits: effectiveSourceData?.estimatedUnits || undefined,
        projectId: effectiveSourceData?.projectId || projectId || undefined,
        // Priority: existing task scope > legacy detection > defaultScope prop > project if projectId given > project
        scope: (effectiveSourceData?.scope as any) || (effectiveSourceData && !effectiveSourceData.projectId ? "business" : defaultScope || (projectId ? "project" : "project")),
        color: (effectiveSourceData as any)?.color || undefined,
        isPrivate: (effectiveSourceData as any)?.isPrivate || false,
        checklistInstanceId: (effectiveSourceData as any)?.checklistInstanceId || undefined,
      };
      form.reset(newDefaults);
      setTitleValue(newDefaults.title);
      setShowAdvanced(newDefaults.isRecurring);
      // Initialize checklist from task/initialData - preserve existing IDs, only generate for items without IDs
      // Don't reset if we're in the middle of a mutation (to preserve optimistic updates)
      if (!isChecklistMutating) {
        if (effectiveSourceData) {
          const taskChecklist = (effectiveSourceData.checklist as Array<{ id?: string; text: string; completed: boolean; assigneeId?: string; assigneeName?: string }>) || [];
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
      // Initialize selected tags from task or initialData (for duplication)
      setSelectedTagIds((effectiveSourceData?.tagIds as string[]) || []);
      // Clear pending reminder when opening a new task modal
      if (!task) {
        setPendingReminder(null);
      }
    } else {
      // Modal is closing - clear pending reminder to avoid accidental creation
      setPendingReminder(null);
    }
  }, [task, open, initialData, initialStatus, projectId, defaultAssigneeId, form, isChecklistMutating]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Auto-set endTime to 15 minutes after startTime when startTime is first set
  const startTimeValue = form.watch("startTime");
  const endTimeValue = form.watch("endTime");
  const prevStartTimeRef = useRef<string | undefined>(task?.startTime || undefined);
  
  useEffect(() => {
    // Only auto-populate if:
    // 1. startTime is set and has actually changed from previous value
    // 2. endTime is not set (empty, null, or undefined)
    // 3. This is a new task OR the user is changing the start time
    const startTimeChanged = startTimeValue !== prevStartTimeRef.current;
    const endTimeEmpty = !endTimeValue || endTimeValue === "";
    
    if (startTimeValue && startTimeChanged && endTimeEmpty) {
      try {
        const [hours, minutes] = startTimeValue.split(":").map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
          const totalMinutes = hours * 60 + minutes + 15; // Add 15 minutes
          const newHours = Math.floor(totalMinutes / 60) % 24; // Handle overflow past midnight
          const newMinutes = totalMinutes % 60;
          const newEndTime = `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
          form.setValue("endTime", newEndTime, { shouldDirty: true });
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    prevStartTimeRef.current = startTimeValue;
  }, [startTimeValue]); // Only trigger when startTime changes

  // Get the current linked checklist ID from form (must be after form initialization)
  const linkedChecklistId = form.watch("checklistInstanceId");

  // Fetch linked checklist items when a checklist group is linked
  const { data: linkedChecklistItems = [], isLoading: isLoadingLinkedChecklist, isError: isLinkedChecklistError } = useQuery<any[]>({
    queryKey: ["/api/checklist-instance-groups", linkedChecklistId, "items"],
    queryFn: async () => {
      if (!linkedChecklistId) return [];
      const response = await fetch(`/api/checklist-instance-groups/${linkedChecklistId}/items`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch checklist items");
      }
      return response.json();
    },
    enabled: !!linkedChecklistId,
  });

  // Fetch reminders linked to this task
  const { data: taskReminders = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders/for-item", "task", task?.id],
    queryFn: async () => {
      if (!task?.id) return [];
      const response = await fetch(`/api/reminders/for-item/task/${task.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!task?.id,
  });

  // Mutation to update linked checklist item status
  const updateLinkedChecklistItemMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return await apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", linkedChecklistId, "items"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update checklist item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveTaskMutation = useMutation({
    mutationFn: async (data: TaskFormData) => {
      // Build assigneeNames from assigneeIds for caching
      const selectedAssignees = users.filter(u => (data.assigneeIds || []).includes(u.id));
      const assigneeNames = selectedAssignees.map(u => getUserDisplayName(u));
      
      // Get linked checklist name for caching
      const linkedChecklist = data.checklistInstanceId 
        ? checklistGroups.find(g => g.id === data.checklistInstanceId)
        : null;
      const checklistInstanceName = linkedChecklist?.name || null;
      
      const payload = { 
        ...data, 
        tagIds: selectedTagIds,
        assigneeNames, // Cache names for display
        checklistInstanceName, // Cache checklist name for display
      };
      if (task) {
        return await apiRequest(`/api/tasks/${task.id}`, "PATCH", payload);
      } else {
        // Include checklist items when creating a new task
        const createPayload = { ...payload, type: "task", checklist: checklistItems };
        return await apiRequest("/api/tasks", "POST", createPayload);
      }
    },
    onSuccess: async (newTask: any) => {
      // Attach any pending files to the newly created task
      if (!task && pendingAttachments.length > 0 && newTask?.id) {
        for (const attachment of pendingAttachments) {
          try {
            await apiRequest("/api/drive-attachments", "POST", {
              driveFileId: attachment.id,
              fileName: attachment.name,
              mimeType: attachment.mimeType,
              webViewLink: attachment.webViewLink,
              attachedToType: "task",
              attachedToId: newTask.id,
            });
          } catch (err) {
            console.error("Failed to attach pending file:", err);
          }
        }
        setPendingAttachments([]);
      }
      
      // Create pending reminder for newly created task
      if (!task && pendingReminder && newTask?.id) {
        try {
          await apiRequest("/api/reminders", "POST", {
            title: pendingReminder.title,
            description: pendingReminder.description,
            dueAt: new Date(pendingReminder.triggerAt).toISOString(),
            priority: pendingReminder.priority,
            reminderType: "task",
            linkedItemType: "task",
            linkedItemId: newTask.id,
            taskId: newTask.id,
            projectId: projectId || undefined,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reminders/for-item", "task", newTask.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        } catch (err) {
          console.error("Failed to create reminder:", err);
          toast({
            title: "Task created, but reminder failed",
            description: "The task was saved but the reminder could not be created.",
            variant: "destructive",
          });
        }
        setPendingReminder(null);
      }
      
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

  const handleChecklistAssigneeChange = (itemId: string, userId: string | undefined, userName: string | undefined) => {
    const newChecklist = checklistItems.map(item =>
      item.id === itemId ? { ...item, assigneeId: userId, assigneeName: userName } : item
    );
    setChecklistItems(newChecklist);
    if (task) updateChecklistMutation.mutate(newChecklist);
  };

  // Drag-and-drop sensors for checklist reorder
  const checklistSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleChecklistDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = checklistItems.findIndex(item => item.id === active.id);
    const newIndex = checklistItems.findIndex(item => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newChecklist = arrayMove(checklistItems, oldIndex, newIndex);
      setChecklistItems(newChecklist);
      if (task) {
        updateChecklistMutation.mutate(newChecklist);
      }
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
              onClick={() => setShowReminderDialog(true)}
              title={pendingReminder ? "Reminder pending" : "Set Reminder"}
              data-testid="button-set-reminder"
            >
              <Bell className={`h-4 w-4 ${pendingReminder ? "text-amber-500" : ""}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Attach File"
                  data-testid="button-attach-file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="menu-item-upload-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setShowDriveFilePicker(true)}
                  data-testid="menu-item-google-drive"
                >
                  <HardDrive className="h-4 w-4 mr-2" />
                  From Google Drive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileUpload}
              data-testid="file-input-upload"
            />
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
                <DropdownMenuItem 
                  onClick={() => {
                    if (task && onDuplicate) {
                      const duplicateData: Partial<Task> = {
                        title: `${task.title} (Copy)`,
                        content: task.content,
                        status: task.status,
                        priority: task.priority,
                        assigneeId: task.assigneeId,
                        assigneeIds: task.assigneeIds,
                        tagIds: task.tagIds,
                        projectId: task.projectId,
                        dueDate: task.dueDate,
                        startTime: task.startTime,
                        endTime: task.endTime,
                        checklist: task.checklist,
                        estimatedCost: task.estimatedCost,
                        estimatedUnits: task.estimatedUnits,
                        isRecurring: task.isRecurring,
                        recurringType: task.recurringType,
                        recurringDays: task.recurringDays,
                        includeSaturday: task.includeSaturday,
                        includeSunday: task.includeSunday,
                        scope: task.scope as any,
                        checklistInstanceId: task.checklistInstanceId,
                        isPrivate: task.isPrivate,
                      };
                      onOpenChange(false);
                      onDuplicate(duplicateData);
                    }
                  }}
                  data-testid="menu-item-duplicate"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
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

            {/* Reminders linked to this task */}
            {task && taskReminders.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5" />
                  Reminders
                </label>
                <div className="space-y-1">
                  {taskReminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-sm"
                    >
                      <Bell className={`h-3.5 w-3.5 flex-shrink-0 ${
                        reminder.status === 'completed' || reminder.status === 'dismissed' 
                          ? 'text-muted-foreground' 
                          : 'text-amber-500'
                      }`} />
                      <span className={`flex-1 ${
                        reminder.status === 'completed' || reminder.status === 'dismissed' 
                          ? 'line-through text-muted-foreground' 
                          : ''
                      }`}>
                        {reminder.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reminder.dueAt ? format(new Date(reminder.dueAt), "MMM d, h:mm a") : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {/* Checklist - shows linked checklist items OR inline checklist */}
            <div className="space-y-3">
              {linkedChecklistId ? (
                <>
                  {/* Linked Checklist View */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Linked Checklist
                    </label>
                    {!isLoadingLinkedChecklist && (
                      <span className="text-xs text-muted-foreground">
                        {linkedChecklistItems.filter(i => i.status === "completed").length}/{linkedChecklistItems.length}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {isLoadingLinkedChecklist ? (
                      <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        <span className="text-xs">Loading checklist...</span>
                      </div>
                    ) : isLinkedChecklistError ? (
                      <div className="py-4 text-center">
                        <p className="text-xs text-destructive">Failed to load checklist items</p>
                        <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
                      </div>
                    ) : (
                      <>
                        {linkedChecklistItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
                            data-testid={`linked-checklist-item-${item.id}`}
                          >
                            <Checkbox 
                              className="h-4 w-4" 
                              checked={item.status === "completed"}
                              onCheckedChange={(checked) => {
                                updateLinkedChecklistItemMutation.mutate({
                                  itemId: item.id,
                                  status: checked ? "completed" : "pending"
                                });
                              }}
                              data-testid={`checkbox-linked-checklist-${item.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm block ${item.status === "completed" ? 'line-through text-muted-foreground' : ''}`}>
                                {item.description}
                              </span>
                              {item.groupName && (
                                <span className="text-xs text-muted-foreground">{item.groupName}</span>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {linkedChecklistItems.length === 0 && (
                          <p className="text-xs text-muted-foreground italic py-2">No checklist items</p>
                        )}
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Inline Checklist View */}
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
                    <DndContext
                      sensors={checklistSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleChecklistDragEnd}
                    >
                      <SortableContext
                        items={checklistItems.map(item => item.id || '')}
                        strategy={verticalListSortingStrategy}
                      >
                        {checklistItems.map((item) => (
                          <SortableChecklistItem
                            key={item.id}
                            item={item}
                            onToggle={handleToggleChecklistItem}
                            onRemove={handleRemoveChecklistItem}
                            onAssigneeChange={handleChecklistAssigneeChange}
                            assignees={assignees}
                            getUserDisplayName={getUserDisplayName}
                            getInitials={getInitials}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>

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
                </>
              )}
            </div>

            {/* Attachments */}
            {(attachments.length > 0 || pendingAttachments.length > 0) && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">
                  Attachments {pendingAttachments.length > 0 && !task && `(${pendingAttachments.length} pending)`}
                </label>
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
                  {pendingAttachments.map((attachment, index) => (
                    <div
                      key={`pending-${index}`}
                      className="flex items-center gap-2 p-2 rounded-md border border-dashed hover:bg-muted/50 group"
                      data-testid={`pending-attachment-${index}`}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm flex-1 truncate text-muted-foreground">{attachment.name}</span>
                      <Badge variant="secondary" className="text-xs">Pending</Badge>
                      <button
                        onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== index))}
                        className="p-1 hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100"
                        data-testid={`button-remove-pending-${index}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
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
                  <button
                    type="button"
                    className="h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 text-muted-foreground shrink-0"
                    onClick={() => form.setValue("dueDate", format(new Date(), "yyyy-MM-dd"), { shouldDirty: true, shouldTouch: true })}
                    data-testid="button-due-today"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 text-muted-foreground shrink-0"
                    onClick={() => form.setValue("dueDate", format(addDays(new Date(), 1), "yyyy-MM-dd"), { shouldDirty: true, shouldTouch: true })}
                    data-testid="button-due-tomorrow"
                  >
                    Tmrw
                  </button>
                  {form.watch("dueDate") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
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
                  <Controller
                    name="startTime"
                    control={form.control}
                    render={({ field }) => (
                      <TimeSelect
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Start"
                        className="flex-1"
                        data-testid="input-start-time"
                      />
                    )}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Controller
                    name="endTime"
                    control={form.control}
                    render={({ field }) => (
                      <TimeSelect
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="End"
                        className="flex-1"
                        data-testid="input-end-time"
                      />
                    )}
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
                  {/* Private Task Toggle */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                      Private Task
                    </label>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.watch("isPrivate")}
                        onCheckedChange={(checked) => form.setValue("isPrivate", checked, { shouldDirty: true })}
                        data-testid="switch-private-task"
                      />
                      <span className="text-xs text-muted-foreground">
                        {form.watch("isPrivate") ? "Only assigned users can see this task" : "Visible to all team members"}
                      </span>
                    </div>
                  </div>

                  {/* Linked Checklist */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3" />
                      Linked Checklist
                    </label>
                    <Select
                      value={form.watch("checklistInstanceId") || "none"}
                      onValueChange={(value) => form.setValue("checklistInstanceId", value === "none" ? null : value, { shouldDirty: true, shouldTouch: true })}
                    >
                      <SelectTrigger className="h-9" data-testid="select-linked-checklist">
                        <SelectValue placeholder="Select checklist..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">None</span>
                        </SelectItem>
                        {checklistGroups.length > 0 && <div className="h-px bg-border my-1" />}
                        {checklistGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            <div className="flex items-center gap-2">
                              <ClipboardList className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate">{group.instanceName} / {group.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

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
                                <Controller
                                  name="startTime"
                                  control={form.control}
                                  render={({ field }) => (
                                    <TimeSelect
                                      value={field.value}
                                      onChange={field.onChange}
                                      placeholder="Time"
                                      className="h-8 text-xs w-28"
                                      showIcon={false}
                                      data-testid="input-daily-time"
                                    />
                                  )}
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
                                        <TimeSelect
                                          value={schedule?.startTime || ""}
                                          onChange={(value) => {
                                            const currentSchedule = form.watch("recurringSchedule") || [];
                                            const existing = currentSchedule.findIndex((s: any) => s.dayOfWeek === dayValue);
                                            let newSchedule;
                                            if (existing >= 0) {
                                              newSchedule = [...currentSchedule];
                                              newSchedule[existing] = { ...newSchedule[existing], startTime: value };
                                            } else {
                                              newSchedule = [...currentSchedule, { dayOfWeek: dayValue, startTime: value, duration: 60 }];
                                            }
                                            form.setValue("recurringSchedule", newSchedule, { shouldDirty: true, shouldTouch: true });
                                          }}
                                          placeholder="Time"
                                          className="h-7 text-[10px] flex-1"
                                          showIcon={false}
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
                              <Controller
                                name="startTime"
                                control={form.control}
                                render={({ field }) => (
                                  <TimeSelect
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Time"
                                    className="h-8 text-xs w-28"
                                    showIcon={false}
                                    data-testid="input-monthly-time"
                                  />
                                )}
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
      linkedItemTitle={task?.title || form.getValues("title")}
      projectId={projectId || task?.projectId}
      onPendingReminder={!task ? (data) => {
        setPendingReminder(data);
        toast({ title: "Reminder will be set when task is saved" });
      } : undefined}
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
