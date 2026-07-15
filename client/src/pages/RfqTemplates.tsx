import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { type RfqTemplate } from "@shared/schema";
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
import { FileText, Plus, GripVertical, X } from "lucide-react";
import { format } from "date-fns";
import {
  TemplateListPage,
  type TemplateListConfig,
} from "@/components/templates/TemplateListPage";
import {
  useTemplateCategories,
  CategoryFilterSelect,
} from "@/components/templates/useTemplateCategories";

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

interface RfqTemplateForm {
  name: string;
  description: string;
  categoryId: string | undefined;
  introText: string;
  scope: string;
  termsAndConditions: string;
  tradeName: string;
  items: TemplateItem[];
}

const getItemCount = (template: RfqTemplate) => {
  const templateItems = template.items as TemplateItem[] | null;
  return templateItems?.length || 0;
};

const pickerColumns = [
  { id: "name", label: "Name" },
  { id: "description", label: "Description" },
  { id: "category", label: "Category" },
  { id: "trade", label: "Trade" },
  { id: "items", label: "Items" },
  { id: "updatedAt", label: "Updated" },
];

export default function RfqTemplates() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const { categories, getCategoryBreadcrumb, categoryTree } = useTemplateCategories("rfq");

  const { data: templates = [] } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const uniqueCategoryIds = Array.from(new Set(templates.map(t => t.categoryId).filter(Boolean))) as string[];

  const columns = useMemo<ColumnDef<RfqTemplate, unknown>[]>(() => [
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
  ], [getCategoryBreadcrumb]);

  const config = useMemo<TemplateListConfig<RfqTemplate, RfqTemplateForm>>(
    () => ({
      pageTitle: "RFQ Templates",
      emptyIcon: FileText,
      emptyDescription: "Start by adding your first RFQ template",
      emptyFilteredDescription: "Try adjusting your search or filter",
      api: { base: "/api/rfq-templates" },
      detailRoute: (id) => `/rfq-templates/${id}`,
      table: {
        storageKey: "rfq-templates",
        legacyConfigKey: "rfq-templates-column-config-v1",
        columns,
        pickerColumns,
      },
      searchFields: (t) => [
        t.name,
        t.description,
        t.tradeName,
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
          introText: "",
          scope: "",
          termsAndConditions: "",
          tradeName: "",
          items: [],
        },
        fromEntity: (t) => {
          const templateItems = (t.items as TemplateItem[] | null) || [];
          return {
            name: t.name,
            description: t.description || "",
            categoryId: t.categoryId || undefined,
            introText: t.introText || "",
            scope: t.scope || "",
            termsAndConditions: t.termsAndConditions || "",
            tradeName: t.tradeName || "",
            items: templateItems.map((item, index) => ({
              ...item,
              id: item.id || `item-${Date.now()}-${index}`,
              sortOrder: item.sortOrder ?? index,
            })),
          };
        },
        validate: (f) => (f.name.trim() ? null : "Template name is required."),
        toPayload: (f) => ({
          name: f.name.trim(),
          description: f.description.trim() || undefined,
          categoryId: f.categoryId || undefined,
          introText: f.introText.trim() || undefined,
          scope: f.scope.trim() || undefined,
          termsAndConditions: f.termsAndConditions.trim() || undefined,
          tradeName: f.tradeName.trim() || undefined,
          items: f.items.filter(item => item.description.trim()).map((item, index) => ({
            ...item,
            sortOrder: index,
          })),
        }),
        dialogClassName: "sm:max-w-2xl max-h-[90vh] overflow-y-auto",
        titles: {
          create: "New RFQ Template",
          edit: "Edit RFQ Template",
          createDescription: "Create a new RFQ template with reusable line items.",
          editDescription: "Update the template details and line items below.",
        },
        render: ({ form, setForm }) => {
          const handleAddItem = () => {
            const newItem: TemplateItem = {
              id: `item-${Date.now()}`,
              description: "",
              quantity: "",
              unit: "ea",
              notes: "",
              sortOrder: form.items.length,
            };
            setForm({ ...form, items: [...form.items, newItem] });
          };

          const handleRemoveItem = (id: string) => {
            setForm({ ...form, items: form.items.filter(item => item.id !== id) });
          };

          const handleUpdateItem = (id: string, field: keyof TemplateItem, value: string | number) => {
            setForm({
              ...form,
              items: form.items.map(item =>
                item.id === id ? { ...item, [field]: value } : item
              ),
            });
          };

          return (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Standard Structural Steel RFQ"
                  data-testid="input-template-name"
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
                  <Label htmlFor="tradeName">Trade</Label>
                  <Input
                    id="tradeName"
                    value={form.tradeName}
                    onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                    placeholder="e.g., Steelwork"
                    data-testid="input-template-trade"
                  />
                </div>
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

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="content">
                  <AccordionTrigger className="text-sm">Default Content</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="introText">Introduction Text</Label>
                        <Textarea
                          id="introText"
                          value={form.introText}
                          onChange={(e) => setForm({ ...form, introText: e.target.value })}
                          placeholder="Standard intro text for RFQ..."
                          rows={3}
                          data-testid="textarea-template-intro"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="scope">Scope of Work</Label>
                        <Textarea
                          id="scope"
                          value={form.scope}
                          onChange={(e) => setForm({ ...form, scope: e.target.value })}
                          placeholder="Default scope description..."
                          rows={3}
                          data-testid="textarea-template-scope"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="termsAndConditions">Terms & Conditions</Label>
                        <Textarea
                          id="termsAndConditions"
                          value={form.termsAndConditions}
                          onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
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

                {form.items.length === 0 ? (
                  <div className="border border-dashed rounded-md p-4 text-center text-muted-foreground text-sm">
                    No line items yet. Click "Add Item" to add items to this template.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.items.map((item, index) => (
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
          );
        },
      },
      duplicatePayload: (template) => ({
        name: `${template.name} (Copy)`,
        description: template.description,
        categoryId: template.categoryId,
        introText: template.introText,
        scope: template.scope,
        termsAndConditions: template.termsAndConditions,
        tradeName: template.tradeName,
        items: template.items,
      }),
      toasts: { created: "Your new RFQ template has been created." },
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
