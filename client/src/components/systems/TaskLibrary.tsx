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
  ArrowDown
} from "lucide-react";
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
    status: "active" as "active" | "draft" | "archived",
    isActive: true,
    dueTime: "",
    dueDayOfWeek: [] as number[],
    dueDayOfMonth: 1,
    checklist: [] as Array<{ text: string; completed: boolean }>,
    externalLinks: [] as string[],
    isRecurringTemplate: false,
    recurringDays: [] as number[],
    recurringSchedule: [] as Array<{ dayOfWeek: number; startTime: string; duration: number }>,
  });

  // Fetch task templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  // Fetch user roles
  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  // Fetch users for assignee selection
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Task template created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create task template", variant: "destructive" });
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
      toast({ title: "Task template updated successfully" });
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      const errorMessage = error?.message || error?.details || "Failed to update task template";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({ title: "Task template deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete task template", variant: "destructive" });
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
      status: "active",
      isActive: true,
      dueTime: "",
      dueDayOfWeek: [],
      dueDayOfMonth: 1,
      checklist: [],
      externalLinks: [],
      isRecurringTemplate: false,
      recurringDays: [],
      recurringSchedule: [],
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
      status: (template.status as "active" | "draft" | "archived") || "active",
      isActive: template.isActive,
      dueTime: template.dueTime || "",
      dueDayOfWeek: template.dueDayOfWeek ? (Array.isArray(template.dueDayOfWeek) ? template.dueDayOfWeek : JSON.parse(template.dueDayOfWeek as string)) : [],
      dueDayOfMonth: template.dueDayOfMonth || 1,
      checklist: template.checklist ? (Array.isArray(template.checklist) ? template.checklist : JSON.parse(template.checklist as string)) : [],
      externalLinks: template.externalLinks ? (Array.isArray(template.externalLinks) ? template.externalLinks : JSON.parse(template.externalLinks as string)) : [],
      isRecurringTemplate: template.isRecurringTemplate || false,
      recurringDays: template.recurringDays ? (Array.isArray(template.recurringDays) ? template.recurringDays : JSON.parse(template.recurringDays as string)) : [],
      recurringSchedule: template.recurringSchedule ? (Array.isArray(template.recurringSchedule) ? template.recurringSchedule : JSON.parse(template.recurringSchedule as string)) : [],
    });
    setShowDialog(true);
  };

  // Expose dialog opening functions to parent via ref
  useImperativeHandle(ref, () => ({
    openNewTemplateDialog,
    generateRecurringTasks: () => generateRecurringMutation.mutate(),
  }));

  const handleSaveTemplate = () => {
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
          ? [0, 1, 2, 3, 4, 5, 6] // Daily = all days
          : [],
      defaultRoleId: templateForm.isRecurringTemplate ? (templateForm.defaultRoleId || null) : null,
      // Include assignee fields
      assigneeType: templateForm.assigneeType,
      assigneeUserId: templateForm.assigneeType === 'user' ? (templateForm.assigneeUserId || null) : null,
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

  const sortedTemplates = [...templates].sort((a, b) => {
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

  // Grid template with minimum widths to prevent column squashing
  const gridTemplate = "32px minmax(260px, 1.4fr) minmax(160px, 0.8fr) minmax(150px, 0.7fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr) minmax(120px, 0.5fr) 32px";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3">
        {templates.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No task templates yet. Create your first template to get started.
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              {/* Header Row */}
              <div 
                className="grid items-center gap-4 px-4 h-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800"
                style={{ gridTemplateColumns: gridTemplate }}
              >
              <div></div>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('title')}
                data-testid="sort-title"
              >
                <span>Title & Goal</span>
                {getSortIcon('title')}
              </button>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('category')}
                data-testid="sort-category"
              >
                <span>Category</span>
                {getSortIcon('category')}
              </button>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('role')}
                data-testid="sort-role"
              >
                <span>Role</span>
                {getSortIcon('role')}
              </button>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('frequency')}
                data-testid="sort-frequency"
              >
                <span>Frequency</span>
                {getSortIcon('frequency')}
              </button>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('assignee')}
                data-testid="sort-assignee"
              >
                <span>Assignee</span>
                {getSortIcon('assignee')}
              </button>
              <button 
                className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover-elevate active-elevate-2 rounded px-2 py-1 -ml-2 text-left"
                onClick={() => handleSort('status')}
                data-testid="sort-status"
              >
                <span>Status</span>
                {getSortIcon('status')}
              </button>
              <div></div>
            </div>

              {/* Template Rows */}
              {sortedTemplates.map((template) => {
                const checklistCount = Array.isArray(template.checklist) ? template.checklist.length : 0;
                const linksCount = Array.isArray(template.externalLinks) ? template.externalLinks.length : 0;
                const hasGoal = !!template.goal;
                
                return (
                  <div 
                    key={template.id}
                    className="grid items-center gap-4 px-4 h-10 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: gridTemplate }}
                    onClick={() => openEditTemplateDialog(template)}
                    data-testid={`template-row-${template.id}`}
                  >
                  {/* Leading space for consistency */}
                  <div></div>

                  {/* Title & Goal */}
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{template.title}</div>
                    {hasGoal && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mt-0.5">
                        <Target className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{template.goal}</span>
                      </div>
                    )}
                  </div>

                  {/* Info Badges */}
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    {template.category && (() => {
                      const categoryInfo = getCategoryInfo(template.category);
                      return (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
                          style={{ 
                            borderColor: categoryInfo?.color || '#6B7280',
                            color: categoryInfo?.color || '#6B7280'
                          }}
                        >
                          {categoryInfo?.name || template.category}
                        </Badge>
                      );
                    })()}
                    {checklistCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                        <CheckSquare className="h-3 w-3" />
                        {checklistCount}
                      </Badge>
                    )}
                    {linksCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                        <Link className="h-3 w-3" />
                        {linksCount}
                      </Badge>
                    )}
                  </div>

                  {/* Role */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {getRoleName(template.defaultRoleId)}
                  </div>

                  {/* Frequency */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {getFrequencyLabel(template)}
                  </div>

                  {/* Assignee */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {template.assigneeType === 'user' ? (
                      template.assigneeUserName ? (
                        <Badge variant="outline" className="h-5 px-2 text-xs">
                          {template.assigneeUserName}
                        </Badge>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">
                        {template.defaultRoleId ? getRoleName(template.defaultRoleId) : '-'}
                      </span>
                    )}
                  </div>

                  {/* Active Status */}
                  <div>
                    {template.isActive ? (
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 h-5 px-2 text-xs">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-5 px-2 text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`template-menu-${template.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
          </Card>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-template">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Task Template"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[calc(90vh-150px)] overflow-y-auto pr-2">
            <div>
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="Task template title"
                data-testid="input-template-title"
                required
              />
            </div>
            <div>
              <Label>Goal</Label>
              <Input
                value={templateForm.goal}
                onChange={(e) => setTemplateForm({ ...templateForm, goal: e.target.value })}
                placeholder="Brief, to-the-point goal"
                data-testid="input-template-goal"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Detailed description"
                data-testid="input-template-description"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={templateForm.status}
                onValueChange={(value: "active" | "draft" | "archived") => setTemplateForm({ ...templateForm, status: value })}
              >
                <SelectTrigger data-testid="select-template-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurring Template Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring-template"
                checked={templateForm.isRecurringTemplate}
                onCheckedChange={(checked) => 
                  setTemplateForm({ ...templateForm, isRecurringTemplate: checked as boolean })
                }
                data-testid="checkbox-recurring-template"
              />
              <Label htmlFor="recurring-template" className="cursor-pointer">
                Recurring Template
              </Label>
            </div>

            {templateForm.isRecurringTemplate && (
              <>
                {/* Assignee Selection */}
                <div className="space-y-3">
                  <Label>Assign To</Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={templateForm.assigneeType === "role" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTemplateForm({ ...templateForm, assigneeType: "role" })}
                      data-testid="button-assign-role"
                    >
                      Role
                    </Button>
                    <Button
                      type="button"
                      variant={templateForm.assigneeType === "user" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setTemplateForm({ ...templateForm, assigneeType: "user" })}
                      data-testid="button-assign-user"
                    >
                      Specific User
                    </Button>
                  </div>
                  
                  {templateForm.assigneeType === "role" ? (
                    <Select
                      value={templateForm.defaultRoleId}
                      onValueChange={(value) => setTemplateForm({ ...templateForm, defaultRoleId: value })}
                    >
                      <SelectTrigger data-testid="select-recurring-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
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

                <div>
                  <Label>Frequency</Label>
                  <Select
                    value={templateForm.frequency}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, frequency: value })}
                  >
                    <SelectTrigger data-testid="select-template-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            
                {/* Conditional frequency fields */}
                {templateForm.frequency === "daily" && (
                  <div>
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={templateForm.dueTime}
                      onChange={(e) => setTemplateForm({ ...templateForm, dueTime: e.target.value })}
                      data-testid="input-template-time"
                    />
                  </div>
                )}
            
                {templateForm.frequency === "weekly" && (
                  <>
                    <div>
                      <Label>Days of Week</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <Badge
                            key={day.value}
                            variant={templateForm.dueDayOfWeek.includes(day.value) ? "default" : "outline"}
                            className="cursor-pointer hover-elevate active-elevate-2"
                            onClick={() => toggleDayOfWeek(day.value)}
                            data-testid={`button-day-${day.label.toLowerCase()}`}
                          >
                            {day.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Time and duration for each selected day */}
                    {templateForm.dueDayOfWeek.length > 0 && (
                      <div className="space-y-3">
                        <Label>Start Times</Label>
                        {templateForm.dueDayOfWeek.map((dayValue) => {
                          const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
                          const schedule = getDaySchedule(dayValue);
                          
                          return (
                            <div key={dayValue} className="flex items-center gap-3">
                              <span className="w-20 text-sm font-medium">{day?.fullLabel}</span>
                              <Select
                                value={schedule?.startTime || ""}
                                onValueChange={(value) => updateDaySchedule(dayValue, value, templateForm.estimatedDuration || 60)}
                              >
                                <SelectTrigger className="w-32" data-testid={`select-recurring-time-${day?.label.toLowerCase()}`}>
                                  <SelectValue placeholder="Time" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px]">
                                  {Array.from({ length: 96 }, (_, i) => {
                                    const hours = Math.floor(i / 4);
                                    const minutes = (i % 4) * 15;
                                    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                    return (
                                      <SelectItem key={time} value={time}>
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
                    )}
                  </>
                )}
            
                {templateForm.frequency === "monthly" && (
                  <div>
                    <Label>Day of Month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={templateForm.dueDayOfMonth}
                      onChange={(e) => setTemplateForm({ ...templateForm, dueDayOfMonth: parseInt(e.target.value) || 1 })}
                      placeholder="1-31"
                      data-testid="input-template-day-of-month"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <Label>Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
              >
                <SelectTrigger data-testid="select-template-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Duration (minutes)</Label>
              <Input
                type="number"
                value={templateForm.estimatedDuration}
                onChange={(e) => setTemplateForm({ ...templateForm, estimatedDuration: parseInt(e.target.value) || 0 })}
                onFocus={(e) => e.target.select()}
                placeholder="60"
                data-testid="input-template-duration"
              />
            </div>
            
            {/* Checklist */}
            <div>
              <Label className="flex items-center justify-between">
                <span>Checklist</span>
                <Button type="button" variant="outline" size="sm" onClick={addChecklistItem} data-testid="button-add-checklist">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </Label>
              {templateForm.checklist.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {templateForm.checklist.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={item.text}
                        onChange={(e) => updateChecklistItem(index, e.target.value)}
                        placeholder="Checklist item"
                        data-testid={`input-checklist-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeChecklistItem(index)}
                        data-testid={`button-remove-checklist-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">No checklist items</div>
              )}
            </div>

            {/* External Links */}
            <div>
              <Label className="flex items-center justify-between">
                <span>External Links</span>
                <Button type="button" variant="outline" size="sm" onClick={addExternalLink} data-testid="button-add-link">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Link
                </Button>
              </Label>
              {templateForm.externalLinks.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {templateForm.externalLinks.map((link, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={link}
                        onChange={(e) => updateExternalLink(index, e.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        data-testid={`input-link-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExternalLink(index)}
                        data-testid={`button-remove-link-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">No external links</div>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={templateForm.isActive}
                onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isActive: checked })}
                data-testid="switch-template-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} data-testid="button-save-template">
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

TaskLibrary.displayName = "TaskLibrary";
