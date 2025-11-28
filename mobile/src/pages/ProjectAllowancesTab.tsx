import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Loader2, DollarSign, TrendingUp, TrendingDown, Percent, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileButton } from "@/components/ui/MobileButton";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, getApiBaseUrl, queryClient } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";

type EstimateItem = {
  id: string;
  estimateId: string;
  name: string;
  allowance: string;
  allowanceStatus: string;
  pcMarkupPercent: number | null;
  unitCostExTax: number;
  quantity: number;
  priceIncTax: number;
  estimateName: string;
  estimateVersion: number;
};

type AllowanceWithCosts = {
  item: EstimateItem;
  actualCost: number;
  variance: number;
};

type Estimate = {
  id: string;
  name: string;
  version: number;
  status: string;
};

const typeOptions = [
  { value: "all", label: "All" },
  { value: "pc", label: "PC" },
  { value: "ps", label: "PS" },
];

const statusOptionsConfig = [
  { value: "all", label: "All Status", key: "all" },
  { value: "pending", label: "Pending", key: "pending" },
  { value: "in_progress", label: "In Progress", key: "in_progress" },
  { value: "finalized", label: "Finalized", key: "finalized" },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  in_progress: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  finalized: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
};

const getStatusLabel = (key: string): string => {
  const found = statusOptionsConfig.find(s => s.key === key);
  return found?.label || key.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
};

export function ProjectAllowancesTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAllowance, setSelectedAllowance] = useState<AllowanceWithCosts | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingMarkup, setEditingMarkup] = useState(false);
  const [markupValue, setMarkupValue] = useState("");

  const { data: allowances = [], isLoading, refetch } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", currentProject?.id, "allowances"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${currentProject?.id}/allowances`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch allowances");
      return res.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", currentProject?.id],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/estimates?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch estimates");
      return res.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return await apiRequest(`/api/estimate-items/${itemId}`, "PATCH", { allowanceStatus: status });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "allowances"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const updateMarkupMutation = useMutation({
    mutationFn: async ({ itemId, markup }: { itemId: string; markup: number }) => {
      return await apiRequest(`/api/estimate-items/${itemId}`, "PATCH", { pcMarkupPercent: markup });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "allowances"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setEditingMarkup(false);
    },
  });

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  // Filter allowances
  const filteredAllowances = allowances.filter((a) => {
    const matchesSearch = a.item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || 
      (typeFilter === "pc" && a.item.allowance === "Prime Cost") ||
      (typeFilter === "ps" && a.item.allowance === "Provisional Sum");
    const matchesStatus = statusFilter === "all" || a.item.allowanceStatus === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleAllowanceClick = async (allowance: AllowanceWithCosts) => {
    setSelectedAllowance(allowance);
    setMarkupValue(allowance.item.pcMarkupPercent?.toString() || "0");
    setEditingMarkup(false);
    setIsDetailOpen(true);
    const Haptics = await getHaptics();
    await Haptics.impact({ style: ImpactStyle.Light });
  };

  const handleStatusChange = async (status: string) => {
    if (selectedAllowance) {
      await updateStatusMutation.mutateAsync({ itemId: selectedAllowance.item.id, status });
      setSelectedAllowance(prev => prev ? {
        ...prev,
        item: { ...prev.item, allowanceStatus: status }
      } : null);
    }
  };

  const isValidMarkup = (value: string): boolean => {
    if (!value.trim()) return false;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  };

  const handleMarkupSave = async () => {
    if (selectedAllowance) {
      if (!isValidMarkup(markupValue)) {
        setMarkupValue("0");
        return;
      }
      const markup = Math.max(0, parseFloat(markupValue));
      await updateMarkupMutation.mutateAsync({ itemId: selectedAllowance.item.id, markup });
      setSelectedAllowance(prev => prev ? {
        ...prev,
        item: { ...prev.item, pcMarkupPercent: markup }
      } : null);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a project to view allowances</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background" {...pullToRefresh.containerProps}>
      <PullToRefreshIndicator {...pullToRefresh} />
      
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search allowances..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm"
            data-testid="input-search-allowances"
          />
        </div>
        
        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {/* Type Filter Chips */}
          {typeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTypeFilter(option.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === option.value
                  ? "bg-[#bba7db] text-white"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`chip-type-${option.value}`}
            >
              {option.label}
            </button>
          ))}
          <div className="w-px h-6 bg-border my-auto" />
          {/* Status Filter Chips */}
          {statusOptionsConfig.slice(0, 4).map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === option.value
                  ? "bg-[#bba7db] text-white"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`chip-status-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAllowances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <DollarSign className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">No Allowances Found</h3>
            <p className="text-sm text-muted-foreground">
              {allowances.length === 0 
                ? "Create estimate items with PC or PS allowances"
                : "No allowances match your filters"}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredAllowances.map((allowance) => {
              const statusStyle = statusColors[allowance.item.allowanceStatus] || 
                { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" };
              const isPC = allowance.item.allowance === "Prime Cost";
              
              return (
                <div
                  key={allowance.item.id}
                  onClick={() => handleAllowanceClick(allowance)}
                  className="p-4 bg-background active:bg-muted/50 transition-colors"
                  data-testid={`card-allowance-${allowance.item.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Name and Type Badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm truncate">{allowance.item.name}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isPC 
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        }`}>
                          {isPC ? "PC" : "PS"}
                        </span>
                      </div>
                      
                      {/* Status Badge */}
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {getStatusLabel(allowance.item.allowanceStatus)}
                      </span>
                      
                      {/* Price Info */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          <span>Est: {formatCurrency(allowance.item.priceIncTax)}</span>
                        </div>
                        {isPC && allowance.item.pcMarkupPercent !== null && (
                          <div className="flex items-center gap-1">
                            <Percent className="w-3 h-3" />
                            <span>{allowance.item.pcMarkupPercent}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Variance */}
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        {allowance.variance > 0 ? (
                          <TrendingUp className="w-4 h-4 text-red-500" />
                        ) : allowance.variance < 0 ? (
                          <TrendingDown className="w-4 h-4 text-green-500" />
                        ) : null}
                        <span className={`text-sm font-medium ${
                          allowance.variance > 0 ? "text-red-500" : 
                          allowance.variance < 0 ? "text-green-500" : ""
                        }`}>
                          {formatCurrency(Math.abs(allowance.variance))}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">variance</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <BottomSheet
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedAllowance(null);
          setEditingMarkup(false);
        }}
        title="Allowance Details"
      >
        {selectedAllowance && (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-lg font-semibold">{selectedAllowance.item.name}</h2>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  selectedAllowance.item.allowance === "Prime Cost"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" 
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>
                  {selectedAllowance.item.allowance === "Prime Cost" ? "PC" : "PS"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                From: {selectedAllowance.item.estimateName} (v{selectedAllowance.item.estimateVersion})
              </p>
            </div>

            {/* Status Picker */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {statusOptionsConfig.filter(s => s.value !== "all").map((option) => {
                  const isSelected = selectedAllowance.item.allowanceStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => handleStatusChange(option.value)}
                      disabled={updateStatusMutation.isPending}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-[#bba7db] text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                      data-testid={`button-status-${option.value}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Estimate Price</span>
                </div>
                <p className="font-semibold">{formatCurrency(selectedAllowance.item.priceIncTax)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs font-medium">Actual Cost</span>
                </div>
                <p className="font-semibold">{formatCurrency(selectedAllowance.actualCost)}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  {selectedAllowance.variance > 0 ? (
                    <TrendingUp className="w-4 h-4 text-red-500" />
                  ) : selectedAllowance.variance < 0 ? (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  ) : (
                    <DollarSign className="w-4 h-4" />
                  )}
                  <span className="text-xs font-medium">Variance</span>
                </div>
                <p className={`font-semibold ${
                  selectedAllowance.variance > 0 ? "text-red-500" : 
                  selectedAllowance.variance < 0 ? "text-green-500" : ""
                }`}>
                  {selectedAllowance.variance >= 0 ? "+" : ""}{formatCurrency(selectedAllowance.variance)}
                </p>
              </div>
              {selectedAllowance.item.allowance === "Prime Cost" && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Percent className="w-4 h-4" />
                    <span className="text-xs font-medium">PC Markup</span>
                  </div>
                  {editingMarkup ? (
                    <div className="flex items-center gap-2">
                      <MobileInput
                        type="number"
                        value={markupValue}
                        onChange={(e) => setMarkupValue(e.target.value)}
                        className="w-16 h-8 text-sm"
                      />
                      <span className="text-sm">%</span>
                      <MobileButton
                        size="sm"
                        onClick={handleMarkupSave}
                        disabled={updateMarkupMutation.isPending}
                      >
                        Save
                      </MobileButton>
                      <MobileButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingMarkup(false)}
                      >
                        Cancel
                      </MobileButton>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingMarkup(true)}
                      className="font-semibold underline underline-offset-2"
                      data-testid="button-edit-markup"
                    >
                      {selectedAllowance.item.pcMarkupPercent || 0}%
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
