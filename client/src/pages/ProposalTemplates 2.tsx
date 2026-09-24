import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { type ProposalTemplate } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { File } from "lucide-react";
import { format } from "date-fns";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";

/**
 * The proposal template list.
 *
 * Built on TemplateListPage like every other template type, so the table, the
 * column picker, the search, duplicate and delete all behave the way they do
 * on /po-templates and /rfq-templates — and keep behaving that way when that
 * shared component is changed. The document itself is edited on the detail
 * page, by the real proposal builder.
 */

interface ProposalTemplateForm {
  name: string;
  description: string;
}

const sectionCount = (t: ProposalTemplate) =>
  Array.isArray(t.sections) ? t.sections.filter((s) => s?.isEnabled !== false).length : 0;

const columns: ColumnDef<ProposalTemplate, unknown>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (t) => t.name || "",
    cell: ({ row }) => (
      <span className="text-xs font-medium" data-testid={`cell-name-${row.original.id}`}>
        {row.original.name}
      </span>
    ),
    size: 260,
    meta: { defaultWidth: 260, headerLabel: "Name" } satisfies DataTableColumnMeta,
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
    id: "sections",
    header: "Sections",
    accessorFn: (t) => sectionCount(t),
    cell: ({ row }) => (
      <span className="text-xs tabular-nums" data-testid={`cell-sections-${row.original.id}`}>
        {sectionCount(row.original)}
      </span>
    ),
    size: 90,
    meta: { defaultWidth: 90, align: "right", headerLabel: "Sections" } satisfies DataTableColumnMeta,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (t) => (t.isActive ? "Active" : "Inactive"),
    cell: ({ row }) =>
      row.original.isActive ? (
        <Badge variant="outline" className="text-data">Active</Badge>
      ) : (
        <Badge variant="secondary" className="text-data bg-muted text-secondary dark:text-muted">
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
  { id: "sections", label: "Sections" },
  { id: "status", label: "Status" },
  { id: "updatedAt", label: "Updated" },
  { id: "actions", label: "Actions", pinned: true },
];

export default function ProposalTemplates() {
  const config = useMemo<TemplateListConfig<ProposalTemplate, ProposalTemplateForm>>(
    () => ({
      pageTitle: "Proposal Templates",
      emptyIcon: File,
      emptyDescription:
        "A template is a proposal's structure — its sections, its wording and its layout — without a project attached.",
      api: { base: "/api/proposal-templates" },
      detailRoute: (id) => `/proposal-templates/${id}`,
      table: {
        storageKey: "proposal-templates",
        columns,
        pickerColumns,
        // The document is the template. Opening the row opens the builder;
        // the dialog only ever renames it.
        editAction: { navigate: (t) => `/proposal-templates/${t.id}`, label: "Open" },
      },
      searchFields: (t) => [t.name, t.description],
      sort: (a, b) => a.name.localeCompare(b.name),
      form: {
        initialValues: { name: "", description: "" },
        fromEntity: (t) => ({ name: t.name, description: t.description || "" }),
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        toPayload: (f, mode) => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          // A new template starts empty and is built in the editor. companyId
          // and createdById come from the session server-side, never here.
          ...(mode === "create" ? { sections: [], layoutSettings: {} } : {}),
        }),
        fields: [
          {
            type: "text",
            key: "name",
            label: "Template Name *",
            placeholder: "e.g., Standard Residential Renovation",
            testId: "input-template-name",
          },
          {
            type: "textarea",
            key: "description",
            label: "Description",
            placeholder: "When to reach for this one...",
            rows: 2,
            testId: "textarea-template-description",
          },
        ],
        titles: {
          create: "New Proposal Template",
          edit: "Rename Proposal Template",
          createDescription: "Name it, then build the document itself in the editor.",
          editDescription: "The document is edited in the template itself — this is just its name.",
        },
      },
      duplicatePayload: (t) => ({
        name: `${t.name} (Copy)`,
        description: t.description ?? undefined,
        sections: t.sections ?? [],
        layoutSettings: t.layoutSettings ?? {},
      }),
      toasts: { created: "Open it to build the document." },
    }),
    [],
  );

  return <TemplateListPage config={config} />;
}
