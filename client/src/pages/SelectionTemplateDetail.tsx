import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Package,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Star,
  Camera,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  Settings,
  Tags,
} from "lucide-react";
import { format } from "date-fns";
import { formatCents } from "@shared/money";
import type { SelectionTemplate, SelectionTemplateGroup, FieldCategory } from "@shared/schema";
import { OptionsSection, type OptionView } from "@/components/selections/OptionViews";
import { OptionDialog, type OptionDialogValues } from "@/components/selections/OptionDialog";
import { cn } from "@/lib/utils";

interface SelectionOption {
  id: string;
  /** Set when the option references a library product rather than describing one. */
  productId?: number;
  name: string;
  description?: string;
  sku?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  unitCost?: number;
  unitTax?: number;
  gstInclusive?: boolean;
  markupPercent?: number;
  totalCost?: number;
  quantity?: number;
  unitType?: string;
  url?: string;
  imageUrl?: string;
  imageUrls?: string[];
  visibleToClient?: boolean;
  isSelectedByClient?: boolean;
  sortOrder: number;
  specifications?: Record<string, any>;
}


function formatSpecsOneLiner(specs: Record<string, any> | undefined): string {
  if (!specs) return "";
  const parts: string[] = [];
  if (specs.width && specs.height) {
    const dims = [specs.width, specs.height, specs.depth].filter(Boolean).map(String).join(" × ");
    parts.push(dims + "mm");
  }
  if (specs.material) parts.push(specs.material);
  if (specs.finish) parts.push(specs.finish);
  if (specs.colour) parts.push(specs.colour);
  if (specs.welsRating) parts.push(`WELS ${"★".repeat(specs.welsRating)}`);
  if (specs.wattage) parts.push(`${specs.wattage}W`);
  if (specs.lumens) parts.push(`${specs.lumens}lm`);
  if (specs.colourTemp) parts.push(`${specs.colourTemp}K`);
  if (specs.ipRating) parts.push(specs.ipRating);
  if (specs.dimmable) parts.push("Dimmable");
  if (specs.slipRatingP) parts.push(specs.slipRatingP);
  if (specs.thickness) parts.push(`${specs.thickness}mm thick`);
  if (specs.warranty) parts.push(`${specs.warranty}yr warranty`);
  if (specs.custom) {
    specs.custom.forEach((c: { label: string; value: string }) => {
      if (c.label && c.value) parts.push(`${c.label}: ${c.value}`);
    });
  }
  return parts.join(" · ");
}

export default function SelectionTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [gstInclusive, setGstInclusive] = useState(false);
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);
  const [productLibraryOpen, setProductLibraryOpen] = useState(false);
  const [pickerTag, setPickerTag] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const [optionForm, setOptionForm] = useState<Partial<SelectionOption>>({
    name: "",
    description: "",
    sku: "",
    brand: "",
    category: "",
    unitCost: undefined,
    quantity: 1,
    unitType: "ea",
    visibleToClient: true,
    isSelectedByClient: false,
    imageUrls: [],
    specifications: {},
  });

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  const [localMeta, setLocalMeta] = useState({
    itemName: "",
    description: "",
    categoryName: "",
    room: "",
    allowanceType: undefined as "PC" | "PS" | undefined,
    budgetAmount: undefined as number | undefined,
    deadline: null as string | null,
    clientCanSeePrice: true,
    clientCanChange: true,
    groupIds: [] as string[],
  });
  const [hasMetaChanges, setHasMetaChanges] = useState(false);

  const { data: categoryFieldCategory } = useQuery<FieldCategory>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
    queryFn: async () => {
      const res = await fetch("/api/field-categories/by-key/selection.category", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: categoryOptions = [] } = useQuery<{ id: string; value: string; label: string; sortOrder: number }[]>({
    queryKey: ["/api/field-categories", categoryFieldCategory?.id, "options"],
    queryFn: async () => {
      if (!categoryFieldCategory?.id) return [];
      const res = await fetch(`/api/field-categories/${categoryFieldCategory.id}/options`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!categoryFieldCategory?.id,
  });

  const { data: roomFieldCategory } = useQuery<any>({
    queryKey: ["/api/field-categories/by-key/selection.room"],
  });

  const { data: roomOptions = [] } = useQuery<{ id: string; value: string; label: string; sortOrder: number }[]>({
    queryKey: ["/api/field-categories", roomFieldCategory?.id, "options"],
    queryFn: async () => {
      if (!roomFieldCategory?.id) return [];
      const res = await fetch(`/api/field-categories/${roomFieldCategory.id}/options`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!roomFieldCategory?.id,
  });

  const { data: template, isLoading } = useQuery<SelectionTemplate>({
    queryKey: ["/api/selection-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/selection-templates/${params.templateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const { data: groups = [] } = useQuery<SelectionTemplateGroup[]>({
    queryKey: ["/api/selection-template-groups"],
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: productLibraryOpen,
  });

  const { data: productTags = [] } = useQuery<any[]>({
    queryKey: ["/api/product-tags"],
    enabled: productLibraryOpen,
  });

  /** The product fields an option copies for display; the link is productId. */
  const optionFromProduct = (product: any, sortOrder: number) => {
    const imageUrls = (product.images || [])
      .map((img: any) => (typeof img === "string" ? img : img?.filePath))
      .filter((u: any): u is string => typeof u === "string" && u.length > 0);
    return {
      id: crypto.randomUUID(),
      productId: product.id,
      name: product.name || "",
      description: product.description || undefined,
      sku: product.sku || undefined,
      brand: product.brand || undefined,
      category: product.category || undefined,
      unitCost: product.defaultUnitCost ?? undefined,
      quantity: 1,
      unitType: product.unitType || "ea",
      url: product.url || undefined,
      imageUrls,
      visibleToClient: true,
      isSelectedByClient: false,
      specifications: product.specifications || undefined,
      sortOrder,
    } as any;
  };

  /**
   * The point of tags: "Gutter colour" and "Fascia colour" both want the same
   * 22 Colorbond colours. Adding them one at a time is 22 clicks per selection
   * and they drift; this adds the whole set at once, still as references.
   */
  const handleAddAllFromLibrary = (toAdd: any[]) => {
    const alreadyLinked = new Set(options.map((o: any) => o.productId).filter(Boolean));
    const fresh = toAdd.filter((p) => !alreadyLinked.has(p.id));
    if (fresh.length === 0) {
      toast({ title: "Already added", description: "Every product in that tag is already an option here." });
      return;
    }
    const updated = [
      ...options,
      ...fresh.map((p, i) => optionFromProduct(p, options.length + i)),
    ];
    updateMutation.mutate({ templateData: updated }, {
      onSuccess: () => {
        setProductLibraryOpen(false);
        const skipped = toAdd.length - fresh.length;
        toast({
          title: `Added ${fresh.length} option${fresh.length === 1 ? "" : "s"}`,
          description: skipped > 0 ? `${skipped} were already here.` : undefined,
        });
      },
    });
  };

  /** Form state back to what is stored. Also what Cancel calls. */
  const resetLocalMeta = () => {
    if (!template) return;
    const tAny = template as any;
    setLocalMeta({
      itemName: template.name,
      description: template.description || "",
      categoryName: template.category || "",
      room: tAny.room || "",
      allowanceType: tAny.allowanceType || undefined,
      budgetAmount: tAny.budgetAmount || undefined,
      deadline: tAny.deadline || null,
      clientCanSeePrice: tAny.clientCanSeePrice ?? true,
      clientCanChange: tAny.clientCanChange ?? true,
      groupIds: tAny.groupIds || [],
    });
    setHasMetaChanges(false);
  };

  useEffect(() => {
    resetLocalMeta();
  }, [template?.id]);

  // NOTE: Legacy templates (old SelectionItem[] format) are rendered read-compatibly below.
  // No automatic silent migration is performed — templateData is only rewritten on explicit user save.

  const options: SelectionOption[] = useMemo(() => {
    const data = (template?.templateData as any[]) || [];
    if (data.length === 0) return [];

    if ('itemName' in data[0]) {
      // Old format still loading — show options from all items while migration runs
      return data.flatMap((item: any, itemIdx: number) =>
        (item.options || []).map((opt: any, optIdx: number) => ({
          ...opt,
          id: opt.id || `old-${itemIdx}-${optIdx}`,
          sortOrder: opt.sortOrder ?? (itemIdx * 1000 + optIdx),
        }))
      );
    }

    return data.map((opt: any, idx: number) => ({
      ...opt,
      id: opt.id || crypto.randomUUID(),
      sortOrder: opt.sortOrder ?? idx,
    }));
  }, [template?.templateData]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return await apiRequest(`/api/selection-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update template.", variant: "destructive" });
    },
  });

  const handleSaveMeta = () => {
    updateMutation.mutate({
      name: localMeta.itemName.trim() || template?.name,
      description: localMeta.description.trim() || undefined,
      category: localMeta.categoryName || undefined,
      room: localMeta.room.trim() || undefined,
      allowanceType: localMeta.allowanceType || undefined,
      budgetAmount: localMeta.budgetAmount || undefined,
      deadline: localMeta.deadline || undefined,
      clientCanSeePrice: localMeta.clientCanSeePrice,
      clientCanChange: localMeta.clientCanChange,
      groupIds: localMeta.groupIds,
    }, {
      onSuccess: () => {
        setHasMetaChanges(false);
        toast({ title: "Saved", description: "Template details updated." });
      },
    });
  };

  const handleFileUpload = async (files: FileList) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      setIsUploadingImage(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await apiRequest("/api/uploads/template-image", "POST", {
          fileData: dataUrl,
          fileName: file.name,
          mimeType: file.type,
        });
        setOptionForm(prev => ({
          ...prev,
          imageUrls: [...(prev.imageUrls || []), result.url],
        }));
      } catch {
        toast({ title: "Upload failed", description: "Failed to upload image.", variant: "destructive" });
      } finally {
        setIsUploadingImage(false);
      }
    }
  };

  const handleAddOption = () => {
    setEditingOption(null);
    setGstInclusive(false);
    setOptionForm({
      productId: undefined,
      name: "",
      description: "",
      sku: "",
      brand: "",
      category: "",
      unitCost: undefined,
      quantity: 1,
      unitType: "ea",
      visibleToClient: true,
      isSelectedByClient: false,
      imageUrls: [],
      specifications: {},
    });
    setOptionDialogOpen(true);
  };

  const handleSelectFromLibrary = (product: any) => {
    setEditingOption(null);
    setGstInclusive(product.gstInclusive || false);
    // product_images stores `filePath`; there is no `url`. Reading `.url` meant
    // the image never came across — and the `|| img` fallback put the whole
    // image OBJECT into a string array, which /apply later calls .split("/") on.
    const imageUrls = (product.images || [])
      .map((img: any) => (typeof img === "string" ? img : img?.filePath))
      .filter((u: any): u is string => typeof u === "string" && u.length > 0);
    setOptionForm({
      // The point of picking from the library is to REFERENCE the product, not
      // copy it. Without this the write-through sees an unlinked option and
      // mints a new product, so the same Colorbond colour offered by Gutter
      // colour and Fascia colour became two products that then drift apart.
      productId: product.id,
      name: product.name || "",
      description: product.description || "",
      sku: product.sku || "",
      brand: product.brand || "",
      category: product.category || "",
      unitCost: product.defaultUnitCost ? product.defaultUnitCost / 100 : undefined,
      quantity: 1,
      unitType: product.unitType || "ea",
      url: product.url || "",
      imageUrls,
      visibleToClient: true,
      isSelectedByClient: false,
      markupPercent: product.markupPercent,
      specifications: product.specifications || {},
    });
    setProductLibraryOpen(false);
    setOptionDialogOpen(true);
  };

  const handleEditOption = (option: SelectionOption) => {
    setEditingOption(option);
    setGstInclusive(option.gstInclusive || false);
    const imageUrls = option.imageUrls && option.imageUrls.length > 0
      ? option.imageUrls
      : option.imageUrl ? [option.imageUrl] : [];
    setOptionForm({
      name: option.name,
      description: option.description || "",
      sku: option.sku || "",
      brand: option.brand || "",
      category: option.category || "",
      unitCost: option.unitCost ? option.unitCost / 100 : undefined,
      quantity: option.quantity || 1,
      unitType: option.unitType || "ea",
      url: option.url || "",
      imageUrls,
      visibleToClient: option.visibleToClient ?? true,
      isSelectedByClient: option.isSelectedByClient || false,
      markupPercent: option.markupPercent,
      specifications: option.specifications || {},
    });
    setOptionDialogOpen(true);
  };

  const handleSaveOption = (
    values: OptionDialogValues,
    specifications: Record<string, any> | null,
  ) => {
    // The name check that used to live here is the dialog's zod schema now —
    // which is also why a template option can no longer be saved blank.
    const builtOption = (base: Partial<SelectionOption>) => ({
      ...base,
      // Present when the option came from the library. On an edit `base` already
      // carries it, but a NEW option is built from {} — which is exactly how the
      // link used to be lost.
      productId: optionForm.productId ?? (base as any).productId,
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      sku: values.sku?.trim() || undefined,
      brand: values.brand?.trim() || undefined,
      category: values.category?.trim() || undefined,
      // Already cents — the dialog works in the same unit templateData stores.
      unitCost: values.unitCost ?? undefined,
      gstInclusive: values.gstInclusive ?? false,
      quantity: values.quantity || 1,
      unitType: values.unitType || "ea",
      url: values.url?.trim() || undefined,
      // Images are this page's, not the dialog's.
      imageUrls: (optionForm.imageUrls || []).filter(Boolean),
      imageUrl: undefined,
      visibleToClient: values.visibleToClient ?? true,
      // Not a dialog field: "set as default" is a menu action on the card.
      isSelectedByClient: (base as any).isSelectedByClient || false,
      markupPercent: values.markupPercent ?? undefined,
      totalCost: values.totalCost ?? undefined,
      specifications: specifications ?? undefined,
    });

    let updatedOptions: SelectionOption[];

    if (editingOption) {
      updatedOptions = options.map(opt =>
        opt.id === editingOption.id ? builtOption(opt) as SelectionOption : opt
      );
    } else {
      const newOption: SelectionOption = {
        ...builtOption({}) as SelectionOption,
        id: crypto.randomUUID(),
        sortOrder: options.length,
      };
      updatedOptions = [...options, newOption];
    }

    updateMutation.mutate({ templateData: updatedOptions }, {
      onSuccess: () => {
        setOptionDialogOpen(false);
        setEditingOption(null);
        toast({
          title: editingOption ? "Option updated" : "Option added",
          description: editingOption ? "The option has been updated." : "A new option has been added.",
        });
      },
    });
  };

  const handleDeleteOption = (optionId: string) => {
    const updatedOptions = options.filter(opt => opt.id !== optionId);
    updateMutation.mutate({ templateData: updatedOptions }, {
      onSuccess: () => toast({ title: "Option deleted", description: "The option has been removed." }),
    });
  };

  const handleSelectOption = (optionId: string) => {
    const updatedOptions = options.map(opt => ({
      ...opt,
      isSelectedByClient: opt.id === optionId ? !opt.isSelectedByClient : opt.isSelectedByClient,
    }));
    updateMutation.mutate({ templateData: updatedOptions });
  };

  /**
   * templateData entry -> the shape OptionsSection reads.
   *
   * The hero comes out of the blob's `imageUrls` (or the older single
   * `imageUrl`) rather than an option_attachments row, which is the one real
   * difference between the two sources. Everything else lines up because
   * templateData stores cents, exactly as selection_options does.
   *
   * approvedAt and lockedAt are absent on purpose: a template has neither, and
   * passing a falsy value is what keeps the Approved/Locked badges off.
   */
  const optionViews: OptionView[] = options.map((o) => ({
    id: o.id,
    name: o.name,
    brand: o.brand,
    sku: o.sku,
    description: o.description,
    url: o.url,
    quantity: o.quantity,
    unitType: o.unitType,
    unitCost: o.unitCost,
    totalCost: o.totalCost,
    markupPercent: o.markupPercent,
    visibleToClient: o.visibleToClient,
    isSelectedByClient: o.isSelectedByClient,
    heroUrl: o.imageUrls?.[0] || o.imageUrl || null,
    specsLine: formatSpecsOneLiner(o.specifications) || null,
  }));

  /** OptionsSection hands back an OptionView; the handlers want the blob entry. */
  const rowOf = (v: OptionView) => options.find((o) => o.id === v.id)!;

  const templateGroups = useMemo(() => {
    const tAny = template as any;
    return (tAny?.groups || []) as { id: string; name: string }[];
  }, [template]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">Template not found</div>
        <Button variant="outline" onClick={() => navigate("/selection-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Templates
        </Button>
      </div>
    );
  }

  /**
   * What the dialog starts from.
   *
   * The one conversion at this boundary is money: `optionForm.unitCost` is
   * DOLLARS on this page (the old dialog divided by 100 on load and multiplied
   * on save), while the dialog — like selection_options and like templateData
   * itself — is CENTS.
   */
  const optionDialogValues: Partial<OptionDialogValues> = {
    name: optionForm.name ?? "",
    brand: optionForm.brand ?? "",
    sku: optionForm.sku ?? "",
    description: optionForm.description ?? "",
    category: optionForm.category ?? "",
    url: optionForm.url ?? "",
    quantity: optionForm.quantity ?? 1,
    unitType: optionForm.unitType ?? "ea",
    unitCost: optionForm.unitCost != null ? Math.round(optionForm.unitCost * 100) : undefined,
    markupPercent: optionForm.markupPercent,
    gstInclusive,
    visibleToClient: optionForm.visibleToClient ?? true,
  };

  /**
   * The dialog's right-hand column. It stays here because a template image is a
   * data-URL upload whose returned URL is stored as a string inside
   * templateData — nothing like the project page's multipart write into
   * option_attachments.
   */
  const optionMediaPane = (
    <>
        {/* Images */}
        <div className="space-y-2">
          <Label>Images</Label>
          <div className="flex flex-wrap gap-2">
            {(optionForm.imageUrls || []).map((url, idx) => (
              <div key={idx} className="relative group w-16 h-16 rounded-md overflow-hidden border bg-muted flex-shrink-0">
                <img
                  src={url}
                  alt={`Image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <button
                  type="button"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  onClick={() => {
                    const urls = [...(optionForm.imageUrls || [])];
                    urls.splice(idx, 1);
                    setOptionForm({ ...optionForm, imageUrls: urls });
                  }}
                >
                  <X className="h-4 w-4 text-white" />
                </button>
                {idx === 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                    Hero
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="w-16 h-16 rounded-md border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-1 hover-elevate cursor-pointer flex-shrink-0 text-muted-foreground"
              onClick={() => imageUploadRef.current?.click()}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  <span className="text-[9px]">Add</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">First image is used as the hero on the card.</p>
        </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">

          {/* Title row. Same shape as a project selection: back arrow inline
              with the name, Save and the kebab on the right. The old header was
              two stacked 36px bars carrying a Templates › Selections › name
              breadcrumb — a shape no other detail page in the app uses. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <button
                onClick={() => navigate("/selection-templates")}
                className="h-7 w-7 -ml-1 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                data-testid="button-back"
                aria-label="Back to Selection Templates"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-2xl font-bold leading-tight truncate">
                {template.name || "Untitled"}
              </h2>
              <Badge variant="outline" className="h-5 text-[10px] shrink-0">Template</Badge>
            </div>
            <div className="flex items-center gap-2">
              {hasMetaChanges && (
                <Button
                  size="sm"
                  onClick={handleSaveMeta}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-template"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1" />
                  )}
                  Save
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-template-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsEditingDetails(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setGroupsDialogOpen(true)}>
                    <Tags className="w-4 h-4 mr-2" />
                    Manage Groups
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Template Details — summary strip OR inline edit form.
              The strip is the project page's, field for field. Everything was
              an always-live form field before, which made a template read as a
              settings screen rather than as the selection it becomes. */}
          <div className="surface-panel p-3" data-testid="template-details-block">
            {!isEditingDetails ? (
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0 flex items-center gap-6 flex-wrap">
                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Category</div>
                    <div className="text-sm font-medium">{template.category || "—"}</div>
                  </div>

                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Location</div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      {(template as any).room || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Deadline</div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3 text-muted-foreground" />
                      {(template as any).deadline
                        ? format(new Date((template as any).deadline), "dd/MM/yyyy")
                        : "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Groups</div>
                    <div className="flex flex-wrap items-center gap-1">
                      {templateGroups.length === 0
                        ? <span className="text-sm font-medium">—</span>
                        : templateGroups.map((g) => (
                            <Badge key={g.id} variant="outline" className="h-4 px-1.5 text-data">{g.name}</Badge>
                          ))}
                    </div>
                  </div>

                  {template.description && (
                    <div className="w-full mt-2">
                      <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Description</div>
                      <div className="text-sm text-foreground">{template.description}</div>
                    </div>
                  )}
                </div>

                {/* Right column: the money, divided off and read vertically —
                    the project page's allowance block, with a template's
                    budget in it. PC/PS is shown because it is the one field a
                    template carries that a selection has nowhere to put; see
                    migration 0078. */}
                <div className="shrink-0 self-stretch border-l border-border/70 pl-5 pr-1 text-right">
                  <div className="text-data text-muted-foreground uppercase tracking-wide mb-1">Budget</div>
                  <div className="text-lg font-bold tabular-nums" data-testid="text-template-budget">
                    {(template as any).budgetAmount != null
                      ? formatCents((template as any).budgetAmount)
                      : "—"}
                  </div>
                  <div className="text-data text-muted-foreground mt-1">
                    {(template as any).allowanceType === "PC" ? "Prime Cost"
                      : (template as any).allowanceType === "PS" ? "Provisional Sum"
                      : "No allowance type"}
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-2 text-data text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {(template as any).clientCanSeePrice ?? true ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      Price
                    </span>
                    <span className="flex items-center gap-1">
                      {(template as any).clientCanChange ?? true ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      Can change
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Template Name</Label>
                    <Input
                      className="h-9 text-sm"
                      value={localMeta.itemName}
                      onChange={(e) => { setLocalMeta({ ...localMeta, itemName: e.target.value }); setHasMetaChanges(true); }}
                      placeholder="Template name..."
                      data-testid="input-template-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select
                      value={localMeta.categoryName || "_none"}
                      onValueChange={(v) => { setLocalMeta({ ...localMeta, categoryName: v === "_none" ? "" : v }); setHasMetaChanges(true); }}
                    >
                      <SelectTrigger className="h-9 text-sm" data-testid="select-category">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {categoryOptions.map(opt => (
                          <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea
                    value={localMeta.description}
                    onChange={(e) => { setLocalMeta({ ...localMeta, description: e.target.value }); setHasMetaChanges(true); }}
                    rows={3}
                    placeholder="Describe this selection..."
                    className="text-sm resize-none"
                    data-testid="input-template-description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Room / Location</Label>
                    <Select
                      value={localMeta.room || "_none"}
                      onValueChange={(v) => { setLocalMeta({ ...localMeta, room: v === "_none" ? "" : v }); setHasMetaChanges(true); }}
                    >
                      <SelectTrigger className="h-9 text-sm" data-testid="select-room">
                        <SelectValue placeholder="Select room" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {roomOptions.map(opt => (
                          <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Deadline</Label>
                    <Input
                      type="date"
                      className="h-9 text-sm"
                      value={localMeta.deadline ? localMeta.deadline.substring(0, 10) : ""}
                      onChange={(e) => { setLocalMeta({ ...localMeta, deadline: e.target.value || null }); setHasMetaChanges(true); }}
                      data-testid="input-deadline"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Allowance type</Label>
                    <Select
                      value={localMeta.allowanceType || "none"}
                      onValueChange={(v) => { setLocalMeta({ ...localMeta, allowanceType: v === "none" ? undefined : v as "PC" | "PS" }); setHasMetaChanges(true); }}
                    >
                      <SelectTrigger className="h-9 text-sm" data-testid="select-allowance-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="PC">Prime Cost (PC)</SelectItem>
                        <SelectItem value="PS">Provisional Sum (PS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Budget ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-9 text-sm"
                      value={localMeta.budgetAmount !== undefined ? localMeta.budgetAmount / 100 : ""}
                      onChange={(e) => {
                        setLocalMeta({ ...localMeta, budgetAmount: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined });
                        setHasMetaChanges(true);
                      }}
                      data-testid="input-budget"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 pt-1">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={localMeta.clientCanSeePrice}
                      onCheckedChange={(v) => { setLocalMeta({ ...localMeta, clientCanSeePrice: v }); setHasMetaChanges(true); }}
                      data-testid="switch-client-can-see-price"
                    />
                    <Label className="text-sm">Client can see price</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={localMeta.clientCanChange}
                      onCheckedChange={(v) => { setLocalMeta({ ...localMeta, clientCanChange: v }); setHasMetaChanges(true); }}
                      data-testid="switch-client-can-change"
                    />
                    <Label className="text-sm">Client can change selection</Label>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Groups</Label>
                  <div className="flex flex-wrap gap-3">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={localMeta.groupIds.includes(g.id)}
                          onCheckedChange={(checked) => {
                            setLocalMeta(prev => ({
                              ...prev,
                              groupIds: checked
                                ? [...prev.groupIds, g.id]
                                : prev.groupIds.filter(id => id !== g.id),
                            }));
                            setHasMetaChanges(true);
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs">{g.name}</span>
                      </label>
                    ))}
                    {groups.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No groups created yet</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { resetLocalMeta(); setIsEditingDetails(false); }}
                    data-testid="button-cancel-edit-details"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { handleSaveMeta(); setIsEditingDetails(false); }}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-details"
                  >
                    {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>


          {/* Options — the same block a project selection renders, from the same
              component. A template passes fewer affordances: there is nothing to
              approve, nothing to lock, and no allowance to vary from, so the
              Approve button, the lock badge and the variance figure are simply
              absent rather than drawn differently. */}
          <OptionsSection
            options={optionViews}
            viewStorageKey="selection-options-view"
            chosenLabel="Default"
            onOpen={(v) => handleEditOption(rowOf(v))}
            emptyHint="Add options that clients can choose from."
            emptyAction={(
              <Button onClick={handleAddOption} data-testid="button-add-first-option">
                <Plus className="w-4 h-4 mr-2" />
                Add Option
              </Button>
            )}
            addControl={(
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-add-option">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Option
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleAddOption}>
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    New option
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setProductSearch(""); setProductLibraryOpen(true); }}>
                    <Package className="h-3.5 w-3.5 mr-2" />
                    From product library
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            renderMenu={(v, place) => {
              const option = rowOf(v);
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-6 w-6",
                        place === "grid" && "bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity",
                      )}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-menu-option-${option.id}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditOption(option); }}>
                      <Edit3 className="h-4 w-4 mr-2" />Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSelectOption(option.id); }}>
                      <Star className="h-4 w-4 mr-2" />
                      {option.isSelectedByClient ? "Deselect" : "Set as Default"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); handleDeleteOption(option.id); }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }}
          />
        </div>
      </div>

      {/* Hidden file input for image uploads */}
      <input
        ref={imageUploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileUpload(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Groups Dialog */}
      <Dialog open={groupsDialogOpen} onOpenChange={setGroupsDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Groups</DialogTitle>
            <DialogDescription>Assign this template to one or more groups.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-2 max-h-64 overflow-y-auto">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer">
                <Checkbox
                  checked={localMeta.groupIds.includes(g.id)}
                  onCheckedChange={(checked) => {
                    setLocalMeta(prev => ({
                      ...prev,
                      groupIds: checked
                        ? [...prev.groupIds, g.id]
                        : prev.groupIds.filter(id => id !== g.id),
                    }));
                    setHasMetaChanges(true);
                  }}
                />
                <span className="text-sm">{g.name}</span>
              </label>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No groups created yet. Create groups from the templates list page.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setGroupsDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Option Dialog — the shared one. This page supplies the
          persistence (rewrite templateData, PATCH the template) and the media
          column; the form, its validation and the pricing arithmetic live in
          the component. */}
      <OptionDialog
        open={optionDialogOpen}
        onOpenChange={(o) => { setOptionDialogOpen(o); if (!o) setEditingOption(null); }}
        mode={editingOption ? "edit" : "create"}
        nounSingular="Option"
        isSaving={updateMutation.isPending}
        // A template has no selection_options.notes, and buildOption in
        // shared/applyTemplate.ts does not carry notes across, so the field
        // would take text that vanishes the moment the template is applied.
        showNotes={false}
        initialValues={optionDialogValues}
        initialSpecifications={optionForm.specifications ?? null}
        onSubmit={handleSaveOption}
        mediaPane={optionMediaPane}
      />

      {/* Product Library Dialog */}
      <Dialog open={productLibraryOpen} onOpenChange={setProductLibraryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Product Library</DialogTitle>
            <DialogDescription>Select a product to add as an option.</DialogDescription>
          </DialogHeader>
          <div className="flex-shrink-0 mb-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
            {productTags.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={pickerTag} onValueChange={setPickerTag}>
                  <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-picker-tag">
                    <SelectValue placeholder="Any tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Any tag</SelectItem>
                    {productTags.map((t: any) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pickerTag !== "all" && (() => {
                  const tagged = products.filter((p: any) => (p.tagIds || []).includes(pickerTag));
                  return (
                    <Button
                      size="sm"
                      className="h-8 text-xs flex-shrink-0"
                      disabled={tagged.length === 0 || updateMutation.isPending}
                      onClick={() => handleAddAllFromLibrary(tagged)}
                      data-testid="button-add-all-tagged"
                    >
                      Add all {tagged.length}
                    </Button>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {products.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No products in library yet
              </div>
            ) : (() => {
              const filtered = products.filter((p: any) =>
                (pickerTag === "all" || (p.tagIds || []).includes(pickerTag)) &&
                (!productSearch ||
                  p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                  p.brand?.toLowerCase().includes(productSearch.toLowerCase()) ||
                  p.sku?.toLowerCase().includes(productSearch.toLowerCase()))
              );
              if (filtered.length === 0) {
                return <div className="text-center py-8 text-sm text-muted-foreground">No products match your search</div>;
              }
              return filtered.map(product => (
                <button
                  key={product.id}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover-elevate text-left"
                  onClick={() => handleSelectFromLibrary(product)}
                >
                  {(product.images?.[0]?.filePath || product.imageUrl) ? (
                    <img src={product.images?.[0]?.filePath || product.imageUrl} alt={product.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{product.name}</div>
                    {(product.brand || product.sku) && (
                      <div className="text-xs text-muted-foreground">
                        {[product.brand, product.sku ? `SKU: ${product.sku}` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {product.defaultUnitCost && (
                      <div className="text-xs text-muted-foreground">${(product.defaultUnitCost / 100).toFixed(2)}</div>
                    )}
                  </div>
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
