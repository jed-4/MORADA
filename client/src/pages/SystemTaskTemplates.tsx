import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Calendar as CalendarIcon,
  Tag as TagIcon,
  X,
  Search,
  Filter,
  RotateCcw,
  Info,
  MoreVertical,
  PlayCircle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import type { TaskTemplate, TaskTag, TaskTemplateStatus } from "@shared/schema";

interface RecurringScheduleItem {
  dayOfWeek: number;
  startTime: string;
  duration: number;
}

interface TaskTemplateFormData {
  title: string;
  goal?: string;
  description?: string;
  statusId?: string;
  defaultRoleId?: string;
  tagIds: string[];
  isRecurringTemplate: boolean;
  recurringDays: number[];
  recurringSchedule: RecurringScheduleItem[];
  recurringStartTime?: string; // DEPRECATED
  recurringDuration?: number; // DEPRECATED
  recurringAssigneeId?: string; // DEPRECATED
  estimatedDuration?: number;
  checklist: Array<{ text: string; completed: boolean }>;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
];

interface CreateTaskFormData {
  title: string;
  content: string;
  assigneeId?: string;
  dueDate?: Date;
  status: string;
  tags: string[];
}

export default function SystemTaskTemplates() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  
  // Create task from template state
  const [isCreateTaskDialogOpen, setIsCreateTaskDialogOpen] = useState(false);
  const [selectedTemplateForTask, setSelectedTemplateForTask] = useState<TaskTemplate | null>(null);
  const [createTaskFormData, setCreateTaskFormData] = useState<CreateTaskFormData>({
    title: "",
    content: "",
    assigneeId: undefined,
    dueDate: undefined,
    status: "todo",
    tags: [],
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [recurringFilter, setRecurringFilter] = useState<"all" | "yes" | "no">("all");
  
  const [formData, setFormData] = useState<TaskTemplateFormData>({
    title: "",
    goal: "",
    description: "",
    statusId: undefined,
    defaultRoleId: undefined,
    tagIds: [],
    isRecurringTemplate: false,
    recurringDays: [],
    recurringSchedule: [],
    recurringStartTime: "",
    recurringDuration: undefined,
    recurringAssigneeId: undefined,
    estimatedDuration: undefined,
    checklist: [],
  });
  const [checklistInput, setChecklistInput] = useState("");

  // Queries
  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/task-templates"],
  });

  const { data: tags = [] } = useQuery<TaskTag[]>({ queryKey: ["/api/task-tags"] });
  const { data: statuses = [] } = useQuery<TaskTemplateStatus[]>({
    queryKey: ["/api/task-template-statuses"],
  });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: userRoles = [] } = useQuery<any[]>({ queryKey: ["/api/user-roles"] });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: Partial<TaskTemplateFormData>) =>
      await apiRequest("/api/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template created",
        description: "The task template has been created successfully.",
      });
      handleCloseDialog();
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to create task template.",
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskTemplateFormData> }) =>
      await apiRequest(`/api/task-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template updated",
        description: "The task template has been updated successfully.",
      });
      handleCloseDialog();
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to update task template.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest(`/api/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template deleted",
        description: "The task template has been deleted successfully.",
      });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to delete task template.",
        variant: "destructive",
      }),
  });

  // Create task from template mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest("/api/tasks", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task created",
        description: "The task has been created from the template.",
      });
      handleCloseCreateTaskDialog();
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to create task.",
        variant: "destructive",
      }),
  });

  // Handlers for Create Task from Template
  const handleOpenCreateTaskDialog = (template: TaskTemplate) => {
    setSelectedTemplateForTask(template);
    // Pre-fill form with template data
    setCreateTaskFormData({
      title: template.title,
      content: template.description || template.goal || "",
      assigneeId: template.assigneeUserId || undefined,
      dueDate: undefined,
      status: "todo",
      tags: (template.tagIds as string[]) || [],
    });
    setIsCreateTaskDialogOpen(true);
  };

  const handleCloseCreateTaskDialog = () => {
    setIsCreateTaskDialogOpen(false);
    setSelectedTemplateForTask(null);
    setCreateTaskFormData({
      title: "",
      content: "",
      assigneeId: undefined,
      dueDate: undefined,
      status: "todo",
      tags: [],
    });
  };

  const handleCreateTaskFromTemplate = () => {
    if (!createTaskFormData.title.trim()) {
      toast({
        title: "Validation error",
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    const taskData = {
      type: "task",
      title: createTaskFormData.title,
      content: createTaskFormData.content || "",
      assigneeId: createTaskFormData.assigneeId || undefined,
      assigneeName: createTaskFormData.assigneeId 
        ? users.find(u => u.id === createTaskFormData.assigneeId)?.firstName + " " + users.find(u => u.id === createTaskFormData.assigneeId)?.lastName
        : undefined,
      dueDate: createTaskFormData.dueDate || undefined,
      status: createTaskFormData.status,
      tags: createTaskFormData.tags,
      templateId: selectedTemplateForTask?.id,
      // Business task (no projectId)
      projectId: null,
    };

    createTaskMutation.mutate(taskData);
  };

  // Handlers
  const handleOpenDialog = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        goal: template.goal || "",
        description: template.description || "",
        statusId: template.statusId || undefined,
        defaultRoleId: template.defaultRoleId || undefined,
        tagIds: (template.tagIds as string[]) || [],
        isRecurringTemplate: template.isRecurringTemplate || false,
        recurringDays: (template.recurringDays as number[]) || [],
        recurringSchedule: (template.recurringSchedule as RecurringScheduleItem[]) || [],
        recurringStartTime: template.recurringStartTime || "",
        recurringDuration: template.recurringDuration || undefined,
        recurringAssigneeId: template.recurringAssigneeId || undefined,
        estimatedDuration: template.estimatedDuration || undefined,
        checklist: (template.checklist as Array<{ text: string; completed: boolean }>) || [],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        title: "",
        goal: "",
        description: "",
        statusId: undefined,
        defaultRoleId: undefined,
        tagIds: [],
        isRecurringTemplate: false,
        recurringDays: [],
        recurringSchedule: [],
        recurringStartTime: "",
        recurringDuration: undefined,
        recurringAssigneeId: undefined,
        estimatedDuration: undefined,
        checklist: [],
      });
    }
    setChecklistInput("");
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({
        title: "Validation error",
        description: "Template title is required.",
        variant: "destructive",
      });
      return;
    }

    const dataToSubmit = {
      title: formData.title,
      goal: formData.goal || undefined,
      description: formData.description || undefined,
      statusId: formData.statusId || undefined,
      defaultRoleId: formData.defaultRoleId || undefined,
      tagIds: formData.tagIds,
      isRecurringTemplate: formData.isRecurringTemplate,
      recurringDays: formData.isRecurringTemplate ? formData.recurringDays : [],
      recurringSchedule: formData.isRecurringTemplate ? formData.recurringSchedule : [],
      estimatedDuration: formData.estimatedDuration || undefined,
      checklist: formData.checklist,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this task template?")) {
      deleteMutation.mutate(id);
    }
  };

  const toggleTag = (tagId: string) => {
    setFormData(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter(id => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const toggleDay = (day: number) => {
    setFormData(prev => {
      const isSelected = prev.recurringDays.includes(day);
      const newRecurringDays = isSelected
        ? prev.recurringDays.filter(d => d !== day)
        : [...prev.recurringDays, day].sort((a, b) => a - b);
      
      // If deselecting a day, remove its schedule entry
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
    setFormData(prev => {
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

  const getDaySchedule = (dayOfWeek: number): RecurringScheduleItem | undefined => {
    return formData.recurringSchedule.find(s => s.dayOfWeek === dayOfWeek);
  };

  const addChecklistItem = () => {
    if (checklistInput.trim()) {
      setFormData(prev => ({
        ...prev,
        checklist: [...prev.checklist, { text: checklistInput.trim(), completed: false }],
      }));
      setChecklistInput("");
    }
  };

  const removeChecklistItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index),
    }));
  };

  const getTagById = (id: string) => tags.find(tag => tag.id === id);
  const getStatusById = (id: string) => statuses.find(status => status.id === id);

  const filteredTemplates = templates.filter(template => {
    if (searchTerm && !template.title.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (statusFilter !== "all" && template.statusId !== statusFilter) {
      return false;
    }
    if (tagFilter.length > 0) {
      const templateTagIds = (template.tagIds as string[]) || [];
      if (!tagFilter.some(tagId => templateTagIds.includes(tagId))) {
        return false;
      }
    }
    if (recurringFilter === "yes" && !template.isRecurringTemplate) {
      return false;
    }
    if (recurringFilter === "no" && template.isRecurringTemplate) {
      return false;
    }
    return true;
  });

  const hasActiveFilters = searchTerm || statusFilter !== "all" || tagFilter.length > 0 || recurringFilter !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setTagFilter([]);
    setRecurringFilter("all");
  };

  const toggleTagFilter = (tagId: string) => {
    setTagFilter(prev => 
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <div className="flex flex-col h-full" data-testid="system-task-templates">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Task Templates</h1>
              <p className="text-muted-foreground mt-1">
                Create and manage reusable task templates for common workflows and processes.
              </p>
            </div>
            <Button onClick={() => handleOpenDialog()} data-testid="button-create-template">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-2 border-b">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8"
                data-testid="input-search"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8" data-testid="filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status.id} value={status.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                      {status.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={recurringFilter} onValueChange={(v) => setRecurringFilter(v as "all" | "yes" | "no")}>
              <SelectTrigger className="w-[130px] h-8" data-testid="filter-recurring">
                <SelectValue placeholder="Recurring" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="yes">Recurring</SelectItem>
                <SelectItem value="no">One-time</SelectItem>
              </SelectContent>
            </Select>

            {tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap max-w-md overflow-x-auto">
                <span className="text-xs text-muted-foreground mr-1 flex-shrink-0">Tags:</span>
                {tags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={tagFilter.includes(tag.id) ? "default" : "outline"}
                    className="cursor-pointer text-[10px] px-1.5 py-0 flex-shrink-0"
                    style={tagFilter.includes(tag.id) ? { backgroundColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                    onClick={() => toggleTagFilter(tag.id)}
                    data-testid={`filter-tag-${tag.id}`}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs" data-testid="button-clear-filters">
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}

            <div className="ml-auto text-xs text-muted-foreground">
              {filteredTemplates.length} of {templates.length} templates
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 p-6">
                <p className="text-muted-foreground text-center">
                  No task templates yet. Create your first template to get started.
                </p>
              </CardContent>
            </Card>
          ) : filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 p-6">
                <Filter className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-center">
                  No templates match your filters.
                </p>
                <Button variant="link" onClick={clearFilters} className="mt-2" data-testid="button-clear-filters-empty">
                  Clear all filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Recurring</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map(template => {
                      const templateTags = (template.tagIds as string[] || [])
                        .map(id => getTagById(id))
                        .filter(Boolean);
                      const templateStatus = template.statusId ? getStatusById(template.statusId) : null;

                      return (
                        <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{template.title}</span>
                                {template.description && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                        data-testid={`button-description-${template.id}`}
                                      >
                                        <Info className="h-3.5 w-3.5" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 text-sm" align="start">
                                      <div className="space-y-1">
                                        <p className="font-medium text-xs text-muted-foreground">Description</p>
                                        <p className="whitespace-pre-wrap">{template.description}</p>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                              {template.goal && (
                                <span className="text-sm text-muted-foreground">{template.goal}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {templateStatus && (
                              <Badge
                                style={{ backgroundColor: templateStatus.color }}
                                className="text-white"
                                data-testid={`badge-status-${template.id}`}
                              >
                                {templateStatus.name}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {templateTags.map(tag => (
                                <Badge
                                  key={tag.id}
                                  style={{ backgroundColor: tag.color }}
                                  className="text-white text-xs"
                                  data-testid={`badge-tag-${tag.id}-${template.id}`}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {template.isRecurringTemplate && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>
                                  {(template.recurringDays as number[] || []).length} day(s)
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-actions-${template.id}`}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleOpenCreateTaskDialog(template)}
                                  data-testid={`menu-create-task-${template.id}`}
                                >
                                  <PlayCircle className="w-4 h-4 mr-2" />
                                  Create Task
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleOpenDialog(template)}
                                  data-testid={`menu-edit-${template.id}`}
                                >
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Edit Template
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(template.id)}
                                  className="text-destructive focus:text-destructive"
                                  data-testid={`menu-delete-${template.id}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingTemplate ? "Edit Task Template" : "Create Task Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the task template details below."
                : "Create a new reusable task template."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Daily Site Inspection"
                data-testid="input-title"
              />
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal">Goal</Label>
              <Input
                id="goal"
                value={formData.goal}
                onChange={e => setFormData(prev => ({ ...prev, goal: e.target.value }))}
                placeholder="Brief, to-the-point goal"
                data-testid="input-goal"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.statusId}
                onValueChange={value => setFormData(prev => ({ ...prev, statusId: value }))}
              >
                <SelectTrigger id="status" data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status.id} value={status.id} data-testid={`status-option-${status.id}`}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recurring Template */}
            <div className="flex flex-col gap-4 p-4 border rounded-md bg-muted/5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRecurringTemplate"
                  checked={formData.isRecurringTemplate}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, isRecurringTemplate: checked as boolean }))
                  }
                  data-testid="checkbox-recurring"
                />
                <Label htmlFor="isRecurringTemplate" className="cursor-pointer">
                  <CalendarIcon className="w-4 h-4 inline mr-1" />
                  Enable Recurring Schedule (Perfect Week)
                </Label>
              </div>

              {formData.isRecurringTemplate && (
                <div className="flex flex-col gap-4 pl-6">
                  {/* Days of Week */}
                  <div className="flex flex-col gap-2">
                    <Label>Days of Week</Label>
                    <div className="flex flex-wrap gap-2" data-testid="recurring-days">
                      {DAYS_OF_WEEK.map(day => {
                        const isSelected = formData.recurringDays.includes(day.value);
                        return (
                          <Badge
                            key={day.value}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleDay(day.value)}
                            data-testid={`day-${day.value}`}
                          >
                            {day.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day-specific times */}
                  {formData.recurringDays.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <Label>Schedule for Each Day</Label>
                      <div className="flex flex-col gap-2">
                        {formData.recurringDays.map(dayValue => {
                          const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
                          const schedule = getDaySchedule(dayValue);
                          return (
                            <div
                              key={dayValue}
                              className="flex items-center gap-2 p-2 border rounded-md bg-muted/20"
                              data-testid={`day-schedule-${dayValue}`}
                            >
                              <span className="w-16 text-sm font-medium">{day?.fullLabel}</span>
                              <Input
                                type="time"
                                value={schedule?.startTime || "09:00"}
                                onChange={e =>
                                  updateDaySchedule(
                                    dayValue,
                                    e.target.value,
                                    schedule?.duration || 60
                                  )
                                }
                                className="w-32"
                                data-testid={`time-${dayValue}`}
                              />
                              <Input
                                type="number"
                                min="1"
                                value={schedule?.duration || 60}
                                onChange={e =>
                                  updateDaySchedule(
                                    dayValue,
                                    schedule?.startTime || "09:00",
                                    parseInt(e.target.value) || 60
                                  )
                                }
                                placeholder="60"
                                className="w-24"
                                data-testid={`duration-${dayValue}`}
                              />
                              <span className="text-xs text-muted-foreground">min</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Role Assignment */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="defaultRole">Assign to Role</Label>
                    <Select
                      value={formData.defaultRoleId}
                      onValueChange={value =>
                        setFormData(prev => ({ ...prev, defaultRoleId: value }))
                      }
                    >
                      <SelectTrigger id="defaultRole" data-testid="select-role">
                        <SelectValue placeholder="Select role (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {userRoles.map((role: any) => (
                          <SelectItem key={role.id} value={role.id} data-testid={`role-option-${role.id}`}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Tasks will be created for all users with this role
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <Label>
                <TagIcon className="w-4 h-4 inline mr-1" />
                Tags
              </Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[44px]" data-testid="tags-container">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tags available. Create tags in Task Settings.
                  </p>
                ) : (
                  tags.map(tag => {
                    const isSelected = formData.tagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: isSelected ? tag.color : "transparent",
                          borderColor: tag.color,
                          color: isSelected ? "white" : tag.color,
                        }}
                        className="cursor-pointer border-2"
                        onClick={() => toggleTag(tag.id)}
                        data-testid={`tag-${tag.id}`}
                      >
                        {tag.name}
                        {isSelected && <X className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })
                )}
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimatedDuration">Estimated Duration (minutes)</Label>
              <Input
                id="estimatedDuration"
                type="number"
                min="0"
                value={formData.estimatedDuration || ""}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    estimatedDuration: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                placeholder="60"
                data-testid="input-estimated-duration"
              />
            </div>

            {/* Checklist */}
            <div className="flex flex-col gap-2">
              <Label>Checklist Items</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add checklist item..."
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  data-testid="input-checklist"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addChecklistItem}
                  disabled={!checklistInput.trim()}
                  data-testid="button-add-checklist"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.checklist.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {formData.checklist.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                      data-testid={`checklist-item-${index}`}
                    >
                      <span className="flex-1 text-sm">{item.text}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistItem(index)}
                        data-testid={`button-remove-checklist-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingTemplate
                  ? "Update Template"
                  : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Template Dialog */}
      <Dialog open={isCreateTaskDialogOpen} onOpenChange={setIsCreateTaskDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="create-task-dialog-title">
              Create Task from Template
            </DialogTitle>
            <DialogDescription>
              Adjust the task details as needed before creating.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={createTaskFormData.title}
                onChange={e => setCreateTaskFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
                data-testid="input-task-title"
              />
            </div>

            {/* Description/Content */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-content">Description</Label>
              <Textarea
                id="task-content"
                value={createTaskFormData.content}
                onChange={e => setCreateTaskFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Task description..."
                rows={3}
                data-testid="input-task-content"
              />
            </div>

            {/* Assignee */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select
                value={createTaskFormData.assigneeId || "none"}
                onValueChange={v => setCreateTaskFormData(prev => ({ ...prev, assigneeId: v === "none" ? undefined : v }))}
              >
                <SelectTrigger data-testid="select-task-assignee">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal"
                    data-testid="button-task-due-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {createTaskFormData.dueDate
                      ? format(createTaskFormData.dueDate, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={createTaskFormData.dueDate}
                    onSelect={date => setCreateTaskFormData(prev => ({ ...prev, dueDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                value={createTaskFormData.status}
                onValueChange={v => setCreateTaskFormData(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger data-testid="select-task-status">
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

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseCreateTaskDialog} data-testid="button-cancel-create-task">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTaskFromTemplate}
              disabled={createTaskMutation.isPending}
              data-testid="button-create-task"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
