import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type PurchaseOrderTemplate } from "@shared/schema";
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
  ShoppingCart,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Loader2,
  Columns3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

interface TemplateItem {
  description: string;
  quantity?: string;
  unit?: string;
  unitPrice?: number;
  costCodeId?: string;
}

export default function POTemplates() {
  const [, navigate] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PurchaseOrderTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scope: "",
  });

  const { data: templates = [], isLoading } = useQuery<PurchaseOrderTemplate[]>({
    queryKey: ["/api/purchase-order-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; scope?: string; items?: TemplateItem[] }) => {
      return await apiRequest("/api/purchase-order-templates", "POST", {
        ...data,
        items: data.items || [],
        companyId: user?.companyId,
        createdById: user?.id,
      });
    },
    onSuccess: (newTemplate: PurchaseOrderTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates"] });
      toast({
        title: "Template created",
        description: "Your new PO template has been created.",
      });
      setIsAddingTemplate(false);
      setFormData({ name: "", description: "", scope: "" });
      navigate(`/po-templates/${newTemplate.id}`);
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<PurchaseOrderTemplate> }) => {
      return await apiRequest(`/api/purchase-order-templates/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates"] });
      toast({
        title: "Template updated",
        description: "The template has been updated successfully.",
      });
      setEditingTemplate(null);
      setFormData({ name: "", description: "", scope: "" });
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
      await apiRequest(`/api/purchase-order-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates"] });
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
    mutationFn: async (template: PurchaseOrderTemplate) => {
      const { id, createdAt, updatedAt, ...rest } = template;
      return await apiRequest("/api/purchase-order-templates", "POST", {
        ...rest,
        name: `${template.name} (Copy)`,
        createdById: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-templates"] });
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

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "", scope: "" });
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: PurchaseOrderTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      scope: template.scope || "",
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

    if (editingTemplate) {
      updateMutation.mutate({
        id: editingTemplate.id,
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          scope: formData.scope.trim() || undefined,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        scope: formData.scope.trim() || undefined,
      });
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templates
        .filter((template) =>
          template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.description?.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [templates, searchTerm],
  );

  const getItemCount = (template: PurchaseOrderTemplate) => {
    const items = template.items as TemplateItem[] | null;
    return items?.length || 0;
  };

  const columns = useMemo<ColumnDef<PurchaseOrderTemplate, unknown>[]>(
    () => [
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
      {
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
        meta: { defaultWidth: 56, align: "right", pinned: true, headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    ],
    [duplicateMutation, deleteMutation],
  );

  const pickerColumns = useMemo(
    () => [
      { id: "name", label: "Name" },
      { id: "description", label: "Description" },
      { id: "items", label: "Items" },
      { id: "status", label: "Status" },
      { id: "updatedAt", label: "Updated" },
      { id: "actions", label: "Actions", pinned: true },
    ],
    [],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            PO Templates
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
        </div>
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              data-testid="button-column-picker"
            >
              <Columns3 className="w-3 h-3 mr-1" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker storageKey="po-templates" columns={pickerColumns} />
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
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Start by adding your first purchase order template"}
            </p>
            {!searchTerm && (
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
            storageKey="po-templates"
            legacyConfigKey="po-templates-column-config-v1"
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/po-templates/${row.id}`)}
          />
        )}
      </div>

      {/* Add/Edit Template Dialog */}
      <Dialog
        open={isAddingTemplate || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingTemplate(false);
            setEditingTemplate(null);
            setFormData({ name: "", description: "", scope: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit PO Template" : "New PO Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template details below."
                : "Create a new purchase order template to reuse across projects."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Framing Pack"
                data-testid="input-template-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the template..."
                rows={2}
                data-testid="textarea-template-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope">Default Scope</Label>
              <Textarea
                id="scope"
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                placeholder="Default scope text to include in POs..."
                rows={3}
                data-testid="textarea-template-scope"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingTemplate(false);
                setEditingTemplate(null);
                setFormData({ name: "", description: "", scope: "" });
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
