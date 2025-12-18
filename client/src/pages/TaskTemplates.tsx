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
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Clock,
  Calendar as CalendarIcon,
  Tag as TagIcon,
  X,
  ListTodo,
  CheckSquare,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskTemplate, TaskTag, TaskTemplateStatus, TemplateCategory } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

interface RecurringScheduleItem {
  dayOfWeek: number;
  startTime: string;
  duration: number;
}

interface TaskTemplateFormData {
  title: string;
  goal?: string;
  description?: string;
  categoryId?: string;
  statusId?: string;
  defaultRoleId?: string;
  tagIds: string[];
  isRecurringTemplate: boolean;
  recurringDays: number[];
  recurringSchedule: RecurringScheduleItem[];
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

export default function TaskTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterRecurring, setFilterRecurring] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [formData, setFormData] = useState<TaskTemplateFormData>({
    title: "",
    goal: "",
    description: "",
    categoryId: undefined,
    statusId: undefined,
    defaultRoleId: undefined,
    tagIds: [],
    isRecurringTemplate: false,
    recurringDays: [],
    recurringSchedule: [],
    estimatedDuration: undefined,
    checklist: [],
  });
  const [checklistInput, setChecklistInput] = useState("");

  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  const { data: tags = [] } = useQuery<TaskTag[]>({ queryKey: ["/api/task-tags"] });
  const { data: statuses = [] } = useQuery<TaskTemplateStatus[]>({
    queryKey: ["/api/task-template-statuses"],
  });
  const { data: userRoles = [] } = useQuery<any[]>({ queryKey: ["/api/user-roles"] });
  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", "task"],
    queryFn: async () => {
      const response = await fetch("/api/template-categories?templateType=task");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const getCategoryBreadcrumb = (categoryId: string | null | undefined): string => {
    if (!categoryId) return "";
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return "";
    
    const breadcrumbParts: string[] = [category.name];
    let currentCategory = category;
    
    while (currentCategory.parentId) {
      const parent = categories.find((c) => c.id === currentCategory.parentId);
      if (parent) {
        breadcrumbParts.unshift(parent.name);
        currentCategory = parent;
      } else {
        break;
      }
    }
    
    return breadcrumbParts.join(" / ");
  };

  const buildCategoryTree = () => {
    const rootCategories = categories.filter((c) => !c.parentId);
    const tree: { id: string; name: string; depth: number }[] = [];
    
    const addChildren = (parentId: string | null, depth: number) => {
      const children = categories.filter((c) => c.parentId === parentId);
      children.forEach((child) => {
        tree.push({ id: child.id, name: child.name, depth });
        addChildren(child.id, depth + 1);
      });
    };
    
    rootCategories.forEach((root) => {
      tree.push({ id: root.id, name: root.name, depth: 0 });
      addChildren(root.id, 1);
    });
    
    return tree;
  };

  const createMutation = useMutation({
    mutationFn: async (data: Partial<TaskTemplateFormData>) =>
      await apiRequest("/api/systems/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
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
      await apiRequest(`/api/systems/task-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
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
    mutationFn: async (id: string) => await apiRequest(`/api/systems/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
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

  const duplicateMutation = useMutation({
    mutationFn: async (template: TaskTemplate) => {
      return await apiRequest("/api/systems/task-templates", "POST", {
        title: `${template.title} (Copy)`,
        goal: template.goal,
        description: template.description,
        categoryId: template.categoryId,
        statusId: template.statusId,
        defaultRoleId: template.defaultRoleId,
        tagIds: template.tagIds,
        isRecurringTemplate: template.isRecurringTemplate,
        recurringDays: template.recurringDays,
        recurringSchedule: template.recurringSchedule,
        estimatedDuration: template.estimatedDuration,
        checklist: template.checklist,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated successfully.",
      });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      }),
  });

  // Create task from template functionality
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const [isCreateTaskDialogOpen, setIsCreateTaskDialogOpen] = useState(false);
  const [selectedTemplateForTask, setSelectedTemplateForTask] = useState<TaskTemplate | null>(null);
  const [createTaskFormData, setCreateTaskFormData] = useState({
    title: "",
    content: "",
    assigneeId: undefined as string | undefined,
    dueDate: undefined as Date | undefined,
    status: "todo",
  });

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
      assigneeId: undefined,
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

  const handleOpenDialog = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        goal: template.goal || "",
        description: template.description || "",
        categoryId: template.categoryId || undefined,
        statusId: template.statusId || undefined,
        defaultRoleId: template.defaultRoleId || undefined,
        tagIds: (template.tagIds as string[]) || [],
        isRecurringTemplate: template.isRecurringTemplate || false,
        recurringDays: (template.recurringDays as number[]) || [],
        recurringSchedule: (template.recurringSchedule as RecurringScheduleItem[]) || [],
        estimatedDuration: template.estimatedDuration || undefined,
        checklist: (template.checklist as Array<{ text: string; completed: boolean }>) || [],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        title: "",
        goal: "",
        description: "",
        categoryId: undefined,
        statusId: undefined,
        defaultRoleId: undefined,
        tagIds: [],
        isRecurringTemplate: false,
        recurringDays: [],
        recurringSchedule: [],
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

    const data = {
      ...formData,
      title: formData.title.trim(),
      goal: formData.goal?.trim() || undefined,
      description: formData.description?.trim() || undefined,
      categoryId: formData.categoryId || undefined,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddChecklistItem = () => {
    if (checklistInput.trim()) {
      setFormData(prev => ({
        ...prev,
        checklist: [...prev.checklist, { text: checklistInput.trim(), completed: false }],
      }));
      setChecklistInput("");
    }
  };

  const handleRemoveChecklistItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index),
    }));
  };

  const handleToggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      recurringDays: prev.recurringDays.includes(day)
        ? prev.recurringDays.filter(d => d !== day)
        : [...prev.recurringDays, day].sort((a, b) => a - b),
    }));
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = 
      template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCategoryBreadcrumb(template.categoryId).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || template.categoryId === filterCategory;
    const matchesStatus = filterStatus === "all" || template.statusId === filterStatus;
    const matchesRole = filterRole === "all" || template.defaultRoleId === filterRole;
    const matchesTag = filterTag === "all" || (template.tagIds as string[] | null)?.includes(filterTag);
    const matchesRecurring = filterRecurring === "all" || 
      (filterRecurring === "yes" && template.isRecurringTemplate) ||
      (filterRecurring === "no" && !template.isRecurringTemplate);
    
    return matchesSearch && matchesCategory && matchesStatus && matchesRole && matchesTag && matchesRecurring;
  });

  const getChecklistCount = (template: TaskTemplate) => {
    const checklist = template.checklist as Array<{ text: string; completed: boolean }> | null;
    return checklist?.length || 0;
  };

  const getTagNames = (template: TaskTemplate) => {
    const tagIds = template.tagIds as string[] | null;
    if (!tagIds || tagIds.length === 0) return [];
    return tags.filter(tag => tagIds.includes(tag.id)).map(tag => tag.name);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold text-foreground" data-testid="text-page-title">
              Task Templates
            </span>
          </div>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {filteredTemplates.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleOpenDialog()}
            className="h-7 text-xs"
            data-testid="button-add-template"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Template
          </Button>
        </div>
      </div>

      {/* Row 2 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center px-2 gap-2 flex-shrink-0 border-b border-border overflow-x-auto">
        <div className="relative flex-shrink-0 w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 pl-7 text-xs"
            data-testid="input-search-templates"
          />
        </div>
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-7 w-32 text-xs flex-shrink-0" data-testid="select-filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {buildCategoryTree().map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {"  ".repeat(cat.depth)}{cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="select-filter-role">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {userRoles.map((role: any) => (
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTag} onValueChange={setFilterTag}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="select-filter-tag">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterRecurring} onValueChange={setFilterRecurring}>
          <SelectTrigger className="h-7 w-28 text-xs flex-shrink-0" data-testid="select-filter-recurring">
            <SelectValue placeholder="Recurring" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="yes">Recurring</SelectItem>
            <SelectItem value="no">One-time</SelectItem>
          </SelectContent>
        </Select>

        {(filterCategory !== "all" || filterStatus !== "all" || filterRole !== "all" || filterTag !== "all" || filterRecurring !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs flex-shrink-0"
            onClick={() => {
              setFilterCategory("all");
              setFilterStatus("all");
              setFilterRole("all");
              setFilterTag("all");
              setFilterRecurring("all");
            }}
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <CheckSquare className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchTerm || filterCategory !== "all" || filterStatus !== "all" || filterRole !== "all" || filterTag !== "all" || filterRecurring !== "all"
                ? "No templates match your filters" 
                : "No task templates yet"}
            </p>
            {!searchTerm && filterCategory === "all" && filterStatus === "all" && filterRole === "all" && filterTag === "all" && filterRecurring === "all" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => handleOpenDialog()}
                data-testid="button-add-first-template"
              >
                <Plus className="h-3 w-3 mr-1" />
                Create your first template
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {/* Column Headers */}
            <div className="hidden md:flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
              <div className="flex-1 min-w-0">Name</div>
              <div className="w-48 hidden lg:block">Description</div>
              <div className="w-24">Role</div>
              <div className="w-24">Status</div>
              <div className="w-8"></div>
            </div>
            {filteredTemplates.map((template) => {
              const roleName = template.defaultRoleId 
                ? userRoles.find(r => r.id === template.defaultRoleId)?.name || "—"
                : "—";
              const statusName = template.statusId
                ? statuses.find(s => s.id === template.statusId)?.name || "—"
                : "—";
              
              return (
                <div
                  key={template.id}
                  className="group flex items-center gap-2 px-3 py-2 border-b hover-elevate cursor-pointer"
                  onClick={() => handleOpenDialog(template)}
                  data-testid={`card-template-${template.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" data-testid={`text-template-title-${template.id}`}>
                      {template.title}
                    </span>
                  </div>
                  <div className="w-48 hidden lg:block">
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {template.goal || template.description || "—"}
                    </span>
                  </div>
                  <div className="w-24">
                    <span className="text-xs text-muted-foreground truncate block">
                      {roleName}
                    </span>
                  </div>
                  <div className="w-24">
                    {statusName !== "—" ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-full">
                        {statusName}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="w-8 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); handleOpenCreateTaskDialog(template); }}
                          data-testid="menu-create-task"
                        >
                          <PlayCircle className="h-3 w-3 mr-2" />
                          Create Task
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDialog(template); }}>
                          <Pencil className="h-3 w-3 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(template); }}>
                          <Copy className="h-3 w-3 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(template.id); }}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Task Template" : "Create Task Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the task template details"
                : "Create a reusable template for tasks"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter template title"
                data-testid="input-template-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={formData.categoryId || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, categoryId: value === "none" ? undefined : value }))
                  }
                >
                  <SelectTrigger data-testid="select-template-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {buildCategoryTree().map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span style={{ paddingLeft: `${cat.depth * 12}px` }}>
                          {cat.depth > 0 ? "└ " : ""}{cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="estimatedDuration">Estimated Duration (minutes)</Label>
                <Input
                  id="estimatedDuration"
                  type="number"
                  value={formData.estimatedDuration || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      estimatedDuration: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                  placeholder="60"
                  data-testid="input-template-duration"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="goal">Goal</Label>
              <Input
                id="goal"
                value={formData.goal}
                onChange={(e) => setFormData((prev) => ({ ...prev, goal: e.target.value }))}
                placeholder="Brief goal for this task"
                data-testid="input-template-goal"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description..."
                rows={3}
                data-testid="input-template-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Default Role</Label>
                <Select
                  value={formData.defaultRoleId || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, defaultRoleId: value === "none" ? undefined : value }))
                  }
                >
                  <SelectTrigger data-testid="select-template-role">
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default role</SelectItem>
                    {userRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.statusId || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, statusId: value === "none" ? undefined : value }))
                  }
                >
                  <SelectTrigger data-testid="select-template-status">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No status</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="grid gap-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={formData.tagIds.includes(tag.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          tagIds: prev.tagIds.includes(tag.id)
                            ? prev.tagIds.filter((id) => id !== tag.id)
                            : [...prev.tagIds, tag.id],
                        }))
                      }
                    >
                      <TagIcon className="h-3 w-3 mr-1" />
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recurring Settings */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRecurring"
                  checked={formData.isRecurringTemplate}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isRecurringTemplate: checked === true }))
                  }
                />
                <Label htmlFor="isRecurring" className="text-sm cursor-pointer">
                  This is a recurring template
                </Label>
              </div>

              {formData.isRecurringTemplate && (
                <div className="ml-6 grid gap-2 mt-2">
                  <Label className="text-xs text-muted-foreground">Select recurring days</Label>
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={formData.recurringDays.includes(day.value) ? "default" : "outline"}
                        size="sm"
                        className="w-9 h-7 text-xs"
                        onClick={() => handleToggleDay(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div className="grid gap-2">
              <Label>Checklist Items</Label>
              <div className="flex gap-2">
                <Input
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  placeholder="Add checklist item..."
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddChecklistItem())}
                  data-testid="input-checklist-item"
                />
                <Button type="button" size="sm" onClick={handleAddChecklistItem}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {formData.checklist.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {formData.checklist.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                      <CheckSquare className="h-3 w-3 text-muted-foreground" />
                      <span className="flex-1 truncate">{item.text}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleRemoveChecklistItem(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task from Template Dialog */}
      <Dialog open={isCreateTaskDialogOpen} onOpenChange={setIsCreateTaskDialogOpen}>
        <DialogContent className="sm:max-w-[420px]" data-testid="dialog-create-task">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Task from Template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Title *</Label>
              <Input
                value={createTaskFormData.title}
                onChange={(e) => setCreateTaskFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
                className="h-8 text-sm"
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
                className="text-sm"
                data-testid="input-create-task-content"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Assignee</Label>
              <Select
                value={createTaskFormData.assigneeId || "none"}
                onValueChange={(v) => setCreateTaskFormData(prev => ({ ...prev, assigneeId: v === "none" ? undefined : v }))}
              >
                <SelectTrigger className="h-8 text-sm" data-testid="select-create-task-assignee">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
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
                    className="w-full justify-start text-left font-normal h-8 text-sm"
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
                <SelectTrigger className="h-8 text-sm" data-testid="select-create-task-status">
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
            <Button variant="outline" size="sm" onClick={() => setIsCreateTaskDialogOpen(false)} data-testid="button-cancel-create-task">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTaskFromTemplate} disabled={createTaskMutation.isPending} data-testid="button-submit-create-task">
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
