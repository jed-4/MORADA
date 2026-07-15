import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { type PurchaseOrderTemplate } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";

interface TemplateItem {
  description: string;
  quantity?: string;
  unit?: string;
  unitPrice?: number;
  costCodeId?: string;
}

interface POTemplateForm {
  name: string;
  description: string;
  scope: string;
}

const getItemCount = (template: PurchaseOrderTemplate) => {
  const items = template.items as TemplateItem[] | null;
  return items?.length || 0;
};

const columns: ColumnDef<PurchaseOrderTemplate, unknown>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (t) => t.name || "",
    cell: ({ row }) => (
      <span className="text-xs font-medium" data-testid={`cell-name-${row.original.id}`}>
        {row.original.name}
      </span>
    ),
    size: 240,
    meta: { defaultWidth: 240, headerLabel: "Name" } satisfies DataTableColumnMeta,
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (t) => t.description || "",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground" data-testid={`cell-description-${row.original.id}`}>
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
    cell: ({ row }) => {
      const count = getItemCount(row.original);
      return (
        <span className="text-xs tabular-nums" data-testid={`cell-items-${row.original.id}`}>
          {count}
        </span>
      );
    },
    size: 80,
    meta: { defaultWidth: 80, align: "right", headerLabel: "Items" } satisfies DataTableColumnMeta,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (t) => (t.isActive ? "Active" : "Inactive"),
    cell: ({ row }) =>
      row.original.isActive ? (
        <Badge variant="outline" className="text-data">Active</Badge>
      ) : (
        <Badge
          variant="secondary"
          className="text-data bg-muted text-secondary dark:text-muted"
        >
          Inactive
        </Badge>
      ),
    size: 90,
    meta: { defaultWidth: 90, headerLabel: "Status" } satisfies DataTableColumnMeta,
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
    size: 120,
    meta: { defaultWidth: 120, headerLabel: "Updated" } satisfies DataTableColumnMeta,
  },
];

const pickerColumns = [
  { id: "name", label: "Name" },
  { id: "description", label: "Description" },
  { id: "items", label: "Items" },
  { id: "status", label: "Status" },
  { id: "updatedAt", label: "Updated" },
  { id: "actions", label: "Actions", pinned: true },
];

export default function POTemplates() {
  const { user } = useAuth();

  const config = useMemo<TemplateListConfig<PurchaseOrderTemplate, POTemplateForm>>(
    () => ({
      pageTitle: "PO Templates",
      emptyIcon: ShoppingCart,
      emptyDescription: "Start by adding your first purchase order template",
      api: { base: "/api/purchase-order-templates" },
      detailRoute: (id) => `/po-templates/${id}`,
      table: {
        storageKey: "po-templates",
        legacyConfigKey: "po-templates-column-config-v1",
        columns,
        pickerColumns,
      },
      searchFields: (t) => [t.name, t.description],
      sort: (a, b) => a.name.localeCompare(b.name),
      form: {
        initialValues: { name: "", description: "", scope: "" },
        fromEntity: (t) => ({
          name: t.name,
          description: t.description || "",
          scope: t.scope || "",
        }),
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        toPayload: (f, mode) => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          scope: f.scope.trim() || undefined,
          ...(mode === "create"
            ? { items: [], companyId: user?.companyId, createdById: user?.id }
            : {}),
        }),
        fields: [
          {
            type: "text",
            key: "name",
            label: "Template Name *",
            placeholder: "e.g., Standard Framing Pack",
            testId: "input-template-name",
          },
          {
            type: "textarea",
            key: "description",
            label: "Description",
            placeholder: "Brief description of the template...",
            rows: 2,
            testId: "textarea-template-description",
          },
          {
            type: "textarea",
            key: "scope",
            label: "Default Scope",
            placeholder: "Default scope text to include in POs...",
            rows: 3,
            testId: "textarea-template-scope",
          },
        ],
        titles: {
          create: "New PO Template",
          edit: "Edit PO Template",
          createDescription: "Create a new purchase order template to reuse across projects.",
          editDescription: "Update the template details below.",
        },
      },
      duplicatePayload: (template) => {
        const { id, createdAt, updatedAt, ...rest } = template;
        return { ...rest, name: `${template.name} (Copy)`, createdById: user?.id };
      },
      toasts: { created: "Your new PO template has been created." },
    }),
    [user],
  );

  return <TemplateListPage config={config} />;
}
