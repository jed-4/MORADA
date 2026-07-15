import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Loader2,
  Columns3,
} from "lucide-react";
import {
  useTemplateCrud,
  type TemplateCrudToasts,
  type TemplateCrudErrorToasts,
} from "./useTemplateCrud";

export interface TemplateEntity {
  id: string;
  name: string;
}

export type TemplateFormMode = "create" | "edit";

export type TemplateFormField<TForm> = {
  key: Extract<keyof TForm, string>;
  label: string;
  placeholder?: string;
  /** data-testid on the input/textarea/select trigger. */
  testId?: string;
} & (
  | { type: "text" }
  | { type: "textarea"; rows?: number }
  | { type: "select"; options: Array<{ value: string; label: string }> }
);

export interface TemplateFormRenderProps<TForm> {
  form: TForm;
  setForm: (form: TForm) => void;
  mode: TemplateFormMode;
}

export interface TemplateListPickerColumn {
  id: string;
  label: string;
  pinned?: boolean;
}

export interface TemplateListConfig<T extends TemplateEntity, TForm extends object> {
  /** Singular noun used in the count badge. Default "template". */
  entityLabel?: string;
  pageTitle: string;
  /** Icon for the empty state. */
  emptyIcon: LucideIcon;
  /** Empty-state copy when there are no templates at all. */
  emptyDescription?: string;
  /** Empty-state CTA label. Default "Add Your First Template". */
  emptyActionLabel?: string;
  api: {
    /** REST base route, e.g. "/api/purchase-order-templates". */
    base: string;
    /** Query key for the list. Defaults to [api.base]. */
    queryKey?: readonly unknown[];
  };
  /** Detail route for a template id — enables row click navigation. */
  detailRoute?: (id: string) => string;
  /** Navigate to detailRoute after create. Default true when detailRoute is set. */
  navigateOnCreate?: boolean;
  table: {
    /** DataTable storage scope — must be copied verbatim from the legacy page. */
    storageKey: string;
    /** Legacy layout key to import once — copied verbatim from the legacy page. */
    legacyConfigKey?: string;
    /** Data columns, WITHOUT the actions column (appended automatically). */
    columns: ColumnDef<T, unknown>[];
    /** Column-picker entries — ids/labels copied verbatim from the legacy page. */
    pickerColumns: TemplateListPickerColumn[];
    /** Append the standard pinned actions column. Default true. */
    includeActionsColumn?: boolean;
    /** Extra DropdownMenuItems rendered between Duplicate and Delete. */
    extraRowActions?: (row: T) => ReactNode;
    /** Extra classes merged onto the table wrapper ("flex-1 overflow-hidden"). */
    contentClassName?: string;
    /**
     * Row-menu edit behaviour. Default "dialog" opens the shared edit dialog.
     * Pass { navigate } to route to a detail page instead (labelled "View / Edit").
     */
    editAction?: "dialog" | { navigate: (t: T) => string; label?: string };
    /** data-testid on the column-picker trigger. Default "button-column-picker". */
    columnPickerTestId?: string;
  };
  /** Fields matched (case-insensitively) against the search term. */
  searchFields: (t: T) => Array<string | null | undefined>;
  /** Additional predicate applied after search (e.g. category filter). */
  extraFilter?: (t: T) => boolean;
  /** Set true when a page-level filter is active so the empty state says "No templates found". */
  filtersActive?: boolean;
  /** Empty-state copy when search/filters match nothing. Default "Try adjusting your search terms". */
  emptyFilteredDescription?: string;
  sort?: (a: T, b: T) => number;
  form: {
    initialValues: TForm;
    /** Map an entity into form values when opening the edit dialog. */
    fromEntity: (t: T) => TForm;
    /**
     * Return an error to block save, or null when valid. A plain string uses
     * the standard "Validation error" toast title; return an object to
     * override the title too.
     */
    validate?: (form: TForm) => string | { title: string; description: string } | null;
    /** Build the request body for create (POST) or edit (PATCH). */
    toPayload: (form: TForm, mode: TemplateFormMode) => Record<string, unknown>;
    /** Declarative dialog fields — or use render for full control. */
    fields?: TemplateFormField<TForm>[];
    /** Escape hatch: render the dialog body yourself (tabs, item editors, ...). */
    render?: (props: TemplateFormRenderProps<TForm>) => ReactNode;
    /** DialogContent className. Default "sm:max-w-md". */
    dialogClassName?: string;
    titles: {
      create: string;
      edit: string;
      createDescription?: string;
      editDescription?: string;
    };
  };
  /** Build the POST body for the Duplicate row action. */
  duplicatePayload: (t: T) => Record<string, unknown>;
  /** Override success-toast descriptions. */
  toasts?: TemplateCrudToasts;
  /** Override error-toast descriptions. */
  errorToasts?: TemplateCrudErrorToasts;
  /** Extra controls rendered before the New Template button. */
  headerActions?: ReactNode;
  /** Extra controls rendered after the search input (e.g. CategoryFilterSelect). */
  filterBar?: ReactNode;
  /** Additional dialogs rendered at the page root (e.g. import dialog). */
  extraDialogs?: ReactNode;
  /** Extra content rendered under the empty state. */
  emptyStateActions?: ReactNode;
}

/**
 * Config-driven template list page: two-row header, shared DataTable with the
 * standard pinned actions column, create/edit dialog, delete confirmation.
 * Storage keys, column ids, and data-testids are supplied verbatim via config
 * so users' saved layouts survive migration.
 */
export function TemplateListPage<T extends TemplateEntity, TForm extends object>({
  config,
}: {
  config: TemplateListConfig<T, TForm>;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<T | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [formData, setFormData] = useState<TForm>(config.form.initialValues);

  const entityLabel = config.entityLabel ?? "template";
  const queryKey = config.api.queryKey ?? [config.api.base];

  const { data: templates = [], isLoading } = useQuery<T[]>({
    queryKey: queryKey as unknown[],
  });

  const resetForm = () => setFormData(config.form.initialValues);

  const {
    createMutation,
    updateMutation,
    deleteMutation,
    duplicateMutation,
    isSaving,
    confirmDelete,
    setConfirmDelete,
  } = useTemplateCrud<T>({
    apiBase: config.api.base,
    queryKey,
    toasts: config.toasts,
    errorToasts: config.errorToasts,
    duplicatePayload: config.duplicatePayload,
    onCreateSuccess: (created) => {
      setIsAddingTemplate(false);
      resetForm();
      if (config.detailRoute && config.navigateOnCreate !== false) {
        navigate(config.detailRoute(created.id));
      }
    },
    onUpdateSuccess: () => {
      setEditingTemplate(null);
      resetForm();
    },
  });

  const handleOpenAdd = () => {
    resetForm();
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: T) => {
    setFormData(config.form.fromEntity(template));
    setEditingTemplate(template);
  };

  const closeDialog = () => {
    setIsAddingTemplate(false);
    setEditingTemplate(null);
    resetForm();
  };

  const handleSave = () => {
    const error = config.form.validate?.(formData);
    if (error) {
      const { title, description } =
        typeof error === "string" ? { title: "Validation error", description: error } : error;
      toast({ title, description, variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({
        id: editingTemplate.id,
        data: config.form.toPayload(formData, "edit"),
      });
    } else {
      createMutation.mutate(config.form.toPayload(formData, "create"));
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.toLowerCase();
    let list = templates.filter((template) =>
      config.searchFields(template).some((field) => field?.toLowerCase().includes(q)),
    );
    if (config.extraFilter) list = list.filter(config.extraFilter);
    if (config.sort) list = [...list].sort(config.sort);
    return list;
  }, [templates, searchTerm, config]);

  const columns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (config.table.includeActionsColumn === false) return config.table.columns;
    const actionsColumn: ColumnDef<T, unknown> = {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end" data-testid={`cell-actions-${row.original.id}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
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
                  const editAction = config.table.editAction;
                  if (editAction && editAction !== "dialog") {
                    navigate(editAction.navigate(row.original));
                  } else {
                    handleOpenEdit(row.original);
                  }
                }}
                data-testid={`button-edit-${row.original.id}`}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                {config.table.editAction && config.table.editAction !== "dialog"
                  ? config.table.editAction.label ?? "View / Edit"
                  : "Edit"}
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
              {config.table.extraRowActions?.(row.original)}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete({ id: row.original.id, name: row.original.name });
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
      meta: { defaultWidth: 56, align: "right", pinned: true, headerLabel: "Actions" } satisfies DataTableColumnMeta,
    };
    return [...config.table.columns, actionsColumn];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.table.columns, config.table.includeActionsColumn, config.table.extraRowActions, config.table.editAction, duplicateMutation]);

  const filtersActive = searchTerm !== "" || config.filtersActive === true;
  const mode: TemplateFormMode = editingTemplate ? "edit" : "create";

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {config.pageTitle}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? entityLabel : `${entityLabel}s`}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {config.headerActions}
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

      {/* Row 2 - Search & Filters */}
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
          {config.filterBar}
        </div>
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              data-testid={config.table.columnPickerTestId ?? "button-column-picker"}
            >
              <Columns3 className="w-3 h-3 mr-1" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker
              storageKey={config.table.storageKey}
              columns={config.table.pickerColumns}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Templates Table */}
      <div className={cn("flex-1 overflow-hidden", config.table.contentClassName)}>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="py-8">
            <EmptyState
              variant="inline"
              icon={config.emptyIcon}
              title={filtersActive ? "No templates found" : "No templates yet"}
              description={
                filtersActive
                  ? config.emptyFilteredDescription ?? "Try adjusting your search terms"
                  : config.emptyDescription ?? `Start by adding your first ${entityLabel}`
              }
              action={
                !filtersActive
                  ? {
                      label: config.emptyActionLabel ?? "Add Your First Template",
                      onClick: handleOpenAdd,
                      icon: Plus,
                      "data-testid": "button-create-first-template",
                    }
                  : undefined
              }
            />
            {!filtersActive && config.emptyStateActions}
          </div>
        ) : (
          <DataTable
            data={filteredTemplates}
            columns={columns}
            storageKey={config.table.storageKey}
            legacyConfigKey={config.table.legacyConfigKey}
            rowKey={(row) => row.id}
            onRowClick={
              config.detailRoute
                ? (row) => navigate(config.detailRoute!(row.id))
                : undefined
            }
          />
        )}
      </div>

      {/* Add/Edit Template Dialog */}
      <Dialog
        open={isAddingTemplate || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className={config.form.dialogClassName ?? "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? config.form.titles.edit : config.form.titles.create}
            </DialogTitle>
            {(editingTemplate
              ? config.form.titles.editDescription
              : config.form.titles.createDescription) && (
              <DialogDescription>
                {editingTemplate
                  ? config.form.titles.editDescription
                  : config.form.titles.createDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          {config.form.render ? (
            config.form.render({ form: formData, setForm: setFormData, mode })
          ) : (
            <div className="space-y-4 py-4">
              {config.form.fields?.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.key}
                      value={String((formData as Record<string, unknown>)[field.key] ?? "")}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: e.target.value } as TForm)
                      }
                      placeholder={field.placeholder}
                      rows={field.rows}
                      data-testid={field.testId}
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={String((formData as Record<string, unknown>)[field.key] ?? "")}
                      onValueChange={(value) =>
                        setFormData({ ...formData, [field.key]: value } as TForm)
                      }
                    >
                      <SelectTrigger id={field.key} data-testid={field.testId}>
                        <SelectValue placeholder={field.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={field.key}
                      value={String((formData as Record<string, unknown>)[field.key] ?? "")}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: e.target.value } as TForm)
                      }
                      placeholder={field.placeholder}
                      data-testid={field.testId}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-template">
              {isSaving ? (
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
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        description="This permanently deletes it and cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}
      />
      {config.extraDialogs}
    </div>
  );
}
