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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Package,
  DollarSign,
  Settings,
  Loader2,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  Star,
  Camera,
  X,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
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
  sortOrder: number;
  options?: SelectionOption[];
}

export default function SelectionTemplateItemDetail() {
  const params = useParams<{ templateId: string; itemId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("options");
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [gstInclusive, setGstInclusive] = useState(false);
  
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
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [specsOpen, setSpecsOpen] = useState(false);
  const [specPickerOpen, setSpecPickerOpen] = useState(false);

  const [itemForm, setItemForm] = useState<Partial<SelectionItem>>({
    itemName: "",
    description: "",
    categoryName: "",
    room: "",
    allowanceType: undefined,
    budgetAmount: undefined,
  });

  const { data: categoryFieldCategory } = useQuery<FieldCategory>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
    queryFn: async () => {
      const res = await fetch("/api/field-categories/by-key/selection.category", {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: categoryOptions = [] } = useQuery<{ id: string; value: string; label: string; sortOrder: number }[]>({
    queryKey: ["/api/field-categories", categoryFieldCategory?.id, "options"],
    queryFn: async () => {
      if (!categoryFieldCategory?.id) return [];
      const res = await fetch(`/api/field-categories/${categoryFieldCategory.id}/options`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!categoryFieldCategory?.id,
  });

  const { data: template, isLoading } = useQuery<SelectionTemplate>({
    queryKey: ["/api/selection-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/selection-templates/${params.templateId}`, {
        credentials: "include",
      });
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
    return itemsToCheck.some(item => 
      !item.id || item.options?.some(opt => !opt.id)
    );
  };

  // Items with stable IDs (either from server or cached generated)
  const items: SelectionItem[] = useMemo(() => {
    const rawItems = (template?.templateData as SelectionItem[]) || [];
    return normalizeWithStableIds(rawItems);
  }, [template?.templateData]);

  // Auto-save normalized data if legacy items lack IDs (one-time migration)
  useEffect(() => {
    if (!template || hasTriggeredMigration.current) return;
    
    const rawItems = (template.templateData as SelectionItem[]) || [];
    if (rawItems.length > 0 && hasLegacyData(rawItems)) {
      hasTriggeredMigration.current = true;
      setIsNormalizing(true);
      
      const normalized = normalizeWithStableIds(rawItems);
      apiRequest(`/api/selection-templates/${params.templateId}`, "PATCH", { templateData: normalized })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/selection-templates", params.templateId] });
        })
        .catch(() => {
          hasTriggeredMigration.current = false;
        })
        .finally(() => {
          setIsNormalizing(false);
        });
    }
  }, [template, params.templateId]);

  const currentItem = items.find(item => item.id === params.itemId);

  useEffect(() => {
    if (currentItem) {
      setItemForm({
        itemName: currentItem.itemName,
        description: currentItem.description || "",
        categoryName: currentItem.categoryName || "",
        room: currentItem.room || "",
        allowanceType: currentItem.allowanceType,
        budgetAmount: currentItem.budgetAmount ? currentItem.budgetAmount / 100 : undefined,
      });
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
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const handleSaveItemSettings = () => {
    if (!currentItem) return;

    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) {
        return {
          ...item,
          itemName: itemForm.itemName || item.itemName,
          description: itemForm.description,
          categoryName: itemForm.categoryName || item.categoryName,
          room: itemForm.room,
          allowanceType: itemForm.allowanceType,
          budgetAmount: itemForm.budgetAmount ? Math.round(itemForm.budgetAmount * 100) : undefined,
        };
      }
      return item;
    });

    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
      onSuccess: () => {
        setSettingsDialogOpen(false);
        toast({
          title: "Item updated",
          description: "Selection item settings have been saved.",
        });
      },
    });
  };

  const handleAddOption = () => {
    setEditingOption(null);
    setGstInclusive(false);
    setImageUrlInput("");
    setSpecsOpen(false);
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
    setImageUrlInput("");
    setSpecsOpen(!!(option.specifications && Object.keys(option.specifications).length > 0));
    // backward compat: if legacy imageUrl exists but no imageUrls array, migrate
    const imageUrls = option.imageUrls && option.imageUrls.length > 0
      ? option.imageUrls
      : option.imageUrl
        ? [option.imageUrl]
        : [];
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
      toast({
        title: "Missing name",
        description: "Please enter an option name.",
        variant: "destructive",
      });
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
      imageUrl: undefined, // clear legacy field
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
      if (item.id === currentItem.id) {
        return { ...item, options: updatedOptions };
      }
      return item;
    });

    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
      onSuccess: () => {
        setOptionDialogOpen(false);
        setEditingOption(null);
        toast({
          title: editingOption ? "Option updated" : "Option added",
          description: editingOption
            ? "The option has been updated successfully."
            : "A new option has been added.",
        });
      },
    });
  };

  const handleDeleteOption = (optionId: string) => {
    if (!currentItem) return;

    const updatedOptions = (currentItem.options || []).filter(opt => opt.id !== optionId);
    
    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) {
        return { ...item, options: updatedOptions };
      }
      return item;
    });

    updateMutation.mutate({ templateData: normalizeWithStableIds(updatedItems) }, {
      onSuccess: () => {
        toast({
          title: "Option deleted",
          description: "The option has been removed.",
        });
      },
    });
  };

  const handleSelectOption = (optionId: string) => {
    if (!currentItem) return;

    const updatedOptions = (currentItem.options || []).map(opt => ({
      ...opt,
      isSelectedByClient: opt.id === optionId,
    }));

    const updatedItems = items.map(item => {
      if (item.id === currentItem.id) {
        return { ...item, options: updatedOptions };
      }
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
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Template
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Row 1 - Back + Title */}
      <div className="h-9 bg-background flex items-center px-2 gap-3 border-b border-border flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => navigate(`/selection-templates/${params.templateId}`)}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" data-testid="text-item-name">
            {currentItem.itemName}
          </h2>
          {currentItem.categoryName && (
            <Badge variant="secondary" className="text-xs">
              {currentItem.categoryName}
            </Badge>
          )}
          {currentItem.allowanceType && (
            <Badge variant="outline" className="text-xs">
              {currentItem.allowanceType}
            </Badge>
          )}
        </div>
        <Badge variant="outline" className="text-xs ml-auto">
          {(currentItem.options || []).length} {(currentItem.options || []).length === 1 ? 'option' : 'options'}
        </Badge>
      </div>

      {/* Header Row 2 - Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setSettingsDialogOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-3 w-3 mr-1" />
            Settings
          </Button>
        </div>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-2 border-b border-border">
          <TabsList className="h-8">
            <TabsTrigger value="options" className="text-xs h-6">Options</TabsTrigger>
            <TabsTrigger value="details" className="text-xs h-6">Details</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="options" className="flex-1 overflow-auto p-4 mt-0">
          {/* Search */}
          <div className="mb-4">
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search options..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-2 py-0 h-6 text-xs border"
                data-testid="input-search-options"
              />
            </div>
          </div>

          {filteredOptions.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-sm font-medium mb-2">No options yet</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Add options for this selection item
              </p>
              <button
                className="h-6 px-2 text-xs border rounded-md text-white border-primary/20 hover:opacity-90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                style={{ backgroundColor: CASVA_LILAC }}
                onClick={handleAddOption}
                data-testid="button-add-first-option"
              >
                <Plus className="h-3 w-3" />
                Add Option
              </button>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredOptions.map((option) => {
                const heroUrl = option.imageUrls?.[0] || option.imageUrl || null;
                const specsLine = formatSpecsOneLiner(option.specifications);
                return (
                <div
                  key={option.id}
                  className={`border rounded-lg overflow-hidden bg-card hover-elevate transition-all ${
                    option.isSelectedByClient ? 'ring-2 ring-primary' : ''
                  }`}
                  data-testid={`card-option-${option.id}`}
                >
                  {/* Hero image */}
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
                    {/* Top-right menu */}
                    <div className="absolute top-1 right-1">
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
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSelectOption(option.id)}>
                            <Star className="h-4 w-4 mr-2" />
                            {option.isSelectedByClient ? 'Deselect' : 'Set as Default'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteOption(option.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Badges overlay */}
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

                  {/* Card body */}
                  <div className="p-3 space-y-1">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="font-semibold text-sm leading-tight line-clamp-1">{option.name}</h4>
                      {option.unitCost && (
                        <div className="text-sm font-semibold text-nowrap flex items-center gap-0.5 ml-2 shrink-0">
                          <DollarSign className="h-3 w-3" />
                          {(option.unitCost / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                    {option.brand && (
                      <p className="text-xs text-muted-foreground">{option.brand}{option.sku ? ` · ${option.sku}` : ''}</p>
                    )}
                    {!option.brand && option.sku && (
                      <p className="text-xs text-muted-foreground">SKU: {option.sku}</p>
                    )}
                    {option.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{option.description}</p>
                    )}
                    {specsLine && (
                      <p className="text-[10px] text-muted-foreground/80 line-clamp-1 mt-0.5">{specsLine}</p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="details" className="flex-1 overflow-auto p-4 mt-0">
          <div className="max-w-2xl space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <p className="text-sm">{currentItem.categoryName || '-'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Room/Location</Label>
                <p className="text-sm">{currentItem.room || '-'}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm">{currentItem.description || '-'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Allowance Type</Label>
                <p className="text-sm">{currentItem.allowanceType || '-'}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Budget Amount</Label>
                <p className="text-sm">
                  {currentItem.budgetAmount
                    ? `$${(currentItem.budgetAmount / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Item Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-item-settings">
          <DialogHeader>
            <DialogTitle>Selection Item Settings</DialogTitle>
            <DialogDescription>
              Update this selection item's details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input
                value={itemForm.itemName || ""}
                onChange={(e) => setItemForm({ ...itemForm, itemName: e.target.value })}
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={itemForm.description || ""}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={itemForm.categoryName || ""}
                  onValueChange={(value) => setItemForm({ ...itemForm, categoryName: value })}
                >
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Room/Location</Label>
                <Input
                  value={itemForm.room || ""}
                  onChange={(e) => setItemForm({ ...itemForm, room: e.target.value })}
                  placeholder="e.g., Kitchen, Bathroom"
                  data-testid="input-room"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Allowance Type</Label>
                <Select
                  value={itemForm.allowanceType || ""}
                  onValueChange={(value) => setItemForm({ ...itemForm, allowanceType: value as "PC" | "PS" | undefined })}
                >
                  <SelectTrigger data-testid="select-allowance-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PC">Prime Cost (PC)</SelectItem>
                    <SelectItem value="PS">Provisional Sum (PS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Budget Amount ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.budgetAmount || ""}
                  onChange={(e) => setItemForm({ ...itemForm, budgetAmount: parseFloat(e.target.value) || undefined })}
                  data-testid="input-budget"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveItemSettings}
              disabled={updateMutation.isPending}
              style={{ backgroundColor: CASVA_LILAC }}
              className="text-white hover:opacity-90"
              data-testid="button-save-settings"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <SelectTrigger data-testid="select-unit-type">
                    <SelectValue />
                  </SelectTrigger>
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

            {/* Images */}
            <div className="space-y-2">
              <Label>Images</Label>
              {(optionForm.imageUrls || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {(optionForm.imageUrls || []).map((url, idx) => (
                    <div key={idx} className="relative group w-16 h-16 rounded-md overflow-hidden border bg-muted">
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
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && imageUrlInput.trim()) {
                      e.preventDefault();
                      setOptionForm({
                        ...optionForm,
                        imageUrls: [...(optionForm.imageUrls || []), imageUrlInput.trim()],
                      });
                      setImageUrlInput("");
                    }
                  }}
                  data-testid="input-image-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!imageUrlInput.trim()}
                  onClick={() => {
                    if (!imageUrlInput.trim()) return;
                    setOptionForm({
                      ...optionForm,
                      imageUrls: [...(optionForm.imageUrls || []), imageUrlInput.trim()],
                    });
                    setImageUrlInput("");
                  }}
                >
                  Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Paste an image URL and press Add or Enter. First image is used as the hero.</p>
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
                  {optionForm.specifications && Object.keys(optionForm.specifications).filter(k => k !== 'custom').some(k => optionForm.specifications![k] !== undefined && optionForm.specifications![k] !== "") && (
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      {Object.keys(optionForm.specifications).filter(k => k !== 'custom' && optionForm.specifications![k] !== undefined && optionForm.specifications![k] !== "").length} set
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
                        <Label className="text-xs capitalize">{key === "depth" ? "Depth (mm)" : key === "width" ? "Width (mm)" : "Height (mm)"}</Label>
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
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
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
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MATERIAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Additional spec fields (from picker) */}
                  {SPEC_PICKER_GROUPS.flatMap(g => g.fields).filter(f => {
                    const val = optionForm.specifications?.[f.key];
                    return val !== undefined && val !== "" && val !== null;
                  }).map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <Label className="text-xs w-36 shrink-0">{f.label}</Label>
                      {f.type === "boolean" ? (
                        <Switch
                          checked={!!optionForm.specifications?.[f.key]}
                          onCheckedChange={(checked) => setOptionForm({
                            ...optionForm,
                            specifications: { ...optionForm.specifications, [f.key]: checked },
                          })}
                        />
                      ) : (
                        <div className="flex-1 flex items-center gap-1">
                          <Input
                            type={f.type === "number" ? "number" : "text"}
                            min="0"
                            className="h-8 text-xs flex-1"
                            value={optionForm.specifications?.[f.key] ?? ""}
                            onChange={(e) => setOptionForm({
                              ...optionForm,
                              specifications: {
                                ...optionForm.specifications,
                                [f.key]: f.type === "number" ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value || undefined,
                              },
                            })}
                          />
                          <button
                            type="button"
                            className="p-1 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const specs = { ...optionForm.specifications };
                              delete specs[f.key];
                              setOptionForm({ ...optionForm, specifications: specs });
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Custom fields */}
                  {((optionForm.specifications?.custom || []) as { label: string; value: string }[]).map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        className="h-8 text-xs w-28 shrink-0"
                        placeholder="Label"
                        value={c.label}
                        onChange={(e) => {
                          const custom = [...((optionForm.specifications?.custom || []) as { label: string; value: string }[])];
                          custom[idx] = { ...custom[idx], label: e.target.value };
                          setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                        }}
                      />
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="Value"
                        value={c.value}
                        onChange={(e) => {
                          const custom = [...((optionForm.specifications?.custom || []) as { label: string; value: string }[])];
                          custom[idx] = { ...custom[idx], value: e.target.value };
                          setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                        }}
                      />
                      <button
                        type="button"
                        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => {
                          const custom = [...((optionForm.specifications?.custom || []) as { label: string; value: string }[])];
                          custom.splice(idx, 1);
                          setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* + Add detail picker */}
                  <div className="relative">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md px-2 py-1"
                      onClick={() => setSpecPickerOpen(!specPickerOpen)}
                    >
                      <Plus className="h-3 w-3" />
                      Add detail
                    </button>
                    {specPickerOpen && (
                      <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border rounded-md shadow-md p-2 min-w-48 max-h-64 overflow-y-auto">
                        {SPEC_PICKER_GROUPS.map(group => (
                          <div key={group.label} className="mb-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">{group.label}</p>
                            {group.fields.filter(f => {
                              const val = optionForm.specifications?.[f.key];
                              return val === undefined || val === "" || val === null;
                            }).map(f => (
                              <button
                                key={f.key}
                                type="button"
                                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent"
                                onClick={() => {
                                  const defaultVal = f.type === "boolean" ? false : f.type === "number" ? undefined : "";
                                  setOptionForm({
                                    ...optionForm,
                                    specifications: { ...optionForm.specifications, [f.key]: defaultVal },
                                  });
                                  setSpecPickerOpen(false);
                                }}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        ))}
                        <div className="border-t pt-1 mt-1">
                          <button
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent text-muted-foreground"
                            onClick={() => {
                              const custom = [...((optionForm.specifications?.custom || []) as { label: string; value: string }[]), { label: "", value: "" }];
                              setOptionForm({ ...optionForm, specifications: { ...optionForm.specifications, custom } });
                              setSpecPickerOpen(false);
                            }}
                          >
                            + Custom field
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveOption}
              disabled={updateMutation.isPending}
              style={{ backgroundColor: CASVA_LILAC }}
              className="text-white hover:opacity-90"
              data-testid="button-save-option"
            >
              {updateMutation.isPending ? "Saving..." : editingOption ? "Save Changes" : "Add Option"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
