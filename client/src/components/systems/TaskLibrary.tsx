import { useState, useImperativeHandle, forwardRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Plus, 
  MoreVertical, 
  Trash2, 
  Edit, 
  Power,
  PowerOff,
  X,
  Link,
  CheckSquare,
  Target,
  Calendar as CalendarIcon,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PlayCircle
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTaskTemplateCategoryOptions } from "@/hooks/useTaskTemplateCategoryOptions";
import { useTaskStatusOptions } from "@/hooks/useTaskStatusOptions";
import { UserSelect } from "@/components/UserSelect";
import type { TaskTemplate, UserRole } from "@shared/schema";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
];

export interface TaskLibraryHandle {
  openNewTemplateDialog: () => void;
  generateRecurringTasks: () => void;
}

interface TaskLibraryProps {
  searchQuery?: string;
}

export const TaskLibrary = forwardRef<TaskLibraryHandle, TaskLibraryProps>(({ searchQuery }, ref) => {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const { toast } = useToast();
  const { categoryOptions, getCategoryInfo } = useTaskTemplateCategoryOptions();
  const { statusOptions: taskStatusOptions } = useTaskStatusOptions();

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterFrequency, setFilterFrequency] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Form state
  const [templateForm, setTemplateForm] = useState({
    title: "",
    goal: "",
    description: "",
    defaultRoleId: "",
    assigneeType: "role" as "role" | "user",
    assigneeUserId: "",
    frequency: "once",
    category: "",
    estimatedDuration: 0,
    status: "published" as "published" | "draft" | "archived",
    isActive: true,
    dueTime: "",
    dueDayOfWeek: [] as number[],
    dueDayOfMonth: 1,
    checklist: [] as Array<{ text: string; completed: boolean }>,
    externalLinks: [] as string[],
    isRecurringTemplate: false,
    recurringDays: [] as number[],
    recurringSchedule: [] as Array<{ dayOfWeek: number; startTime: string; duration: number }>,
    includeSaturday: false, // For daily frequency: include Saturday
    includeSunday: false, // For daily frequency: include Sunday
    defaultTaskStatus: "todo", // Default status for tasks created from this template
    scope: "business" as "business" | "project",
    projectId: "" as string,
  });

  // Fetch task templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  // Fetch user roles (lightweight endpoint for assignment dropdowns)
  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/roles/assignable"],
  });

  // Fetch users for assignee selection (lightweight endpoint)
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users/assignable"],
  });

  // Fetch projects for scope selection
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Operational task created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create operational task", variant: "destructive" });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/systems/task-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setShowDialog(false);
      setEditingTemplate(null);
      resetForm();
      toast({ title: "Operational task updated successfully" });
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      const errorMessage = error?.message || error?.details || "Failed to update operational task";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({ title: "Operational task deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete operational task", variant: "destructive" });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => 
      apiRequest(`/api/systems/task-templates/${id}`, "PATCH", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({ title: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  // Regenerate tasks mutation
  const regenerateTasksMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/task-templates/${id}/regenerate`, "POST"),
    onSuccess: (data: { deleted: number; generated: number }) => {
      // Invalidate all task and note queries to refresh all views
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "/api/tasks" || key === "/api/notes" || key === "/api/tasks/user";
        }
      });
      toast({ 
        title: "Tasks regenerated successfully",
        description: `Deleted ${data.deleted} old tasks, generated ${data.generated} new tasks`
      });
    },
    onError: () => {
      toast({ title: "Failed to regenerate tasks", variant: "destructive" });
    },
  });

  // Generate recurring tasks mutation
  const generateRecurringMutation = useMutation({
    mutationFn: () => apiRequest("/api/systems/task-templates/generate-recurring", "POST"),
    onSuccess: (data: any) => {
      // Invalidate all task and note queries to refresh all views
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "/api/tasks" || key === "/api/notes" || key === "/api/tasks/user";
        }
      });
      toast({ 
        title: "Tasks generated successfully", 
        description: `Created ${data.generated} recurring task${data.generated === 1 ? '' : 's'}`
      });
    },
    onError: () => {
      toast({ title: "Failed to generate recurring tasks", variant: "destructive" });
    },
  });

  // Create task from template state
  const [isCreateTaskDialogOpen, setIsCreateTaskDialogOpen] = useState(false);
  const [selectedTemplateForTask, setSelectedTemplateForTask] = useState<TaskTemplate | null>(null);
  const [createTaskFormData, setCreateTaskFormData] = useState({
    title: "",
    content: "",
    assigneeId: undefined as string | undefined,
    dueDate: undefined as Date | undefined,
    status: "todo",
  });

  // Create task from template mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest("/api/tasks", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created from template" });
      setIsCreateTaskDialogOpen(false);
      setSelectedTemplateForTask(null);
      setCreateTaskFormData({
        title: "",
        content: "",
        assigneeId: undefined,
        dueDate: undefined,
        status: "todo",
      });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  const handleOpenCreateTaskDialog = (template: TaskTemplate) => {
    setSelectedTemplateForTask(template);
    setCreateTaskFormData({
      title: template.title,
      content: template.description || template.goal || "",
      assigneeId: template.assigneeUserId || undefined,
      dueDate: undefined,
      status: "todo",
    });
    setIsCreateTaskDialogOpen(true);
  };

  const handleCreateTaskFromTemplate = () => {
    if (!createTaskFormData.title.trim()) {
      toast({ title: "Task title is required", variant: "destructive" });
      return;
    }

    const assignee = users.find((u: any) => u.id === createTaskFormData.assigneeId);
    const taskData = {
      type: "task",
      title: createTaskFormData.title,
      content: createTaskFormData.content || "",
      assigneeId: createTaskFormData.assigneeId || undefined,
      assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : undefined,
      dueDate: createTaskFormData.dueDate || undefined,
      status: createTaskFormData.status,
      templateId: selectedTemplateForTask?.id,
      projectId: null, // Business task
    };

    createTaskMutation.mutate(taskData);
  };

  const resetForm = () => {
    setTemplateForm({
      title: "",
      goal: "",
      description: "",
      defaultRoleId: "",
      assigneeType: "role",
      assigneeUserId: "",
      frequency: "once",
      category: "",
      estimatedDuration: 0,
      status: "published",
      isActive: true,
      dueTime: "",
      dueDayOfWeek: [],
      dueDayOfMonth: 1,
      checklist: [],
      externalLinks: [],
      isRecurringTemplate: false,
      recurringDays: [],
      recurringSchedule: [],
      defaultTaskStatus: "todo",
      scope: "business",
      projectId: "",
    });
  };

  const openNewTemplateDialog = () => {
    setEditingTemplate(null);
    resetForm();
    setShowDialog(true);
  };

  const openEditTemplateDialog = (template: TaskTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      title: template.title,
      goal: template.goal || "",
      description: template.description || "",
      defaultRoleId: template.defaultRoleId || "",
      assigneeType: (template.assigneeType as "role" | "user") || "role",
      assigneeUserId: template.assigneeUserId || "",
      frequency: template.frequency || "once",
      category: template.category || "",
      estimatedDuration: template.estimatedDuration || 0,
      status: (template.status === "active" ? "published" : template.status as "published" | "draft" | "archived") || "published",
      isActive: template.isActive,
      dueTime: template.dueTime || "",
      dueDayOfWeek: template.dueDayOfWeek ? (Array.isArray(template.dueDayOfWeek) ? template.dueDayOfWeek : JSON.parse(template.dueDayOfWeek as string)) : [],
      dueDayOfMonth: template.dueDayOfMonth || 1,
      checklist: template.checklist ? (Array.isArray(template.checklist) ? template.checklist : JSON.parse(template.checklist as string)) : [],
      externalLinks: template.externalLinks ? (Array.isArray(template.externalLinks) ? template.externalLinks : JSON.parse(template.externalLinks as string)) : [],
      isRecurringTemplate: template.isRecurringTemplate || false,
      recurringDays: template.recurringDays ? (Array.isArray(template.recurringDays) ? template.recurringDays : JSON.parse(template.recurringDays as string)) : [],
      recurringSchedule: template.recurringSchedule ? (Array.isArray(template.recurringSchedule) ? template.recurringSchedule : JSON.parse(template.recurringSchedule as string)) : [],
      includeSaturday: template.includeSaturday || false,
      includeSunday: template.includeSunday || false,
      defaultTaskStatus: template.defaultTaskStatus || "todo",
      scope: (template.scope as "business" | "project") || "business",
      projectId: template.projectId || "",
    });
    setShowDialog(true);
  };

  // Expose dialog opening functions to parent via ref
  useImperativeHandle(ref, () => ({
    openNewTemplateDialog,
    generateRecurringTasks: () => generateRecurringMutation.mutate(),
  }));

  const handleSaveTemplate = () => {
    // Validate required fields
    if (!templateForm.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    
    // Validate project is selected when scope is "project"
    if (templateForm.scope === "project" && !templateForm.projectId) {
      toast({ title: "Please select a project for project-scoped templates", variant: "destructive" });
      return;
    }
    
    // Build recurringSchedule from dueDayOfWeek and individual day schedules
    // Use estimatedDuration for all schedules
    let recurringScheduleData: Array<{ dayOfWeek: number; startTime: string; duration: number }> = [];
    const duration = templateForm.estimatedDuration || 60;
    
    if (templateForm.isRecurringTemplate && templateForm.frequency === "weekly") {
      recurringScheduleData = templateForm.dueDayOfWeek
        .map(dayValue => {
          const schedule = getDaySchedule(dayValue);
          if (schedule && schedule.startTime && schedule.startTime.trim() !== "") {
            return {
              dayOfWeek: dayValue,
              startTime: schedule.startTime,
              duration: duration
            };
          }
          return null;
        })
        .filter((s): s is { dayOfWeek: number; startTime: string; duration: number } => s !== null);
    }

    // Clean up the data before sending
    const cleanedData = {
      ...templateForm,
      // Remove empty external links
      externalLinks: templateForm.externalLinks.filter(link => link.trim() !== ""),
      // Include recurring fields if enabled
      isRecurringTemplate: templateForm.isRecurringTemplate,
      recurringSchedule: recurringScheduleData,
      // IMPORTANT: Set recurringDays from dueDayOfWeek when isRecurringTemplate is enabled
      // The backend uses recurringDays to determine which days to generate tasks
      recurringDays: templateForm.isRecurringTemplate && templateForm.frequency === "weekly" 
        ? templateForm.dueDayOfWeek 
        : templateForm.isRecurringTemplate && templateForm.frequency === "daily"
          ? [1, 2, 3, 4, 5, ...(templateForm.includeSaturday ? [6] : []), ...(templateForm.includeSunday ? [0] : [])] // Daily = weekdays + optional Sat/Sun
          : [],
      includeSaturday: templateForm.includeSaturday,
      includeSunday: templateForm.includeSunday,
      defaultRoleId: templateForm.isRecurringTemplate ? (templateForm.defaultRoleId || null) : null,
      // Include assignee fields
      assigneeType: templateForm.assigneeType,
      assigneeUserId: templateForm.assigneeType === 'user' ? (templateForm.assigneeUserId || null) : null,
      // Scope fields - only include projectId when scope is project
      scope: templateForm.scope,
      projectId: templateForm.scope === 'project' ? (templateForm.projectId || null) : null,
    };

    console.log("Saving template with data:", cleanedData);

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: cleanedData });
    } else {
      createTemplateMutation.mutate(cleanedData);
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "-";
    const role = roles.find((r) => r.id === roleId);
    return role?.name || "Unknown";
  };

  const getFrequencyLabel = (template: TaskTemplate) => {
    const freq = template.frequency || "once";
    let label = freq.charAt(0).toUpperCase() + freq.slice(1);
    
    if (freq === "daily" && template.dueTime) {
      label += ` at ${template.dueTime}`;
    } else if (freq === "weekly" && template.dueDayOfWeek) {
      const days = typeof template.dueDayOfWeek === 'string' ? JSON.parse(template.dueDayOfWeek) : template.dueDayOfWeek;
      if (Array.isArray(days) && days.length > 0) {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        label += ` (${days.map((d: number) => dayNames[d]).join(", ")})`;
      }
    } else if (freq === "monthly" && template.dueDayOfMonth) {
      label += ` on day ${template.dueDayOfMonth}`;
    }
    
    return label;
  };

  const toggleDayOfWeek = (day: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      dueDayOfWeek: prev.dueDayOfWeek.includes(day)
        ? prev.dueDayOfWeek.filter((d) => d !== day)
        : [...prev.dueDayOfWeek, day].sort()
    }));
  };

  // Recurring schedule helper functions
  const toggleDay = (day: number) => {
    setTemplateForm(prev => {
      const isSelected = prev.recurringDays.includes(day);
      const newRecurringDays = isSelected
        ? prev.recurringDays.filter(d => d !== day)
        : [...prev.recurringDays, day].sort((a, b) => a - b);
      
      const newRecurringSchedule = isSelected
        ? prev.recurringSchedule.filter(s => s.dayOfWeek !== day)
        : prev.recurringSchedule;

      return {
        ...prev,
        recurringDays: newRecurringDays,
        recurringSchedule: newRecurringSchedule,
      };
    });
  };

  const updateDaySchedule = (dayOfWeek: number, startTime: string, duration: number) => {
    setTemplateForm(prev => {
      const existingIndex = prev.recurringSchedule.findIndex(s => s.dayOfWeek === dayOfWeek);
      const newRecurringSchedule = [...prev.recurringSchedule];
      
      if (existingIndex >= 0) {
        newRecurringSchedule[existingIndex] = { dayOfWeek, startTime, duration };
      } else {
        newRecurringSchedule.push({ dayOfWeek, startTime, duration });
      }

      return {
        ...prev,
        recurringSchedule: newRecurringSchedule,
      };
    });
  };

  const getDaySchedule = (dayOfWeek: number): { dayOfWeek: number; startTime: string; duration: number } | undefined => {
    return templateForm.recurringSchedule.find(s => s.dayOfWeek === dayOfWeek);
  };

  // Checklist management
  const addChecklistItem = () => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { text: "", completed: false }]
    }));
  };

  const updateChecklistItem = (index: number, text: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item, i) => 
        i === index ? { ...item, text } : item
      )
    }));
  };

  const removeChecklistItem = (index: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  // External links management
  const addExternalLink = () => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: [...prev.externalLinks, ""]
    }));
  };

  const updateExternalLink = (index: number, value: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: prev.externalLinks.map((link, i) => 
        i === index ? value : link
      )
    }));
  };

  const removeExternalLink = (index: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: prev.externalLinks.filter((_, i) => i !== index)
    }));
  };

  // Sorting logic
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3.5 w-3.5 text-gray-700" />
      : <ArrowDown className="h-3.5 w-3.5 text-gray-700" />;
  };

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = !searchQuery || 
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || template.category === filterCategory;
    const matchesRole = filterRole === "all" || template.defaultRoleId === filterRole;
    const matchesFrequency = filterFrequency === "all" || 
      (filterFrequency === "recurring" && template.isRecurringTemplate) ||
      (filterFrequency === "once" && !template.isRecurringTemplate);
    const matchesStatus = filterStatus === "all" || template.status === filterStatus;
    const matchesActive = filterActive === "all" || 
      (filterActive === "active" && template.isActive) ||
      (filterActive === "inactive" && !template.isActive);
    
    return matchesSearch && matchesCategory && matchesRole && matchesFrequency && matchesStatus && matchesActive;
  });

  const hasActiveFilters = filterCategory !== "all" || filterRole !== "all" || filterFrequency !== "all" || filterStatus !== "all" || filterActive !== "all";

  const clearAllFilters = () => {
    setFilterCategory("all");
    setFilterRole("all");
    setFilterFrequency("all");
    setFilterStatus("all");
    setFilterActive("all");
  };

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (!sortColumn) return 0;
    
    const direction = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortColumn) {
      case 'title':
        return direction * a.title.localeCompare(b.title);
      case 'category':
        const catA = getCategoryInfo(a.category)?.name || a.category || '';
        const catB = getCategoryInfo(b.category)?.name || b.category || '';
        return direction * catA.localeCompare(catB);
      case 'role':
        const roleA = getRoleName(a.defaultRoleId);
        const roleB = getRoleName(b.defaultRoleId);
        return direction * roleA.localeCompare(roleB);
      case 'frequency':
        const freqA = getFrequencyLabel(a);
        const freqB = getFrequencyLabel(b);
        return direction * freqA.localeCompare(freqB);
      case 'assignee':
        const assigneeA = a.assigneeType === 'user' 
          ? (a.assigneeUserName || '-')
          : (a.defaultRoleId ? getRoleName(a.defaultRoleId) : '-');
        const assigneeB = b.assigneeType === 'user' 
          ? (b.assigneeUserName || '-')
          : (b.defaultRoleId ? getRoleName(b.defaultRoleId) : '-');
        return direction * assigneeA.localeCompare(assigneeB);
      case 'status':
        const statusOrder: Record<string, number> = { 'published': 0, 'active': 0, 'draft': 1, 'archived': 2 };
        const statusA = statusOrder[a.status || 'published'] ?? 0;
        const statusB = statusOrder[b.status || 'published'] ?? 0;
        return direction * (statusA - statusB);
      case 'active':
        return direction * ((a.isActive ? 1 : 0) - (b.isActive ? 1 : 0));
      default:
        return 0;
    }
  });

  if (templatesLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  const activeTemplates = templates.filter((t) => t.isActive);
  const inactiveTemplates = templates.filter((t) => !t.isActive);

  // Grid template with minimum widths to prevent column squashing - tighter layout
  const gridTemplate = "24px minmax(200px, 1.4fr) minmax(120px, 0.7fr) minmax(100px, 0.6fr) minmax(140px, 0.8fr) minmax(140px, 0.8fr) minmax(70px, 0.4fr) minmax(50px, 0.3fr) 28px";

  return (
    <div className="flex flex-col h-full">
      {/* Filter Row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background flex-shrink-0 overflow-x-auto">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-7 w-32 text-xs flex-shrink-0" data-testid="filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {"  ".repeat(cat.depth || 0)}{cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="filter-role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterFrequency} onValueChange={setFilterFrequency}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="filter-frequency">
            <SelectValue placeholder="Frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
            <SelectItem value="once">One-time</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="h-7 w-24 text-xs flex-shrink-0" data-testid="filter-active">
            <SelectValue placeholder="Active" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-shrink-0"
            onClick={clearAllFilters}
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}

        <div className="ml-auto flex-shrink-0">
          <Badge variant="secondary" className="text-xs">
            {filteredTemplates.length} / {templates.length}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {templates.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No operational tasks yet. Create your first one to get started.
            </div>
          </Card>
        ) : filteredTemplates.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No templates match your filters. Try adjusting your filters.
            </div>
          </Card>
        ) : (
          <div className="border border-border rounded-md bg-background overflow-hidden">
            <div className="overflow-x-auto">
              {/* Header Row - compact like TaskListCompact */}
              <div 
                className="grid items-center gap-2 px-2 h-8 bg-muted/30 border-b border-border/50"
                style={{ gridTemplateColumns: gridTemplate }}
              >
              <div></div>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('title')}
                data-testid="sort-title"
              >
                <span>Title</span>
                {getSortIcon('title')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('category')}
                data-testid="sort-category"
              >
                <span>Category</span>
                {getSortIcon('category')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('role')}
                data-testid="sort-role"
              >
                <span>Role</span>
                {getSortIcon('role')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('frequency')}
                data-testid="sort-frequency"
              >
                <span>Frequency</span>
                {getSortIcon('frequency')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('assignee')}
                data-testid="sort-assignee"
              >
                <span>Assignee</span>
                {getSortIcon('assignee')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('status')}
                data-testid="sort-status"
              >
                <span>Status</span>
                {getSortIcon('status')}
              </button>
              <button 
                className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground rounded px-1 py-0.5 text-left"
                onClick={() => handleSort('active')}
                data-testid="sort-active"
              >
                <span>Active</span>
                {getSortIcon('active')}
              </button>
              <div></div>
            </div>

              {/* Template Rows */}
              {sortedTemplates.map((template) => {
                const checklistCount = Array.isArray(template.checklist) ? template.checklist.length : 0;
                const linksCount = Array.isArray(template.externalLinks) ? template.externalLinks.length : 0;
                
                return (
                  <div 
                    key={template.id}
                    className="grid items-center gap-2 px-2 h-10 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: gridTemplate }}
                    onClick={() => openEditTemplateDialog(template)}
                    data-testid={`template-row-${template.id}`}
                  >
                  {/* Leading space for consistency */}
                  <div></div>

                  {/* Title */}
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate leading-5">{template.title}</div>
                  </div>

                  {/* Category & Info Badges */}
                  <div className="flex items-center gap-1 min-w-0">
                    {template.category && (() => {
                      const categoryInfo = getCategoryInfo(template.category);
                      return (
                        <Badge 
                          variant="outline" 
                          className="text-xs px-1.5 py-0 h-5 rounded-full flex-shrink-0 border-0 no-default-hover-elevate no-default-active-elevate"
                          style={{ 
                            backgroundColor: `${categoryInfo?.color || '#6B7280'}15`,
                            color: categoryInfo?.color || '#6B7280'
                          }}
                        >
                          {categoryInfo?.name || template.category}
                        </Badge>
                      );
                    })()}
                    {checklistCount > 0 && (
                      <Badge variant="outline" className="gap-0.5 text-xs px-1.5 py-0 h-5 rounded-full flex-shrink-0 no-default-hover-elevate no-default-active-elevate">
                        <CheckSquare className="h-2.5 w-2.5" />
                        {checklistCount}
                      </Badge>
                    )}
                    {linksCount > 0 && (
                      <Badge variant="outline" className="gap-0.5 text-xs px-1.5 py-0 h-5 rounded-full flex-shrink-0 no-default-hover-elevate no-default-active-elevate">
                        <Link className="h-2.5 w-2.5" />
                        {linksCount}
                      </Badge>
                    )}
                  </div>

                  {/* Role */}
                  <div className="text-xs text-muted-foreground truncate">
                    {getRoleName(template.defaultRoleId)}
                  </div>

                  {/* Frequency */}
                  <div className="text-xs text-muted-foreground truncate">
                    {getFrequencyLabel(template)}
                  </div>

                  {/* Assignee */}
                  <div className="text-xs text-muted-foreground truncate">
                    {template.assigneeType === 'user' ? (
                      template.assigneeUserName ? (
                        <span className="text-foreground">{template.assigneeUserName}</span>
                      ) : (
                        <span>-</span>
                      )
                    ) : (
                      <span>
                        {template.defaultRoleId ? getRoleName(template.defaultRoleId) : '-'}
                      </span>
                    )}
                  </div>

                  {/* Status (Published/Draft/Archived) */}
                  <div>
                    {(template.status === 'published' || template.status === 'active' || !template.status) ? (
                      <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 h-5 px-2 py-0.5 rounded-full text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                        Published
                      </Badge>
                    ) : template.status === 'draft' ? (
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 h-5 px-2 py-0.5 rounded-full text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                        Draft
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/10 text-gray-700 dark:text-gray-400 h-5 px-2 py-0.5 rounded-full text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                        Archived
                      </Badge>
                    )}
                  </div>

                  {/* Active/Inactive */}
                  <div>
                    {template.isActive ? (
                      <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 h-5 px-2 py-0.5 rounded-full text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                        On
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/10 text-gray-600 dark:text-gray-500 h-5 px-2 py-0.5 rounded-full text-xs border-0 no-default-hover-elevate no-default-active-elevate">
                        Off
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`template-menu-${template.id}`}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => handleOpenCreateTaskDialog(template)} 
                          data-testid="menu-create-task"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Create Task
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditTemplateDialog(template)} data-testid="menu-edit-template">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => toggleActiveMutation.mutate({ 
                            id: template.id, 
                            isActive: !template.isActive 
                          })}
                          data-testid={template.isActive ? "menu-deactivate-template" : "menu-activate-template"}
                        >
                          {template.isActive ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        {template.isRecurringTemplate && (
                          <DropdownMenuItem
                            onClick={() => regenerateTasksMutation.mutate(template.id)}
                            data-testid="menu-regenerate-tasks"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regenerate Tasks
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                          className="text-destructive"
                          data-testid="menu-delete-template"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Template Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setEditingTemplate(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto" data-testid="dialog-template">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm">{editingTemplate ? "Edit Operational Task" : "New Operational Task"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-[calc(90vh-120px)] overflow-y-auto pr-1">
            {/* Title */}
            <div>
              <Label className="text-[10px] text-muted-foreground">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="Operational task title"
                className="h-7 text-[11px]"
                data-testid="input-template-title"
                required
              />
            </div>

            {/* Goal */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Goal</Label>
              <Input
                value={templateForm.goal}
                onChange={(e) => setTemplateForm({ ...templateForm, goal: e.target.value })}
                placeholder="Brief, to-the-point goal"
                className="h-7 text-[11px]"
                data-testid="input-template-goal"
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Detailed description"
                className="min-h-[60px] text-[11px]"
                data-testid="input-template-description"
              />
            </div>

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Scope</Label>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant={templateForm.scope === "business" ? "default" : "outline"}
                  className="flex-1 h-7 text-[11px]"
                  onClick={() => setTemplateForm({ ...templateForm, scope: "business", projectId: "" })}
                  data-testid="button-scope-business"
                >
                  Business
                </Button>
                <Button
                  type="button"
                  variant={templateForm.scope === "project" ? "default" : "outline"}
                  className="flex-1 h-7 text-[11px]"
                  onClick={() => setTemplateForm({ ...templateForm, scope: "project" })}
                  data-testid="button-scope-project"
                >
                  Project
                </Button>
              </div>
              {templateForm.scope === "project" && (
                <Select
                  value={templateForm.projectId}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, projectId: value })}
                >
                  <SelectTrigger className="h-7 text-[11px]" data-testid="select-template-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id} className="text-[11px]">
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Status, Category, Duration - 3 column grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <Label className="text-[10px] text-muted-foreground">Status</Label>
                <Select
                  value={templateForm.status}
                  onValueChange={(value: "published" | "draft" | "archived") => setTemplateForm({ ...templateForm, status: value })}
                >
                  <SelectTrigger className="h-7 text-[11px]" data-testid="select-template-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published" className="text-[11px]">Published</SelectItem>
                    <SelectItem value="draft" className="text-[11px]">Draft</SelectItem>
                    <SelectItem value="archived" className="text-[11px]">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Category</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
                >
                  <SelectTrigger className="h-7 text-[11px]" data-testid="select-template-category">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key} className="text-[11px]">
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Duration (min)</Label>
                <Input
                  type="number"
                  value={templateForm.estimatedDuration}
                  onChange={(e) => setTemplateForm({ ...templateForm, estimatedDuration: parseInt(e.target.value) || 0 })}
                  onFocus={(e) => e.target.select()}
                  placeholder="60"
                  className="h-7 text-[11px]"
                  data-testid="input-template-duration"
                />
              </div>
            </div>

            {/* Active Toggle & Recurring in a row */}
            <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="recurring-template"
                  checked={templateForm.isRecurringTemplate}
                  onCheckedChange={(checked) => 
                    setTemplateForm({ ...templateForm, isRecurringTemplate: checked as boolean })
                  }
                  data-testid="checkbox-recurring-template"
                />
                <Label htmlFor="recurring-template" className="text-[11px] cursor-pointer">
                  Recurring Template
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">Active</Label>
                <Switch
                  checked={templateForm.isActive}
                  onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isActive: checked })}
                  data-testid="switch-template-active"
                />
              </div>
            </div>

            {templateForm.isRecurringTemplate && (
              <div className="space-y-2 p-2 bg-muted/20 rounded border">
                {/* Assignee Selection */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Assign To</Label>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant={templateForm.assigneeType === "role" ? "default" : "outline"}
                      className="flex-1 h-6 text-[11px]"
                      onClick={() => setTemplateForm({ ...templateForm, assigneeType: "role" })}
                      data-testid="button-assign-role"
                    >
                      Role
                    </Button>
                    <Button
                      type="button"
                      variant={templateForm.assigneeType === "user" ? "default" : "outline"}
                      className="flex-1 h-6 text-[11px]"
                      onClick={() => setTemplateForm({ ...templateForm, assigneeType: "user" })}
                      data-testid="button-assign-user"
                    >
                      User
                    </Button>
                  </div>
                  
                  {templateForm.assigneeType === "role" ? (
                    <Select
                      value={templateForm.defaultRoleId}
                      onValueChange={(value) => setTemplateForm({ ...templateForm, defaultRoleId: value })}
                    >
                      <SelectTrigger className="h-7 text-[11px]" data-testid="select-recurring-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id} className="text-[11px]">
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <UserSelect
                      value={templateForm.assigneeUserId}
                      onValueChange={(value) => setTemplateForm({ ...templateForm, assigneeUserId: value })}
                      placeholder="Select a user"
                      allowNone={false}
                      data-testid="select-assignee-user"
                    />
                  )}
                </div>

                {/* Default Task Status */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Default Task Status</Label>
                  <Select
                    value={templateForm.defaultTaskStatus}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, defaultTaskStatus: value })}
                  >
                    <SelectTrigger className="h-7 text-[11px]" data-testid="select-default-task-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskStatusOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key} className="text-[11px]">
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    Tasks will be created with this status
                  </p>
                </div>

                {/* Frequency */}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                  <Select
                    value={templateForm.frequency}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, frequency: value })}
                  >
                    <SelectTrigger className="h-7 text-[11px]" data-testid="select-template-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily" className="text-[11px]">Daily</SelectItem>
                      <SelectItem value="weekly" className="text-[11px]">Weekly</SelectItem>
                      <SelectItem value="monthly" className="text-[11px]">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            
                {/* Daily - Time and Exclude Weekends */}
                {templateForm.frequency === "daily" && (
                  <div className="flex items-end gap-4">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Time</Label>
                      <Input
                        type="time"
                        value={templateForm.dueTime}
                        onChange={(e) => setTemplateForm({ ...templateForm, dueTime: e.target.value })}
                        className="h-7 text-[11px] w-28"
                        data-testid="input-template-time"
                      />
                    </div>
                    <div className="flex items-center gap-4 pb-1">
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id="include-saturday-template"
                          checked={templateForm.includeSaturday}
                          onCheckedChange={(checked) => setTemplateForm({ ...templateForm, includeSaturday: !!checked })}
                          data-testid="checkbox-include-saturday-template"
                        />
                        <Label htmlFor="include-saturday-template" className="text-[10px] text-muted-foreground cursor-pointer">
                          Inc. Saturday
                        </Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id="include-sunday-template"
                          checked={templateForm.includeSunday}
                          onCheckedChange={(checked) => setTemplateForm({ ...templateForm, includeSunday: !!checked })}
                          data-testid="checkbox-include-sunday-template"
                        />
                        <Label htmlFor="include-sunday-template" className="text-[10px] text-muted-foreground cursor-pointer">
                          Inc. Sunday
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
            
                {/* Weekly - Days */}
                {templateForm.frequency === "weekly" && (
                  <>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Days of Week</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {DAYS_OF_WEEK.map((day) => (
                          <Badge
                            key={day.value}
                            variant={templateForm.dueDayOfWeek.includes(day.value) ? "default" : "outline"}
                            className="cursor-pointer hover-elevate active-elevate-2 text-[10px] px-1.5 py-0 h-5"
                            onClick={() => toggleDayOfWeek(day.value)}
                            data-testid={`button-day-${day.label.toLowerCase()}`}
                          >
                            {day.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {templateForm.dueDayOfWeek.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Start Times</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {templateForm.dueDayOfWeek.map((dayValue) => {
                            const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
                            const schedule = getDaySchedule(dayValue);
                            
                            return (
                              <div key={dayValue} className="flex items-center gap-1.5 px-2 py-1 bg-background rounded border">
                                <span className="text-[10px] font-medium w-12">{day?.label}</span>
                                <Select
                                  value={schedule?.startTime || ""}
                                  onValueChange={(value) => updateDaySchedule(dayValue, value, templateForm.estimatedDuration || 60)}
                                >
                                  <SelectTrigger className="h-6 text-[10px] w-16" data-testid={`select-recurring-time-${day?.label.toLowerCase()}`}>
                                    <SelectValue placeholder="--:--" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[200px]">
                                    {Array.from({ length: 96 }, (_, i) => {
                                      const hours = Math.floor(i / 4);
                                      const minutes = (i % 4) * 15;
                                      const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                      return (
                                        <SelectItem key={time} value={time} className="text-[10px]">
                                          {time}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
            
                {/* Monthly - Day */}
                {templateForm.frequency === "monthly" && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Day of Month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={templateForm.dueDayOfMonth}
                      onChange={(e) => setTemplateForm({ ...templateForm, dueDayOfMonth: parseInt(e.target.value) || 1 })}
                      placeholder="1-31"
                      className="h-7 text-[11px] w-20"
                      data-testid="input-template-day-of-month"
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <Label className="text-[10px] text-muted-foreground">Checklist</Label>
                <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={addChecklistItem} data-testid="button-add-checklist">
                  <Plus className="h-2.5 w-2.5" />
                  Add
                </Button>
              </div>
              {templateForm.checklist.length > 0 ? (
                <div className="space-y-1">
                  {templateForm.checklist.map((item, index) => (
                    <div key={index} className="flex gap-1">
                      <Input
                        value={item.text}
                        onChange={(e) => updateChecklistItem(index, e.target.value)}
                        placeholder="Checklist item"
                        className="h-6 text-[11px]"
                        data-testid={`input-checklist-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeChecklistItem(index)}
                        data-testid={`button-remove-checklist-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/30 rounded">No items</div>
              )}
            </div>

            {/* External Links */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <Label className="text-[10px] text-muted-foreground">External Links</Label>
                <Button type="button" variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={addExternalLink} data-testid="button-add-link">
                  <Plus className="h-2.5 w-2.5" />
                  Add
                </Button>
              </div>
              {templateForm.externalLinks.length > 0 ? (
                <div className="space-y-1">
                  {templateForm.externalLinks.map((link, index) => (
                    <div key={index} className="flex gap-1">
                      <Input
                        value={link}
                        onChange={(e) => updateExternalLink(index, e.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        className="h-6 text-[11px]"
                        data-testid={`input-link-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeExternalLink(index)}
                        data-testid={`button-remove-link-${index}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/30 rounded">No links</div>
              )}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setShowDialog(false)} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-[11px]" onClick={handleSaveTemplate} data-testid="button-save-template">
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Template Dialog */}
      <Dialog open={isCreateTaskDialogOpen} onOpenChange={setIsCreateTaskDialogOpen}>
        <DialogContent className="sm:max-w-[420px]" data-testid="dialog-create-task">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm">Create Task from Template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Title *</Label>
              <Input
                value={createTaskFormData.title}
                onChange={(e) => setCreateTaskFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
                className="h-7 text-[11px]"
                data-testid="input-create-task-title"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Description</Label>
              <Textarea
                value={createTaskFormData.content}
                onChange={(e) => setCreateTaskFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Task description..."
                rows={3}
                className="text-[11px]"
                data-testid="input-create-task-content"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Assignee</Label>
              <Select
                value={createTaskFormData.assigneeId || "none"}
                onValueChange={(v) => setCreateTaskFormData(prev => ({ ...prev, assigneeId: v === "none" ? undefined : v }))}
              >
                <SelectTrigger className="h-7 text-[11px]" data-testid="select-create-task-assignee">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-7 text-[11px]"
                    data-testid="button-create-task-due-date"
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {createTaskFormData.dueDate
                      ? format(createTaskFormData.dueDate, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={createTaskFormData.dueDate}
                    onSelect={(date) => setCreateTaskFormData(prev => ({ ...prev, dueDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Status</Label>
              <Select
                value={createTaskFormData.status}
                onValueChange={(v) => setCreateTaskFormData(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger className="h-7 text-[11px]" data-testid="select-create-task-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setIsCreateTaskDialogOpen(false)} data-testid="button-cancel-create-task">
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-[11px]" onClick={handleCreateTaskFromTemplate} disabled={createTaskMutation.isPending} data-testid="button-submit-create-task">
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

TaskLibrary.displayName = "TaskLibrary";
