import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type RfqTemplate, type TemplateCategory } from "@shared/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Loader2,
  GripVertical,
  X,
  Columns3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { format } from "date-fns";

interface TemplateItem {
  id: string;
  description: string;
  quantity?: string;
  unit?: string;
  notes?: string;
  sortOrder: number;
}

const UNITS = [
  "ea",
  "m",
  "m2",
  "m3",
  "lm",
  "kg",
  "t",
  "L",
  "hrs",
  "days",
  "lot",
  "set",
];

export default function RfqTemplates() {
  const [, navigate] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RfqTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    categoryId: undefined as string | undefined,
    introText: "",
    scope: "",
    termsAndConditions: "",
    tradeName: "",
  });

  const [items, setItems] = useState<TemplateItem[]>([]);

  const { data: templates = [], isLoading } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", "rfq"],
    queryFn: async () => {
      const response = await fetch("/api/template-categories?templateType=rfq");
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
      introText?: string;
      scope?: string;
      termsAndConditions?: string;
      tradeName?: string;
      items?: TemplateItem[];
    }) => {
      return await apiRequest("/api/rfq-templates", "POST", data);
    },
    onSuccess: (newTemplate: RfqTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates"] });
      toast({
        title: "Template created",
        description: "Your new RFQ template has been created.",
      });
      setIsAddingTemplate(false);
      resetForm();
      navigate(`/rfq-templates/${newTemplate.id}`);
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
    mutationFn: async ({ id, data }: { id: string; data: Partial<RfqTemplate> }) => {
      return await apiRequest(`/api/rfq-templates/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates"] });
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
      await apiRequest(`/api/rfq-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates"] });
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
    mutationFn: async (template: RfqTemplate) => {
      return await apiRequest("/api/rfq-templates", "POST", {
        name: `${template.name} (Copy)`,
        description: template.description,
        categoryId: template.categoryId,
        introText: template.introText,
        scope: template.scope,
        termsAndConditions: template.termsAndConditions,
        tradeName: template.tradeName,
        items: template.items,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-templates"] });
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
      introText: "",
      scope: "",
      termsAndConditions: "",
      tradeName: "",
    });
    setItems([]);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: RfqTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      categoryId: template.categoryId || undefined,
      introText: template.introText || "",
      scope: template.scope || "",
      termsAndConditions: template.termsAndConditions || "",
      tradeName: template.tradeName || "",
    });
    const templateItems = (template.items as TemplateItem[] | null) || [];
    setItems(templateItems.map((item, index) => ({
      ...item,
      id: item.id || `item-${Date.now()}-${index}`,
      sortOrder: item.sortOrder ?? index,
    })));
    setEditingTemplate(template);
  };

  const handleAddItem = () => {
    const newItem: TemplateItem = {
      id: `item-${Date.now()}`,
      description: "",
      quantity: "",
      unit: "ea",
      notes: "",
      sortOrder: items.length,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof TemplateItem, value: string | number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
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
      introText: formData.introText.trim() || undefined,
      scope: formData.scope.trim() || undefined,
      termsAndConditions: formData.termsAndConditions.trim() || undefined,
      tradeName: formData.tradeName.trim() || undefined,
      items: items.filter(item => item.description.trim()).map((item, index) => ({
        ...item,
        sortOrder: index,
      })),
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
        template.tradeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        categoryBreadcrumb.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === "all" || template.categoryId === categoryFilter;
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getItemCount = (template: RfqTemplate) => {
    const templateItems = template.items as TemplateItem[] | null;
    return templateItems?.length || 0;
  };

  const uniqueCategoryIds = [...new Set(templates.map(t => t.categoryId).filter(Boolean))] as string[];

  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  type RfqTemplateRow = RfqTemplate;

  const columns = useMemo<ColumnDef<RfqTemplateRow, unknown>[]>(() => {
    return [
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
        id: "category",
        header: "Category",
        accessorFn: (t) => getCategoryBreadcrumb(t.categoryId),
        cell: ({ row }) => {
          const breadcrumb = getCategoryBreadcrumb(row.original.categoryId);
          return breadcrumb ? (
            <Badge variant="outline" className="h-4 px-1.5 text-data">{breadcrumb}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Category" } satisfies DataTableColumnMeta,
      },
      {
        id: "trade",
        header: "Trade",
        accessorFn: (t) => t.tradeName || "",
        cell: ({ row }) => (
          row.original.tradeName ? (
            <Badge variant="secondary" className="h-4 px-1.5 text-data">{row.original.tradeName}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Trade" } satisfies DataTableColumnMeta,
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
        size: 70,
        meta: { defaultWidth: 70, align: "right", headerLabel: "Items" } satisfies DataTableColumnMeta,
      },
      {
        id: "updatedAt",
        header: "Updated",
        accessorFn: (t) => (t.updatedAt ? new Date(t.updatedAt).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums" data-testid={`cell-updated-${row.original.id}`}>
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
          <div className="flex items-center justify-end gap-1" data-testid={`cell-actions-${row.original.id}`}>
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
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, duplicateMutation]);

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
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            RFQ Templates
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
            <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-column-picker">
              <Columns3 className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0">
            <DataTableColumnPicker storageKey="rfq-templates" columns={pickerColumns} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm || categoryFilter !== "all" ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm || categoryFilter !== "all"
                ? "Try adjusting your search or filter"
                : "Start by adding your first RFQ template"}
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
            storageKey="rfq-templates"
            legacyConfigKey="rfq-templates-column-config-v1"
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/rfq-templates/${t.id}`)}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit RFQ Template" : "New RFQ Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate 
                ? "Update the template details and line items below."
                : "Create a new RFQ template with reusable line items."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Structural Steel RFQ"
                data-testid="input-template-name"
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
                <Label htmlFor="tradeName">Trade</Label>
                <Input
                  id="tradeName"
                  value={formData.tradeName}
                  onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                  placeholder="e.g., Steelwork"
                  data-testid="input-template-trade"
                />
              </div>
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

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="content">
                <AccordionTrigger className="text-sm">Default Content</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="introText">Introduction Text</Label>
                      <Textarea
                        id="introText"
                        value={formData.introText}
                        onChange={(e) => setFormData({ ...formData, introText: e.target.value })}
                        placeholder="Standard intro text for RFQ..."
                        rows={3}
                        data-testid="textarea-template-intro"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="scope">Scope of Work</Label>
                      <Textarea
                        id="scope"
                        value={formData.scope}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                        placeholder="Default scope description..."
                        rows={3}
                        data-testid="textarea-template-scope"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
                      <Textarea
                        id="termsAndConditions"
                        value={formData.termsAndConditions}
                        onChange={(e) => setFormData({ ...formData, termsAndConditions: e.target.value })}
                        placeholder="Standard terms and conditions..."
                        rows={3}
                        data-testid="textarea-template-terms"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="h-7 text-xs"
                  data-testid="button-add-item"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="border border-dashed rounded-md p-4 text-center text-muted-foreground text-sm">
                  No line items yet. Click "Add Item" to add items to this template.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div 
                      key={item.id} 
                      className="border rounded-md p-2 bg-muted/30"
                      data-testid={`item-row-${index}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex items-center pt-1 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="flex-1 grid grid-cols-12 gap-2">
                          <div className="col-span-5">
                            <Input
                              value={item.description}
                              onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                              placeholder="Item description *"
                              className="h-8 text-xs"
                              data-testid={`input-item-description-${index}`}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              value={item.quantity || ""}
                              onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                              placeholder="Qty"
                              className="h-8 text-xs"
                              data-testid={`input-item-quantity-${index}`}
                            />
                          </div>
                          <div className="col-span-2">
                            <Select 
                              value={item.unit || "ea"} 
                              onValueChange={(value) => handleUpdateItem(item.id, 'unit', value)}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-item-unit-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {UNITS.map((unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-3">
                            <Input
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateItem(item.id, 'notes', e.target.value)}
                              placeholder="Notes"
                              className="h-8 text-xs"
                              data-testid={`input-item-notes-${index}`}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`button-remove-item-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
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
