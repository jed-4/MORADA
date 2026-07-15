import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { type ScopeTemplate } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Layers } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";

const STORAGE_KEY = "scope-templates";
const LEGACY_CONFIG_KEY = "scope-templates-column-config-v1";

interface ScopeTemplateForm {
  name: string;
  description: string;
  category: string;
}

const getItemCount = (template: ScopeTemplate) => {
  return (template.templateData as unknown[])?.length || 0;
};

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    residential: "bg-status-info-bg text-status-info",
    commercial: "bg-primary/10 text-primary",
    renovation: "bg-status-warning-bg text-status-warning",
  };
  return colors[category.toLowerCase()] || "";
};

const columns: ColumnDef<ScopeTemplate, unknown>[] = [
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
    id: "category",
    header: "Category",
    accessorFn: (t) => t.category || "",
    cell: ({ row }) => {
      const category = row.original.category;
      if (!category) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <Badge
          variant="secondary"
          className={`h-4 px-1.5 text-data ${getCategoryColor(category)}`}
          data-testid={`cell-category-${row.original.id}`}
        >
          {category}
        </Badge>
      );
    },
    size: 140,
    meta: { defaultWidth: 140, headerLabel: "Category" } satisfies DataTableColumnMeta,
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (t) => t.description || "",
    cell: ({ row }) => (
      <span
        className="text-xs text-muted-foreground line-clamp-1"
        data-testid={`cell-description-${row.original.id}`}
      >
        {row.original.description || "—"}
      </span>
    ),
    size: 320,
    meta: { defaultWidth: 320, headerLabel: "Description" } satisfies DataTableColumnMeta,
  },
  {
    id: "items",
    header: "Items",
    accessorFn: (t) => getItemCount(t),
    cell: ({ row }) => (
      <span className="text-xs tabular-nums" data-testid={`cell-items-${row.original.id}`}>
        {getItemCount(row.original)}
      </span>
    ),
    size: 80,
    meta: { defaultWidth: 80, align: "right", headerLabel: "Items" } satisfies DataTableColumnMeta,
  },
  {
    id: "updatedAt",
    header: "Last Updated",
    accessorFn: (t) => (t.updatedAt ? new Date(t.updatedAt).getTime() : 0),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground" data-testid={`cell-updated-${row.original.id}`}>
        {row.original.updatedAt ? format(new Date(row.original.updatedAt), "MMM d, yyyy") : "—"}
      </span>
    ),
    size: 130,
    meta: { defaultWidth: 130, headerLabel: "Last Updated" } satisfies DataTableColumnMeta,
  },
];

const pickerColumns = [
  { id: "name", label: "Name" },
  { id: "category", label: "Category" },
  { id: "description", label: "Description" },
  { id: "items", label: "Items" },
  { id: "updatedAt", label: "Last Updated" },
];

export default function ScopeTemplates() {
  const { user } = useAuth();

  const config = useMemo<TemplateListConfig<ScopeTemplate, ScopeTemplateForm>>(
    () => ({
      pageTitle: "Scope Templates",
      emptyIcon: Layers,
      emptyDescription: "Start by adding your first scope template",
      emptyActionLabel: "Create Template",
      api: { base: "/api/scope-templates" },
      detailRoute: (id) => `/scope-templates/${id}`,
      table: {
        storageKey: STORAGE_KEY,
        legacyConfigKey: LEGACY_CONFIG_KEY,
        columns,
        pickerColumns,
        editAction: { navigate: (t) => `/scope-templates/${t.id}` },
      },
      searchFields: (t) => [t.name, t.category],
      form: {
        initialValues: { name: "", description: "", category: "" },
        fromEntity: (t) => ({
          name: t.name,
          description: t.description || "",
          category: t.category || "",
        }),
        validate: (f) =>
          f.name.trim()
            ? null
            : { title: "Missing name", description: "Please enter a template name." },
        toPayload: (f, mode) => ({
          name: f.name,
          description: f.description,
          category: f.category,
          ...(mode === "create" ? { templateData: [] } : {}),
        }),
        fields: [
          {
            type: "text",
            key: "name",
            label: "Template Name *",
            placeholder: "e.g., Residential Build",
            testId: "input-template-name",
          },
          {
            type: "text",
            key: "category",
            label: "Category",
            placeholder: "e.g., Residential, Commercial",
            testId: "input-template-category",
          },
          {
            type: "textarea",
            key: "description",
            label: "Description",
            placeholder: "Describe what this template is for...",
            rows: 3,
            testId: "input-template-description",
          },
        ],
        titles: {
          create: "Create Scope Template",
          edit: "Edit Scope Template",
          createDescription: "Create a new scope template that can be reused across projects.",
          editDescription: "Update the template name, category, or description.",
        },
      },
      duplicatePayload: (template) => ({
        name: `${template.name} (Copy)`,
        description: template.description,
        category: template.category,
        templateData: template.templateData,
        createdBy: user?.id,
        createdByName:
          user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.email,
      }),
      toasts: {
        created: "Your scope template has been created successfully.",
        updated: "Your scope template has been updated successfully.",
        deleted: "Your scope template has been deleted successfully.",
      },
      errorToasts: {
        create: "Failed to create template. Please try again.",
        update: "Failed to update template. Please try again.",
        delete: "Failed to delete template. Please try again.",
      },
    }),
    [user],
  );

  return <TemplateListPage config={config} />;
}
