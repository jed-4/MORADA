import { useMemo } from "react";
import { Calculator } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  TemplateListPage,
  type TemplateListConfig,
  type TemplateListPickerColumn,
} from "@/components/templates/TemplateListPage";
import type { TakeoffTemplate } from "@shared/takeoffTemplates";

/**
 * Company-wide take-off templates.
 *
 * The Templates hub has carried a Take-offs card marked "Soon" since the hub
 * was built, pointing at a route that did not exist — so the only way to make
 * a template was to draw the measurements first and Save as template from
 * inside a take-off. That is the wrong way round for a standard kit: you want
 * to set one up once, before any job needs it.
 *
 * Measurement types, colours and line styles are edited on the detail page;
 * this list is the usual create / rename / duplicate / delete.
 */

type TakeoffTemplateForm = { name: string };

/** A template is only as useful as what is in it, so the count is the column that matters. */
const columns: ColumnDef<TakeoffTemplate, unknown>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium" data-testid={`text-template-name-${row.original.id}`}>
        {row.original.name}
      </span>
    ),
  },
  {
    id: "itemCount",
    header: "Items",
    cell: ({ row }) => {
      const count = row.original.items?.length ?? 0;
      return (
        <span className="text-muted-foreground tabular-nums" data-testid={`text-item-count-${row.original.id}`}>
          {count === 0 ? "—" : count}
        </span>
      );
    },
  },
  {
    id: "types",
    header: "Measures",
    cell: ({ row }) => {
      // What the set actually measures, at a glance — an area kit and a
      // linear kit are used at different moments on a job.
      const types = Array.from(
        new Set((row.original.items ?? []).map((i) => i.measurementType).filter(Boolean)),
      );
      return (
        <span className="text-muted-foreground truncate">
          {types.length > 0 ? types.join(", ") : "—"}
        </span>
      );
    },
  },
];

const pickerColumns: TemplateListPickerColumn[] = [
  { id: "name", label: "Name" },
  { id: "itemCount", label: "Items" },
  { id: "types", label: "Measures" },
  { id: "actions", label: "Actions", pinned: true },
];

export default function TakeoffTemplates() {
  const config = useMemo<TemplateListConfig<TakeoffTemplate, TakeoffTemplateForm>>(
    () => ({
      pageTitle: "Take-off Templates",
      emptyIcon: Calculator,
      emptyDescription:
        "A template is a set of measurement items — what you measure and how it is drawn — ready to load into any job's take-off.",
      api: { base: "/api/takeoff-templates" },
      detailRoute: (id) => `/takeoff-templates/${id}`,
      table: {
        storageKey: "takeoff-templates",
        columns,
        pickerColumns,
      },
      searchFields: (t) => [t.name, ...(t.items ?? []).map((i) => i.name)],
      sort: (a, b) => a.name.localeCompare(b.name),
      form: {
        initialValues: { name: "" },
        fromEntity: (t) => ({ name: t.name }),
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        // A new template starts empty; items are added on the detail page.
        toPayload: (f, mode) => ({
          name: f.name.trim(),
          ...(mode === "create" ? { items: [] } : {}),
        }),
        fields: [
          {
            type: "text",
            key: "name",
            label: "Template Name *",
            placeholder: "e.g., Standard House Take-off",
            testId: "input-template-name",
          },
        ],
        titles: {
          create: "New Take-off Template",
          edit: "Rename Take-off Template",
          createDescription: "Name the set, then add its measurement items.",
          editDescription: "Update the template name.",
        },
      },
      duplicatePayload: (template) => ({
        name: `${template.name} (Copy)`,
        items: template.items ?? [],
      }),
      toasts: { created: "Add its measurement items next." },
    }),
    [],
  );

  return <TemplateListPage config={config} />;
}
