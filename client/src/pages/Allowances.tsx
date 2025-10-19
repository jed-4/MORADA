import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
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
  const { statusOptions, getStatusInfo } = useAllowanceStatusOptions();
  const [editingMarkup, setEditingMarkup] = useState<string | null>(null);
  const [markupValue, setMarkupValue] = useState<string>("");
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);

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
    // Check if it's a whole number
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

  const handleMarkupSave = (itemId: string) => {
    const markup = parseFloat(markupValue) || 0;
    updateMarkupMutation.mutate({ itemId, markup });
  };

  // Filter allowances by selected estimate
  const filteredAllowances = useMemo(() => {
    if (!selectedEstimateId) return allowances;
    return allowances.filter(a => a.item.estimateId === selectedEstimateId);
  }, [allowances, selectedEstimateId]);

  const pcItems = filteredAllowances.filter(a => a.item.allowance === "Prime Cost");
  const psItems = filteredAllowances.filter(a => a.item.allowance === "Provisional Sum");

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-semibold">Allowances</h1>
          </div>
          <div className="space-y-4">
            <Card className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold">Allowances</h1>
            <p className="text-muted-foreground mt-1">
              Track Prime Cost and Provisional Sum items from estimates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="estimate-selector" className="text-sm font-medium">
              Select Estimate:
            </label>
            <Select
              value={selectedEstimateId || ""}
              onValueChange={handleEstimateChange}
              disabled={estimatesLoading || estimates.length === 0}
            >
              <SelectTrigger className="w-[250px]" id="estimate-selector" data-testid="select-estimate">
                <SelectValue placeholder="Select an estimate" />
              </SelectTrigger>
              <SelectContent>
                {estimates.map((estimate) => (
                  <SelectItem key={estimate.id} value={estimate.id} data-testid={`estimate-option-${estimate.id}`}>
                    {estimate.name} (v{estimate.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredAllowances.length === 0 ? (
          <Card className="p-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Allowances</h3>
            <p className="text-muted-foreground">
              {allowances.length === 0 
                ? "Create estimate items with Prime Cost or Provisional Sum allowances to see them here."
                : "No allowances found for the selected estimate."}
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {pcItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Prime Cost (PC) Items</h2>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">Description</TableHead>
                        <TableHead className="w-[15%] text-right">Estimate Price</TableHead>
                        <TableHead className="w-[12%]">Status</TableHead>
                        <TableHead className="w-[12%] text-right">PC Markup</TableHead>
                        <TableHead className="w-[13%] text-right">Actual Price</TableHead>
                        <TableHead className="w-[13%] text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pcItems.map(({ item, actualCost, variance }) => (
                        <TableRow 
                          key={item.id}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/projects/${projectId}/allowances/${item.id}`)}
                          data-testid={`row-allowance-${item.id}`}
                        >
                          <TableCell className="font-medium">{item.name}</TableCell>
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
                            {editingMarkup === item.id ? (
                              <div className="flex items-center gap-2 justify-end">
                                <Input
                                  type="number"
                                  value={markupValue}
                                  onChange={(e) => setMarkupValue(e.target.value)}
                                  className="w-20"
                                  data-testid={`input-markup-${item.id}`}
                                />
                                <span className="text-sm">%</span>
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkupSave(item.id)}
                                  disabled={updateMarkupMutation.isPending}
                                  data-testid={`button-save-markup-${item.id}`}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
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
                                onClick={() => handleMarkupEdit(item.id, item.pcMarkupPercent)}
                                data-testid={`button-edit-markup-${item.id}`}
                              >
                                {item.pcMarkupPercent || 0}%
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                            {formatCurrency(actualCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {variance > 0 ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : variance < 0 ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : null}
                              <span
                                className={variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}
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
              </div>
            )}

            {psItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Provisional Sum (PS) Items</h2>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">Description</TableHead>
                        <TableHead className="w-[15%] text-right">Estimate Price</TableHead>
                        <TableHead className="w-[12%]">Status</TableHead>
                        <TableHead className="w-[25%] text-right">Actual Price</TableHead>
                        <TableHead className="w-[13%] text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {psItems.map(({ item, actualCost, variance }) => (
                        <TableRow 
                          key={item.id}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/projects/${projectId}/allowances/${item.id}`)}
                          data-testid={`row-allowance-${item.id}`}
                        >
                          <TableCell className="font-medium">{item.name}</TableCell>
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
                          <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                            {formatCurrency(actualCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {variance > 0 ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : variance < 0 ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : null}
                              <span
                                className={variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
