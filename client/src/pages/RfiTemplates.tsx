import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type RfiTemplate, type TemplateCategory } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  HelpCircle,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Loader2,
  MessageSquare,
  Settings2,
  Columns3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

const DIRECTED_TO_TYPES = [
  { value: "client", label: "Client" },
  { value: "architect", label: "Architect" },
  { value: "engineer", label: "Engineer" },
  { value: "consultant", label: "Consultant" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function RfiTemplates() {
  const [, navigate] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RfiTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    categoryId: undefined as string | undefined,
    subjectTemplate: "",
    questionTemplate: "",
    defaultDirectedToType: "",
    defaultPriority: "normal",
  });

  const { data: templates = [], isLoading } = useQuery<RfiTemplate[]>({
    queryKey: ["/api/rfi-templates"],
  });

  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", "rfi"],
    queryFn: async () => {
      const response = await fetch("/api/template-categories?templateType=rfi");
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
    mutationFn: async (data: {
      name: string;
      description?: string;
      categoryId?: string;
      subjectTemplate?: string;
      questionTemplate?: string;
      defaultDirectedToType?: string;
      defaultPriority?: string;
    }) => {
      return await apiRequest("/api/rfi-templates", "POST", data);
    },
    onSuccess: (newTemplate: RfiTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates"] });
      toast({
        title: "Template created",
        description: "Your new RFI template has been created.",
      });
      setIsAddingTemplate(false);
      resetForm();
      navigate(`/rfi-templates/${newTemplate.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RfiTemplate> }) => {
      return await apiRequest(`/api/rfi-templates/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates"] });
      toast({
        title: "Template updated",
        description: "The template has been updated successfully.",
      });
      setEditingTemplate(null);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/rfi-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates"] });
      toast({
        title: "Template deleted",
        description: "The template has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: RfiTemplate) => {
      return await apiRequest("/api/rfi-templates", "POST", {
        name: `${template.name} (Copy)`,
        description: template.description,
        categoryId: template.categoryId,
        subjectTemplate: template.subjectTemplate,
        questionTemplate: template.questionTemplate,
        defaultDirectedToType: template.defaultDirectedToType,
        defaultPriority: template.defaultPriority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates"] });
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      categoryId: undefined,
      subjectTemplate: "",
      questionTemplate: "",
      defaultDirectedToType: "",
      defaultPriority: "normal",
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: RfiTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      categoryId: template.categoryId || undefined,
      subjectTemplate: template.subjectTemplate || "",
      questionTemplate: template.questionTemplate || "",
      defaultDirectedToType: template.defaultDirectedToType || "",
      defaultPriority: template.defaultPriority || "normal",
    });
    setEditingTemplate(template);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Template name is required.",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      categoryId: formData.categoryId || undefined,
      subjectTemplate: formData.subjectTemplate.trim() || undefined,
      questionTemplate: formData.questionTemplate.trim() || undefined,
      defaultDirectedToType: formData.defaultDirectedToType || undefined,
      defaultPriority: formData.defaultPriority || undefined,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredTemplates = templates
    .filter(template => {
      const categoryBreadcrumb = getCategoryBreadcrumb(template.categoryId);
      const matchesSearch =
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.subjectTemplate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        categoryBreadcrumb.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = categoryFilter === "all" || template.categoryId === categoryFilter;

      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getDirectedToLabel = (type: string | null) => {
    if (!type) return null;
    return DIRECTED_TO_TYPES.find(t => t.value === type)?.label || type;
  };

  const getPriorityLabel = (priority: string | null) => {
    if (!priority) return null;
    return PRIORITIES.find(p => p.value === priority)?.label || priority;
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case "urgent": return "border-red-500 text-status-danger";
      case "high": return "border-orange-500 text-status-warning";
      case "low": return "border-border-strong text-muted";
      default: return "";
    }
  };

  const uniqueCategoryIds = [...new Set(templates.map(t => t.categoryId).filter(Boolean))] as string[];

  const handleRowClick = (template: RfiTemplate) => {
    navigate(`/rfi-templates/${template.id}`);
  };

  const columns = useMemo<ColumnDef<RfiTemplate, unknown>[]>(() => [
    {
      id: "name",
      header: "Name",
      accessorFn: (t) => t.name || "",
      cell: ({ row }) => (
        <span className="text-xs font-medium" data-testid={`cell-name-${row.original.id}`}>
          {row.original.name}
        </span>
      ),
      size: 220,
      meta: { defaultWidth: 220, headerLabel: "Name" } satisfies DataTableColumnMeta,
    },
    {
      id: "description",
      header: "Description",
      accessorFn: (t) => t.description || "",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground line-clamp-1" data-testid={`cell-description-${row.original.id}`}>
          {row.original.description || "—"}
        </span>
      ),
      size: 240,
      meta: { defaultWidth: 240, headerLabel: "Description" } satisfies DataTableColumnMeta,
    },
    {
      id: "subject",
      header: "Subject",
      accessorFn: (t) => t.subjectTemplate || "",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground line-clamp-1" data-testid={`cell-subject-${row.original.id}`}>
          {row.original.subjectTemplate || "—"}
        </span>
      ),
      size: 220,
      meta: { defaultWidth: 220, headerLabel: "Subject" } satisfies DataTableColumnMeta,
    },
    {
      id: "category",
      header: "Category",
      accessorFn: (t) => getCategoryBreadcrumb(t.categoryId),
      cell: ({ row }) => {
        const label = getCategoryBreadcrumb(row.original.categoryId);
        return label ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`cell-category-${row.original.id}`}>
            {label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      size: 160,
      meta: { defaultWidth: 160, headerLabel: "Category" } satisfies DataTableColumnMeta,
    },
    {
      id: "directedTo",
      header: "Directed To",
      accessorFn: (t) => getDirectedToLabel(t.defaultDirectedToType) || "",
      cell: ({ row }) => {
        const label = getDirectedToLabel(row.original.defaultDirectedToType);
        return label ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]" data-testid={`cell-directed-${row.original.id}`}>
            {label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "Directed To" } satisfies DataTableColumnMeta,
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (t) => t.defaultPriority || "",
      cell: ({ row }) => {
        const priority = row.original.defaultPriority;
        if (!priority || priority === "normal") {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <Badge
            variant="outline"
            className={`h-4 px-1.5 text-[10px] ${getPriorityColor(priority)}`}
            data-testid={`cell-priority-${row.original.id}`}
          >
            {getPriorityLabel(priority)}
          </Badge>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, headerLabel: "Priority" } satisfies DataTableColumnMeta,
    },
    {
      id: "updatedAt",
      header: "Updated",
      accessorFn: (t) => (t.updatedAt ? new Date(t.updatedAt).getTime() : 0),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground" data-testid={`cell-updated-${row.original.id}`}>
          {row.original.updatedAt ? format(new Date(row.original.updatedAt), "MMM d, yyyy") : "—"}
        </span>
      ),
      size: 110,
      meta: { defaultWidth: 110, headerLabel: "Updated" } satisfies DataTableColumnMeta,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                data-testid={`button-menu-${row.original.id}`}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(row.original);
                }}
                data-testid={`button-edit-${row.original.id}`}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateMutation.mutate(row.original);
                }}
                data-testid={`button-duplicate-${row.original.id}`}
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(row.original.id);
                }}
                className="text-destructive"
                data-testid={`button-delete-${row.original.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      size: 56,
      meta: { defaultWidth: 56, align: "right", headerLabel: "Actions" } satisfies DataTableColumnMeta,
    },
  ], [categories, duplicateMutation, deleteMutation]);

  const pickerColumns = useMemo(
    () => [
      { id: "name", label: "Name", pinned: true },
      { id: "description", label: "Description" },
      { id: "subject", label: "Subject" },
      { id: "category", label: "Category" },
      { id: "directedTo", label: "Directed To" },
      { id: "priority", label: "Priority" },
      { id: "updatedAt", label: "Updated" },
      { id: "actions", label: "Actions", pinned: true },
    ],
    [],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            RFI Templates
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleOpenAdd}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-templates"
            />
          </div>

          {(categories.length > 0 || uniqueCategoryIds.length > 0) && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-6 w-40 text-xs" data-testid="select-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {buildCategoryTree().map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span style={{ paddingLeft: `${cat.depth * 12}px` }}>
                      {cat.depth > 0 ? "└ " : ""}{cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              data-testid="button-column-picker"
            >
              <Columns3 className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker storageKey="rfi-templates" columns={pickerColumns} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm || categoryFilter !== "all" ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm || categoryFilter !== "all"
                ? "Try adjusting your search or filter"
                : "Start by adding your first RFI template"}
            </p>
            {!searchTerm && categoryFilter === "all" && (
              <button
                onClick={handleOpenAdd}
                className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                data-testid="button-create-first-template"
              >
                <Plus className="h-3 w-3" />
                Add Your First Template
              </button>
            )}
          </div>
        ) : (
          <DataTable
            data={filteredTemplates}
            columns={columns}
            storageKey="rfi-templates"
            legacyConfigKey="rfi-templates-column-config-v1"
            rowKey={(t) => t.id}
            onRowClick={handleRowClick}
          />
        )}
      </div>

      <Dialog
        open={isAddingTemplate || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingTemplate(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit RFI Template" : "New RFI Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template details below."
                : "Create a new RFI template to speed up creating information requests."}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="text-xs">
                <Settings2 className="h-3 w-3 mr-1" />
                Details
              </TabsTrigger>
              <TabsTrigger value="content" className="text-xs">
                <MessageSquare className="h-3 w-3 mr-1" />
                Content
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Structural Clarification Request"
                  data-testid="input-template-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of when to use this template..."
                  rows={2}
                  data-testid="textarea-template-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.categoryId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, categoryId: value === "none" ? undefined : value })}
                  >
                    <SelectTrigger data-testid="select-template-category">
                      <SelectValue placeholder="Select category" />
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

                <div className="space-y-2">
                  <Label htmlFor="defaultPriority">Default Priority</Label>
                  <Select
                    value={formData.defaultPriority}
                    onValueChange={(value) => setFormData({ ...formData, defaultPriority: value })}
                  >
                    <SelectTrigger data-testid="select-template-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultDirectedToType">Default Directed To</Label>
                <Select
                  value={formData.defaultDirectedToType}
                  onValueChange={(value) => setFormData({ ...formData, defaultDirectedToType: value })}
                >
                  <SelectTrigger data-testid="select-template-directed-to">
                    <SelectValue placeholder="Select recipient type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTED_TO_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  This will be the default recipient type when using this template
                </p>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="subjectTemplate">Subject Line Template</Label>
                <Input
                  id="subjectTemplate"
                  value={formData.subjectTemplate}
                  onChange={(e) => setFormData({ ...formData, subjectTemplate: e.target.value })}
                  placeholder="e.g., Clarification Required - [Drawing Reference]"
                  data-testid="input-template-subject"
                />
                <p className="text-[10px] text-muted-foreground">
                  Use placeholders like [Drawing Reference], [Area], [Trade] for dynamic content
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="questionTemplate">Question Template</Label>
                <Textarea
                  id="questionTemplate"
                  value={formData.questionTemplate}
                  onChange={(e) => setFormData({ ...formData, questionTemplate: e.target.value })}
                  placeholder="Please clarify the following regarding [SUBJECT]:

1. [Question 1]

2. [Question 2]

Reference Documents:
- [Document name]

Response Required By: [Date]"
                  rows={10}
                  className="font-mono text-sm"
                  data-testid="textarea-template-question"
                />
                <p className="text-[10px] text-muted-foreground">
                  Create a structured question template. Use brackets for fields to fill in when using the template.
                </p>
              </div>

              <div className="border rounded-md p-3 bg-muted/30">
                <h4 className="text-xs font-medium mb-2">Available Placeholders</h4>
                <div className="flex flex-wrap gap-1">
                  {["[Drawing Reference]", "[Area]", "[Trade]", "[Date]", "[Location]", "[Item]", "[Question]"].map((placeholder) => (
                    <Badge
                      key={placeholder}
                      variant="secondary"
                      className="text-[10px] cursor-pointer hover:bg-secondary/80"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          questionTemplate: formData.questionTemplate + placeholder,
                        });
                      }}
                    >
                      {placeholder}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingTemplate(false);
                setEditingTemplate(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingTemplate ? (
                "Update Template"
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
