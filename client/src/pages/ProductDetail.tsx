/**
 * A product's own page.
 *
 * The Product Library used to edit a product in a small modal with eight fields
 * and no images, which is thin for the thing a client selection points at. This
 * is deliberately shaped like a selection option — images first, then spec, then
 * cost — because that is what a product becomes the moment it is used.
 *
 * Layout and tokens follow the price list pages: page header at px-4 pt-3 pb-2,
 * cards as bg-card rounded-md border with --shadow-card, 6px controls.
 */
import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Package, Trash2, Loader2, ImagePlus, X, Star, MoreVertical, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface ProductImage {
  id: number;
  filePath: string;
  fileName: string | null;
  sortOrder: number | null;
}

interface Product {
  id: number;
  name: string;
  brand: string | null;
  sku: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  supplierContactId: string | null;
  defaultUnitCost: number | null;
  unitType: string | null;
  url: string | null;
  notes: string | null;
  specifications: Record<string, any> | null;
  images?: ProductImage[];
}

/** Matches the units a selection option offers, so a product drops straight in. */
const UNIT_TYPES = ["ea", "m", "m2", "m3", "lm", "kg", "tonne", "litre", "hour", "day", "pack", "set", "pair", "lot"];

/** Cents in the database, dollars in the field. */
const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
const inputToCents = (v: string) => {
  const n = parseFloat(v);
  return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100);
};

type SpecRow = { key: string; value: string };

const specsToRows = (specs: Record<string, any> | null | undefined): SpecRow[] =>
  Object.entries(specs ?? {}).map(([key, value]) => ({
    key,
    value: value == null ? "" : typeof value === "string" ? value : JSON.stringify(value),
  }));

const rowsToSpecs = (rows: SpecRow[]): Record<string, any> | null => {
  const out: Record<string, any> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return Object.keys(out).length ? out : null;
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);

  const { data: product, isLoading, isError } = useQuery<Product>({
    queryKey: ["/api/products", id],
    queryFn: () => apiRequest(`/api/products/${id}`, "GET"),
    enabled: !!id,
  });

  const [form, setForm] = useState<Partial<Product> & { unitCostInput?: string }>({});
  const [specRows, setSpecRows] = useState<SpecRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Load the server's copy once per product. Not on every fetch, or a background
  // refetch would throw away whatever is half-typed.
  useEffect(() => {
    if (!product) return;
    setForm({ ...product, unitCostInput: centsToInput(product.defaultUnitCost) });
    setSpecRows(specsToRows(product.specifications));
    setDirty(false);
    setHeroIdx(0);
  }, [product?.id]);

  const set = <K extends keyof (Product & { unitCostInput: string })>(key: K, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        brand: form.brand || null,
        sku: form.sku || null,
        description: form.description || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        unitType: form.unitType || null,
        url: form.url || null,
        notes: form.notes || null,
        defaultUnitCost: inputToCents(form.unitCostInput ?? ""),
        specifications: rowsToSpecs(specRows),
      };
      return apiRequest(`/api/products/${id}`, "PATCH", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDirty(false);
      toast({ title: "Product saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/products/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted" });
      navigate("/product-library");
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const addImageMutation = useMutation({
    mutationFn: (img: { filePath: string; fileName: string; mimeType: string; sortOrder: number }) =>
      apiRequest(`/api/products/${id}/images`, "POST", img),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/products", id] }),
  });

  const removeImageMutation = useMutation({
    mutationFn: (imageId: number) => apiRequest(`/api/product-images/${imageId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", id] });
      setHeroIdx(0);
    },
    onError: (e: any) => toast({ title: "Could not remove image", description: e?.message, variant: "destructive" }),
  });

  /**
   * Two hops: the bytes go to object storage, then the returned path is recorded
   * against the product. Reuses /api/uploads/template-image, which is already
   * company-scoped — the company id is baked into the served URL.
   */
  const handleFiles = async (files: FileList) => {
    const existing = product?.images?.length ?? 0;
    let i = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Not an image", description: `${file.name} was skipped.`, variant: "destructive" });
        continue;
      }
      setUploading(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const { url } = await apiRequest("/api/uploads/template-image", "POST", {
          fileData: dataUrl, fileName: file.name, mimeType: file.type,
        });
        await addImageMutation.mutateAsync({
          filePath: url, fileName: file.name, mimeType: file.type, sortOrder: existing + i++,
        });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err?.message ?? file.name, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col" data-testid="product-detail-page">
        <div className="px-4 pt-3 pb-2"><Skeleton className="h-5 w-48" /></div>
        <div className="px-4 grid gap-3 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-64 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex h-full flex-col" data-testid="product-detail-page">
        <div className="flex items-center gap-1 px-4 pt-3 pb-1">
          <Link href="/product-library" className="text-xs text-muted-foreground hover:text-foreground">
            ← Product Library
          </Link>
        </div>
        <EmptyState
          variant="inline"
          icon={Package}
          title="Product not found"
          description="It may have been deleted, or belong to another company."
        />
      </div>
    );
  }

  const images = product.images ?? [];
  const hero = images[Math.min(heroIdx, Math.max(images.length - 1, 0))];

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="product-detail-page">
      {/* Header — same shape as the price list detail page. */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-center gap-2 min-w-0">
        <Link
          href="/product-library"
          className="self-center text-muted-foreground hover:text-foreground flex-shrink-0"
          aria-label="Back to product library"
          data-testid="link-back-to-library"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight truncate" data-testid="text-product-name">
          {form.name || product.name}
        </h1>
        {product.brand && (
          <span className="text-xs text-muted-foreground truncate hidden lg:inline">{product.brand}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="button-save-product"
          >
            {saveMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {dirty ? "Save" : "Saved"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="button-product-menu">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (window.confirm(`Delete "${product.name}"? It stays on any selection already using it.`)) {
                    deleteMutation.mutate();
                  }
                }}
                data-testid="button-delete-product"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        <div className="grid gap-3 lg:grid-cols-[320px_1fr] items-start">
          {/* ── Images ───────────────────────────────────────────────────── */}
          <div
            className="bg-card rounded-md border border-border overflow-hidden"
            style={{ boxShadow: "var(--shadow-card)" }}
            data-testid="section-product-images"
          >
            <div className="h-9 flex items-center px-3 border-b border-border">
              <span className="text-xs font-medium">Images</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{images.length}</span>
            </div>

            <div className="p-3 space-y-2">
              <div className="aspect-square w-full rounded-md border border-border bg-muted/30 overflow-hidden flex items-center justify-center">
                {hero ? (
                  <img
                    src={hero.filePath}
                    alt={hero.fileName ?? product.name}
                    className="h-full w-full object-cover"
                    data-testid="img-product-hero"
                  />
                ) : (
                  <div className="text-center px-4">
                    <Package className="h-7 w-7 mx-auto text-muted-foreground/50" />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      No images yet. A photo is what makes a selection readable to a client.
                    </p>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      onClick={() => setHeroIdx(i)}
                      className={`relative aspect-square rounded border overflow-hidden hover-elevate ${
                        i === heroIdx ? "border-primary ring-1 ring-primary/40" : "border-border"
                      }`}
                      data-testid={`button-thumb-${img.id}`}
                      aria-label={`Show image ${i + 1}`}
                    >
                      <img src={img.filePath} alt="" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <Star className="absolute top-0.5 left-0.5 h-2.5 w-2.5 fill-primary text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
                  data-testid="input-product-image"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs flex-1"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                  data-testid="button-add-image"
                >
                  {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImagePlus className="h-3 w-3 mr-1" />}
                  Add image
                </Button>
                {hero && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive"
                    onClick={() => removeImageMutation.mutate(hero.id)}
                    disabled={removeImageMutation.isPending}
                    data-testid="button-remove-image"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              {images.length > 1 && (
                <p className="text-[10px] text-muted-foreground">
                  The first image is the one a selection shows.
                </p>
              )}
            </div>
          </div>

          {/* ── Details ──────────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div
              className="bg-card rounded-md border border-border overflow-hidden"
              style={{ boxShadow: "var(--shadow-card)" }}
              data-testid="section-product-details"
            >
              <div className="h-9 flex items-center px-3 border-b border-border">
                <span className="text-xs font-medium">Details</span>
              </div>
              <div className="p-3 grid gap-3 sm:grid-cols-2">
                <Field label="Name" className="sm:col-span-2">
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => set("name", e.target.value)}
                    className="h-7 text-xs"
                    data-testid="input-name"
                  />
                </Field>
                <Field label="Brand">
                  <Input value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value)} className="h-7 text-xs" data-testid="input-brand" />
                </Field>
                <Field label="SKU">
                  <Input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} className="h-7 text-xs font-mono" data-testid="input-sku" />
                </Field>
                <Field label="Category">
                  <Input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} className="h-7 text-xs" placeholder="e.g. Tapware" data-testid="input-category" />
                </Field>
                <Field label="Subcategory">
                  <Input value={form.subcategory ?? ""} onChange={(e) => set("subcategory", e.target.value)} className="h-7 text-xs" data-testid="input-subcategory" />
                </Field>
                <Field label="Unit cost" hint="ex GST">
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={form.unitCostInput ?? ""}
                    onChange={(e) => set("unitCostInput" as any, e.target.value)}
                    className="h-7 text-xs text-right tabular-nums"
                    placeholder="0.00"
                    data-testid="input-unit-cost"
                  />
                </Field>
                <Field label="Unit">
                  <Select value={form.unitType ?? ""} onValueChange={(v) => set("unitType", v)}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-unit-type">
                      <SelectValue placeholder="ea" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((u) => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Product link" className="sm:col-span-2">
                  <div className="flex items-center gap-1.5">
                    <Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} className="h-7 text-xs" placeholder="https://…" data-testid="input-url" />
                    {form.url && (
                      <a
                        href={form.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex-shrink-0"
                        data-testid="link-product-url"
                      >
                        Open
                      </a>
                    )}
                  </div>
                </Field>
                <Field label="Description" className="sm:col-span-2" hint="shown to the client">
                  <Textarea
                    value={form.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    className="text-xs min-h-[60px]"
                    data-testid="input-description"
                  />
                </Field>
                <Field label="Internal notes" className="sm:col-span-2" hint="never shown to a client">
                  <Textarea
                    value={form.notes ?? ""}
                    onChange={(e) => set("notes", e.target.value)}
                    className="text-xs min-h-[48px]"
                    data-testid="input-notes"
                  />
                </Field>
              </div>
            </div>

            {/* ── Specifications ─────────────────────────────────────────── */}
            <div
              className="bg-card rounded-md border border-border overflow-hidden"
              style={{ boxShadow: "var(--shadow-card)" }}
              data-testid="section-product-specs"
            >
              <div className="h-9 flex items-center px-3 border-b border-border gap-2">
                <span className="text-xs font-medium">Specifications</span>
                <span className="text-[10px] text-muted-foreground">finish, size, material…</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => { setSpecRows((r) => [...r, { key: "", value: "" }]); setDirty(true); }}
                  data-testid="button-add-spec"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="p-3 space-y-1.5">
                {specRows.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Nothing yet. These carry into the selection, so a client sees the finish and size
                    without opening a spec sheet.
                  </p>
                ) : specRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5" data-testid={`row-spec-${i}`}>
                    <Input
                      value={row.key}
                      onChange={(e) => { setSpecRows((r) => r.map((x, j) => j === i ? { ...x, key: e.target.value } : x)); setDirty(true); }}
                      placeholder="Finish"
                      className="h-7 text-xs w-40 flex-shrink-0"
                      data-testid={`input-spec-key-${i}`}
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => { setSpecRows((r) => r.map((x, j) => j === i ? { ...x, value: e.target.value } : x)); setDirty(true); }}
                      placeholder="Brushed nickel"
                      className="h-7 text-xs"
                      data-testid={`input-spec-value-${i}`}
                    />
                    <button
                      onClick={() => { setSpecRows((r) => r.filter((_, j) => j !== i)); setDirty(true); }}
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex-shrink-0"
                      aria-label="Remove specification"
                      data-testid={`button-remove-spec-${i}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, children, className = "", hint,
}: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal font-normal opacity-70">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
