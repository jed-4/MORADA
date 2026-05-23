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
  DollarSign,
  Loader2,
  Save,
  Eye,
  EyeOff,
  Star,
  Camera,
  X,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LayoutList,
} from "lucide-react";
import type { SelectionTemplate, FieldCategory } from "@shared/schema";

const CASVA_LILAC = 'hsl(var(--primary))';

interface SelectionOption {
  id: string;
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

interface Specifications {
  width?: number;
  height?: number;
  depth?: number;
  finish?: string;
  material?: string;
  diameter?: number;
  weight?: number;
  colour?: string;
  colourCode?: string;
  welsRating?: number;
  energyRating?: number;
  slipRatingP?: string;
  slipRatingR?: string;
  flowRate?: number;
  spoutHeight?: number;
  spoutReach?: number;
  mountingType?: string;
  thickness?: number;
  ipRating?: string;
  wattage?: number;
  lumens?: number;
  colourTemp?: number;
  dimmable?: boolean;
  warranty?: number;
  leadTime?: number;
  fireRating?: string;
  custom?: { label: string; value: string }[];
  [key: string]: any;
}

const SPEC_PICKER_GROUPS = [
  {
    label: "Dimensions",
    fields: [
      { key: "diameter", label: "Diameter (mm)", type: "number" },
      { key: "weight", label: "Weight (kg)", type: "number" },
    ],
  },
  {
    label: "Appearance",
    fields: [
      { key: "colour", label: "Colour", type: "text" },
      { key: "colourCode", label: "Colour code", type: "text" },
    ],
  },
  {
    label: "Technical — Tapware",
    fields: [
      { key: "flowRate", label: "Flow rate (L/min)", type: "number" },
      { key: "spoutHeight", label: "Spout height (mm)", type: "number" },
      { key: "spoutReach", label: "Spout reach (mm)", type: "number" },
      { key: "mountingType", label: "Mounting type", type: "text" },
      { key: "welsRating", label: "WELS rating (1–6)", type: "number" },
    ],
  },
  {
    label: "Technical — Tiles & Flooring",
    fields: [
      { key: "thickness", label: "Thickness (mm)", type: "number" },
      { key: "slipRatingP", label: "Slip rating — Wet (P0–P5)", type: "text" },
      { key: "slipRatingR", label: "Slip rating — Oil (R9–R13)", type: "text" },
    ],
  },
  {
    label: "Technical — Lighting",
    fields: [
      { key: "wattage", label: "Wattage (W)", type: "number" },
      { key: "lumens", label: "Lumens (lm)", type: "number" },
      { key: "colourTemp", label: "Colour temperature (K)", type: "number" },
      { key: "ipRating", label: "IP rating", type: "text" },
      { key: "dimmable", label: "Dimmable", type: "boolean" },
    ],
  },
  {
    label: "Technical — Appliances",
    fields: [
      { key: "energyRating", label: "Energy rating (1–10)", type: "number" },
    ],
  },
  {
    label: "Compliance",
    fields: [
      { key: "warranty", label: "Warranty (years)", type: "number" },
      { key: "leadTime", label: "Lead time (weeks)", type: "number" },
      { key: "fireRating", label: "Fire rating", type: "text" },
    ],
  },
];

const FINISH_OPTIONS = ["Chrome", "Brushed Nickel", "Matte Black", "Brushed Gold", "Brushed Brass", "White", "Black", "Powder Coat", "Custom"];
const MATERIAL_OPTIONS = ["Brass", "Stainless Steel", "Ceramic", "Porcelain", "Timber", "Glass", "Acrylic", "Custom"];

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

interface SelectionItem {
  id: string;
  categoryName: string;
  itemName: string;
  description?: string;
  room?: string;
  allowanceType?: "PC" | "PS";
  budgetAmount?: number;
  deadline?: string | null;
  clientCanSeePrice?: boolean;
  clientCanChange?: boolean;
  notes?: string;
  sortOrder: number;
  options?: SelectionOption[];
}

export default function SelectionTemplateItemDetail() {
  const params = useParams<{ templateId: string; itemId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Redirect to the new flat template detail page
  useEffect(() => {
    if (params.templateId) {
      navigate(`/selection-templates/${params.templateId}`, { replace: true });
    }
  }, [params.templateId]);

  const [searchTerm, setSearchTerm] = useState("");
  const [optionsView, setOptionsView] = useState<"grid" | "list">("grid");
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [gstInclusive, setGstInclusive] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [specPickerOpen, setSpecPickerOpen] = useState(false);

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

  const [localItem, setLocalItem] = useState<Partial<SelectionItem>>({});
  const [hasItemChanges, setHasItemChanges] = useState(false);
  const [localNotes, setLocalNotes] = useState("");
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { data: template, isLoading } = useQuery<SelectionTemplate>({
    queryKey: ["/api/selection-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/selection-templates/${params.templateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const [isNormalizing, setIsNormalizing] = useState(false);
  const normalizedCache = useRef<Map<string, string>>(new Map());
  const hasTriggeredMigration = useRef(false);

  const getStableId = (originalId: string | undefined, fallbackKey: string): string => {
    if (originalId) return originalId;
    const cached = normalizedCache.current.get(fallbackKey);
    if (cached) return cached;
    const newId = crypto.randomUUID();
    normalizedCache.current.set(fallbackKey, newId);
    return newId;
  };

  const normalizeWithStableIds = (itemsToNormalize: SelectionItem[]): SelectionItem[] => {
    return itemsToNormalize.map((item, idx) => {
      const itemKey = `item-${idx}`;
      return {
        ...item,
        id: getStableId(item.id, itemKey),
        sortOrder: item.sortOrder ?? idx,
        options: (item.options || []).map((opt, optIdx) => {
          const optKey = `${itemKey}-opt-${optIdx}`;
          return {
            ...opt,
            id: getStableId(opt.id, optKey),
            sortOrder: opt.sortOrder ?? optIdx,
          };
        }),
      };
    });
  };

  const hasLegacyData = (itemsToCheck: SelectionItem[]): boolean => {
    return itemsToCheck.some(item => !item.id || item.options?.some(opt => !opt.id));
  };

  const items: SelectionItem[] = useMemo(() => {
    const rawItems = (template?.templateData as SelectionItem[]) || [];
    return normalizeWithStableIds(rawItems);
  }, [template?.templateData]);

  useEffect(() => {
    if (!template || hasTriggeredMigration.current) return;
    const rawItems = (template.templateData as SelectionItem[]) || [];
    if (rawItems.length > 0 && hasLegacyData(rawItems)) {
      hasTriggeredMigration.current = true;
      setIsNormalizing(true);
      const normalized = normalizeWithStableIds(rawItems);
      apiRequest(`/api/selection-templates/${params.templateId}`, "PATCH", { templateData: normalized })
        .then(() => { queryClient.invalidateQueries({ queryKey: ["/api/selection-templates", params.templateId] }); })
        .catch(() => { hasTriggeredMigration.current = false; })
        .finally(() => { setIsNormalizing(false); });
    }
  }, [template, params.templateId]);

  const currentItem = items.find(item => item.id === params.itemId);

  useEffect(() => {
    if (currentItem) {
      setLocalItem({
        itemName: currentItem.itemName,
        description: currentItem.description || "",
        categoryName: currentItem.categoryName || "",
        room: currentItem.room || "",
        allowanceType: currentItem.allowanceType,
        budgetAmount: currentItem.budgetAmount,
        deadline: currentItem.deadline || null,
        clientCanSeePrice: currentItem.clientCanSeePrice ?? true,
        clientCanChange: currentItem.clientCanChange ?? true,
      });
      setLocalNotes(currentItem.notes || "");
      setHasItemChanges(false);
    }
  }, [currentItem?.id]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<SelectionTemplate>) => {
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

  const handleSaveItem = () => {
    if (!currentItem) return;
    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) {
        return {
          ...item,
          itemName: localItem.itemName || item.itemName,
          description: localItem.description,
          categoryName: localItem.categoryName || item.categoryName,
          room: localItem.room,
          allowanceType: localItem.allowanceType,
          budgetAmount: localItem.budgetAmount,
          deadline: localItem.deadline,
          clientCanSeePrice: localItem.clientCanSeePrice,
          clientCanChange: localItem.clientCanChange,
        };
      }
      return item;
    });
    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
      onSuccess: () => {
        setHasItemChanges(false);
        toast({ title: "Saved", description: "Item details updated." });
      },
    });
  };

  const handleNotesBlur = () => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      if (!currentItem || localNotes === (currentItem.notes || "")) return;
      const updatedItems = items.map(item => {
        if (item.id === currentItem.id) {
          return { ...item, notes: localNotes || undefined };
        }
        return item;
      });
      updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) });
    }, 600);
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
    setSpecsOpen(false);
    setSpecPickerOpen(false);
    setOptionForm({
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

  const handleEditOption = (option: SelectionOption) => {
    setEditingOption(option);
    setGstInclusive(option.gstInclusive || false);
    setSpecsOpen(!!(option.specifications && Object.keys(option.specifications).length > 0));
    setSpecPickerOpen(false);
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

  const handleSaveOption = () => {
    if (!optionForm.name?.trim() || !currentItem) {
      toast({ title: "Missing name", description: "Please enter an option name.", variant: "destructive" });
      return;
    }

    const options = currentItem.options || [];
    let updatedOptions: SelectionOption[];

    const builtOption = (base: Partial<SelectionOption>) => ({
      ...base,
      name: optionForm.name!.trim(),
      description: optionForm.description?.trim(),
      sku: optionForm.sku?.trim(),
      brand: optionForm.brand?.trim(),
      category: optionForm.category?.trim(),
      unitCost: optionForm.unitCost ? Math.round(optionForm.unitCost * 100) : undefined,
      gstInclusive,
      quantity: optionForm.quantity || 1,
      unitType: optionForm.unitType || "ea",
      url: optionForm.url?.trim(),
      imageUrls: (optionForm.imageUrls || []).filter(Boolean),
      imageUrl: undefined,
      visibleToClient: optionForm.visibleToClient ?? true,
      isSelectedByClient: optionForm.isSelectedByClient || false,
      markupPercent: optionForm.markupPercent,
      specifications: optionForm.specifications && Object.keys(optionForm.specifications).length > 0
        ? optionForm.specifications
        : undefined,
    });

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

    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) return { ...item, options: updatedOptions };
      return item;
    });

    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
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
    if (!currentItem) return;
    const updatedOptions = (currentItem.options || []).filter(opt => opt.id !== optionId);
    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) return { ...item, options: updatedOptions };
      return item;
    });
    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
      onSuccess: () => toast({ title: "Option deleted", description: "The option has been removed." }),
    });
  };

  const handleSelectOption = (optionId: string) => {
    if (!currentItem) return;
    const updatedOptions = (currentItem.options || []).map(opt => ({
      ...opt,
      isSelectedByClient: opt.id === optionId,
    }));
    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) return { ...item, options: updatedOptions };
      return item;
    });
    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) });
  };

  const filteredOptions = (currentItem?.options || []).filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template || !currentItem) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">Selection item not found</div>
        <Button variant="outline" onClick={() => navigate(`/selection-templates/${params.templateId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Template
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sticky header */}
      <div className="flex-shrink-0 border-b bg-background">
        <div className="h-9 flex items-center px-2 gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => navigate(`/selection-templates/${params.templateId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 text-xs min-w-0 flex-1">
            <button
              className="text-muted-foreground hover:text-foreground truncate max-w-40 transition-colors"
              onClick={() => navigate(`/selection-templates/${params.templateId}`)}
            >
              {template.name}
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-foreground truncate">{currentItem.itemName}</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {hasItemChanges && (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSaveItem}
                disabled={updateMutation.isPending}
                data-testid="button-save-item"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                Save
              </Button>
            )}
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md text-white border-primary/20 hover:opacity-90 active-elevate-2 flex items-center gap-0.5"
              style={{ backgroundColor: CASVA_LILAC }}
              onClick={handleAddOption}
              data-testid="button-add-option"
            >
              <Plus className="w-3 h-3" />
              <span>Add Option</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-5">

          {/* Item name + subtitle */}
          <div>
            <input
              className="text-xl font-bold bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring rounded w-full px-0.5 py-0.5 -ml-0.5"
              value={localItem.itemName || ""}
              onChange={(e) => { setLocalItem({ ...localItem, itemName: e.target.value }); setHasItemChanges(true); }}
              placeholder="Item name..."
              data-testid="input-item-name-inline"
            />
            <p className="text-sm text-muted-foreground mt-0.5">
              {[localItem.categoryName, localItem.room].filter(Boolean).join(" · ") || <span className="italic">No category set</span>}
            </p>
          </div>

          {/* Item Details block */}
          <div className="border rounded-md p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-[11px]">Item Details</h3>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={localItem.description || ""}
                onChange={(e) => { setLocalItem({ ...localItem, description: e.target.value }); setHasItemChanges(true); }}
                rows={3}
                placeholder="Describe this selection item..."
                className="text-sm resize-none"
                data-testid="input-description-inline"
              />
            </div>

            {/* Notes to trades */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes to trades</Label>
              <Textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={handleNotesBlur}
                rows={3}
                placeholder="Add notes for the trades team..."
                className="text-sm resize-none"
                data-testid="input-notes"
              />
              {localNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
                  {localNotes}
                </div>
              )}
            </div>

            {/* Category + Room + Deadline */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select
                  value={localItem.categoryName || ""}
                  onValueChange={(v) => { setLocalItem({ ...localItem, categoryName: v }); setHasItemChanges(true); }}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-category-inline">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(opt => (
                      <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Room / Location</Label>
                <Input
                  className="h-8 text-xs"
                  value={localItem.room || ""}
                  onChange={(e) => { setLocalItem({ ...localItem, room: e.target.value }); setHasItemChanges(true); }}
                  placeholder="e.g., Kitchen"
                  data-testid="input-room-inline"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Deadline</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={localItem.deadline ? localItem.deadline.substring(0, 10) : ""}
                  onChange={(e) => { setLocalItem({ ...localItem, deadline: e.target.value || null }); setHasItemChanges(true); }}
                  data-testid="input-deadline-inline"
                />
              </div>
            </div>

            {/* Allowance type + Budget */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Allowance type</Label>
                <Select
                  value={localItem.allowanceType || "none"}
                  onValueChange={(v) => { setLocalItem({ ...localItem, allowanceType: v === "none" ? undefined : v as "PC" | "PS" }); setHasItemChanges(true); }}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-allowance-inline">
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
                  className="h-8 text-xs"
                  value={localItem.budgetAmount !== undefined ? localItem.budgetAmount / 100 : ""}
                  onChange={(e) => { setLocalItem({ ...localItem, budgetAmount: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined }); setHasItemChanges(true); }}
                  data-testid="input-budget-inline"
                />
              </div>
            </div>

            {/* Client permission switches */}
            <div className="flex flex-wrap gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={localItem.clientCanSeePrice ?? true}
                  onCheckedChange={(v) => { setLocalItem({ ...localItem, clientCanSeePrice: v }); setHasItemChanges(true); }}
                  data-testid="switch-client-price"
                />
                <Label className="text-sm">Client can see price</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={localItem.clientCanChange ?? true}
                  onCheckedChange={(v) => { setLocalItem({ ...localItem, clientCanChange: v }); setHasItemChanges(true); }}
                  data-testid="switch-client-change"
                />
                <Label className="text-sm">Client can change selection</Label>
              </div>
            </div>
          </div>

          {/* Options section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-sm">Options</h3>
              <Badge variant="outline" className="h-4 text-data">
                {filteredOptions.length}
              </Badge>
              <div className="ml-auto flex items-center gap-1">
                <div className="relative w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-7 h-7 text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${optionsView === "grid" ? "bg-muted" : ""}`}
                  onClick={() => setOptionsView("grid")}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${optionsView === "list" ? "bg-muted" : ""}`}
                  onClick={() => setOptionsView("list")}
                  title="List view"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {filteredOptions.length === 0 ? (
              <div className="text-center py-12 border rounded-md bg-muted/20">
                <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="text-sm font-medium mb-2">
                  {searchTerm ? "No matching options" : "No options yet"}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {searchTerm ? "Try a different search term" : "Add options for this selection item"}
                </p>
                {!searchTerm && (
                  <button
                    className="h-6 px-2 text-xs border rounded-md text-white border-primary/20 hover:opacity-90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                    style={{ backgroundColor: CASVA_LILAC }}
                    onClick={handleAddOption}
                    data-testid="button-add-first-option"
                  >
                    <Plus className="h-3 w-3" />
                    Add Option
                  </button>
                )}
              </div>
            ) : optionsView === "grid" ? (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredOptions.map((option) => {
                  const heroUrl = option.imageUrls?.[0] || option.imageUrl || null;
                  const specsLine = formatSpecsOneLiner(option.specifications);
                  return (
                    <div
                      key={option.id}
                      className={`border rounded-lg overflow-hidden bg-card hover-elevate cursor-pointer transition-all ${option.isSelectedByClient ? "ring-2 ring-primary" : ""}`}
                      onClick={() => handleEditOption(option)}
                      data-testid={`card-option-${option.id}`}
                    >
                      <div className="relative h-40 bg-muted flex items-center justify-center overflow-hidden">
                        {heroUrl ? (
                          <img
                            src={heroUrl}
                            alt={option.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <Camera className="h-8 w-8 text-muted-foreground/30" />
                        )}
                        <div className="absolute top-1 right-1" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 bg-black/40 text-white hover:bg-black/60"
                                data-testid={`button-menu-option-${option.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditOption(option)}>
                                <Edit3 className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSelectOption(option.id)}>
                                <Star className="h-4 w-4 mr-2" />
                                {option.isSelectedByClient ? "Deselect" : "Set as Default"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteOption(option.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="absolute top-1 left-1 flex flex-col gap-1">
                          {option.isSelectedByClient && (
                            <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground">Default</Badge>
                          )}
                          {!option.visibleToClient && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              <EyeOff className="h-2.5 w-2.5 mr-0.5" />Hidden
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="font-semibold text-sm leading-tight line-clamp-1">{option.name}</h4>
                          {option.unitCost && (
                            <div className="text-sm font-semibold text-nowrap flex items-center gap-0.5 ml-2 shrink-0">
                              <DollarSign className="h-3 w-3" />
                              {(option.unitCost / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                        {(option.brand || option.sku) && (
                          <p className="text-xs text-muted-foreground">
                            {option.brand}{option.sku ? ` · ${option.sku}` : ""}
                          </p>
                        )}
                        {specsLine && (
                          <p className="text-[10px] text-muted-foreground/80 line-clamp-1">{specsLine}</p>
                        )}
                        {option.quantity && option.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">Qty {option.quantity} {option.unitType || "ea"}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left text-[11px] text-muted-foreground font-medium p-2 w-12">Img</th>
                      <th className="text-left text-[11px] text-muted-foreground font-medium p-2">Option</th>
                      <th className="text-left text-[11px] text-muted-foreground font-medium p-2 hidden sm:table-cell">Brand</th>
                      <th className="text-left text-[11px] text-muted-foreground font-medium p-2 hidden md:table-cell">SKU</th>
                      <th className="text-right text-[11px] text-muted-foreground font-medium p-2">Qty</th>
                      <th className="text-right text-[11px] text-muted-foreground font-medium p-2">Unit Cost</th>
                      <th className="text-left text-[11px] text-muted-foreground font-medium p-2 hidden sm:table-cell">Visibility</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOptions.map((option) => {
                      const heroUrl = option.imageUrls?.[0] || option.imageUrl || null;
                      return (
                        <tr
                          key={option.id}
                          className="border-t hover-elevate cursor-pointer"
                          onClick={() => handleEditOption(option)}
                          data-testid={`row-option-${option.id}`}
                        >
                          <td className="p-2">
                            {heroUrl ? (
                              <img src={heroUrl} alt={option.name} className="w-9 h-9 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-9 h-9 rounded bg-muted flex items-center justify-center">
                                <Camera className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="font-medium text-xs">{option.name}</div>
                            {option.isSelectedByClient && <Badge className="text-[9px] h-3.5 px-1 mt-0.5">Default</Badge>}
                          </td>
                          <td className="p-2 hidden sm:table-cell text-xs text-muted-foreground">{option.brand || "—"}</td>
                          <td className="p-2 hidden md:table-cell text-xs text-muted-foreground font-mono">{option.sku || "—"}</td>
                          <td className="p-2 text-right text-xs tabular-nums">{option.quantity || 1}</td>
                          <td className="p-2 text-right text-xs tabular-nums">
                            {option.unitCost ? `$${(option.unitCost / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "—"}
                          </td>
                          <td className="p-2 hidden sm:table-cell">
                            {!option.visibleToClient && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                <EyeOff className="h-2.5 w-2.5 mr-0.5" />Hidden
                              </Badge>
                            )}
                          </td>
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditOption(option)}>
                                  <Edit3 className="h-4 w-4 mr-2" />Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSelectOption(option.id)}>
                                  <Star className="h-4 w-4 mr-2" />
                                  {option.isSelectedByClient ? "Deselect" : "Set as Default"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteOption(option.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

      {/* Option Dialog */}
      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-option">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Edit Option" : "Add Option"}</DialogTitle>
            <DialogDescription>
              {editingOption ? "Update this selection option." : "Add a new option for this selection."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Option Name *</Label>
                <Input
                  value={optionForm.name || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
                  placeholder="e.g., Marble Benchtop"
                  data-testid="input-option-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input
                  value={optionForm.brand || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, brand: e.target.value })}
                  placeholder="e.g., Caesarstone"
                  data-testid="input-brand"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={optionForm.description || ""}
                onChange={(e) => setOptionForm({ ...optionForm, description: e.target.value })}
                rows={2}
                placeholder="Describe this option..."
                data-testid="input-option-description"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SKU / Product Code</Label>
                <Input
                  value={optionForm.sku || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, sku: e.target.value })}
                  placeholder="e.g., CS-MARBLE-01"
                  data-testid="input-sku"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={optionForm.category || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, category: e.target.value })}
                  placeholder="e.g., Benchtops"
                  data-testid="input-option-category"
                />
              </div>
              <div className="space-y-2">
                <Label>URL / Link</Label>
                <Input
                  value={optionForm.url || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, url: e.target.value })}
                  placeholder="https://..."
                  data-testid="input-url"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={optionForm.unitCost || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, unitCost: parseFloat(e.target.value) || undefined })}
                  data-testid="input-unit-cost"
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={optionForm.quantity || 1}
                  onChange={(e) => setOptionForm({ ...optionForm, quantity: parseInt(e.target.value) || 1 })}
                  data-testid="input-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Type</Label>
                <Select
                  value={optionForm.unitType || "ea"}
                  onValueChange={(value) => setOptionForm({ ...optionForm, unitType: value })}
                >
                  <SelectTrigger data-testid="select-unit-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ea">Each</SelectItem>
                    <SelectItem value="m2">m²</SelectItem>
                    <SelectItem value="lm">Linear Meter</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Markup (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={optionForm.markupPercent || ""}
                  onChange={(e) => setOptionForm({ ...optionForm, markupPercent: parseFloat(e.target.value) || undefined })}
                  data-testid="input-markup"
                />
              </div>
            </div>

            {/* Images — file upload */}
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
                  data-testid="button-add-image"
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

            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={gstInclusive}
                  onCheckedChange={setGstInclusive}
                  data-testid="switch-gst"
                />
                <Label className="text-sm">Price includes GST</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={optionForm.visibleToClient ?? true}
                  onCheckedChange={(checked) => setOptionForm({ ...optionForm, visibleToClient: checked })}
                  data-testid="switch-visible"
                />
                <Label className="text-sm flex items-center gap-1">
                  {optionForm.visibleToClient ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Visible to client
                </Label>
              </div>
            </div>

            {/* Specifications collapsible */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover-elevate bg-muted/40 text-left"
                onClick={() => setSpecsOpen(!specsOpen)}
              >
                <span className="flex items-center gap-2">
                  {specsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Product Specifications
                  {optionForm.specifications && Object.keys(optionForm.specifications).filter(k => k !== "custom").some(k => optionForm.specifications![k] !== undefined && optionForm.specifications![k] !== "") && (
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      {Object.keys(optionForm.specifications).filter(k => k !== "custom" && optionForm.specifications![k] !== undefined && optionForm.specifications![k] !== "").length} set
                    </Badge>
                  )}
                </span>
              </button>
              {specsOpen && (
                <div className="p-3 space-y-3 border-t">
                  {/* Default fields: W × H × D, Finish, Material */}
                  <div className="grid grid-cols-3 gap-2">
                    {["width", "height", "depth"].map((key) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs capitalize">
                          {key === "depth" ? "Depth (mm)" : key === "width" ? "Width (mm)" : "Height (mm)"}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 text-xs"
                          value={optionForm.specifications?.[key] ?? ""}
                          onChange={(e) => setOptionForm({
                            ...optionForm,
                            specifications: { ...optionForm.specifications, [key]: e.target.value ? parseFloat(e.target.value) : undefined },
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Finish</Label>
                      <Select
                        value={optionForm.specifications?.finish ?? ""}
                        onValueChange={(v) => setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, finish: v || undefined } })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select finish..." /></SelectTrigger>
                        <SelectContent>
                          {FINISH_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Material</Label>
                      <Select
                        value={optionForm.specifications?.material ?? ""}
                        onValueChange={(v) => setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, material: v || undefined } })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select material..." /></SelectTrigger>
                        <SelectContent>
                          {MATERIAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dynamic spec fields (added via picker) */}
                  {SPEC_PICKER_GROUPS.flatMap(g => g.fields).map(field => {
                    const val = optionForm.specifications?.[field.key];
                    if (val === undefined || val === "") return null;
                    return (
                      <div key={field.key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{field.label}</Label>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const s = { ...optionForm.specifications };
                              delete s[field.key];
                              setOptionForm({ ...optionForm, specifications: s });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        {field.type === "boolean" ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!!val}
                              onCheckedChange={(v) => setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, [field.key]: v } })}
                            />
                            <Label className="text-xs">{val ? "Yes" : "No"}</Label>
                          </div>
                        ) : (
                          <Input
                            type={field.type}
                            className="h-8 text-xs"
                            value={val}
                            onChange={(e) => setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, [field.key]: field.type === "number" ? parseFloat(e.target.value) || undefined : e.target.value } })}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Custom fields */}
                  {(optionForm.specifications?.custom || []).map((c: { label: string; value: string }, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          className="h-8 text-xs"
                          value={c.label}
                          onChange={(e) => {
                            const custom = [...(optionForm.specifications?.custom || [])];
                            custom[idx] = { ...custom[idx], label: e.target.value };
                            setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Value</Label>
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const custom = (optionForm.specifications?.custom || []).filter((_: any, i: number) => i !== idx);
                              setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <Input
                          className="h-8 text-xs"
                          value={c.value}
                          onChange={(e) => {
                            const custom = [...(optionForm.specifications?.custom || [])];
                            custom[idx] = { ...custom[idx], value: e.target.value };
                            setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Add spec picker */}
                  <div className="pt-1">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                      onClick={() => setSpecPickerOpen(!specPickerOpen)}
                    >
                      <Plus className="h-3 w-3" />
                      Add detail
                    </button>
                    {specPickerOpen && (
                      <div className="mt-2 border rounded-md p-2 space-y-2 bg-muted/20">
                        {SPEC_PICKER_GROUPS.map(group => (
                          <div key={group.label}>
                            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">{group.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {group.fields.map(field => {
                                const alreadySet = optionForm.specifications?.[field.key] !== undefined;
                                return (
                                  <button
                                    key={field.key}
                                    type="button"
                                    disabled={alreadySet}
                                    className="text-[10px] px-1.5 py-0.5 border rounded hover-elevate disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={() => {
                                      setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, [field.key]: field.type === "boolean" ? false : field.type === "number" ? 0 : "" } });
                                      setSpecPickerOpen(false);
                                    }}
                                  >
                                    {field.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => {
                            const custom = [...(optionForm.specifications?.custom || []), { label: "", value: "" }];
                            setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                            setSpecPickerOpen(false);
                          }}
                        >
                          + Custom field
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOptionDialogOpen(false); setEditingOption(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveOption}
              disabled={updateMutation.isPending}
              style={{ backgroundColor: CASVA_LILAC }}
              className="text-white hover:opacity-90"
              data-testid="button-save-option"
            >
              {updateMutation.isPending ? "Saving..." : editingOption ? "Update Option" : "Add Option"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
