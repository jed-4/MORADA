import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Edit3,
  Copy,
  Layers,
  Columns3,
  Loader2,
} from "lucide-react";
import type { ScopeTemplate } from "@shared/schema";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_KEY = "scope-templates";
const LEGACY_CONFIG_KEY = "scope-templates-column-config-v1";

export default function ScopeTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ScopeTemplate | null>(null);

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    category: "",
  });

  const { data: templates = [], isLoading } = useQuery<ScopeTemplate[]>({
    queryKey: ["/api/scope-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string }) => {
      return await apiRequest("/api/scope-templates", "POST", {
        name: data.name,
        description: data.description,
        category: data.category,
        templateData: [],
      });
    },
    onSuccess: (template: ScopeTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setCreateDialogOpen(false);
      setNewTemplate({ name: "", description: "", category: "" });
      toast({
        title: "Template created",
        description: "Your scope template has been created successfully.",
      });
      navigate(`/scope-templates/${template.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; category: string }) => {
      return await apiRequest(`/api/scope-templates/${data.id}`, "PATCH", {
        name: data.name,
        description: data.description,
        category: data.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setEditDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template updated",
        description: "Your scope template has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/scope-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template deleted",
        description: "Your scope template has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: ScopeTemplate) => {
      return await apiRequest("/api/scope-templates", "POST", {
        name: `${template.name} (Copy)`,
        description: template.description,
        category: template.category,
        templateData: template.templateData,
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
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

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          template.category?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [templates, searchQuery],
  );

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a template name.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newTemplate);
  };

  const handleUpdateTemplate = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      id: selectedTemplate.id,
      name: selectedTemplate.name,
      description: selectedTemplate.description || "",
      category: selectedTemplate.category || "",
    });
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplate) return;
    deleteMutation.mutate(selectedTemplate.id);
  };

  const getItemCount = (template: ScopeTemplate) => {
    return (template.templateData as unknown[])?.length || 0;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      residential: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      commercial: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      renovation: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    };
    return colors[category.toLowerCase()] || "";
  };

  const columns = useMemo<ColumnDef<ScopeTemplate, unknown>[]>(() => [
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
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div
          className="flex items-center justify-end gap-1"
          data-testid={`cell-actions-${row.original.id}`}
        >
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
                  navigate(`/scope-templates/${row.original.id}`);
                }}
                data-testid={`button-edit-${row.original.id}`}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                View / Edit
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
                  setSelectedTemplate(row.original);
                  setDeleteDialogOpen(true);
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
    },
  ], [duplicateMutation, navigate]);

  const pickerColumns = useMemo(
    () => columns
      .filter((c) => c.id !== "actions")
      .map((c) => {
        const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
        return {
          id: c.id as string,
          label: meta.headerLabel ?? (c.id as string),
          pinned: !!meta.pinned,
        };
      }),
    [columns],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title and Count (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Scope Templates
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-templates"
            />
          </div>
        </div>
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              data-testid="button-column-picker"
            >
              <Columns3 className="w-3 h-3 mr-1" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker storageKey={STORAGE_KEY} columns={pickerColumns} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Templates Table */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchQuery ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Start by adding your first scope template"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setCreateDialogOpen(true)}
                className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                data-testid="button-create-first-template"
              >
                <Plus className="h-3 w-3" />
                Create Template
              </button>
            )}
          </div>
        ) : (
          <DataTable
            data={filteredTemplates}
            columns={columns}
            storageKey={STORAGE_KEY}
            legacyConfigKey={LEGACY_CONFIG_KEY}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/scope-templates/${row.id}`)}
          />
        )}
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-template">
          <DialogHeader>
            <DialogTitle>Create Scope Template</DialogTitle>
            <DialogDescription>
              Create a new scope template that can be reused across projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g., Residential Build"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Input
                id="template-category"
                placeholder="e.g., Residential, Commercial"
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                data-testid="input-template-category"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                placeholder="Describe what this template is for..."
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={3}
                data-testid="input-template-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={createMutation.isPending}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>) : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-template">
          <DialogHeader>
            <DialogTitle>Edit Scope Template</DialogTitle>
            <DialogDescription>
              Update the template name, category, or description.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-template-name">Template Name *</Label>
                <Input
                  id="edit-template-name"
                  value={selectedTemplate.name}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, name: e.target.value })
                  }
                  data-testid="input-edit-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-category">Category</Label>
                <Input
                  id="edit-template-category"
                  value={selectedTemplate.category || ""}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, category: e.target.value })
                  }
                  data-testid="input-edit-template-category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-description">Description</Label>
                <Textarea
                  id="edit-template-description"
                  value={selectedTemplate.description || ""}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, description: e.target.value })
                  }
                  rows={3}
                  data-testid="input-edit-template-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTemplate}
              disabled={updateMutation.isPending}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>) : "Update Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-template">
          <DialogHeader>
            <DialogTitle>Delete Scope Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTemplate}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</>) : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
