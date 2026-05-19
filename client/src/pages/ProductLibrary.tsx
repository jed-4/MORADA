import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  X,
  BookOpen,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Product {
  id: number;
  name: string;
  brand: string | null;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  unitCost: number | null;
  unitType: string | null;
  description: string | null;
  url: string | null;
  companyId: string;
}

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().optional(),
  sku: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  unitCost: z.coerce.number().optional(),
  unitType: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
});
type ProductForm = z.infer<typeof productSchema>;

export default function ProductLibrary() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", brand: "", sku: "", category: "", subcategory: "", unitType: "ea", description: "", url: "" },
  });

  const openCreate = () => {
    form.reset({ name: "", brand: "", sku: "", category: "", subcategory: "", unitType: "ea", description: "", url: "" });
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    form.reset({
      name: p.name,
      brand: p.brand || "",
      sku: p.sku || "",
      category: p.category || "",
      subcategory: p.subcategory || "",
      unitCost: p.unitCost != null ? p.unitCost / 100 : undefined,
      unitType: p.unitType || "ea",
      description: p.description || "",
      url: p.url || "",
    });
    setEditingProduct(p);
    setIsDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const payload = { ...data, unitCost: data.unitCost != null ? Math.round(data.unitCost * 100) : null };
      return await apiRequest("/api/products", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      toast({ title: "Product saved" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save product", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const payload = { ...data, unitCost: data.unitCost != null ? Math.round(data.unitCost * 100) : null };
      return await apiRequest(`/api/products/${editingProduct!.id}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      toast({ title: "Product updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update product", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/products/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete product", variant: "destructive" }),
  });

  const handleSubmit = (data: ProductForm) => {
    if (editingProduct) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center px-4 gap-3 border-b bg-background shrink-0">
        <BookOpen className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Product Library</h1>
        <Badge variant="secondary" className="text-xs">{products.length}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs w-44"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover-elevate"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-7 text-xs border border-border/50 rounded-md px-2 bg-background text-foreground"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={openCreate} className="h-7 text-xs gap-1">
            <Plus className="w-3 h-3" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[minmax(180px,1fr)_120px_120px_120px_100px_80px_36px] gap-3 items-center bg-muted/30 border-b border-border h-[34px] px-4 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground sticky top-0 z-10">
        <div>Product</div>
        <div>Brand</div>
        <div>SKU</div>
        <div>Category</div>
        <div className="text-right">Unit Cost</div>
        <div>Unit</div>
        <div></div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package className="w-10 h-10 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">
              {search || categoryFilter ? "No products match your filters." : "No products yet. Add your first product to the library."}
            </p>
            {!search && !categoryFilter && (
              <Button size="sm" onClick={openCreate} className="gap-1">
                <Plus className="w-3 h-3" />
                Add Product
              </Button>
            )}
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[minmax(180px,1fr)_120px_120px_120px_100px_80px_36px] gap-3 items-center border-b border-border/50 px-4 h-10 hover-elevate group"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">{p.name}</span>
                {p.description && (
                  <span className="text-[10px] text-muted-foreground truncate">{p.description}</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{p.brand || "—"}</div>
              <div className="text-xs text-muted-foreground truncate font-mono">{p.sku || "—"}</div>
              <div className="text-xs text-muted-foreground truncate">{p.category || "—"}</div>
              <div className="text-xs text-right tabular-nums">
                {p.unitCost != null ? formatCurrency(p.unitCost) : "—"}
              </div>
              <div className="text-xs text-muted-foreground">{p.unitType || "ea"}</div>
              <div className="flex items-center justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Name *</FormLabel>
                    <FormControl><Input {...field} placeholder="Product name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brand" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Bosch" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. BOS-001" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Appliances" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="subcategory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategory</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Kitchen" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="unitCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="unitType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Type</FormLabel>
                    <FormControl><Input {...field} placeholder="ea, m2, lm…" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="url" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>URL</FormLabel>
                    <FormControl><Input {...field} placeholder="https://…" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Short description" />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  {editingProduct ? "Update" : "Add Product"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
