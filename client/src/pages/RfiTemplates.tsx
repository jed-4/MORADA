import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { useQuery } from "@tanstack/react-query";
import { type RfiTemplate } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
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
import { HelpCircle, MessageSquare, Settings2 } from "lucide-react";
import { format } from "date-fns";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";
import {
  useTemplateCategories,
  CategoryFilterSelect,
} from "@/components/templates/useTemplateCategories";

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

interface RfiTemplateForm {
  name: string;
  description: string;
  categoryId: string | undefined;
  subjectTemplate: string;
  questionTemplate: string;
  defaultDirectedToType: string;
  defaultPriority: string;
}

const getDirectedToLabel = (type: string | null) => {
  if (!type) return null;
  return DIRECTED_TO_TYPES.find(t => t.value === type)?.label || type;
};

const getPriorityLabel = (priority: string | null) => {
  if (!priority) return null;
  return PRIORITIES.find(p => p.value === priority)?.label || priority;
};

const pickerColumns = [
  { id: "name", label: "Name", pinned: true },
  { id: "description", label: "Description" },
  { id: "subject", label: "Subject" },
  { id: "category", label: "Category" },
  { id: "directedTo", label: "Directed To" },
  { id: "priority", label: "Priority" },
  { id: "updatedAt", label: "Updated" },
  { id: "actions", label: "Actions", pinned: true },
];

export default function RfiTemplates() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { categories, getCategoryBreadcrumb, categoryTree } = useTemplateCategories("rfi");

  const { data: templates = [] } = useQuery<RfiTemplate[]>({
    queryKey: ["/api/rfi-templates"],
  });

  const uniqueCategoryIds = Array.from(new Set(templates.map(t => t.categoryId).filter(Boolean))) as string[];

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
          <Badge variant="outline" className="h-4 px-1.5 text-data" data-testid={`cell-category-${row.original.id}`}>
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
          <Badge variant="secondary" className="h-4 px-1.5 text-data" data-testid={`cell-directed-${row.original.id}`}>
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
          <PriorityBadge
            priority={priority}
            label={getPriorityLabel(priority) || undefined}
            className="h-4 px-1.5"
            data-testid={`cell-priority-${row.original.id}`}
          />
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
  ], [getCategoryBreadcrumb]);

  const config = useMemo<TemplateListConfig<RfiTemplate, RfiTemplateForm>>(
    () => ({
      pageTitle: "RFI Templates",
      emptyIcon: HelpCircle,
      emptyDescription: "Start by adding your first RFI template",
      emptyFilteredDescription: "Try adjusting your search or filter",
      api: { base: "/api/rfi-templates" },
      detailRoute: (id) => `/rfi-templates/${id}`,
      table: {
        storageKey: "rfi-templates",
        legacyConfigKey: "rfi-templates-column-config-v1",
        columns,
        pickerColumns,
      },
      searchFields: (t) => [
        t.name,
        t.description,
        t.subjectTemplate,
        getCategoryBreadcrumb(t.categoryId),
      ],
      extraFilter: (t) => categoryFilter === "all" || t.categoryId === categoryFilter,
      filtersActive: categoryFilter !== "all",
      sort: (a, b) => a.name.localeCompare(b.name),
      form: {
        initialValues: {
          name: "",
          description: "",
          categoryId: undefined,
          subjectTemplate: "",
          questionTemplate: "",
          defaultDirectedToType: "",
          defaultPriority: "normal",
        },
        fromEntity: (t) => ({
          name: t.name,
          description: t.description || "",
          categoryId: t.categoryId || undefined,
          subjectTemplate: t.subjectTemplate || "",
          questionTemplate: t.questionTemplate || "",
          defaultDirectedToType: t.defaultDirectedToType || "",
          defaultPriority: t.defaultPriority || "normal",
        }),
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        toPayload: (f) => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          categoryId: f.categoryId || undefined,
          subjectTemplate: f.subjectTemplate.trim() || undefined,
          questionTemplate: f.questionTemplate.trim() || undefined,
          defaultDirectedToType: f.defaultDirectedToType || undefined,
          defaultPriority: f.defaultPriority || undefined,
        }),
        dialogClassName: "sm:max-w-xl max-h-[90vh] overflow-y-auto",
        titles: {
          create: "New RFI Template",
          edit: "Edit RFI Template",
          createDescription: "Create a new RFI template to speed up creating information requests.",
          editDescription: "Update the template details below.",
        },
        render: ({ form, setForm }) => (
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
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Structural Clarification Request"
                  data-testid="input-template-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of when to use this template..."
                  rows={2}
                  data-testid="textarea-template-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.categoryId || "none"}
                    onValueChange={(value) => setForm({ ...form, categoryId: value === "none" ? undefined : value })}
                  >
                    <SelectTrigger data-testid="select-template-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categoryTree.map((cat) => (
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
                    value={form.defaultPriority}
                    onValueChange={(value) => setForm({ ...form, defaultPriority: value })}
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
                  value={form.defaultDirectedToType}
                  onValueChange={(value) => setForm({ ...form, defaultDirectedToType: value })}
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
                <p className="text-data text-muted-foreground">
                  This will be the default recipient type when using this template
                </p>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="subjectTemplate">Subject Line Template</Label>
                <Input
                  id="subjectTemplate"
                  value={form.subjectTemplate}
                  onChange={(e) => setForm({ ...form, subjectTemplate: e.target.value })}
                  placeholder="e.g., Clarification Required - [Drawing Reference]"
                  data-testid="input-template-subject"
                />
                <p className="text-data text-muted-foreground">
                  Use placeholders like [Drawing Reference], [Area], [Trade] for dynamic content
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="questionTemplate">Question Template</Label>
                <Textarea
                  id="questionTemplate"
                  value={form.questionTemplate}
                  onChange={(e) => setForm({ ...form, questionTemplate: e.target.value })}
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
                <p className="text-data text-muted-foreground">
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
                      className="text-data cursor-pointer hover:bg-secondary/80"
                      onClick={() => {
                        setForm({
                          ...form,
                          questionTemplate: form.questionTemplate + placeholder,
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
        ),
      },
      duplicatePayload: (template) => ({
        name: `${template.name} (Copy)`,
        description: template.description,
        categoryId: template.categoryId,
        subjectTemplate: template.subjectTemplate,
        questionTemplate: template.questionTemplate,
        defaultDirectedToType: template.defaultDirectedToType,
        defaultPriority: template.defaultPriority,
      }),
      toasts: { created: "Your new RFI template has been created." },
      filterBar:
        categories.length > 0 || uniqueCategoryIds.length > 0 ? (
          <CategoryFilterSelect
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            tree={categoryTree}
          />
        ) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, categories, categoryTree, getCategoryBreadcrumb, categoryFilter, uniqueCategoryIds.length],
  );

  return <TemplateListPage config={config} />;
}
