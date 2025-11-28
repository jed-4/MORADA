import { useState, useEffect } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Selection, SelectionOption } from "@shared/schema";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Loader2, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Tag, 
  Edit2, 
  Trash2,
  Save,
  Package,
  MoreVertical,
  Eye,
  EyeOff,
  CheckCircle
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { MobileButton } from "@/components/ui/MobileButton";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";
import { format } from "date-fns";
import { useSelectionStatusOptions } from "@/hooks/useSelectionStatusOptions";

interface SelectionWithOptions extends Selection {
  options?: SelectionOption[];
}

interface SelectionDetailPageProps {
  selectionId: string;
  onBack: () => void;
}

export function SelectionDetailPage({ selectionId, onBack }: SelectionDetailPageProps) {
  const { currentProject } = useProject();
  const { statusOptions, getStatusInfo, getStatusLabel } = useSelectionStatusOptions();
  const [activeTab, setActiveTab] = useState<"options" | "details">("options");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formStatus, setFormStatus] = useState("draft");
  const [formAllowance, setFormAllowance] = useState("");
  const [formClientCanChange, setFormClientCanChange] = useState(true);
  const [formClientCanSeePrice, setFormClientCanSeePrice] = useState(false);

  const [optionName, setOptionName] = useState("");
  const [optionDescription, setOptionDescription] = useState("");
  const [optionBrand, setOptionBrand] = useState("");
  const [optionSku, setOptionSku] = useState("");
  const [optionPrice, setOptionPrice] = useState("");

  const { data: selection, isLoading, refetch } = useQuery<SelectionWithOptions>({
    queryKey: ["/api/selections", selectionId],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/selections/${selectionId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch selection");
      return res.json();
    },
    enabled: !!selectionId,
  });

  useEffect(() => {
    if (selection) {
      setFormName(selection.name);
      setFormDescription(selection.description || "");
      setFormCategory(selection.category || "");
      setFormRoom(selection.room || "");
      setFormStatus(selection.status);
      setFormAllowance(selection.allowance != null ? (selection.allowance / 100).toString() : "");
      setFormClientCanChange(selection.clientCanChange);
      setFormClientCanSeePrice(selection.clientCanSeePrice);
    }
  }, [selection]);

  const updateSelectionMutation = useMutation({
    mutationFn: async (data: Partial<Selection>) => {
      return await apiRequest(`/api/selections/${selectionId}`, "PATCH", data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selectionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setHasUnsavedChanges(false);
    },
  });

  const createOptionMutation = useMutation({
    mutationFn: async (data: Partial<SelectionOption>) => {
      return await apiRequest(`/api/selections/${selectionId}/options`, "POST", data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selectionId] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      closeOptionSheet();
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ optionId, data }: { optionId: string; data: Partial<SelectionOption> }) => {
      return await apiRequest(`/api/selection-options/${optionId}`, "PATCH", data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selectionId] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      closeOptionSheet();
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      return await apiRequest(`/api/selection-options/${optionId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selectionId] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const resetOptionForm = () => {
    setOptionName("");
    setOptionDescription("");
    setOptionBrand("");
    setOptionSku("");
    setOptionPrice("");
    setEditingOption(null);
  };

  const closeOptionSheet = () => {
    setIsAddOptionOpen(false);
    resetOptionForm();
  };

  const openEditOption = (option: SelectionOption) => {
    setOptionName(option.name);
    setOptionDescription(option.description || "");
    setOptionBrand(option.brand || "");
    setOptionSku(option.sku || "");
    setOptionPrice(option.totalCost != null ? (option.totalCost / 100).toString() : "");
    setEditingOption(option);
    setIsAddOptionOpen(true);
  };

  const handleSaveOption = () => {
    let priceInCents: number | undefined = undefined;
    if (optionPrice !== "") {
      const parsed = parseFloat(optionPrice);
      if (!isNaN(parsed)) {
        priceInCents = Math.round(parsed * 100);
      }
    }

    const data = {
      name: optionName,
      description: optionDescription || undefined,
      brand: optionBrand || undefined,
      sku: optionSku || undefined,
      totalCost: priceInCents,
      quantity: 1,
      unitType: "ea",
      visibleToClient: true,
    };

    if (editingOption) {
      updateOptionMutation.mutate({ optionId: editingOption.id, data });
    } else {
      createOptionMutation.mutate({ ...data, selectionId });
    }
  };

  const handleSaveSelection = () => {
    let allowanceInCents: number | undefined = undefined;
    if (formAllowance !== "") {
      const parsed = parseFloat(formAllowance);
      if (!isNaN(parsed)) {
        allowanceInCents = Math.round(parsed * 100);
      }
    }

    updateSelectionMutation.mutate({
      name: formName,
      description: formDescription || undefined,
      category: formCategory || undefined,
      room: formRoom || undefined,
      status: formStatus,
      allowance: allowanceInCents,
      clientCanChange: formClientCanChange,
      clientCanSeePrice: formClientCanSeePrice,
    });
  };

  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return null;
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(dollars);
  };

  const filteredOptions = (selection?.options || []).filter((option) =>
    option.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    option.brand?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selection) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Package className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Selection not found</p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#bba7db] font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    );
  }

  const currentStatus = getStatusInfo(selection.status);
  const StatusIcon = currentStatus.icon;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{selection.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`h-5 px-2 flex items-center gap-1 rounded-md text-xs font-medium ${currentStatus.bgClass} ${currentStatus.textClass}`}>
                <StatusIcon className="w-3 h-3" />
                {currentStatus.name}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-t">
          <button
            onClick={() => setActiveTab("options")}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "options"
                ? "border-[#bba7db] text-[#bba7db]"
                : "border-transparent text-muted-foreground"
            }`}
            data-testid="tab-options"
          >
            Options ({selection.options?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "details"
                ? "border-[#bba7db] text-[#bba7db]"
                : "border-transparent text-muted-foreground"
            }`}
            data-testid="tab-details"
          >
            Details
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "options" ? (
          <div className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search options..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
                data-testid="input-search-options"
              />
            </div>

            {/* Options List */}
            {filteredOptions.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-medium mb-2">No Options Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add options for the client to choose from
                </p>
                <button
                  onClick={() => setIsAddOptionOpen(true)}
                  className="inline-flex items-center gap-2 bg-[#bba7db] text-white px-4 py-2 rounded-lg font-medium"
                  data-testid="button-add-first-option"
                >
                  <Plus className="w-4 h-4" />
                  Add First Option
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredOptions.map((option) => (
                  <div
                    key={option.id}
                    className="p-3 bg-card border rounded-lg"
                    data-testid={`option-card-${option.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{option.name}</h3>
                        {option.brand && (
                          <p className="text-xs text-muted-foreground mt-0.5">{option.brand}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {option.totalCost != null && (
                          <span className="text-sm font-semibold">
                            {formatCurrency(option.totalCost)}
                          </span>
                        )}
                        <button
                          onClick={() => openEditOption(option)}
                          className="p-1.5 hover-elevate rounded-md"
                          data-testid={`button-edit-option-${option.id}`}
                        >
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this option?")) {
                              deleteOptionMutation.mutate(option.id);
                            }
                          }}
                          className="p-1.5 hover-elevate rounded-md text-red-500"
                          data-testid={`button-delete-option-${option.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {option.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {option.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {option.isSelectedByClient && (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-md">
                          <CheckCircle className="w-3 h-3" />
                          Selected
                        </span>
                      )}
                      {!option.visibleToClient && (
                        <span className="inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-md">
                          <EyeOff className="w-3 h-3" />
                          Hidden
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Details Tab */
          <div className="p-4 pb-24 space-y-6">
            {/* Status Section */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map((status) => {
                  const Icon = status.icon;
                  const isSelected = formStatus === status.key;
                  return (
                    <button
                      key={status.key}
                      onClick={() => {
                        setFormStatus(status.key);
                        setHasUnsavedChanges(true);
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                        isSelected 
                          ? "bg-[#bba7db] text-white border-[#bba7db]" 
                          : "hover-elevate border-border"
                      }`}
                      data-testid={`status-${status.key}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{status.name}</span>
                      <span className={`text-[10px] text-center ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                        {status.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="font-medium">Basic Information</h3>
              
              <MobileInput
                label="Name"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Selection name"
                data-testid="input-name"
              />

              <MobileTextarea
                label="Description"
                value={formDescription}
                onChange={(e) => {
                  setFormDescription(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Describe this selection..."
                rows={3}
                data-testid="textarea-description"
              />

              <div className="grid grid-cols-2 gap-3">
                <MobileInput
                  label="Category"
                  value={formCategory}
                  onChange={(e) => {
                    setFormCategory(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="e.g., Tiles"
                  data-testid="input-category"
                />
                <MobileInput
                  label="Location"
                  value={formRoom}
                  onChange={(e) => {
                    setFormRoom(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="e.g., Kitchen"
                  data-testid="input-room"
                />
              </div>

              <MobileInput
                label="Budget Allowance ($)"
                value={formAllowance}
                onChange={(e) => {
                  setFormAllowance(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="0.00"
                type="number"
                data-testid="input-allowance"
              />
            </div>

            {/* Client Permissions */}
            <div className="space-y-4">
              <h3 className="font-medium">Client Permissions</h3>
              
              <div className="flex items-center justify-between p-3 bg-card border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Allow Changes</p>
                  <p className="text-xs text-muted-foreground">Client can change their selection</p>
                </div>
                <button
                  onClick={() => {
                    setFormClientCanChange(!formClientCanChange);
                    setHasUnsavedChanges(true);
                  }}
                  className={`w-11 h-6 rounded-full transition-colors ${
                    formClientCanChange ? "bg-[#bba7db]" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  data-testid="toggle-client-can-change"
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formClientCanChange ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-card border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Show Pricing</p>
                  <p className="text-xs text-muted-foreground">Client can see option prices</p>
                </div>
                <button
                  onClick={() => {
                    setFormClientCanSeePrice(!formClientCanSeePrice);
                    setHasUnsavedChanges(true);
                  }}
                  className={`w-11 h-6 rounded-full transition-colors ${
                    formClientCanSeePrice ? "bg-[#bba7db]" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                  data-testid="toggle-client-can-see-price"
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formClientCanSeePrice ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FAB for Options tab */}
      {activeTab === "options" && (
        <button
          onClick={() => setIsAddOptionOpen(true)}
          className="fixed bottom-20 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center z-40"
          data-testid="button-add-option"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Sticky Footer for Details tab */}
      {activeTab === "details" && (
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t px-4 py-3 flex gap-3 z-10">
          <MobileButton
            variant="outline"
            onClick={onBack}
            className="flex-1"
            data-testid="button-cancel"
          >
            Cancel
          </MobileButton>
          <MobileButton
            onClick={handleSaveSelection}
            disabled={updateSelectionMutation.isPending || !hasUnsavedChanges}
            className="flex-1"
            data-testid="button-save"
          >
            {updateSelectionMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </MobileButton>
        </div>
      )}

      {/* Add/Edit Option Sheet */}
      <BottomSheet isOpen={isAddOptionOpen} onClose={closeOptionSheet}>
        <div className="p-4 pb-8">
          <h2 className="text-xl font-bold mb-6">
            {editingOption ? "Edit Option" : "Add Option"}
          </h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Name"
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              placeholder="e.g., Subway Tile White"
              data-testid="input-option-name"
            />

            <MobileInput
              label="Brand"
              value={optionBrand}
              onChange={(e) => setOptionBrand(e.target.value)}
              placeholder="e.g., Concept Tile"
              data-testid="input-option-brand"
            />

            <MobileTextarea
              label="Description"
              value={optionDescription}
              onChange={(e) => setOptionDescription(e.target.value)}
              placeholder="Describe this option..."
              rows={2}
              data-testid="textarea-option-description"
            />

            <div className="grid grid-cols-2 gap-3">
              <MobileInput
                label="SKU"
                value={optionSku}
                onChange={(e) => setOptionSku(e.target.value)}
                placeholder="Product code"
                data-testid="input-option-sku"
              />
              <MobileInput
                label="Price ($)"
                value={optionPrice}
                onChange={(e) => setOptionPrice(e.target.value)}
                placeholder="0.00"
                type="number"
                data-testid="input-option-price"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={closeOptionSheet}
                className="flex-1"
                data-testid="button-cancel-option"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={handleSaveOption}
                disabled={!optionName || createOptionMutation.isPending || updateOptionMutation.isPending}
                className="flex-1"
                data-testid="button-save-option"
              >
                {(createOptionMutation.isPending || updateOptionMutation.isPending)
                  ? "Saving..."
                  : editingOption ? "Save Changes" : "Add Option"
                }
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
