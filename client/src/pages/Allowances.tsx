import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, TrendingUp, TrendingDown, Search, ChevronDown } from "lucide-react";
import { type Estimate } from "@shared/schema";

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

export default function Allowances() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();
  const { statusOptions, getStatusInfo } = useAllowanceStatusOptions();
  const [editingMarkup, setEditingMarkup] = useState<string | null>(null);
  const [markupValue, setMarkupValue] = useState<string>("");
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pc" | "ps">("all");

  // Fetch estimates for the project
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/estimates?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch estimates");
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  // Reset selectedEstimateId when project changes
  useEffect(() => {
    setSelectedEstimateId(null);
  }, [projectId]);

  // Initialize from localStorage or set default estimate (working estimate or first estimate)
  useEffect(() => {
    if (estimates.length > 0 && !selectedEstimateId) {
      const storageKey = `allowances-selected-estimate-${projectId}`;
      const storedEstimateId = localStorage.getItem(storageKey);
      
      // Check if stored estimate still exists in current estimates
      const storedEstimateExists = storedEstimateId && estimates.some(e => e.id === storedEstimateId);
      
      if (storedEstimateExists) {
        setSelectedEstimateId(storedEstimateId);
      } else {
        // Fall back to working estimate or first estimate
        const workingEstimate = estimates.find(e => e.status === 'working');
        const defaultEstimateId = workingEstimate?.id || estimates[0].id;
        setSelectedEstimateId(defaultEstimateId);
        localStorage.setItem(storageKey, defaultEstimateId);
      }
    }
  }, [estimates, selectedEstimateId, projectId]);

  // Save to localStorage when estimate selection changes
  const handleEstimateChange = (estimateId: string) => {
    setSelectedEstimateId(estimateId);
    const storageKey = `allowances-selected-estimate-${projectId}`;
    localStorage.setItem(storageKey, estimateId);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return apiRequest(`/api/estimate-items/${itemId}`, "PATCH", { allowanceStatus: status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Status updated" });
    },
  });

  const updateMarkupMutation = useMutation({
    mutationFn: async ({ itemId, markup }: { itemId: string; markup: number }) => {
      return apiRequest(`/api/estimate-items/${itemId}`, "PATCH", { pcMarkupPercent: markup });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      setEditingMarkup(null);
      toast({ title: "Markup updated" });
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

  const handleMarkupEdit = (itemId: string, currentMarkup: number | null) => {
    setEditingMarkup(itemId);
    setMarkupValue(currentMarkup?.toString() || "0");
  };

  const isValidMarkup = (value: string): boolean => {
    if (!value.trim()) return false;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  };

  const handleMarkupSave = (itemId: string) => {
    if (!isValidMarkup(markupValue)) {
      toast({ title: "Invalid markup", description: "Please enter a valid number (0 or greater)", variant: "destructive" });
      return;
    }
    const markup = Math.max(0, parseFloat(markupValue));
    updateMarkupMutation.mutate({ itemId, markup });
  };

  // Filter allowances by selected estimate, search, status, and type
  const filteredAllowances = useMemo(() => {
    let result = allowances;
    
    // Filter by estimate
    if (selectedEstimateId) {
      result = result.filter(a => a.item.estimateId === selectedEstimateId);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a => a.item.name.toLowerCase().includes(term));
    }
    
    // Filter by status
    if (statusFilter) {
      result = result.filter(a => a.item.allowanceStatus === statusFilter);
    }
    
    // Filter by type (PC/PS)
    if (typeFilter === "pc") {
      result = result.filter(a => a.item.allowance === "Prime Cost");
    } else if (typeFilter === "ps") {
      result = result.filter(a => a.item.allowance === "Provisional Sum");
    }
    
    return result;
  }, [allowances, selectedEstimateId, searchTerm, statusFilter, typeFilter]);

  // Count items by type for badge display
  const pcCount = allowances.filter(a => 
    (!selectedEstimateId || a.item.estimateId === selectedEstimateId) && 
    a.item.allowance === "Prime Cost"
  ).length;
  const psCount = allowances.filter(a => 
    (!selectedEstimateId || a.item.estimateId === selectedEstimateId) && 
    a.item.allowance === "Provisional Sum"
  ).length;

  // Get statuses from the field categories hook
  const filterStatusOptions = statusOptions.length > 0 ? statusOptions : [
    { key: "pending", name: "Pending", color: "#F59E0B" },
    { key: "in_progress", name: "In Progress", color: "#3B82F6" },
    { key: "finalized", name: "Finalized", color: "#10B981" }
  ];

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16">
        <div className="w-12 h-12 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-4">
          <DollarSign className="w-6 h-6 text-[#bba7db]" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">No Project Selected</h3>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Please select a project to view allowances.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Row 1 Skeleton */}
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="animate-pulse h-4 bg-muted rounded w-48" />
            <div className="animate-pulse h-5 bg-muted rounded w-16" />
          </div>
        </div>
        {/* Row 2 Skeleton */}
        <div className="h-9 bg-background flex items-center px-2 gap-2 border-b border-border flex-shrink-0">
          <div className="animate-pulse h-6 bg-muted rounded w-48" />
          <div className="animate-pulse h-6 bg-muted rounded w-40" />
          <div className="animate-pulse h-6 bg-muted rounded w-20" />
        </div>
        {/* Table Skeleton */}
        <div className="flex-1 overflow-auto p-2">
          <Card className="p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-muted rounded w-full" />
              <div className="h-10 bg-muted/50 rounded w-full" />
              <div className="h-10 bg-muted/50 rounded w-full" />
              <div className="h-10 bg-muted/50 rounded w-full" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Row 1 - Breadcrumbs & Count (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Project Name (Breadcrumb style) */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {currentProject.name} / Allowances
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-allowance-count">
            {filteredAllowances.length} items
          </Badge>
        </div>
      </div>

      {/* Row 2 - Search, Filters & Type Toggles (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search + Filters */}
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-allowances"
            />
          </div>

          {/* Estimate Selector */}
          <Select
            value={selectedEstimateId || ""}
            onValueChange={handleEstimateChange}
            disabled={estimatesLoading || estimates.length === 0}
          >
            <SelectTrigger className="w-[180px] h-6 text-xs" data-testid="select-estimate">
              <SelectValue placeholder="Select estimate" />
            </SelectTrigger>
            <SelectContent>
              {estimates.map((estimate) => (
                <SelectItem key={estimate.id} value={estimate.id} data-testid={`estimate-option-${estimate.id}`}>
                  {estimate.name} (v{estimate.version})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter || "all"}
            onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}
          >
            <SelectTrigger 
              className="w-[130px] h-6 text-xs" 
              data-testid="select-status-filter"
            >
              <SelectValue>
                {statusFilter ? getStatusInfo(statusFilter).name : "All Statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {filterStatusOptions.map(status => {
                const color = status.color || "#6B7280";
                return (
                  <SelectItem key={status.key} value={status.key}>
                    <div className="flex items-center gap-2">
                      <Badge
                        style={{
                          backgroundColor: `${color}15`,
                          color: color,
                        }}
                        className="border-0"
                      >
                        {status.name}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Subtle Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* PC/PS Toggle Buttons */}
          <Button
            variant={typeFilter === "all" ? "default" : "outline"}
            size="sm"
            className={`h-6 px-2 text-xs gap-1 ${
              typeFilter === "all" ? "bg-[#bba7db] hover:bg-[#bba7db]/90 border-[#bba7db]" : ""
            }`}
            onClick={() => setTypeFilter("all")}
            data-testid="button-filter-all"
          >
            <span>All</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {pcCount + psCount}
            </Badge>
          </Button>
          <Button
            variant={typeFilter === "pc" ? "default" : "outline"}
            size="sm"
            className={`h-6 px-2 text-xs gap-1 ${
              typeFilter === "pc" ? "bg-[#bba7db] hover:bg-[#bba7db]/90 border-[#bba7db]" : ""
            }`}
            onClick={() => setTypeFilter("pc")}
            data-testid="button-filter-pc"
          >
            <span>Prime Cost</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {pcCount}
            </Badge>
          </Button>
          <Button
            variant={typeFilter === "ps" ? "default" : "outline"}
            size="sm"
            className={`h-6 px-2 text-xs gap-1 ${
              typeFilter === "ps" ? "bg-[#bba7db] hover:bg-[#bba7db]/90 border-[#bba7db]" : ""
            }`}
            onClick={() => setTypeFilter("ps")}
            data-testid="button-filter-ps"
          >
            <span>Prov Sum</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {psCount}
            </Badge>
          </Button>
        </div>
      </div>

      {/* Table Content Area */}
      <div className="flex-1 overflow-auto p-2">
        {filteredAllowances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <div className="w-12 h-12 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-[#bba7db]" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {allowances.length === 0 
                ? "No Allowances Yet"
                : "No Matching Allowances"}
            </h3>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              {allowances.length === 0 
                ? "Add Prime Cost or Provisional Sum items in your estimates to track allowances here."
                : searchTerm || statusFilter || typeFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No allowances found for the selected estimate."}
            </p>
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Description</TableHead>
                  <TableHead className="w-[10%]">Type</TableHead>
                  <TableHead className="w-[12%] text-right">Estimate</TableHead>
                  <TableHead className="w-[12%]">Status</TableHead>
                  <TableHead className="w-[10%] text-right">Markup</TableHead>
                  <TableHead className="w-[13%] text-right">Actual</TableHead>
                  <TableHead className="w-[13%] text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllowances.map(({ item, actualCost, variance }) => (
                  <TableRow 
                    key={item.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setLocation(`/projects/${projectId}/allowances/${item.id}`)}
                    data-testid={`row-allowance-${item.id}`}
                  >
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={item.allowance === "Prime Cost" 
                          ? "bg-blue-50 text-blue-700 border-blue-200" 
                          : "bg-amber-50 text-amber-700 border-amber-200"
                        }
                      >
                        {item.allowance === "Prime Cost" ? "PC" : "PS"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-estimate-${item.id}`}>
                      {formatCurrency(item.priceIncTax)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={item.allowanceStatus}
                        onValueChange={(value) =>
                          updateStatusMutation.mutate({ itemId: item.id, status: value })
                        }
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger
                          className="w-fit border-0 p-0 h-auto"
                          data-testid={`select-status-${item.id}`}
                        >
                          {(() => {
                            const statusInfo = getStatusInfo(item.allowanceStatus);
                            const color = statusInfo.color || "#6B7280";
                            return (
                              <Badge
                                style={{
                                  backgroundColor: `${color}15`,
                                  color: color,
                                }}
                                className="border-0"
                                data-testid={`badge-status-${item.id}`}
                              >
                                {statusInfo.name}
                              </Badge>
                            );
                          })()}
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((opt) => (
                            <SelectItem key={opt.key} value={opt.key}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {item.allowance === "Prime Cost" ? (
                        editingMarkup === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              value={markupValue}
                              onChange={(e) => setMarkupValue(e.target.value)}
                              className="w-16 h-6 text-xs"
                              data-testid={`input-markup-${item.id}`}
                            />
                            <span className="text-xs">%</span>
                            <Button
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleMarkupSave(item.id)}
                              disabled={updateMarkupMutation.isPending}
                              data-testid={`button-save-markup-${item.id}`}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => setEditingMarkup(null)}
                              data-testid={`button-cancel-markup-${item.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleMarkupEdit(item.id, item.pcMarkupPercent)}
                            data-testid={`button-edit-markup-${item.id}`}
                          >
                            {item.pcMarkupPercent || 0}%
                          </Button>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                      {formatCurrency(actualCost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {variance > 0 ? (
                          <TrendingUp className="h-3 w-3 text-red-500" />
                        ) : variance < 0 ? (
                          <TrendingDown className="h-3 w-3 text-green-500" />
                        ) : null}
                        <span
                          className={`text-sm ${variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}`}
                          data-testid={`text-variance-${item.id}`}
                        >
                          {formatCurrency(Math.abs(variance))}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
