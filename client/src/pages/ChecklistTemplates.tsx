import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  type ChecklistTemplate,
  type UserRole,
} from "@shared/schema";
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
  CheckSquare,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  Upload,
  Download,
  Edit3,
  Lock,
  Columns3,
} from "lucide-react";
import { format } from "date-fns";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { ChecklistTemplateFormDialog } from "@/components/checklist/ChecklistTemplateFormDialog";
import { ImportChecklistDialog } from "@/components/checklist/ImportChecklistDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function ChecklistTemplates() {
  const [, setLocation] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { toast } = useToast();

  const handleTemplateCreated = (templateId: string) => {
    setLocation(`/checklist-templates/${templateId}`);
  };

  const { data: templates = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });

  const { data: allRoles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/roles"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/checklist-templates/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist Group deleted",
        description: "The checklist group has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete checklist group.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/checklist-templates/${id}/duplicate`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist Group duplicated",
        description: "The checklist group has been duplicated with all contents.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate checklist group.",
        variant: "destructive",
      });
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/checklist-templates/export", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to export");

      const data = await response.json();

      const headers = ["Checklist Group", "Checklist", "Checklist Item", "Type", "Description"];
      const csvRows = [
        headers.join(","),
        ...data.map((row: { templateName?: string; groupName?: string; itemDescription?: string; type?: string; templateDescription?: string }) => [
          `"${row.templateName || ""}"`,
          `"${row.groupName || ""}"`,
          `"${row.itemDescription || ""}"`,
          `"${row.type || ""}"`,
          `"${row.templateDescription || ""}"`
        ].join(","))
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-groups-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: "Checklist groups have been exported to CSV.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export checklist groups.",
        variant: "destructive",
      });
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templates
        .filter((template) =>
          template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.type.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [templates, searchTerm],
  );

  const getRoleNames = (roleIds: string[] | null | unknown) => {
    const ids = Array.isArray(roleIds) ? roleIds as string[] : [];
    if (ids.length === 0) return [];
    return ids.map(id => allRoles.find(r => r.id === id)?.name || id);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Task": return "bg-status-info-bg text-status-info";
      case "Job": return "bg-status-success-bg text-status-success";
      case "Estimation": return "bg-primary/10 text-primary";
      case "Lead": return "bg-status-warning-bg text-status-warning";
      default: return "bg-muted text-secondary dark:text-muted";
    }
  };

  const columns = useMemo<ColumnDef<ChecklistTemplate, unknown>[]>(() => [
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
      size: 280,
      meta: { defaultWidth: 280, headerLabel: "Description" } satisfies DataTableColumnMeta,
    },
    {
      id: "type",
      header: "Type",
      accessorFn: (t) => t.type || "",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={`h-4 px-1.5 text-data ${getTypeColor(row.original.type)}`}
          data-testid={`badge-type-${row.original.id}`}
        >
          {row.original.type}
        </Badge>
      ),
      size: 100,
      meta: { defaultWidth: 100, headerLabel: "Type" } satisfies DataTableColumnMeta,
    },
    {
      id: "roles",
      header: "Roles",
      enableSorting: false,
      cell: ({ row }) => {
        const roles = Array.isArray(row.original.visibleToRoles)
          ? (row.original.visibleToRoles as string[])
          : [];
        if (roles.length === 0) {
          return <span className="text-xs text-muted-foreground/40">—</span>;
        }
        return (
          <div
            className="flex items-center gap-1 text-data text-muted-foreground"
            title={`Visible to: ${getRoleNames(roles).join(', ')}`}
            data-testid={`badge-roles-${row.original.id}`}
          >
            <Lock className="w-3 h-3" />
            <span>{roles.length} role{roles.length !== 1 ? 's' : ''}</span>
          </div>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, headerLabel: "Roles" } satisfies DataTableColumnMeta,
    },
    {
      id: "createdAt",
      header: "Created",
      accessorFn: (t) => (t.createdAt ? new Date(t.createdAt).getTime() : 0),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground" data-testid={`cell-created-${row.original.id}`}>
          {row.original.createdAt ? format(new Date(row.original.createdAt), "MMM d, yyyy") : "—"}
        </span>
      ),
      size: 120,
      meta: { defaultWidth: 120, headerLabel: "Created" } satisfies DataTableColumnMeta,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end" data-testid={`cell-actions-${row.original.id}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-menu-${row.original.id}`}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setLocation(`/checklist-templates/${row.original.id}`);
                }}
                data-testid={`button-open-${row.original.id}`}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTemplate(row.original);
                }}
                data-testid={`button-edit-${row.original.id}`}
              >
                <Lock className="h-4 w-4 mr-2" />
                Edit / Set Roles
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateMutation.mutate(row.original.id);
                }}
                data-testid={`button-duplicate-${row.original.id}`}
              >
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
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
      size: 60,
      meta: { defaultWidth: 60, align: "right", pinned: true, headerLabel: "Actions" } satisfies DataTableColumnMeta,
    },
  ], [allRoles, duplicateMutation, setLocation]);

  const pickerColumns = useMemo(
    () => [
      { id: "name", label: "Name" },
      { id: "description", label: "Description" },
      { id: "type", label: "Type" },
      { id: "roles", label: "Roles" },
      { id: "createdAt", label: "Created" },
      { id: "actions", label: "Actions", pinned: true },
    ],
    [],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Title + Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Checklists
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'group' : 'groups'}
          </Badge>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={handleExport}
            data-testid="button-export-csv"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="w-3 h-3" />
            <span>Import</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsAddingTemplate(true)}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Checklist Group</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search */}
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
        </div>

        {/* Right: Column picker */}
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-column-picker"
              title="Columns"
              aria-label="Columns"
            >
              <Columns3 className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker storageKey="checklist-templates" columns={pickerColumns} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Templates List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading checklist groups...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm ? "No checklist groups found" : "No checklist groups yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Start by adding your first checklist group"}
            </p>
            {!searchTerm && (
              <button
                onClick={() => setIsAddingTemplate(true)}
                className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                data-testid="button-create-first-template"
              >
                <Plus className="h-3 w-3" />
                Add Your First Checklist Group
              </button>
            )}
          </div>
        ) : (
          <DataTable
            data={filteredTemplates}
            columns={columns}
            storageKey="checklist-templates"
            legacyConfigKey="checklist-templates-column-config-v1"
            rowKey={(row) => row.id}
            onRowClick={(row) => setLocation(`/checklist-templates/${row.id}`)}
          />
        )}
      </div>

      {/* Add Template Dialog */}
      <ChecklistTemplateFormDialog
        open={isAddingTemplate}
        onOpenChange={setIsAddingTemplate}
        onTemplateCreated={handleTemplateCreated}
      />

      {/* Edit Template Dialog */}
      <ChecklistTemplateFormDialog
        open={!!editingTemplate}
        onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
        template={editingTemplate}
        onTemplateUpdated={() => setEditingTemplate(null)}
      />

      {/* Import Dialog */}
      <ImportChecklistDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        description="This permanently deletes it and cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}
      />
    </div>
  );
}
